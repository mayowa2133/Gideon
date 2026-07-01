#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const argSet = new Set(args);
const dryRun = argSet.has("--dry-run");
const allowSkipPackage = argSet.has("--allow-skip-package") || process.env.GIDEON_PRODUCTION_EVIDENCE_ALLOW_SKIP_PACKAGE === "true";
const evidencePath = resolveEvidencePath(args);
const errors = [];

const REQUIRED_BASE_STEPS = [
  "local production readiness gate",
  "strict staging readiness gate",
  "production billing reconciliation",
  "live provider canaries",
  "live staging upload-to-export smoke",
  "live staging hosted MCP smoke"
];

const REQUIRED_RELEASE_STEPS = [
  "signed macOS package",
  "production macOS release metadata",
  "production macOS DMG verification"
];

const SENSITIVE_PATTERNS = [
  /gideon_session=/i,
  /\b(?:OPENAI|STRIPE|APPLE|GIDEON|AWS|R2|S3)_[A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD)\b/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /x-amz-signature=/i,
  /x-goog-signature=/i,
  /signedUrl/i,
  /uploadUrl/i,
  /downloadUrl/i
];

if (dryRun) {
  console.log("Production promotion evidence check dry-run:");
  console.log(`1. Read evidence JSON from ${evidencePath}.`);
  console.log("2. Require successful live promotion status, timestamps, and git commit.");
  console.log("3. Require all live staging/provider/MCP/release steps unless --allow-skip-package is set.");
  console.log("4. Verify every recorded step succeeded with exitCode 0 and bounded safe env metadata.");
  console.log("5. Scan evidence fields for secret-like material, cookies, signed URLs, and provider keys.");
  process.exit(0);
}

const evidence = readEvidence(evidencePath);
validateEvidence(evidence);

if (errors.length > 0) {
  console.error("Production promotion evidence check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Production promotion evidence check passed for ${path.relative(process.cwd(), evidencePath)}.`);

function resolveEvidencePath(inputArgs) {
  const pathIndex = inputArgs.indexOf("--path");
  if (pathIndex !== -1) {
    const value = inputArgs[pathIndex + 1]?.trim();
    if (!value || value.startsWith("--")) {
      console.error("Production promotion evidence check failed:");
      console.error("- --path requires a file path.");
      process.exit(1);
    }
    return path.resolve(value);
  }
  return path.resolve(
    process.env.GIDEON_PRODUCTION_PROMOTION_EVIDENCE_PATH?.trim() ||
      path.join("tmp", "production-promotion-evidence.json")
  );
}

function readEvidence(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Production promotion evidence check failed:");
    console.error(`- Could not read ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    process.exit(1);
  }
}

function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("Evidence root must be a JSON object.");
    return;
  }
  if (evidence.schemaVersion !== 1) {
    errors.push("Evidence schemaVersion must be 1.");
  }
  if (evidence.status !== "succeeded") {
    errors.push("Evidence status must be succeeded.");
  }
  if (evidence.mode !== "live") {
    errors.push("Evidence mode must be live.");
  }
  if (evidence.failedStep !== null) {
    errors.push("Evidence failedStep must be null for a release candidate.");
  }
  requireIsoTimestamp(evidence.generatedAt, "generatedAt");
  requireIsoTimestamp(evidence.finishedAt, "finishedAt");
  if (typeof evidence.gitCommit !== "string" || !/^[0-9a-f]{40}$/i.test(evidence.gitCommit)) {
    errors.push("Evidence gitCommit must be a full 40-character git SHA.");
  }
  if (!Array.isArray(evidence.steps) || evidence.steps.length < REQUIRED_BASE_STEPS.length) {
    errors.push("Evidence steps must include the required live promotion steps.");
    return;
  }

  const requiredSteps = evidence.skipPackage && allowSkipPackage
    ? REQUIRED_BASE_STEPS
    : [...REQUIRED_BASE_STEPS, ...REQUIRED_RELEASE_STEPS];
  if (evidence.skipPackage && !allowSkipPackage) {
    errors.push("Evidence was produced with skipPackage=true; rerun without --skip-package for a production release candidate.");
  }
  for (const requiredStep of requiredSteps) {
    if (!evidence.steps.some((step) => step?.name === requiredStep)) {
      errors.push(`Evidence is missing required step: ${requiredStep}.`);
    }
  }

  for (const [index, step] of evidence.steps.entries()) {
    validateStep(step, index + 1);
  }
  validateSafeMetadata(evidence);
}

function validateStep(step, position) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    errors.push(`Step ${position} must be an object.`);
    return;
  }
  if (typeof step.name !== "string" || !step.name.trim()) {
    errors.push(`Step ${position} must include a name.`);
  }
  if (!Array.isArray(step.command) || !step.command.every((part) => typeof part === "string" && part.length > 0)) {
    errors.push(`Step ${position} must include a command array of strings.`);
  }
  if (step.status !== "succeeded") {
    errors.push(`Step ${position} (${step.name ?? "unknown"}) must have status succeeded.`);
  }
  if (step.exitCode !== 0) {
    errors.push(`Step ${position} (${step.name ?? "unknown"}) must have exitCode 0.`);
  }
  if (step.error !== null) {
    errors.push(`Step ${position} (${step.name ?? "unknown"}) must have null error.`);
  }
  requireIsoTimestamp(step.startedAt, `steps[${position}].startedAt`);
  requireIsoTimestamp(step.finishedAt, `steps[${position}].finishedAt`);
  if (!Number.isFinite(step.durationMs) || step.durationMs < 0) {
    errors.push(`Step ${position} (${step.name ?? "unknown"}) must include non-negative durationMs.`);
  }
  const env = step.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    errors.push(`Step ${position} (${step.name ?? "unknown"}) must include env object.`);
    return;
  }
  for (const key of Object.keys(env)) {
    if (key !== "GIDEON_RELEASE_CHANNEL") {
      errors.push(`Step ${position} (${step.name ?? "unknown"}) records unsafe env key ${key}.`);
    }
  }
}

function validateSafeMetadata(evidence) {
  const redacted = {
    ...evidence,
    safety: evidence.safety ? { ...evidence.safety, secretPolicy: "[policy omitted from scan]" } : evidence.safety
  };
  const serialized = JSON.stringify(redacted);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`Evidence contains sensitive material matching ${pattern}.`);
    }
  }
}

function requireIsoTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`Evidence ${label} must be an ISO timestamp.`);
  }
}
