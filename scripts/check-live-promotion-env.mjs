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
  "GIDEON_WORKER_ID",
  "GIDEON_DATABASE_URL",
  "GIDEON_SESSION_SECRET",
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_OPENAI_API_KEY",
  "GIDEON_STAGING_API_BASE_URL",
  "GIDEON_AUTH_CALLBACK_SECRET",
  "GIDEON_STAGING_MCP_API_BASE_URL",
  "GIDEON_STAGING_MCP_SESSION_COOKIE",
  "GIDEON_STAGING_MCP_PROJECT_ID",
  "GIDEON_STAGING_MCP_METRIC_PROBE_URL"
];

const signingEnv = ["APPLE_TEAM_ID", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"];

if (dryRun) {
  console.log("Live promotion environment check dry-run:");
  console.log(`1. Require fixture secrets: ${fixtureEnv.join(", ")}.`);
  console.log(`2. Require staging/provider/storage/MCP env: ${requiredEnv.join(", ")}.`);
  console.log("3. Validate rediss:// Redis, postgres:// database, https:// staging URLs, and s3/r2 storage provider.");
  console.log("4. Require Apple signing/notarization env unless --skip-package or GIDEON_LIVE_PROMOTION_SKIP_PACKAGE=true.");
  process.exit(0);
}

for (const name of fixtureEnv) {
  requireBase64(name);
}
for (const name of requiredEnv) {
  requireNonEmpty(name);
}

validateUrl("GIDEON_REDIS_URL", ["rediss:"], "GIDEON_REDIS_URL must be a rediss:// URL for live promotion.");
validateUrl("GIDEON_DATABASE_URL", ["postgres:", "postgresql:"], "GIDEON_DATABASE_URL must be a postgres:// URL.");
if (value("GIDEON_DATABASE_URL") && !value("GIDEON_DATABASE_URL").includes("sslmode=require")) {
  errors.push("GIDEON_DATABASE_URL must include sslmode=require for live promotion.");
}
validateUrl("GIDEON_STAGING_API_BASE_URL", ["https:"], "GIDEON_STAGING_API_BASE_URL must be an https:// URL.");
validateUrl("GIDEON_STAGING_MCP_API_BASE_URL", ["https:"], "GIDEON_STAGING_MCP_API_BASE_URL must be an https:// URL.");
validateUrl("GIDEON_STAGING_MCP_METRIC_PROBE_URL", ["https:"], "GIDEON_STAGING_MCP_METRIC_PROBE_URL must be an https:// URL.");

const storageProvider = value("GIDEON_STORAGE_PROVIDER");
if (storageProvider && storageProvider !== "s3" && storageProvider !== "r2") {
  errors.push("GIDEON_STORAGE_PROVIDER must be s3 or r2 for live promotion.");
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

function value(name) {
  return process.env[name]?.trim() ?? "";
}
