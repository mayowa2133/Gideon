import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-tts-policy.mjs";

describe("production TTS policy check", () => {
  it("prints the TTS policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production TTS policy check dry-run:");
    expect(result.stdout).toContain("approved voice allowlist");
    expect(result.stdout).toContain("private voiceover artifact retention");
  });

  it("passes with production-shaped reviewed voice and voiceover retention configuration", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: ttsPolicyEnv()
    });

    expect(result.stdout).toContain("Production TTS policy check passed.");
  });

  it("rejects unapproved production voices", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: ttsPolicyEnv({
          GIDEON_OPENAI_TTS_VOICE: "unreviewed",
          GIDEON_TTS_APPROVED_VOICES: "coral,verse"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_OPENAI_TTS_VOICE must be included in GIDEON_TTS_APPROVED_VOICES")
    });
  });

  it("rejects stale voice reviews and invalid retention windows", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: ttsPolicyEnv({
          GIDEON_TTS_VOICE_REVIEWED_AT: "2020-01-01T00:00:00.000Z",
          GIDEON_VOICEOVER_RETENTION_DAYS: "0"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_TTS_VOICE_REVIEWED_AT must be within the last 180 days")
    });
  });
});

function ttsPolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
    GIDEON_OPENAI_TTS_VOICE: "coral",
    GIDEON_TTS_APPROVED_VOICES: "coral,verse",
    GIDEON_TTS_VOICE_REVIEWED_AT: new Date().toISOString(),
    GIDEON_VOICEOVER_RETENTION_DAYS: "365",
    GIDEON_VOICEOVER_DELETION_SLA_HOURS: "24",
    ...overrides
  };
}
