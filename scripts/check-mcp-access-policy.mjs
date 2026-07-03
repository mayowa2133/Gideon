#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];

const requiredEnv = [
  "GIDEON_MCP_SSO_PROVIDER",
  "GIDEON_MCP_SESSION_MAX_AGE_SECONDS",
  "GIDEON_MCP_SESSION_ROTATION_HOURS",
  "GIDEON_MCP_REQUIRE_CSRF",
  "GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS",
  "GIDEON_MCP_LOAD_CONCURRENCY",
  "GIDEON_MCP_LOAD_REQUESTS",
  "GIDEON_MCP_LOAD_P95_MS",
  "GIDEON_MCP_LOAD_ERROR_RATE_MAX"
];

if (dryRun) {
  console.log("Production MCP access policy check dry-run:");
  console.log(`1. Require remote MCP SSO/session policy env: ${requiredEnv.join(", ")}.`);
  console.log("2. Require enterprise-capable SSO provider, bounded session age, session rotation, CSRF, and revision preconditions.");
  console.log("3. Require explicit production MCP load-test thresholds for concurrency, request volume, p95 latency, and error rate.");
  console.log("4. Fail promotion when MCP access is configured with local/dev providers or weak hosted-session controls.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

validateSsoProvider();
validateRetentionWindow("GIDEON_MCP_SESSION_MAX_AGE_SECONDS", 300, 43_200);
validateRetentionWindow("GIDEON_MCP_SESSION_ROTATION_HOURS", 1, 24);
requireTrue("GIDEON_MCP_REQUIRE_CSRF");
requireTrue("GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS");
validateRetentionWindow("GIDEON_MCP_LOAD_CONCURRENCY", 1, 100);
validateRetentionWindow("GIDEON_MCP_LOAD_REQUESTS", 10, 100_000);
validateRetentionWindow("GIDEON_MCP_LOAD_P95_MS", 100, 10_000);
validateRate("GIDEON_MCP_LOAD_ERROR_RATE_MAX", 0, 0.05);

if (errors.length > 0) {
  console.error("Production MCP access policy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production MCP access policy check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for production MCP access policy checks.`);
  }
}

function validateSsoProvider() {
  const provider = value("GIDEON_MCP_SSO_PROVIDER");
  if (!provider) {
    return;
  }
  if (!["oidc", "google", "github", "saml", "enterprise"].includes(provider)) {
    errors.push("GIDEON_MCP_SSO_PROVIDER must be one of: oidc, google, github, saml, enterprise.");
  }
  if (["local", "email", "dev", "test"].includes(provider)) {
    errors.push("GIDEON_MCP_SSO_PROVIDER must not use local/dev providers for remote MCP access.");
  }
}

function requireTrue(name) {
  if (value(name) !== "true") {
    errors.push(`${name} must be true for hosted MCP production access.`);
  }
}

function validateRetentionWindow(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function validateRate(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be a number between ${min} and ${max}.`);
  }
}

function value(name) {
  return process.env[name]?.trim().toLowerCase() ?? "";
}
