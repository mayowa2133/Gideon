import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-live-promotion-env.mjs";

describe("live promotion environment check", () => {
  it("prints the live environment plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Live promotion environment check dry-run:");
    expect(result.stdout).toContain("GIDEON_STAGING_MCP_SESSION_COOKIE");
    expect(result.stdout).toContain("GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD");
    expect(result.stdout).toContain("Require Apple signing/notarization env");
  });

  it("fails clearly when required live configuration is missing", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_REDIS_URL is required for live promotion")
    });
  });

  it("passes with production-shaped configuration and signing env", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: liveEnv()
    });

    expect(result.stdout).toContain("Live promotion environment check passed.");
  });

  it("allows skipping signing env for infrastructure rehearsal only", async () => {
    const env = liveEnv();
    delete env.APPLE_TEAM_ID;
    delete env.APPLE_ID;
    delete env.APPLE_APP_SPECIFIC_PASSWORD;
    delete env.CSC_NAME;
    env.GIDEON_LIVE_PROMOTION_SKIP_PACKAGE = "true";

    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env
    });

    expect(result.stdout).toContain("infrastructure rehearsal");
  });

  it("rejects weak live URL/provider/base64 configuration", async () => {
    const env = liveEnv({
      GIDEON_REDIS_URL: "redis://localhost:6379/0",
      GIDEON_STORAGE_PROVIDER: "local",
      GIDEON_PROVIDER_CANARY_AUDIO_BASE64: "not-base64-!"
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_REDIS_URL must be a rediss:// URL")
    });
  });
});

function liveEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_PROVIDER_CANARY_AUDIO_BASE64: Buffer.from("audio").toString("base64"),
    GIDEON_PROVIDER_CANARY_IMAGE_BASE64: Buffer.from("image").toString("base64"),
    GIDEON_STAGING_SMOKE_RECORDING_BASE64: Buffer.from("recording").toString("base64"),
    GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
    GIDEON_BULLMQ_QUEUE_NAME: "gideon-staging-workers",
    GIDEON_BULLMQ_PREFIX: "gideon-staging",
    GIDEON_WORKER_ID: "staging-worker-1",
    GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
    GIDEON_SESSION_SECRET: "session-secret",
    GIDEON_STORAGE_PROVIDER: "s3",
    GIDEON_STORAGE_BUCKET: "gideon-private-staging",
    GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
    GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
    GIDEON_OPENAI_API_KEY: "sk-test",
    GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD: "0.02",
    GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD: "0.005",
    GIDEON_STAGING_API_BASE_URL: "https://staging.gideon.example.test",
    GIDEON_AUTH_CALLBACK_SECRET: "auth-callback-secret",
    GIDEON_STAGING_MCP_API_BASE_URL: "https://staging.gideon.example.test",
    GIDEON_STAGING_MCP_SESSION_COOKIE: "gideon_session=session-token",
    GIDEON_STAGING_MCP_PROJECT_ID: "project-staging-mcp",
    GIDEON_STAGING_MCP_METRIC_PROBE_URL: "https://metrics.gideon.example.test/hosted-mcp",
    APPLE_TEAM_ID: "TEAM123",
    APPLE_ID: "release@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-password",
    CSC_NAME: "Developer ID Application: Example",
    ...overrides
  };
}
