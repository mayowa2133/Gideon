#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const env = process.env;
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict") || env.GIDEON_STAGING_READINESS_STRICT === "true";
const errors = [];
const warnings = [];

const packageJson = readJson("package.json");
const scripts = packageJson.scripts ?? {};
const migrations = listSqlFiles("migrations");

validateCommandContract();
validateMigrations();
validateReleaseArtifacts();
validateOperationalEnvironment();

if (errors.length > 0) {
  console.error("Staging readiness check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log(strict ? "Staging readiness strict check passed." : "Staging readiness dry-run check passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function validateCommandContract() {
  for (const scriptName of [
    "typecheck",
    "test",
    "build",
    "db:migrate",
    "worker:hosted:check",
    "provider:canary",
    "hosted:review:check",
    "package:mac",
    "package:mac:signed",
    "release:mac:check",
    "staging:smoke",
    "staging:mcp:smoke",
    "production:promote:check",
    "production:evidence:check",
    "production:github-config:check",
    "production:github-settings:check",
    "production:github-evidence:check",
    "production:github-receipt:check",
    "production:github-archive:check",
    "production:github-promote:run",
    "production:live-env:check",
    "production:fixtures:materialize",
    "production:billing:check",
    "production:db:check",
    "production:queue:check",
    "production:observability:check",
    "production:storage:check",
    "production:storage-download:smoke"
  ]) {
    if (typeof scripts[scriptName] !== "string") {
      errors.push(`package.json must define ${scriptName}.`);
    }
  }
}

function validateMigrations() {
  for (const expected of [
    "0001_hosted_jobs_artifacts.sql",
    "0002_usage_audit_events.sql",
    "0003_core_identity_projects.sql"
  ]) {
    if (!migrations.includes(expected)) {
      errors.push(`Missing required PostgreSQL migration: ${expected}.`);
    }
  }
}

function validateReleaseArtifacts() {
  const version = String(packageJson.version ?? "");
  const releaseDir = normalize(env.GIDEON_RELEASE_DIR) || "release";
  const expectedArtifacts = [
    `Gideon-${version}-arm64.dmg`,
    `Gideon-${version}-arm64-mac.zip`,
    `Gideon-${version}-arm64.dmg.blockmap`,
    `Gideon-${version}-arm64-mac.zip.blockmap`,
    "latest-mac.yml",
    "provenance.json"
  ];

  for (const artifact of expectedArtifacts) {
    const artifactPath = path.join(releaseDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      const message = `Missing local release artifact ${artifactPath}; run pnpm package:mac and pnpm release:mac:check before staging release promotion.`;
      if (strict) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }
}

function validateOperationalEnvironment() {
  if (!strict) {
    warnings.push("Strict staging environment validation is disabled. Re-run with pnpm staging:check -- --strict before promotion.");
    return;
  }

  requireEnv("GIDEON_DEPLOYMENT_ENV", "Set GIDEON_DEPLOYMENT_ENV=production for the production-shaped staging preflight.");
  if (normalize(env.GIDEON_DEPLOYMENT_ENV) !== "production") {
    errors.push("GIDEON_DEPLOYMENT_ENV must be production for the production-shaped staging preflight.");
  }

  requireEquals("GIDEON_HOSTED_QUEUE_PROVIDER", "bullmq", "Use BullMQ for staging hosted workers.");
  requireEnv("GIDEON_BULLMQ_QUEUE_NAME", "Set GIDEON_BULLMQ_QUEUE_NAME with a staging-specific queue name.");
  requireEnv("GIDEON_BULLMQ_PREFIX", "Set GIDEON_BULLMQ_PREFIX with a staging-specific Redis prefix.");
  requireBullMqPolicy();
  requireEnv("GIDEON_WORKER_ID", "Set a stable staging worker identity.");
  requirePositiveInteger("GIDEON_WORKER_LEASE_SECONDS", "Set a positive staging worker lease duration.");
  requirePositiveInteger("GIDEON_WORKER_HEARTBEAT_INTERVAL_MS", "Set a positive staging worker heartbeat interval.");
  validateLeaseHeartbeatRatio();

  const redisUrl = normalize(env.GIDEON_REDIS_URL ?? env.REDIS_URL);
  if (!redisUrl) {
    errors.push("Set GIDEON_REDIS_URL or REDIS_URL for staging BullMQ.");
  } else {
    validateUrl(redisUrl, ["rediss:"], "Staging Redis URL must use rediss://.");
  }

  requireEquals("GIDEON_STORE_PROVIDER", "postgres_snapshot", "Use PostgreSQL snapshot persistence for staging.");
  const databaseUrl = normalize(env.GIDEON_DATABASE_URL ?? env.DATABASE_URL);
  if (!databaseUrl) {
    errors.push("Set GIDEON_DATABASE_URL or DATABASE_URL for staging PostgreSQL.");
  } else {
    validateUrl(databaseUrl, ["postgres:", "postgresql:"], "Staging database URL must use postgres:// or postgresql://.");
    if (!databaseUrl.includes("sslmode=require") && env.GIDEON_ALLOW_INSECURE_DATABASE !== "true") {
      errors.push("Staging database URL should require TLS with sslmode=require unless GIDEON_ALLOW_INSECURE_DATABASE=true.");
    }
  }
  requirePostgresPolicy();

  requireEnv("GIDEON_SESSION_SECRET", "Set GIDEON_SESSION_SECRET for hosted web/API sessions.");
  requireEnv("GIDEON_USER_DATA_DIR", "Set GIDEON_USER_DATA_DIR for worker-local cache/state paths.");
  requireEnv("GIDEON_PROJECTS_DIR", "Set GIDEON_PROJECTS_DIR for worker media cache paths.");
  requireEnv("GIDEON_STORAGE_ROOT", "Set GIDEON_STORAGE_ROOT for worker artifact cache paths.");

  const storageProvider = normalize(env.GIDEON_STORAGE_PROVIDER);
  if (storageProvider !== "s3" && storageProvider !== "r2") {
    errors.push("Set GIDEON_STORAGE_PROVIDER=s3 or r2 for staging private object storage.");
  }
  requireEnv("GIDEON_STORAGE_BUCKET", "Set GIDEON_STORAGE_BUCKET for staging private object storage.");
  requireEnv("GIDEON_STORAGE_ACCESS_KEY_ID", "Set GIDEON_STORAGE_ACCESS_KEY_ID for staging private object storage.");
  requireEnv("GIDEON_STORAGE_SECRET_ACCESS_KEY", "Set GIDEON_STORAGE_SECRET_ACCESS_KEY for staging private object storage.");
  requireStorageLifecyclePolicy();
  requireStorageSignedDownloadSmoke();

  if (!normalize(env.GIDEON_OPENAI_API_KEY ?? env.OPENAI_API_KEY)) {
    errors.push("Set GIDEON_OPENAI_API_KEY or OPENAI_API_KEY before running live provider canaries.");
  }
  requireEquals("GIDEON_PROVIDER_CANARY_LIVE", "true", "Set GIDEON_PROVIDER_CANARY_LIVE=true before staging promotion.");
  requireReadableFile("GIDEON_PROVIDER_CANARY_AUDIO_PATH", "Set GIDEON_PROVIDER_CANARY_AUDIO_PATH to a small staging audio fixture.");
  requireReadableFile("GIDEON_PROVIDER_CANARY_IMAGE_PATH", "Set GIDEON_PROVIDER_CANARY_IMAGE_PATH to a small staging screenshot fixture.");
  requireProviderCanaryCostCeilings();
  requireHostedSmokeEnvironment();
  requireHostedMcpSmokeEnvironment();
  requireObservabilityPolicy();

  requireEquals("GIDEON_RELEASE_CHANNEL", "production", "Set GIDEON_RELEASE_CHANNEL=production for staging release promotion checks.");
  requireEnv("APPLE_TEAM_ID", "Set APPLE_TEAM_ID for production release notarization checks.");
  requireEnv("APPLE_ID", "Set APPLE_ID for production release notarization checks.");
  requireEnv("APPLE_APP_SPECIFIC_PASSWORD", "Set APPLE_APP_SPECIFIC_PASSWORD for production release notarization checks.");
  if (!normalize(env.CSC_LINK) && !normalize(env.CSC_NAME)) {
    errors.push("Set CSC_LINK or CSC_NAME so production release candidates can be signed.");
  }
}

function requireBullMqPolicy() {
  requireIntegerRange("GIDEON_BULLMQ_CONCURRENCY", 1, 100, "Set GIDEON_BULLMQ_CONCURRENCY to an integer between 1 and 100.");
  requireIntegerRange("GIDEON_BULLMQ_ATTEMPTS", 2, 10, "Set GIDEON_BULLMQ_ATTEMPTS to an integer between 2 and 10.");
  const backoffType = normalize(env.GIDEON_BULLMQ_BACKOFF_TYPE);
  if (backoffType !== "fixed" && backoffType !== "exponential") {
    errors.push("Set GIDEON_BULLMQ_BACKOFF_TYPE to fixed or exponential.");
  }
  requireIntegerRange("GIDEON_BULLMQ_BACKOFF_DELAY_MS", 1_000, 300_000, "Set GIDEON_BULLMQ_BACKOFF_DELAY_MS to an integer between 1000 and 300000.");
  const completeRetention = requireIntegerRange(
    "GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT",
    100,
    100_000,
    "Set GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT to an integer between 100 and 100000."
  );
  const failedRetention = requireIntegerRange(
    "GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT",
    1_000,
    500_000,
    "Set GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT to an integer between 1000 and 500000."
  );
  if (Number.isInteger(completeRetention) && Number.isInteger(failedRetention) && failedRetention < completeRetention) {
    errors.push("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT must be greater than or equal to GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT.");
  }
  if (normalize(env.GIDEON_BULLMQ_DEAD_LETTER_POLICY) !== "retain_failed") {
    errors.push("Set GIDEON_BULLMQ_DEAD_LETTER_POLICY=retain_failed for production incident review.");
  }
}

function requirePostgresPolicy() {
  requireIntegerRange("GIDEON_DATABASE_POOL_MAX", 2, 100, "Set GIDEON_DATABASE_POOL_MAX to an integer between 2 and 100.");
  requireIntegerRange(
    "GIDEON_DATABASE_STATEMENT_TIMEOUT_MS",
    1_000,
    300_000,
    "Set GIDEON_DATABASE_STATEMENT_TIMEOUT_MS to an integer between 1000 and 300000."
  );
  requireIntegerRange(
    "GIDEON_DATABASE_IDLE_TIMEOUT_MS",
    1_000,
    600_000,
    "Set GIDEON_DATABASE_IDLE_TIMEOUT_MS to an integer between 1000 and 600000."
  );
  requireIntegerRange(
    "GIDEON_POSTGRES_BACKUP_RETENTION_DAYS",
    7,
    365,
    "Set GIDEON_POSTGRES_BACKUP_RETENTION_DAYS to an integer between 7 and 365."
  );
  if (normalize(env.GIDEON_POSTGRES_PITR_ENABLED) !== "true") {
    errors.push("Set GIDEON_POSTGRES_PITR_ENABLED=true for staging point-in-time recovery.");
  }
  const restoreMaxAgeDays = requireIntegerRange(
    "GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS",
    1,
    365,
    "Set GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS to an integer between 1 and 365."
  );
  requireRecentIsoTimestamp(
    "GIDEON_POSTGRES_RESTORE_DRILL_AT",
    restoreMaxAgeDays,
    "Set GIDEON_POSTGRES_RESTORE_DRILL_AT to a recent ISO timestamp from a verified restore drill."
  );
  if (normalize(env.GIDEON_POSTGRES_MIGRATION_POLICY) !== "predeploy_migrate") {
    errors.push("Set GIDEON_POSTGRES_MIGRATION_POLICY=predeploy_migrate so migrations run before traffic promotion.");
  }
}

function requireStorageSignedDownloadSmoke() {
  const storageKey = normalize(env.GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY);
  if (!storageKey) {
    errors.push("Set GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY to an existing private export/render/source object key for signed-download smoke.");
    return;
  }
  if (!/^workspaces\/[^/]+\/projects\/[^/]+\/(?:export|render|source_recording)\//.test(storageKey)) {
    errors.push("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY must reference a workspace/project scoped source_recording, render, or export object.");
  }
}

function requireStorageLifecyclePolicy() {
  for (const [name, min, max] of [
    ["GIDEON_STORAGE_TEMP_RETENTION_DAYS", 1, 7],
    ["GIDEON_STORAGE_FAILED_RETENTION_DAYS", 1, 30],
    ["GIDEON_STORAGE_SOURCE_RETENTION_DAYS", 1, 3650],
    ["GIDEON_STORAGE_EXPORT_RETENTION_DAYS", 1, 3650],
    ["GIDEON_STORAGE_DELETION_SLA_HOURS", 1, 168],
    ["GIDEON_SIGNED_URL_MAX_SECONDS", 60, 3600]
  ]) {
    requireIntegerRange(name, min, max, `Set ${name} to an integer between ${min} and ${max} for staging private storage policy.`);
  }
  if (normalize(env.GIDEON_STORAGE_PUBLIC_BASE_URL) && normalize(env.GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL) !== "true") {
    errors.push("GIDEON_STORAGE_PUBLIC_BASE_URL must be unset for staging private artifacts unless GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL=true.");
  }
}

function requireProviderCanaryCostCeilings() {
  for (const name of [
    "GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD",
    "GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD",
    "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD",
    "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD",
    "GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD",
    "GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD",
    "GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD",
    "GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD"
  ]) {
    requireNonNegativeDecimal(name, `Set ${name} to a non-negative USD amount before live provider canaries.`);
  }
}

function requireHostedSmokeEnvironment() {
  const stagingApiBaseUrl = normalize(env.GIDEON_STAGING_API_BASE_URL);
  if (!stagingApiBaseUrl) {
    errors.push("Set GIDEON_STAGING_API_BASE_URL before running the live upload-to-export staging smoke.");
  } else {
    validateUrl(stagingApiBaseUrl, ["https:"], "GIDEON_STAGING_API_BASE_URL must be an absolute https:// URL.");
  }
  requireEnv("GIDEON_AUTH_CALLBACK_SECRET", "Set GIDEON_AUTH_CALLBACK_SECRET so staging smoke can create a hosted session.");
  requireEquals(
    "GIDEON_STAGING_SMOKE_LIVE",
    "true",
    "Set GIDEON_STAGING_SMOKE_LIVE=true before staging promotion."
  );
  requireReadableFile(
    "GIDEON_STAGING_SMOKE_RECORDING_PATH",
    "Set GIDEON_STAGING_SMOKE_RECORDING_PATH to a small staging recording fixture."
  );
  requirePositiveInteger(
    "GIDEON_STAGING_SMOKE_POLL_TIMEOUT_MS",
    "Set GIDEON_STAGING_SMOKE_POLL_TIMEOUT_MS to a positive timeout for live job polling."
  );
  requirePositiveInteger(
    "GIDEON_STAGING_SMOKE_POLL_INTERVAL_MS",
    "Set GIDEON_STAGING_SMOKE_POLL_INTERVAL_MS to a positive interval for live job polling."
  );
}

function requireHostedMcpSmokeEnvironment() {
  const stagingMcpApiBaseUrl = normalize(env.GIDEON_STAGING_MCP_API_BASE_URL);
  if (!stagingMcpApiBaseUrl) {
    errors.push("Set GIDEON_STAGING_MCP_API_BASE_URL before running the live hosted MCP staging smoke.");
  } else {
    validateUrl(stagingMcpApiBaseUrl, ["https:"], "GIDEON_STAGING_MCP_API_BASE_URL must be an absolute https:// URL.");
  }
  requireEnv(
    "GIDEON_STAGING_MCP_SESSION_COOKIE",
    "Set GIDEON_STAGING_MCP_SESSION_COOKIE to an active scratch-user hosted session before staging promotion."
  );
  requireEnv(
    "GIDEON_STAGING_MCP_PROJECT_ID",
    "Set GIDEON_STAGING_MCP_PROJECT_ID to a scratch project with at least one script and moment."
  );
  requireEquals(
    "GIDEON_STAGING_MCP_SMOKE_LIVE",
    "true",
    "Set GIDEON_STAGING_MCP_SMOKE_LIVE=true before staging promotion."
  );
  if (normalize(env.GIDEON_STAGING_MCP_REQUIRE_METRIC_EXPORT) === "true") {
    const metricProbeUrl = normalize(env.GIDEON_STAGING_MCP_METRIC_PROBE_URL);
    if (!metricProbeUrl) {
      errors.push("Set GIDEON_STAGING_MCP_METRIC_PROBE_URL when hosted MCP metric export is required.");
    } else {
      validateUrl(metricProbeUrl, ["https:"], "GIDEON_STAGING_MCP_METRIC_PROBE_URL must be an absolute https:// URL.");
    }
  }
}

function requireObservabilityPolicy() {
  const backend = normalize(env.GIDEON_OBSERVABILITY_BACKEND);
  if (!["datadog", "prometheus", "grafana", "honeycomb", "otel"].includes(backend)) {
    errors.push("Set GIDEON_OBSERVABILITY_BACKEND to datadog, prometheus, grafana, honeycomb, or otel.");
  }
  const metricExportUrl = normalize(env.GIDEON_OBSERVABILITY_METRIC_EXPORT_URL);
  if (!metricExportUrl) {
    errors.push("Set GIDEON_OBSERVABILITY_METRIC_EXPORT_URL for production metric export.");
  } else {
    validateUrl(metricExportUrl, ["https:"], "GIDEON_OBSERVABILITY_METRIC_EXPORT_URL must be an absolute https:// URL.");
  }
  const dashboardUrl = normalize(env.GIDEON_OBSERVABILITY_DASHBOARD_URL);
  if (!dashboardUrl) {
    errors.push("Set GIDEON_OBSERVABILITY_DASHBOARD_URL for production operations.");
  } else {
    validateUrl(dashboardUrl, ["https:"], "GIDEON_OBSERVABILITY_DASHBOARD_URL must be an absolute https:// URL.");
  }
  const runbookUrl = normalize(env.GIDEON_OBSERVABILITY_RUNBOOK_URL);
  if (!runbookUrl) {
    errors.push("Set GIDEON_OBSERVABILITY_RUNBOOK_URL for production incident response.");
  } else {
    validateUrl(runbookUrl, ["https:"], "GIDEON_OBSERVABILITY_RUNBOOK_URL must be an absolute https:// URL.");
  }
  const alertRoute = normalize(env.GIDEON_OBSERVABILITY_ALERT_ROUTE);
  if (!alertRoute || ["default", "dev", "local", "test"].includes(alertRoute.toLowerCase())) {
    errors.push("Set GIDEON_OBSERVABILITY_ALERT_ROUTE to a production alert route.");
  }
  if (normalize(env.GIDEON_OBSERVABILITY_PAGING_ENABLED) !== "true") {
    errors.push("Set GIDEON_OBSERVABILITY_PAGING_ENABLED=true for production incidents.");
  }
  requireIntegerRange(
    "GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS",
    60,
    3_600,
    "Set GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS to an integer between 60 and 3600."
  );
  requireIntegerRange(
    "GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR",
    1,
    100,
    "Set GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR to an integer between 1 and 100."
  );
  requireIntegerRange(
    "GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS",
    1_000,
    60_000,
    "Set GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS to an integer between 1000 and 60000."
  );
  requireIntegerRange(
    "GIDEON_OBSERVABILITY_STORAGE_P95_MS",
    100,
    60_000,
    "Set GIDEON_OBSERVABILITY_STORAGE_P95_MS to an integer between 100 and 60000."
  );
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`Could not read ${filePath}: ${error instanceof Error ? error.message : "unknown error"}.`);
    return {};
  }
}

function listSqlFiles(dir) {
  try {
    return fs.readdirSync(dir).filter((entry) => /^\d+_.+\.sql$/.test(entry)).sort();
  } catch (error) {
    errors.push(`Could not read ${dir}: ${error instanceof Error ? error.message : "unknown error"}.`);
    return [];
  }
}

function requireEnv(name, message) {
  if (!normalize(env[name])) {
    errors.push(message);
  }
}

function requireEquals(name, expected, message) {
  if (normalize(env[name]) !== expected) {
    errors.push(message);
  }
}

function requirePositiveInteger(name, message) {
  const value = normalize(env[name]);
  if (!value || !Number.isInteger(Number(value)) || Number(value) < 1) {
    errors.push(message);
  }
}

function requireIntegerRange(name, min, max, message) {
  const value = normalize(env[name]);
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(message);
    return null;
  }
  return parsed;
}

function requireNonNegativeDecimal(name, message) {
  const value = normalize(env[name]);
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed < 0) {
    errors.push(message);
  }
}

function requireReadableFile(name, message) {
  const value = normalize(env[name]);
  if (!value) {
    errors.push(message);
    return;
  }
  try {
    const stats = fs.statSync(value);
    if (!stats.isFile() || stats.size < 1) {
      errors.push(`${name} must point to a non-empty file.`);
    }
  } catch {
    errors.push(`${name} must point to a readable file.`);
  }
}

function requireRecentIsoTimestamp(name, maxAgeDays, message) {
  const value = normalize(env[name]);
  if (!value) {
    errors.push(message);
    return;
  }
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) {
    errors.push(`${name} must be an ISO-8601 timestamp.`);
    return;
  }
  if (parsedMs > Date.now() + 60_000) {
    errors.push(`${name} must not be in the future.`);
  }
  if (Number.isInteger(maxAgeDays) && Date.now() - parsedMs > maxAgeDays * 24 * 60 * 60 * 1_000) {
    errors.push(`${name} must be within the last ${maxAgeDays} days.`);
  }
}

function validateUrl(value, protocols, message) {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(message);
    }
  } catch {
    errors.push(message);
  }
}

function validateLeaseHeartbeatRatio() {
  const leaseSeconds = Number(normalize(env.GIDEON_WORKER_LEASE_SECONDS));
  const heartbeatMs = Number(normalize(env.GIDEON_WORKER_HEARTBEAT_INTERVAL_MS));
  if (!Number.isFinite(leaseSeconds) || !Number.isFinite(heartbeatMs) || leaseSeconds < 1 || heartbeatMs < 1) {
    return;
  }
  if (heartbeatMs >= leaseSeconds * 1000) {
    errors.push("GIDEON_WORKER_HEARTBEAT_INTERVAL_MS must be lower than GIDEON_WORKER_LEASE_SECONDS.");
  }
}

function normalize(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}
