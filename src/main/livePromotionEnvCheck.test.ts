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
    expect(result.stdout).toContain("GIDEON_BULLMQ_ATTEMPTS");
    expect(result.stdout).toContain("GIDEON_POSTGRES_PITR_ENABLED");
    expect(result.stdout).toContain("GIDEON_OBSERVABILITY_BACKEND");
    expect(result.stdout).toContain("GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD");
    expect(result.stdout).toContain("GIDEON_STORAGE_TEMP_RETENTION_DAYS");
    expect(result.stdout).toContain("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY");
    expect(result.stdout).toContain("GIDEON_TTS_APPROVED_VOICES");
    expect(result.stdout).toContain("GIDEON_ANALYSIS_PROMPT_VERSION");
    expect(result.stdout).toContain("GIDEON_MCP_SSO_PROVIDER");
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

  it("rejects unreviewed live TTS voice configuration", async () => {
    const env = liveEnv({
      GIDEON_OPENAI_TTS_VOICE: "unreviewed",
      GIDEON_TTS_APPROVED_VOICES: "coral,verse"
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_OPENAI_TTS_VOICE must be included in GIDEON_TTS_APPROVED_VOICES")
    });
  });

  it("rejects unapproved live prompt rollout configuration", async () => {
    const env = liveEnv({
      GIDEON_ANALYSIS_PROMPT_VERSION: "analysis-v3",
      GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS: "analysis-v1,analysis-v2"
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_ANALYSIS_PROMPT_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS")
    });
  });

  it("rejects weak live MCP access policy", async () => {
    const env = liveEnv({
      GIDEON_MCP_SSO_PROVIDER: "local",
      GIDEON_MCP_REQUIRE_CSRF: "false"
    });

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_MCP_SSO_PROVIDER must be one of")
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
    GIDEON_BULLMQ_CONCURRENCY: "4",
    GIDEON_BULLMQ_ATTEMPTS: "3",
    GIDEON_BULLMQ_BACKOFF_TYPE: "exponential",
    GIDEON_BULLMQ_BACKOFF_DELAY_MS: "5000",
    GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT: "1000",
    GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT: "5000",
    GIDEON_BULLMQ_DEAD_LETTER_POLICY: "retain_failed",
    GIDEON_WORKER_ID: "staging-worker-1",
    GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
    GIDEON_DATABASE_POOL_MAX: "10",
    GIDEON_DATABASE_STATEMENT_TIMEOUT_MS: "30000",
    GIDEON_DATABASE_IDLE_TIMEOUT_MS: "30000",
    GIDEON_POSTGRES_BACKUP_RETENTION_DAYS: "30",
    GIDEON_POSTGRES_PITR_ENABLED: "true",
    GIDEON_POSTGRES_RESTORE_DRILL_AT: new Date().toISOString(),
    GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS: "90",
    GIDEON_POSTGRES_MIGRATION_POLICY: "predeploy_migrate",
    GIDEON_SESSION_SECRET: "session-secret",
    GIDEON_STORAGE_PROVIDER: "s3",
    GIDEON_STORAGE_BUCKET: "gideon-private-staging",
    GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
    GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
    GIDEON_STORAGE_ENDPOINT: "https://storage.example.test",
    GIDEON_STORAGE_TEMP_RETENTION_DAYS: "3",
    GIDEON_STORAGE_FAILED_RETENTION_DAYS: "14",
    GIDEON_STORAGE_SOURCE_RETENTION_DAYS: "365",
    GIDEON_VOICEOVER_RETENTION_DAYS: "365",
    GIDEON_STORAGE_EXPORT_RETENTION_DAYS: "365",
    GIDEON_STORAGE_DELETION_SLA_HOURS: "24",
    GIDEON_SIGNED_URL_MAX_SECONDS: "900",
    GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY: "workspaces/workspace-1/projects/project-1/export/export-1.mp4",
    GIDEON_OPENAI_TTS_MODEL: "gpt-4o-mini-tts",
    GIDEON_OPENAI_TTS_VOICE: "coral",
    GIDEON_TTS_APPROVED_VOICES: "coral,verse",
    GIDEON_TTS_VOICE_REVIEWED_AT: new Date().toISOString(),
    GIDEON_VOICEOVER_DELETION_SLA_HOURS: "24",
    GIDEON_OPENAI_LLM_MODEL: "gpt-5.1",
    GIDEON_ANALYSIS_PROMPT_VERSION: "analysis-v2",
    GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS: "analysis-v1,analysis-v2",
    GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION: "analysis-v1",
    GIDEON_ANALYSIS_PROMPT_REVIEWED_AT: new Date().toISOString(),
    GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE: "production",
    GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT: "100",
    GIDEON_ANALYSIS_MODEL_CANARY_PERCENT: "0",
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
    GIDEON_MCP_SSO_PROVIDER: "oidc",
    GIDEON_MCP_SESSION_MAX_AGE_SECONDS: "3600",
    GIDEON_MCP_SESSION_ROTATION_HOURS: "12",
    GIDEON_MCP_REQUIRE_CSRF: "true",
    GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS: "true",
    GIDEON_MCP_LOAD_CONCURRENCY: "10",
    GIDEON_MCP_LOAD_REQUESTS: "500",
    GIDEON_MCP_LOAD_P95_MS: "1500",
    GIDEON_MCP_LOAD_ERROR_RATE_MAX: "0.01",
    ...observabilityPolicyEnv(),
    APPLE_TEAM_ID: "TEAM123",
    APPLE_ID: "release@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-password",
    CSC_NAME: "Developer ID Application: Example",
    ...overrides
  };
}

function observabilityPolicyEnv(): Record<string, string> {
  return {
    GIDEON_OBSERVABILITY_BACKEND: "datadog",
    GIDEON_OBSERVABILITY_METRIC_EXPORT_URL: "https://observability.example.test/gideon/metrics",
    GIDEON_OBSERVABILITY_DASHBOARD_URL: "https://observability.example.test/dashboards/gideon-production",
    GIDEON_OBSERVABILITY_RUNBOOK_URL: "https://runbooks.example.test/gideon/production-incidents",
    GIDEON_OBSERVABILITY_ALERT_ROUTE: "pagerduty/gideon-production",
    GIDEON_OBSERVABILITY_PAGING_ENABLED: "true",
    GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS: "300",
    GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR: "3",
    GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS: "15000",
    GIDEON_OBSERVABILITY_STORAGE_P95_MS: "5000"
  };
}
