#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];
const warnings = [];

const requiredEnv = [
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

if (dryRun) {
  console.log("Production observability policy check dry-run:");
  console.log(`1. Require observability env: ${requiredEnv.join(", ")}.`);
  console.log("2. Validate backend selection and HTTPS metric/dashboard/runbook URLs.");
  console.log("3. Require an alert route and enabled paging for production.");
  console.log("4. Validate bounded queue-age, terminal-failure, provider-latency, and storage-latency thresholds.");
  console.log("5. Warn on lenient thresholds that may hide production incidents.");
  process.exit(0);
}

const backend = requireEnum("GIDEON_OBSERVABILITY_BACKEND", ["datadog", "prometheus", "grafana", "honeycomb", "otel"]);
requireHttpsUrl("GIDEON_OBSERVABILITY_METRIC_EXPORT_URL", "GIDEON_OBSERVABILITY_METRIC_EXPORT_URL must be an https:// URL for production metric export.");
requireHttpsUrl("GIDEON_OBSERVABILITY_DASHBOARD_URL", "GIDEON_OBSERVABILITY_DASHBOARD_URL must be an https:// URL.");
requireHttpsUrl("GIDEON_OBSERVABILITY_RUNBOOK_URL", "GIDEON_OBSERVABILITY_RUNBOOK_URL must be an https:// URL.");
requireNamespacedValue("GIDEON_OBSERVABILITY_ALERT_ROUTE", "GIDEON_OBSERVABILITY_ALERT_ROUTE must identify a production alert route.");
requireEquals("GIDEON_OBSERVABILITY_PAGING_ENABLED", "true", "GIDEON_OBSERVABILITY_PAGING_ENABLED must be true for production.");
const queueAgeSeconds = requireIntegerRange("GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS", 60, 3_600);
const terminalFailures = requireIntegerRange("GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR", 1, 100);
const ttsP95Ms = requireIntegerRange("GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS", 1_000, 60_000);
const storageP95Ms = requireIntegerRange("GIDEON_OBSERVABILITY_STORAGE_P95_MS", 100, 60_000);

if (backend === "prometheus" && !value("GIDEON_OBSERVABILITY_METRIC_EXPORT_URL").includes("/metrics")) {
  warnings.push("Prometheus metric export URL usually ends with /metrics; confirm the scrape target before promotion.");
}
if (Number.isInteger(queueAgeSeconds) && queueAgeSeconds > 900) {
  warnings.push("Queue-age warning threshold is above 15 minutes; confirm this is acceptable for upload-to-export latency.");
}
if (Number.isInteger(terminalFailures) && terminalFailures > 10) {
  warnings.push("Terminal-failure threshold is above 10/hour; confirm paging still catches provider/storage regressions.");
}
if (Number.isInteger(ttsP95Ms) && ttsP95Ms > 30_000) {
  warnings.push("Provider TTS p95 threshold is above 30 seconds; confirm user-facing render latency remains acceptable.");
}
if (Number.isInteger(storageP95Ms) && storageP95Ms > 10_000) {
  warnings.push("Storage p95 threshold is above 10 seconds; confirm signed upload/download latency remains acceptable.");
}

if (errors.length > 0) {
  console.error("Production observability policy check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    warnings.forEach((warning) => console.error(`- ${warning}`));
  }
  process.exit(1);
}

console.log("Production observability policy check passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

function requireEquals(name, expected, message) {
  if (value(name) !== expected) {
    errors.push(message);
  }
}

function requireEnum(name, allowed) {
  const raw = value(name);
  if (!allowed.includes(raw)) {
    errors.push(`${name} must be one of: ${allowed.join(", ")}.`);
    return null;
  }
  return raw;
}

function requireHttpsUrl(name, message) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required.`);
    return;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      errors.push(message);
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      errors.push(`${name} must not point to localhost for production.`);
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
  if (["default", "dev", "local", "test"].includes(raw.toLowerCase())) {
    errors.push(message);
  }
  if (!/^[a-z0-9][a-z0-9._:/@-]{2,120}$/i.test(raw)) {
    errors.push(`${name} must be a simple production alert route identifier.`);
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

function value(name) {
  return process.env[name]?.trim() ?? "";
}
