import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("staging readiness check", () => {
  it("passes in dry-run mode while warning that strict staging validation is still required", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/check-staging-readiness.mjs"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Staging readiness dry-run check passed.");
    expect(result.stdout).toContain("Strict staging environment validation is disabled.");
  });

  it("fails strict mode when production-shaped environment is missing", async () => {
    await expect(
      execFileAsync(process.execPath, ["scripts/check-staging-readiness.mjs", "--strict"], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Staging readiness check failed:")
    });
  });

  it("passes strict mode with production-shaped staging configuration and canary fixtures", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-staging-check-"));
    const audioPath = path.join(tempDir, "audio.wav");
    const imagePath = path.join(tempDir, "frame.png");
    const recordingPath = path.join(tempDir, "walkthrough.mp4");
    const releaseDir = path.join(tempDir, "release");
    await fs.writeFile(audioPath, "audio");
    await fs.writeFile(imagePath, "image");
    await fs.writeFile(recordingPath, "video");
    await writeReleaseFixtures(releaseDir);

    const result = await execFileAsync(process.execPath, ["scripts/check-staging-readiness.mjs", "--strict"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        GIDEON_DEPLOYMENT_ENV: "production",
        GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
        GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
        GIDEON_BULLMQ_QUEUE_NAME: "gideon-staging-workers",
        GIDEON_BULLMQ_PREFIX: "gideon-staging",
        GIDEON_WORKER_ID: "staging-worker-1",
        GIDEON_WORKER_LEASE_SECONDS: "300",
        GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
        GIDEON_STORE_PROVIDER: "postgres_snapshot",
        GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker",
        GIDEON_PROJECTS_DIR: "/var/lib/gideon-worker/projects",
        GIDEON_STORAGE_ROOT: "/var/lib/gideon-worker/cache",
        GIDEON_STORAGE_PROVIDER: "s3",
        GIDEON_STORAGE_BUCKET: "gideon-private-staging",
        GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
        GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
        GIDEON_STORAGE_ENDPOINT: "https://storage.example.test",
        ...storagePolicyEnv(),
        GIDEON_OPENAI_API_KEY: "sk-test",
        GIDEON_PROVIDER_CANARY_LIVE: "true",
        GIDEON_PROVIDER_CANARY_AUDIO_PATH: audioPath,
        GIDEON_PROVIDER_CANARY_IMAGE_PATH: imagePath,
        ...providerCanaryCostEnv(),
        GIDEON_STAGING_API_BASE_URL: "https://staging.gideon.example.test",
        GIDEON_AUTH_CALLBACK_SECRET: "auth-callback-secret",
        GIDEON_STAGING_SMOKE_LIVE: "true",
        GIDEON_STAGING_SMOKE_RECORDING_PATH: recordingPath,
        GIDEON_STAGING_SMOKE_POLL_TIMEOUT_MS: "600000",
        GIDEON_STAGING_SMOKE_POLL_INTERVAL_MS: "5000",
        GIDEON_STAGING_MCP_API_BASE_URL: "https://staging.gideon.example.test",
        GIDEON_STAGING_MCP_SESSION_COOKIE: "gideon_session=session-token",
        GIDEON_STAGING_MCP_PROJECT_ID: "project-staging-mcp",
        GIDEON_STAGING_MCP_SMOKE_LIVE: "true",
        GIDEON_STAGING_MCP_REQUIRE_METRIC_EXPORT: "true",
        GIDEON_STAGING_MCP_METRIC_PROBE_URL: "https://metrics.gideon.example.test/hosted-mcp",
        GIDEON_RELEASE_DIR: releaseDir,
        GIDEON_RELEASE_CHANNEL: "production",
        APPLE_TEAM_ID: "TEAM123",
        APPLE_ID: "release@example.com",
        APPLE_APP_SPECIFIC_PASSWORD: "app-password",
        CSC_NAME: "Developer ID Application: Example"
      }
    });

    expect(result.stdout).toContain("Staging readiness strict check passed.");
  });

  it("requires live upload-to-export smoke configuration in strict mode", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-staging-check-"));
    const audioPath = path.join(tempDir, "audio.wav");
    const imagePath = path.join(tempDir, "frame.png");
    const releaseDir = path.join(tempDir, "release");
    await fs.writeFile(audioPath, "audio");
    await fs.writeFile(imagePath, "image");
    await writeReleaseFixtures(releaseDir);

    await expect(
      execFileAsync(process.execPath, ["scripts/check-staging-readiness.mjs", "--strict"], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_DEPLOYMENT_ENV: "production",
          GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
          GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
          GIDEON_BULLMQ_QUEUE_NAME: "gideon-staging-workers",
          GIDEON_BULLMQ_PREFIX: "gideon-staging",
          GIDEON_WORKER_ID: "staging-worker-1",
          GIDEON_WORKER_LEASE_SECONDS: "300",
          GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
          GIDEON_STORE_PROVIDER: "postgres_snapshot",
          GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
          GIDEON_SESSION_SECRET: "session-secret",
          GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker",
          GIDEON_PROJECTS_DIR: "/var/lib/gideon-worker/projects",
          GIDEON_STORAGE_ROOT: "/var/lib/gideon-worker/cache",
          GIDEON_STORAGE_PROVIDER: "s3",
          GIDEON_STORAGE_BUCKET: "gideon-private-staging",
          GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
          GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
          GIDEON_STORAGE_ENDPOINT: "https://storage.example.test",
          ...storagePolicyEnv(),
          GIDEON_OPENAI_API_KEY: "sk-test",
          GIDEON_PROVIDER_CANARY_LIVE: "true",
          GIDEON_PROVIDER_CANARY_AUDIO_PATH: audioPath,
          GIDEON_PROVIDER_CANARY_IMAGE_PATH: imagePath,
          ...providerCanaryCostEnv(),
          GIDEON_RELEASE_DIR: releaseDir,
          GIDEON_RELEASE_CHANNEL: "production",
          APPLE_TEAM_ID: "TEAM123",
          APPLE_ID: "release@example.com",
          APPLE_APP_SPECIFIC_PASSWORD: "app-password",
          CSC_NAME: "Developer ID Application: Example"
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Set GIDEON_STAGING_API_BASE_URL")
    });
  });
});

function providerCanaryCostEnv(): Record<string, string> {
  return {
    GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD: "0.05",
    GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD: "0.01",
    GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD: "0.02",
    GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD: "0.005"
  };
}

function storagePolicyEnv(): Record<string, string> {
  return {
    GIDEON_STORAGE_TEMP_RETENTION_DAYS: "3",
    GIDEON_STORAGE_FAILED_RETENTION_DAYS: "14",
    GIDEON_STORAGE_SOURCE_RETENTION_DAYS: "365",
    GIDEON_STORAGE_EXPORT_RETENTION_DAYS: "365",
    GIDEON_STORAGE_DELETION_SLA_HOURS: "24",
    GIDEON_SIGNED_URL_MAX_SECONDS: "900",
    GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY: "workspaces/workspace-1/projects/project-1/export/export-1.mp4"
  };
}

async function writeReleaseFixtures(releaseDir: string): Promise<void> {
  await fs.mkdir(releaseDir, { recursive: true });
  for (const fileName of [
    "Gideon-0.1.0-arm64.dmg",
    "Gideon-0.1.0-arm64-mac.zip",
    "Gideon-0.1.0-arm64.dmg.blockmap",
    "Gideon-0.1.0-arm64-mac.zip.blockmap",
    "latest-mac.yml",
    "provenance.json"
  ]) {
    await fs.writeFile(path.join(releaseDir, fileName), "fixture");
  }
}
