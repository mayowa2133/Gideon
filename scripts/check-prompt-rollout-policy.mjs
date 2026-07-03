#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];

const requiredEnv = [
  "GIDEON_OPENAI_LLM_MODEL",
  "GIDEON_ANALYSIS_PROMPT_VERSION",
  "GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS",
  "GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION",
  "GIDEON_ANALYSIS_PROMPT_REVIEWED_AT",
  "GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE",
  "GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT",
  "GIDEON_ANALYSIS_MODEL_CANARY_PERCENT"
];

if (dryRun) {
  console.log("Production prompt rollout policy check dry-run:");
  console.log(`1. Require explicit LLM model, active prompt version, approved prompt versions, rollback version, review timestamp, rollout stage, rollout percent, and canary percent: ${requiredEnv.join(", ")}.`);
  console.log("2. Reject unapproved active prompt versions and rollback versions that are missing from the approved prompt list.");
  console.log("3. Require active and rollback prompt versions to differ so production can revert without editing code.");
  console.log("4. Require a recent prompt review timestamp and stage-specific rollout bounds before live provider canaries run.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

validateSafeIdentifier("GIDEON_OPENAI_LLM_MODEL", 2, 80);
validateSafeIdentifier("GIDEON_ANALYSIS_PROMPT_VERSION", 2, 80);
validateSafeIdentifier("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION", 2, 80);
validateApprovedPromptVersions();
validateRecentIsoTimestamp("GIDEON_ANALYSIS_PROMPT_REVIEWED_AT", 180);
validateRolloutStage();

if (errors.length > 0) {
  console.error("Production prompt rollout policy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production prompt rollout policy check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for production prompt rollout policy checks.`);
  }
}

function validateSafeIdentifier(name, minLength, maxLength) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  if (raw.length < minLength || raw.length > maxLength || !/^[A-Za-z0-9._-]+$/.test(raw)) {
    errors.push(`${name} must be ${minLength}-${maxLength} characters using only letters, numbers, dots, underscores, and hyphens.`);
  }
}

function validateApprovedPromptVersions() {
  const active = value("GIDEON_ANALYSIS_PROMPT_VERSION");
  const rollback = value("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION");
  const approved = value("GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  if (approved.length === 0) {
    return;
  }
  for (const candidate of approved) {
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(candidate)) {
      errors.push("GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS must be a comma-separated list of safe prompt version identifiers.");
      break;
    }
  }
  if (active && !approved.includes(active)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS.");
  }
  if (rollback && !approved.includes(rollback)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS.");
  }
  if (active && rollback && active === rollback) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION must differ from GIDEON_ANALYSIS_PROMPT_VERSION.");
  }
}

function validateRecentIsoTimestamp(name, maxAgeDays) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    errors.push(`${name} must be an ISO-8601 timestamp.`);
    return;
  }
  if (parsedMs > Date.now() + 60_000) {
    errors.push(`${name} must not be in the future.`);
  }
  if (Date.now() - parsedMs > maxAgeDays * 24 * 60 * 60 * 1_000) {
    errors.push(`${name} must be within the last ${maxAgeDays} days.`);
  }
}

function validateRolloutStage() {
  const stage = value("GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE");
  if (!["canary", "staging", "production"].includes(stage)) {
    errors.push("GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE must be one of: canary, staging, production.");
  }
  const rolloutPercent = validateInteger("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT", 1, 100);
  const canaryPercent = validateInteger("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT", 0, 50);
  if (!Number.isInteger(rolloutPercent) || !Number.isInteger(canaryPercent)) {
    return;
  }
  if (stage === "canary") {
    if (rolloutPercent > 50) {
      errors.push("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT must be 50 or lower when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=canary.");
    }
    if (canaryPercent < 1) {
      errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be at least 1 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=canary.");
    }
  }
  if (stage === "staging" && canaryPercent !== 0) {
    errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be 0 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=staging.");
  }
  if (stage === "production") {
    if (rolloutPercent !== 100) {
      errors.push("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT must be 100 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=production.");
    }
    if (canaryPercent !== 0) {
      errors.push("GIDEON_ANALYSIS_MODEL_CANARY_PERCENT must be 0 when GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE=production.");
    }
  }
}

function validateInteger(name, min, max) {
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
