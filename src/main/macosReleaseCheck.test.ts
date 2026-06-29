import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-macos-release.mjs");

describe("macOS release checks", () => {
  it("validates local release artifacts and writes provenance", async () => {
    const releaseDir = await createReleaseFixture();

    const result = await runReleaseCheck({ GIDEON_RELEASE_DIR: releaseDir });

    expect(result.stdout).toContain("macOS release check passed for local channel.");
    const provenance = JSON.parse(await fs.readFile(path.join(releaseDir, "provenance.json"), "utf8")) as {
      artifacts: Array<{ fileName: string; sha256: string; sha512: string; size: number }>;
    };
    expect(provenance.artifacts.map((artifact) => artifact.fileName)).toEqual(
      expect.arrayContaining(["Gideon-0.1.0-arm64.dmg", "Gideon-0.1.0-arm64-mac.zip", "latest-mac.yml"])
    );
    expect(provenance.artifacts.find((artifact) => artifact.fileName.endsWith(".dmg"))).toMatchObject({
      sha256: expect.any(String),
      sha512: expect.any(String),
      size: expect.any(Number)
    });
  });

  it("rejects production release checks without signing and notarization credentials", async () => {
    const releaseDir = await createReleaseFixture();

    await expect(runReleaseCheck({ GIDEON_RELEASE_DIR: releaseDir, GIDEON_RELEASE_CHANNEL: "production" })).rejects.toMatchObject({
      stderr: expect.stringContaining("Set APPLE_TEAM_ID for notarization.")
    });
  });

  it("rejects stale latest-mac metadata", async () => {
    const releaseDir = await createReleaseFixture({ staleLatest: true });

    await expect(runReleaseCheck({ GIDEON_RELEASE_DIR: releaseDir })).rejects.toMatchObject({
      stderr: expect.stringContaining("latest-mac.yml sha512 does not match Gideon-0.1.0-arm64.dmg")
    });
  });
});

async function runReleaseCheck(env: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath], {
    env: {
      PATH: process.env.PATH ?? "",
      ...env
    }
  });
}

async function createReleaseFixture(input: { staleLatest?: boolean } = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-release-check-"));
  const dmg = Buffer.from("fake-dmg");
  const zip = Buffer.from("fake-zip");
  const dmgBlockmap = Buffer.from("fake-dmg-blockmap");
  const zipBlockmap = Buffer.from("fake-zip-blockmap");
  await fs.writeFile(path.join(dir, "Gideon-0.1.0-arm64.dmg"), dmg);
  await fs.writeFile(path.join(dir, "Gideon-0.1.0-arm64-mac.zip"), zip);
  await fs.writeFile(path.join(dir, "Gideon-0.1.0-arm64.dmg.blockmap"), dmgBlockmap);
  await fs.writeFile(path.join(dir, "Gideon-0.1.0-arm64-mac.zip.blockmap"), zipBlockmap);
  const dmgSha = input.staleLatest ? "stale" : sha512(dmg);
  await fs.writeFile(
    path.join(dir, "latest-mac.yml"),
    [
      "version: 0.1.0",
      "files:",
      "  - url: Gideon-0.1.0-arm64-mac.zip",
      `    sha512: ${sha512(zip)}`,
      `    size: ${zip.length}`,
      "  - url: Gideon-0.1.0-arm64.dmg",
      `    sha512: ${dmgSha}`,
      `    size: ${dmg.length}`,
      "path: Gideon-0.1.0-arm64-mac.zip",
      `sha512: ${sha512(zip)}`,
      ""
    ].join("\n")
  );
  return dir;
}

function sha512(input: Buffer): string {
  return createHash("sha512").update(input).digest("base64");
}
