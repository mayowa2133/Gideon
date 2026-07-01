import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/materialize-live-promotion-fixtures.mjs");

describe("live promotion fixture materialization", () => {
  it("prints the fixture materialization plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Live promotion fixture materialization dry-run:");
    expect(result.stdout).toContain("GIDEON_PROVIDER_CANARY_AUDIO_BASE64");
    expect(result.stdout).toContain("GIDEON_STAGING_SMOKE_RECORDING_BASE64");
  });

  it("materializes non-empty decoded fixture files", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-live-fixtures-"));

    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        GIDEON_LIVE_FIXTURE_DIR: outputDir,
        GIDEON_PROVIDER_CANARY_AUDIO_BASE64: Buffer.from("audio").toString("base64"),
        GIDEON_PROVIDER_CANARY_IMAGE_BASE64: Buffer.from("image").toString("base64"),
        GIDEON_STAGING_SMOKE_RECORDING_BASE64: Buffer.from("recording").toString("base64")
      }
    });

    expect(result.stdout).toContain("Wrote provider ASR audio fixture");
    await expect(fs.readFile(path.join(outputDir, "provider-audio.wav"), "utf8")).resolves.toBe("audio");
    await expect(fs.readFile(path.join(outputDir, "provider-image.png"), "utf8")).resolves.toBe("image");
    await expect(fs.readFile(path.join(outputDir, "staging-recording.mp4"), "utf8")).resolves.toBe("recording");
  });

  it("fails before writing weak live fixtures when secrets are missing or empty", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_PROVIDER_CANARY_AUDIO_BASE64 is required")
    });
  });

  it("rejects invalid base64 and oversized decoded fixtures", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-live-fixtures-"));

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_LIVE_FIXTURE_DIR: outputDir,
          GIDEON_LIVE_FIXTURE_MAX_BYTES: "3",
          GIDEON_PROVIDER_CANARY_AUDIO_BASE64: "not-valid-!",
          GIDEON_PROVIDER_CANARY_IMAGE_BASE64: Buffer.from("image").toString("base64"),
          GIDEON_STAGING_SMOKE_RECORDING_BASE64: Buffer.from("recording").toString("base64")
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_PROVIDER_CANARY_AUDIO_BASE64 must be valid base64")
    });
  });
});
