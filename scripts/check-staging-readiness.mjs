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
    "production:github-promote:run",
    "production:live-env:check",
    "production:fixtures:materialize"
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

  if (!normalize(env.GIDEON_OPENAI_API_KEY ?? env.OPENAI_API_KEY)) {
    errors.push("Set GIDEON_OPENAI_API_KEY or OPENAI_API_KEY before running live provider canaries.");
  }
  requireEquals("GIDEON_PROVIDER_CANARY_LIVE", "true", "Set GIDEON_PROVIDER_CANARY_LIVE=true before staging promotion.");
  requireReadableFile("GIDEON_PROVIDER_CANARY_AUDIO_PATH", "Set GIDEON_PROVIDER_CANARY_AUDIO_PATH to a small staging audio fixture.");
  requireReadableFile("GIDEON_PROVIDER_CANARY_IMAGE_PATH", "Set GIDEON_PROVIDER_CANARY_IMAGE_PATH to a small staging screenshot fixture.");
  requireHostedSmokeEnvironment();
  requireHostedMcpSmokeEnvironment();

  requireEquals("GIDEON_RELEASE_CHANNEL", "production", "Set GIDEON_RELEASE_CHANNEL=production for staging release promotion checks.");
  requireEnv("APPLE_TEAM_ID", "Set APPLE_TEAM_ID for production release notarization checks.");
  requireEnv("APPLE_ID", "Set APPLE_ID for production release notarization checks.");
  requireEnv("APPLE_APP_SPECIFIC_PASSWORD", "Set APPLE_APP_SPECIFIC_PASSWORD for production release notarization checks.");
  if (!normalize(env.CSC_LINK) && !normalize(env.CSC_NAME)) {
    errors.push("Set CSC_LINK or CSC_NAME so production release candidates can be signed.");
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
