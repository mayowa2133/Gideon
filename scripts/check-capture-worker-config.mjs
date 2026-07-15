#!/usr/bin/env node

const env = process.env;
const errors = [];
const warnings = [];
const production = normalized("GIDEON_DEPLOYMENT_ENV") === "production" || normalized("NODE_ENV") === "production";

requireUrl("GIDEON_DATABASE_URL", ["postgres:", "postgresql:"]);
requireUrl("GIDEON_REDIS_URL", ["redis:", "rediss:"]);
requireValue("GIDEON_CAPTURE_QUEUE_NAME");
requireValue("GIDEON_CAPTURE_WORKER_ID");
requirePositive("GIDEON_CAPTURE_WORKER_CONCURRENCY");
requirePositive("GIDEON_CAPTURE_MAX_BROWSER_SECONDS");

const isolation = normalized("GIDEON_CAPTURE_ISOLATION");
if (!new Set(["container", "microvm", "local_test"]).has(isolation)) errors.push("GIDEON_CAPTURE_ISOLATION must be container, microvm, or local_test.");
if (production && isolation === "local_test") errors.push("Production capture workers cannot use local_test isolation.");
if (isolation === "container" || isolation === "microvm") {
  if (!normalized("GIDEON_CAPTURE_RUNTIME_ENDPOINT")) errors.push("Set GIDEON_CAPTURE_RUNTIME_ENDPOINT for an isolated browser pool.");
  requireImageDigest("GIDEON_CAPTURE_RUNTIME_IMAGE_DIGEST");
}
if (normalized("GIDEON_CAPTURE_RUNTIME_ENDPOINT")) requireRuntimeUrl("GIDEON_CAPTURE_RUNTIME_ENDPOINT", production ? ["https:"] : ["http:", "https:"]);

const secretProvider = normalized("GIDEON_CAPTURE_SECRET_PROVIDER");
if (!new Set(["aws_secrets_manager", "gcp_secret_manager", "vault", "development_memory"]).has(secretProvider)) errors.push("GIDEON_CAPTURE_SECRET_PROVIDER is invalid.");
if (production && secretProvider === "development_memory") errors.push("Production capture workers require an external secret provider.");

const storage = normalized("GIDEON_STORAGE_PROVIDER");
if (production && !new Set(["s3", "r2"]).has(storage)) errors.push("Production capture workers require private S3/R2 object storage.");
if (!normalized("GIDEON_FFMPEG_PATH")) warnings.push("GIDEON_FFMPEG_PATH is unset; the worker will depend on ffmpeg in PATH.");
if (!normalized("GIDEON_CAPTURE_POLICY_VERSION")) (production ? errors : warnings).push("Set GIDEON_CAPTURE_POLICY_VERSION so capture manifests identify the deployed policy bundle.");

if (errors.length) {
  console.error("Capture worker configuration is not ready:");
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) { console.error("Warnings:"); for (const warning of warnings) console.error(`- ${warning}`); }
  process.exit(1);
}
console.log("Capture worker configuration looks usable.");
if (warnings.length) { console.log("Warnings:"); for (const warning of warnings) console.log(`- ${warning}`); }

function normalized(name) { return env[name]?.trim() || ""; }
function requireValue(name) { if (!normalized(name)) errors.push(`Set ${name}.`); }
function requirePositive(name) { const value = Number(normalized(name)); if (!Number.isInteger(value) || value < 1) errors.push(`Set ${name} to a positive integer.`); }
function requireUrl(name, protocols) {
  const value = normalized(name);
  if (!value) { errors.push(`Set ${name}.`); return; }
  try { const url = new URL(value); if (!protocols.includes(url.protocol)) errors.push(`${name} must use ${protocols.join(" or ")}.`); }
  catch { errors.push(`${name} must be a valid URL.`); }
}
function requireRuntimeUrl(name, protocols) {
  const value = normalized(name);
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) errors.push(`${name} must use ${protocols.join(" or ")}.`);
    if (url.username || url.password || url.search || url.hash) errors.push(`${name} must not contain credentials, query parameters, or fragments.`);
    if (production && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")) errors.push(`${name} must not target loopback in production.`);
  } catch { errors.push(`${name} must be a valid URL.`); }
}
function requireImageDigest(name) { if (!/^sha256:[a-f0-9]{64}$/.test(normalized(name))) errors.push(`${name} must be a pinned SHA-256 image digest.`); }
