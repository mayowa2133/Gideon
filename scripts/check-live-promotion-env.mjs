#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const skipPackage = args.has("--skip-package") || process.env.GIDEON_LIVE_PROMOTION_SKIP_PACKAGE === "true";
const errors = [];

const fixtureEnv = [
  "GIDEON_PROVIDER_CANARY_AUDIO_BASE64",
  "GIDEON_PROVIDER_CANARY_IMAGE_BASE64",
  "GIDEON_STAGING_SMOKE_RECORDING_BASE64"
];

const requiredEnv = [
  "GIDEON_REDIS_URL",
  "GIDEON_BULLMQ_QUEUE_NAME",
  "GIDEON_BULLMQ_PREFIX",
  "GIDEON_BULLMQ_CONCURRENCY",
  "GIDEON_BULLMQ_ATTEMPTS",
  "GIDEON_BULLMQ_BACKOFF_TYPE",
  "GIDEON_BULLMQ_BACKOFF_DELAY_MS",
  "GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT",
  "GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT",
  "GIDEON_BULLMQ_DEAD_LETTER_POLICY",
  "GIDEON_WORKER_ID",
  "GIDEON_DATABASE_URL",
  "GIDEON_DATABASE_POOL_MAX",
  "GIDEON_DATABASE_STATEMENT_TIMEOUT_MS",
  "GIDEON_DATABASE_IDLE_TIMEOUT_MS",
  "GIDEON_POSTGRES_BACKUP_RETENTION_DAYS",
  "GIDEON_POSTGRES_PITR_ENABLED",
  "GIDEON_POSTGRES_RESTORE_DRILL_AT",
  "GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS",
  "GIDEON_POSTGRES_MIGRATION_POLICY",
  "GIDEON_SESSION_SECRET",
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_STORAGE_TEMP_RETENTION_DAYS",
  "GIDEON_STORAGE_FAILED_RETENTION_DAYS",
  "GIDEON_STORAGE_SOURCE_RETENTION_DAYS",
  "GIDEON_VOICEOVER_RETENTION_DAYS",
  "GIDEON_STORAGE_EXPORT_RETENTION_DAYS",
  "GIDEON_STORAGE_DELETION_SLA_HOURS",
  "GIDEON_SIGNED_URL_MAX_SECONDS",
  "GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY",
  "GIDEON_OPENAI_TTS_MODEL",
  "GIDEON_OPENAI_TTS_VOICE",
  "GIDEON_TTS_APPROVED_VOICES",
  "GIDEON_TTS_VOICE_REVIEWED_AT",
  "GIDEON_VOICEOVER_DELETION_SLA_HOURS",
  "GIDEON_OPENAI_LLM_MODEL",
  "GIDEON_ANALYSIS_PROMPT_VERSION",
  "GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS",
  "GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION",
  "GIDEON_ANALYSIS_PROMPT_REVIEWED_AT",
  "GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE",
  "GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT",
  "GIDEON_ANALYSIS_MODEL_CANARY_PERCENT",
  "GIDEON_OPENAI_API_KEY",
  "GIDEON_STAGING_API_BASE_URL",
  "GIDEON_AUTH_CALLBACK_SECRET",
  "GIDEON_STAGING_MCP_API_BASE_URL",
  "GIDEON_STAGING_MCP_SESSION_COOKIE",
  "GIDEON_STAGING_MCP_PROJECT_ID",
  "GIDEON_STAGING_MCP_METRIC_PROBE_URL",
  "GIDEON_MCP_SSO_PROVIDER",
  "GIDEON_MCP_SESSION_MAX_AGE_SECONDS",
  "GIDEON_MCP_SESSION_ROTATION_HOURS",
  "GIDEON_MCP_REQUIRE_CSRF",
  "GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS",
  "GIDEON_MCP_LOAD_CONCURRENCY",
  "GIDEON_MCP_LOAD_REQUESTS",
  "GIDEON_MCP_LOAD_P95_MS",
  "GIDEON_MCP_LOAD_ERROR_RATE_MAX",
  "GIDEON_OBSERVABILITY_BACKEND",
  "GIDEON_OBSERVABILITY_METRIC_EXPORT_URL",
  "GIDEON_OBSERVABILITY_DASHBOARD_URL",
  "GIDEON_OBSERVABILITY_RUNBOOK_URL",
  "GIDEON_OBSERVABILITY_ALERT_ROUTE",
  "GIDEON_OBSERVABILITY_PAGING_ENABLED",
  "GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS",
  "GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR",
  "GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS",
  "GIDEON_OBSERVABILITY_STORAGE_P95_MS"
];

const providerCostEnv = [
  "GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD"
];

const signingEnv = ["APPLE_TEAM_ID", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"];

if (dryRun) {
  console.log("Live promotion environment check dry-run:");
  console.log(`1. Require fixture secrets: ${fixtureEnv.join(", ")}.`);
  console.log(`2. Require staging/provider/storage/MCP env: ${requiredEnv.join(", ")}.`);
  console.log(`3. Require provider canary cost ceilings: ${providerCostEnv.join(", ")}.`);
  console.log("4. Validate rediss:// Redis, postgres:// database, https:// staging URLs, and s3/r2 storage provider.");
  console.log("5. Require Apple signing/notarization env unless --skip-package or GIDEON_LIVE_PROMOTION_SKIP_PACKAGE=true.");
  process.exit(0);
}

for (const name of fixtureEnv) {
  requireBase64(name);
}
for (const name of requiredEnv) {
  requireNonEmpty(name);
}
for (const name of providerCostEnv) {
  requirePositiveMoney(name);
}

validateUrl("GIDEON_REDIS_URL", ["rediss:"], "GIDEON_REDIS_URL must be a rediss:// URL for live promotion.");
validateRetentionWindow("GIDEON_BULLMQ_CONCURRENCY", 1, 100);
validateRetentionWindow("GIDEON_BULLMQ_ATTEMPTS", 2, 10);
if (value("GIDEON_BULLMQ_BACKOFF_TYPE") !== "fixed" && value("GIDEON_BULLMQ_BACKOFF_TYPE") !== "exponential") {
  errors.push("GIDEON_BULLMQ_BACKOFF_TYPE must be fixed or exponential.");
}
validateRetentionWindow("GIDEON_BULLMQ_BACKOFF_DELAY_MS", 1_000, 300_000);
validateRetentionWindow("GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT", 100, 100_000);
validateRetentionWindow("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT", 1_000, 500_000);
if (Number(value("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT")) < Number(value("GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT"))) {
  errors.push("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT must be greater than or equal to GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT.");
}
if (value("GIDEON_BULLMQ_DEAD_LETTER_POLICY") !== "retain_failed") {
  errors.push("GIDEON_BULLMQ_DEAD_LETTER_POLICY must be retain_failed.");
}
validateUrl("GIDEON_DATABASE_URL", ["postgres:", "postgresql:"], "GIDEON_DATABASE_URL must be a postgres:// URL.");
if (value("GIDEON_DATABASE_URL") && !value("GIDEON_DATABASE_URL").includes("sslmode=require")) {
  errors.push("GIDEON_DATABASE_URL must include sslmode=require for live promotion.");
}
if (value("GIDEON_DATABASE_URL")) {
  try {
    const databaseUrl = new URL(value("GIDEON_DATABASE_URL"));
    if (databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1") {
      errors.push("GIDEON_DATABASE_URL must point to managed PostgreSQL for live promotion.");
    }
  } catch {
    // validateUrl already records the URL failure.
  }
}
validateRetentionWindow("GIDEON_DATABASE_POOL_MAX", 2, 100);
validateRetentionWindow("GIDEON_DATABASE_STATEMENT_TIMEOUT_MS", 1_000, 300_000);
validateRetentionWindow("GIDEON_DATABASE_IDLE_TIMEOUT_MS", 1_000, 600_000);
validateRetentionWindow("GIDEON_POSTGRES_BACKUP_RETENTION_DAYS", 7, 365);
if (value("GIDEON_POSTGRES_PITR_ENABLED") !== "true") {
  errors.push("GIDEON_POSTGRES_PITR_ENABLED must be true for live promotion.");
}
const restoreDrillMaxAgeDays = validateRetentionWindow("GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS", 1, 365);
validateRecentIsoTimestamp("GIDEON_POSTGRES_RESTORE_DRILL_AT", restoreDrillMaxAgeDays);
if (value("GIDEON_POSTGRES_MIGRATION_POLICY") !== "predeploy_migrate") {
  errors.push("GIDEON_POSTGRES_MIGRATION_POLICY must be predeploy_migrate.");
}
validateUrl("GIDEON_STORAGE_ENDPOINT", ["https:"], "GIDEON_STORAGE_ENDPOINT must be an https:// URL.");
validateUrl("GIDEON_STAGING_API_BASE_URL", ["https:"], "GIDEON_STAGING_API_BASE_URL must be an https:// URL.");
validateUrl("GIDEON_STAGING_MCP_API_BASE_URL", ["https:"], "GIDEON_STAGING_MCP_API_BASE_URL must be an https:// URL.");
validateUrl("GIDEON_STAGING_MCP_METRIC_PROBE_URL", ["https:"], "GIDEON_STAGING_MCP_METRIC_PROBE_URL must be an https:// URL.");
validateMcpAccessPolicy();
validateObservabilityPolicy();

const storageProvider = value("GIDEON_STORAGE_PROVIDER");
if (storageProvider && storageProvider !== "s3" && storageProvider !== "r2") {
  errors.push("GIDEON_STORAGE_PROVIDER must be s3 or r2 for live promotion.");
}
validateRetentionWindow("GIDEON_STORAGE_TEMP_RETENTION_DAYS", 1, 7);
validateRetentionWindow("GIDEON_STORAGE_FAILED_RETENTION_DAYS", 1, 30);
validateRetentionWindow("GIDEON_STORAGE_SOURCE_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_VOICEOVER_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_EXPORT_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_DELETION_SLA_HOURS", 1, 168);
validateRetentionWindow("GIDEON_SIGNED_URL_MAX_SECONDS", 60, 3600);
validateTtsPolicy();
validatePromptRolloutPolicy();
if (value("GIDEON_STORAGE_PUBLIC_BASE_URL") && value("GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL") !== "true") {
  errors.push("GIDEON_STORAGE_PUBLIC_BASE_URL must be unset for live private artifacts unless GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL=true.");
}
const signedDownloadSmokeKey = value("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY");
if (signedDownloadSmokeKey && !/^workspaces\/[^/]+\/projects\/[^/]+\/(?:export|render|source_recording)\//.test(signedDownloadSmokeKey)) {
  errors.push("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY must reference a workspace/project scoped source_recording, render, or export object.");
}

if (!skipPackage) {
  for (const name of signingEnv) {
    requireNonEmpty(name);
  }
  if (!value("CSC_LINK") && !value("CSC_NAME")) {
    errors.push("Set CSC_LINK or CSC_NAME so the live promotion can sign production artifacts.");
  }
}

if (errors.length > 0) {
  console.error("Live promotion environment check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(skipPackage ? "Live promotion environment check passed for infrastructure rehearsal." : "Live promotion environment check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for live promotion.`);
  }
}

function requireBase64(name) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required for live promotion fixtures.`);
    return;
  }
  const normalized = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    errors.push(`${name} must be valid base64.`);
    return;
  }
  if (Buffer.from(normalized, "base64").length < 1) {
    errors.push(`${name} must decode to non-empty fixture bytes.`);
  }
}

function requirePositiveMoney(name) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required for live provider canary cost ceilings.`);
    return;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`${name} must be a non-negative USD amount.`);
  }
}

function validateRetentionWindow(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
    return null;
  }
  return parsed;
}

function validateUrl(name, protocols, message) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  try {
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(message);
    }
  } catch {
    errors.push(message);
  }
}

function validateObservabilityPolicy() {
  const backend = value("GIDEON_OBSERVABILITY_BACKEND");
  if (!["datadog", "prometheus", "grafana", "honeycomb", "otel"].includes(backend)) {
    errors.push("GIDEON_OBSERVABILITY_BACKEND must be one of: datadog, prometheus, grafana, honeycomb, otel.");
  }
  validateUrl("GIDEON_OBSERVABILITY_METRIC_EXPORT_URL", ["https:"], "GIDEON_OBSERVABILITY_METRIC_EXPORT_URL must be an https:// URL.");
  validateUrl("GIDEON_OBSERVABILITY_DASHBOARD_URL", ["https:"], "GIDEON_OBSERVABILITY_DASHBOARD_URL must be an https:// URL.");
  validateUrl("GIDEON_OBSERVABILITY_RUNBOOK_URL", ["https:"], "GIDEON_OBSERVABILITY_RUNBOOK_URL must be an https:// URL.");
  if (["default", "dev", "local", "test"].includes(value("GIDEON_OBSERVABILITY_ALERT_ROUTE").toLowerCase())) {
    errors.push("GIDEON_OBSERVABILITY_ALERT_ROUTE must identify a production alert route.");
  }
  if (value("GIDEON_OBSERVABILITY_PAGING_ENABLED") !== "true") {
    errors.push("GIDEON_OBSERVABILITY_PAGING_ENABLED must be true for live promotion.");
  }
  validateRetentionWindow("GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS", 60, 3_600);
  validateRetentionWindow("GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR", 1, 100);
  validateRetentionWindow("GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS", 1_000, 60_000);
  validateRetentionWindow("GIDEON_OBSERVABILITY_STORAGE_P95_MS", 100, 60_000);
}

function validateTtsPolicy() {
  validateSafeIdentifier("GIDEON_OPENAI_TTS_MODEL", 2, 80);
  validateSafeIdentifier("GIDEON_OPENAI_TTS_VOICE", 2, 80);
  const voice = value("GIDEON_OPENAI_TTS_VOICE");
  const voices = value("GIDEON_TTS_APPROVED_VOICES")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  for (const candidate of voices) {
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(candidate)) {
      errors.push("GIDEON_TTS_APPROVED_VOICES must be a comma-separated list of safe voice identifiers.");
      break;
    }
  }
  if (voice && voices.length > 0 && !voices.includes(voice)) {
    errors.push("GIDEON_OPENAI_TTS_VOICE must be included in GIDEON_TTS_APPROVED_VOICES.");
  }
  validateRecentIsoTimestamp("GIDEON_TTS_VOICE_REVIEWED_AT", 180);
  validateRetentionWindow("GIDEON_VOICEOVER_DELETION_SLA_HOURS", 1, 168);
}

function validatePromptRolloutPolicy() {
  validateSafeIdentifier("GIDEON_OPENAI_LLM_MODEL", 2, 80);
  validateSafeIdentifier("GIDEON_ANALYSIS_PROMPT_VERSION", 2, 80);
  validateSafeIdentifier("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION", 2, 80);
  const active = value("GIDEON_ANALYSIS_PROMPT_VERSION");
  const rollback = value("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION");
  const approved = value("GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  for (const candidate of approved) {
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(candidate)) {
      errors.push("GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS must be a comma-separated list of safe prompt version identifiers.");
      break;
    }
  }
  if (active && approved.length > 0 && !approved.includes(active)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS.");
  }
  if (rollback && approved.length > 0 && !approved.includes(rollback)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS.");
  }
  if (active && rollback && active === rollback) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION must differ from GIDEON_ANALYSIS_PROMPT_VERSION.");
  }
  validateRecentIsoTimestamp("GIDEON_ANALYSIS_PROMPT_REVIEWED_AT", 180);

  const stage = value("GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE");
  if (!["canary", "staging", "production"].includes(stage)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE must be one of: canary, staging, production.");
  }
  const rolloutPercent = validateRetentionWindow("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT", 1, 100);
  const canaryPercent = validateRetentionWindow("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT", 0, 50);
  if (!Number.isInteger(rolloutPercent) || !Number.isInteger(canaryPercent)) {
    return;
  }
  if (stage === "canary") {
    if (rolloutPercent > 50) {
      errors.push("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT must be 50 or lower when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=canary.");
    }
    if (canaryPercent < 1) {
      errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be at least 1 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=canary.");
    }
  }
  if (stage === "staging" && canaryPercent !== 0) {
    errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be 0 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=staging.");
  }
  if (stage === "production") {
    if (rolloutPercent !== 100) {
      errors.push("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT must be 100 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=production.");
    }
    if (canaryPercent !== 0) {
      errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be 0 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=production.");
    }
  }
}

function validateMcpAccessPolicy() {
  const provider = value("GIDEON_MCP_SSO_PROVIDER");
  if (provider && !["oidc", "google", "github", "saml", "enterprise"].includes(provider)) {
    errors.push("GIDEON_MCP_SSO_PROVIDER must be one of: oidc, google, github, saml, enterprise.");
  }
  validateRetentionWindow("GIDEON_MCP_SESSION_MAX_AGE_SECONDS", 300, 43_200);
  validateRetentionWindow("GIDEON_MCP_SESSION_ROTATION_HOURS", 1, 24);
  if (value("GIDEON_MCP_REQUIRE_CSRF") !== "true") {
    errors.push("GIDEON_MCP_REQUIRE_CSRF must be true for hosted MCP production access.");
  }
  if (value("GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS") !== "true") {
    errors.push("GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS must be true for hosted MCP production access.");
  }
  validateRetentionWindow("GIDEON_MCP_LOAD_CONCURRENCY", 1, 100);
  validateRetentionWindow("GIDEON_MCP_LOAD_REQUESTS", 10, 100_000);
  validateRetentionWindow("GIDEON_MCP_LOAD_P95_MS", 100, 10_000);
  validateRate("GIDEON_MCP_LOAD_ERROR_RATE_MAX", 0, 0.05);
}

function validateSafeIdentifier(name, minLength, maxLength) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  if (raw.length < minLength || raw.length > maxLength || !/^[A-Za-z0-9._-]+$/.test(raw)) {
    errors.push(`${name} must be ${minLength}-${maxLength} characters using only letters, numbers, dots, underscores, and hyphens.`);
  }
}

function validateRate(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be a number between ${min} and ${max}.`);
  }
}

function validateRecentIsoTimestamp(name, maxAgeDays) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required for live promotion.`);
    return;
  }
  const parsedMs = Date.parse(raw);
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

function value(name) {
  return process.env[name]?.trim() ?? "";
}
