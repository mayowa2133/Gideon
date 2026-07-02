#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];
const warnings = [];

const requiredEnv = [
  "GIDEON_HOSTED_QUEUE_PROVIDER",
  "GIDEON_REDIS_URL",
  "GIDEON_BULLMQ_QUEUE_NAME",
  "GIDEON_BULLMQ_PREFIX",
  "GIDEON_BULLMQ_CONCURRENCY",
  "GIDEON_BULLMQ_ATTEMPTS",
  "GIDEON_BULLMQ_BACKOFF_TYPE",
  "GIDEON_BULLMQ_BACKOFF_DELAY_MS",
  "GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT",
  "GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT",
  "GIDEON_BULLMQ_DEAD_LETTER_POLICY"
];

if (dryRun) {
  console.log("BullMQ production policy check dry-run:");
  console.log(`1. Require managed Redis/BullMQ env: ${requiredEnv.join(", ")}.`);
  console.log("2. Require rediss:// Redis, environment-specific queue name, and Redis key prefix.");
  console.log("3. Validate bounded worker concurrency.");
  console.log("4. Validate retry attempts and fixed/exponential backoff.");
  console.log("5. Validate completed/failed job retention counts.");
  console.log("6. Require an explicit dead-letter policy based on retained failed jobs.");
  process.exit(0);
}

requireEquals("GIDEON_HOSTED_QUEUE_PROVIDER", "bullmq", "GIDEON_HOSTED_QUEUE_PROVIDER must be bullmq for production queue policy checks.");
requireUrl("GIDEON_REDIS_URL", ["rediss:"], "GIDEON_REDIS_URL must be a rediss:// URL for managed production Redis.");
requireNamespacedValue("GIDEON_BULLMQ_QUEUE_NAME", "GIDEON_BULLMQ_QUEUE_NAME must be environment-specific and not the local default.");
requireNamespacedValue("GIDEON_BULLMQ_PREFIX", "GIDEON_BULLMQ_PREFIX must be environment-specific and not the local default.");
const concurrency = requireIntegerRange("GIDEON_BULLMQ_CONCURRENCY", 1, 100);
const attempts = requireIntegerRange("GIDEON_BULLMQ_ATTEMPTS", 2, 10);
const backoffType = requireEnum("GIDEON_BULLMQ_BACKOFF_TYPE", ["fixed", "exponential"]);
const backoffDelayMs = requireIntegerRange("GIDEON_BULLMQ_BACKOFF_DELAY_MS", 1_000, 300_000);
const completeRetention = requireIntegerRange("GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT", 100, 100_000);
const failedRetention = requireIntegerRange("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT", 1_000, 500_000);
requireEnum("GIDEON_BULLMQ_DEAD_LETTER_POLICY", ["retain_failed"]);

if (Number.isInteger(failedRetention) && Number.isInteger(completeRetention) && failedRetention < completeRetention) {
  errors.push("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT must be greater than or equal to GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT for incident review.");
}
if (Number.isInteger(concurrency) && concurrency > 25) {
  warnings.push("GIDEON_BULLMQ_CONCURRENCY is high; confirm provider/storage/database rate limits before production promotion.");
}
if (backoffType === "fixed" && Number.isInteger(attempts) && attempts > 3) {
  warnings.push("Fixed backoff with more than 3 attempts can synchronize retries; exponential backoff is preferred for provider failures.");
}
if (Number.isInteger(backoffDelayMs) && backoffDelayMs < 5_000) {
  warnings.push("Backoff delay below 5 seconds may be too aggressive for provider rate limits.");
}

if (errors.length > 0) {
  console.error("BullMQ production policy check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    warnings.forEach((warning) => console.error(`- ${warning}`));
  }
  process.exit(1);
}

console.log("BullMQ production policy check passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

function requireEquals(name, expected, message) {
  if (value(name) !== expected) {
    errors.push(message);
  }
}

function requireUrl(name, protocols, message) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required.`);
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

function requireNamespacedValue(name, message) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required.`);
    return;
  }
  if (["gideon", "gideon-hosted-worker-jobs", "default", "dev", "local"].includes(raw)) {
    errors.push(message);
  }
  if (!/^[a-z0-9][a-z0-9._:-]{2,80}$/i.test(raw)) {
    errors.push(`${name} must be a simple environment-specific Redis/BullMQ identifier.`);
  }
}

function requireIntegerRange(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
    return null;
  }
  return parsed;
}

function requireEnum(name, allowed) {
  const raw = value(name);
  if (!allowed.includes(raw)) {
    errors.push(`${name} must be one of: ${allowed.join(", ")}.`);
    return null;
  }
  return raw;
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
