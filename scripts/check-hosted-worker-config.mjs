#!/usr/bin/env node

const env = process.env;
const errors = [];
const warnings = [];
const deploymentEnv = normalize(env.GIDEON_DEPLOYMENT_ENV ?? env.NODE_ENV);
const productionMode = deploymentEnv === "production";

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

const bullMqQueueName = normalize(env.GIDEON_BULLMQ_QUEUE_NAME ?? env.GIDEON_WORKER_QUEUE_NAME);
const bullMqPrefix = normalize(env.GIDEON_BULLMQ_PREFIX);
if (productionMode) {
  requireNonEmpty("GIDEON_BULLMQ_QUEUE_NAME", "Set GIDEON_BULLMQ_QUEUE_NAME in production to isolate the worker queue.");
  requireNonEmpty("GIDEON_BULLMQ_PREFIX", "Set GIDEON_BULLMQ_PREFIX in production to isolate Redis keys by environment.");
}

requireNonEmpty("GIDEON_WORKER_ID", "Set a stable worker identity for logs, leases, and metrics.");
requirePositiveInteger("GIDEON_WORKER_LEASE_SECONDS", "Set a positive worker lease duration in seconds.");
requirePositiveInteger("GIDEON_WORKER_HEARTBEAT_INTERVAL_MS", "Set a positive heartbeat interval in milliseconds.");
validateLeaseHeartbeatRatio();

const userDataDir = normalize(env.GIDEON_USER_DATA_DIR);
const storePath = normalize(env.GIDEON_STORE_PATH);
const storeProvider = normalize(env.GIDEON_STORE_PROVIDER) || "file";
const databaseUrl = normalize(env.GIDEON_DATABASE_URL ?? env.DATABASE_URL);
const projectsDir = normalize(env.GIDEON_PROJECTS_DIR);
const storageRoot = normalize(env.GIDEON_STORAGE_ROOT);

if (storeProvider !== "file" && storeProvider !== "postgres_snapshot") {
  errors.push("GIDEON_STORE_PROVIDER must be file or postgres_snapshot.");
}

if (storeProvider === "postgres_snapshot") {
  if (!databaseUrl) {
    errors.push("Set GIDEON_DATABASE_URL or DATABASE_URL when GIDEON_STORE_PROVIDER=postgres_snapshot.");
  } else {
    validatePostgresUrl(databaseUrl);
  }
  validateSimpleIdentifier(
    normalize(env.GIDEON_POSTGRES_SNAPSHOT_TABLE) || "gideon_app_state_snapshots",
    "GIDEON_POSTGRES_SNAPSHOT_TABLE"
  );
}

if (storeProvider === "file" && !userDataDir && !storePath) {
  errors.push("Set GIDEON_USER_DATA_DIR or GIDEON_STORE_PATH so the worker has durable store state.");
}

if (!projectsDir) {
  warnings.push("GIDEON_PROJECTS_DIR is not set; local project media paths will default to app data.");
}

if (!storageRoot) {
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

if (productionMode) {
  validateProductionHardening({
    redisUrl,
    bullMqQueueName,
    bullMqPrefix,
    storageProvider,
    storeProvider,
    databaseUrl,
    userDataDir,
    storePath,
    projectsDir,
    storageRoot
  });
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

function validatePostgresUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      errors.push("Database URL must use postgres:// or postgresql://.");
    }
  } catch {
    errors.push("Database URL is not a valid URL.");
  }
}

function validateSimpleIdentifier(value, name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    errors.push(`${name} must be a simple PostgreSQL identifier.`);
  }
}

function validateLeaseHeartbeatRatio() {
  const leaseSeconds = Number(normalize(env.GIDEON_WORKER_LEASE_SECONDS));
  const heartbeatMs = Number(normalize(env.GIDEON_WORKER_HEARTBEAT_INTERVAL_MS));
  if (!Number.isFinite(leaseSeconds) || !Number.isFinite(heartbeatMs) || leaseSeconds < 1 || heartbeatMs < 1) {
    return;
  }
  const leaseMs = leaseSeconds * 1000;
  if (heartbeatMs >= leaseMs) {
    errors.push("GIDEON_WORKER_HEARTBEAT_INTERVAL_MS must be lower than GIDEON_WORKER_LEASE_SECONDS so leases renew before expiry.");
    return;
  }
  if (heartbeatMs > leaseMs / 2) {
    warnings.push("Heartbeat interval is more than half the lease duration; use a shorter interval to reduce false lease recovery.");
  }
}

function validateProductionHardening(input) {
  if (input.redisUrl.startsWith("redis://") && normalize(env.GIDEON_ALLOW_INSECURE_REDIS) !== "true") {
    errors.push("Production hosted workers must use rediss:// Redis unless GIDEON_ALLOW_INSECURE_REDIS=true is explicitly set.");
  }
  if (input.bullMqQueueName === "gideon-hosted-worker-jobs") {
    warnings.push("Production GIDEON_BULLMQ_QUEUE_NAME is using the default name; include an environment suffix to avoid cross-environment queue collisions.");
  }
  if (input.bullMqPrefix === "gideon") {
    warnings.push("Production GIDEON_BULLMQ_PREFIX is using the local default; include an environment suffix to avoid Redis key collisions.");
  }
  const localStorageAllowed = normalize(env.GIDEON_ALLOW_LOCAL_PRODUCTION_STORAGE) === "true";
  if ((!input.storageProvider || input.storageProvider === "local") && !localStorageAllowed) {
    errors.push("Production workers should use private object storage; set GIDEON_STORAGE_PROVIDER=s3/r2 or GIDEON_ALLOW_LOCAL_PRODUCTION_STORAGE=true.");
  }
  const localStoreAllowed = normalize(env.GIDEON_ALLOW_LOCAL_PRODUCTION_STORE) === "true";
  if (input.storeProvider === "file" && !localStoreAllowed) {
    errors.push("Production workers should use GIDEON_STORE_PROVIDER=postgres_snapshot with GIDEON_DATABASE_URL, or set GIDEON_ALLOW_LOCAL_PRODUCTION_STORE=true for a controlled local-store deployment.");
  }
  const insecureDatabaseAllowed = normalize(env.GIDEON_ALLOW_INSECURE_DATABASE) === "true";
  if (
    input.storeProvider === "postgres_snapshot" &&
    input.databaseUrl &&
    !input.databaseUrl.includes("sslmode=require") &&
    !insecureDatabaseAllowed
  ) {
    errors.push("Production database URLs should require TLS with sslmode=require unless GIDEON_ALLOW_INSECURE_DATABASE=true is explicitly set.");
  }
  const noProviderAllowed = normalize(env.GIDEON_ALLOW_NO_PROVIDER_KEYS) === "true";
  if (!normalize(env.OPENAI_API_KEY) && !normalize(env.GIDEON_OPENAI_API_KEY) && !noProviderAllowed) {
    errors.push("Production workers need provider credentials for real ASR/LLM/TTS, or set GIDEON_ALLOW_NO_PROVIDER_KEYS=true for a controlled fallback deployment.");
  }
  [input.userDataDir, input.storePath, input.projectsDir, input.storageRoot].filter(Boolean).forEach((value) => {
    if (value.startsWith("/tmp/") || value.startsWith("/private/tmp/")) {
      errors.push(`Production worker path ${value} is under tmp; use durable storage or private object storage.`);
    }
  });
}
