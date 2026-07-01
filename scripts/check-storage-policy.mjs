#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];

const requiredEnv = [
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_STORAGE_TEMP_RETENTION_DAYS",
  "GIDEON_STORAGE_FAILED_RETENTION_DAYS",
  "GIDEON_STORAGE_SOURCE_RETENTION_DAYS",
  "GIDEON_STORAGE_EXPORT_RETENTION_DAYS",
  "GIDEON_STORAGE_DELETION_SLA_HOURS",
  "GIDEON_SIGNED_URL_MAX_SECONDS"
];

if (dryRun) {
  console.log("Storage lifecycle policy check dry-run:");
  console.log(`1. Require private S3/R2 storage env: ${requiredEnv.join(", ")}.`);
  console.log("2. Validate HTTPS storage endpoint, non-empty bucket, and non-public production artifact URLs.");
  console.log("3. Require temp/failed/source/export retention windows and deletion SLA.");
  console.log("4. Require signed URL lifetime to stay short-lived.");
  console.log("5. Fail on public base URL configuration unless explicitly allowed for controlled rehearsal.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

const provider = value("GIDEON_STORAGE_PROVIDER");
if (provider !== "s3" && provider !== "r2") {
  errors.push("GIDEON_STORAGE_PROVIDER must be s3 or r2 for production private object storage.");
}

validateUrl("GIDEON_STORAGE_ENDPOINT", ["https:"], "GIDEON_STORAGE_ENDPOINT must be an https:// URL.");
validateBucketName();
validateRetentionWindow("GIDEON_STORAGE_TEMP_RETENTION_DAYS", 1, 7);
validateRetentionWindow("GIDEON_STORAGE_FAILED_RETENTION_DAYS", 1, 30);
validateRetentionWindow("GIDEON_STORAGE_SOURCE_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_EXPORT_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_DELETION_SLA_HOURS", 1, 168);
validateRetentionWindow("GIDEON_SIGNED_URL_MAX_SECONDS", 60, 3600);
validatePublicBaseUrl();

if (errors.length > 0) {
  console.error("Storage lifecycle policy check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Storage lifecycle policy check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for production storage lifecycle checks.`);
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

function validateBucketName() {
  const bucket = value("GIDEON_STORAGE_BUCKET");
  if (!bucket) {
    return;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) {
    errors.push("GIDEON_STORAGE_BUCKET must be a DNS-compatible private bucket name.");
  }
  if (/public|website|static/i.test(bucket)) {
    errors.push("GIDEON_STORAGE_BUCKET name must not indicate public website/static hosting.");
  }
}

function validateRetentionWindow(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function validatePublicBaseUrl() {
  const publicBaseUrl = value("GIDEON_STORAGE_PUBLIC_BASE_URL");
  if (!publicBaseUrl) {
    return;
  }
  if (value("GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL") === "true") {
    return;
  }
  errors.push("GIDEON_STORAGE_PUBLIC_BASE_URL must be unset for production private artifacts unless GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL=true.");
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
