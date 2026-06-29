#!/usr/bin/env node

const env = process.env;
const errors = [];
const warnings = [];

const queueProvider = normalize(env.GIDEON_HOSTED_QUEUE_PROVIDER ?? env.GIDEON_WORKER_QUEUE_PROVIDER);
if (queueProvider !== "bullmq") {
  errors.push("Set GIDEON_HOSTED_QUEUE_PROVIDER=bullmq for a separately scaled hosted worker.");
}

const redisUrl = normalize(env.GIDEON_REDIS_URL ?? env.REDIS_URL);
if (!redisUrl) {
  errors.push("Set GIDEON_REDIS_URL or REDIS_URL for the BullMQ hosted worker broker.");
} else {
  validateRedisUrl(redisUrl);
}

requireNonEmpty("GIDEON_WORKER_ID", "Set a stable worker identity for logs, leases, and metrics.");
requirePositiveInteger("GIDEON_WORKER_LEASE_SECONDS", "Set a positive worker lease duration in seconds.");
requirePositiveInteger("GIDEON_WORKER_HEARTBEAT_INTERVAL_MS", "Set a positive heartbeat interval in milliseconds.");

if (!normalize(env.GIDEON_USER_DATA_DIR) && !normalize(env.GIDEON_STORE_PATH)) {
  errors.push("Set GIDEON_USER_DATA_DIR or GIDEON_STORE_PATH so the worker has durable store state.");
}

if (!normalize(env.GIDEON_PROJECTS_DIR)) {
  warnings.push("GIDEON_PROJECTS_DIR is not set; local project media paths will default to app data.");
}

if (!normalize(env.GIDEON_STORAGE_ROOT)) {
  warnings.push("GIDEON_STORAGE_ROOT is not set; local artifact storage will default to app data.");
}

const storageProvider = normalize(env.GIDEON_STORAGE_PROVIDER);
if (storageProvider && storageProvider !== "local") {
  ["GIDEON_STORAGE_BUCKET", "GIDEON_STORAGE_ACCESS_KEY_ID", "GIDEON_STORAGE_SECRET_ACCESS_KEY"].forEach((name) =>
    requireNonEmpty(name, `Set ${name} for ${storageProvider} private artifact storage.`)
  );
}

if (!normalize(env.OPENAI_API_KEY) && !normalize(env.GIDEON_OPENAI_API_KEY)) {
  warnings.push("No OpenAI API key is configured; analysis, ASR, and TTS will use local fallback behavior where available.");
}

if (!normalize(env.GIDEON_SESSION_SECRET)) {
  warnings.push("GIDEON_SESSION_SECRET is not set. This is acceptable for a detached worker, but web/API sessions need it.");
}

if (errors.length > 0) {
  console.error("Hosted worker deployment configuration is not ready:");
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

console.log("Hosted worker deployment configuration looks usable.");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function normalize(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function requireNonEmpty(name, message) {
  if (!normalize(env[name])) {
    errors.push(message);
  }
}

function requirePositiveInteger(name, message) {
  const value = normalize(env[name]);
  if (!value || !Number.isInteger(Number(value)) || Number(value) < 1) {
    errors.push(message);
  }
}

function validateRedisUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      errors.push("Redis URL must use redis:// or rediss://.");
    }
  } catch {
    errors.push("Redis URL is not a valid URL.");
  }
}
