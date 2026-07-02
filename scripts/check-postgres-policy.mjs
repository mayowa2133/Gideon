#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];
const warnings = [];

const requiredEnv = [
  "GIDEON_STORE_PROVIDER",
  "GIDEON_DATABASE_URL",
  "GIDEON_DATABASE_POOL_MAX",
  "GIDEON_DATABASE_STATEMENT_TIMEOUT_MS",
  "GIDEON_DATABASE_IDLE_TIMEOUT_MS",
  "GIDEON_POSTGRES_BACKUP_RETENTION_DAYS",
  "GIDEON_POSTGRES_PITR_ENABLED",
  "GIDEON_POSTGRES_RESTORE_DRILL_AT",
  "GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS",
  "GIDEON_POSTGRES_MIGRATION_POLICY"
];

if (dryRun) {
  console.log("PostgreSQL production policy check dry-run:");
  console.log(`1. Require hosted PostgreSQL env: ${requiredEnv.join(", ")}.`);
  console.log("2. Validate postgres:// or postgresql:// database URL with sslmode=require.");
  console.log("3. Validate bounded pool size, statement timeout, and idle timeout.");
  console.log("4. Require managed backup retention and point-in-time recovery.");
  console.log("5. Require a recent restore-drill timestamp within the configured maximum age.");
  console.log("6. Require an explicit predeploy migration policy.");
  process.exit(0);
}

requireEquals("GIDEON_STORE_PROVIDER", "postgres_snapshot", "GIDEON_STORE_PROVIDER must be postgres_snapshot for production hosted persistence.");
requireDatabaseUrl();
const poolMax = requireIntegerRange("GIDEON_DATABASE_POOL_MAX", 2, 100);
const statementTimeoutMs = requireIntegerRange("GIDEON_DATABASE_STATEMENT_TIMEOUT_MS", 1_000, 300_000);
const idleTimeoutMs = requireIntegerRange("GIDEON_DATABASE_IDLE_TIMEOUT_MS", 1_000, 600_000);
const backupRetentionDays = requireIntegerRange("GIDEON_POSTGRES_BACKUP_RETENTION_DAYS", 7, 365);
requireEquals("GIDEON_POSTGRES_PITR_ENABLED", "true", "GIDEON_POSTGRES_PITR_ENABLED must be true for production point-in-time recovery.");
const restoreMaxAgeDays = requireIntegerRange("GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS", 1, 365);
requireEnum("GIDEON_POSTGRES_MIGRATION_POLICY", ["predeploy_migrate"]);
requireRecentIsoTimestamp("GIDEON_POSTGRES_RESTORE_DRILL_AT", restoreMaxAgeDays);

if (Number.isInteger(poolMax) && poolMax > 50) {
  warnings.push("GIDEON_DATABASE_POOL_MAX is high; confirm managed PostgreSQL connection limits and PgBouncer/pooler capacity.");
}
if (Number.isInteger(statementTimeoutMs) && statementTimeoutMs > 120_000) {
  warnings.push("GIDEON_DATABASE_STATEMENT_TIMEOUT_MS is above 120 seconds; confirm long queries cannot block production workers.");
}
if (Number.isInteger(idleTimeoutMs) && idleTimeoutMs > 300_000) {
  warnings.push("GIDEON_DATABASE_IDLE_TIMEOUT_MS is above 5 minutes; confirm idle connection budgets before promotion.");
}
if (Number.isInteger(backupRetentionDays) && backupRetentionDays < 14) {
  warnings.push("GIDEON_POSTGRES_BACKUP_RETENTION_DAYS is below 14 days; confirm this is acceptable for launch support.");
}

if (errors.length > 0) {
  console.error("PostgreSQL production policy check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    warnings.forEach((warning) => console.error(`- ${warning}`));
  }
  process.exit(1);
}

console.log("PostgreSQL production policy check passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

function requireEquals(name, expected, message) {
  if (value(name) !== expected) {
    errors.push(message);
  }
}

function requireDatabaseUrl() {
  const raw = value("GIDEON_DATABASE_URL");
  if (!raw) {
    errors.push("GIDEON_DATABASE_URL is required.");
    return;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      errors.push("GIDEON_DATABASE_URL must be a postgres:// or postgresql:// URL.");
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      errors.push("GIDEON_DATABASE_URL must point to managed production PostgreSQL, not localhost.");
    }
    if (parsed.searchParams.get("sslmode") !== "require") {
      errors.push("GIDEON_DATABASE_URL must include sslmode=require.");
    }
  } catch {
    errors.push("GIDEON_DATABASE_URL must be a valid postgres:// or postgresql:// URL.");
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

function requireRecentIsoTimestamp(name, maxAgeDays) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name} is required.`);
    return;
  }
  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    errors.push(`${name} must be an ISO-8601 timestamp.`);
    return;
  }
  const nowMs = Date.now();
  if (parsedMs > nowMs + 60_000) {
    errors.push(`${name} must not be in the future.`);
  }
  if (Number.isInteger(maxAgeDays)) {
    const ageMs = nowMs - parsedMs;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1_000;
    if (ageMs > maxAgeMs) {
      errors.push(`${name} must be within the last ${maxAgeDays} days.`);
    }
  }
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
