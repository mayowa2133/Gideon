#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const receiptPath = path.resolve(options.values.path ?? path.join("tmp", "github-production-promotion-evidence", "verification-receipt.json"));
const errors = [];

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
  console.log("GitHub promotion verification receipt check dry-run:");
  console.log(`1. Read receipt JSON from ${receiptPath}.`);
  console.log("2. Require schemaVersion, verification timestamp, repository, artifact, and evidence summary.");
  console.log("3. Require successful live evidence metadata and safe check statuses.");
  console.log("4. If GitHub run metadata is present, require completed/success workflow_dispatch and headSha matching evidence gitCommit.");
  console.log("5. Scan receipt fields for secret-like material, cookies, signed URLs, and provider keys.");
  process.exit(0);
}

const receipt = readJson(receiptPath);
validateReceipt(receipt);

if (errors.length > 0) {
  console.error("GitHub promotion verification receipt check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`GitHub promotion verification receipt check passed for ${path.relative(process.cwd(), receiptPath)}.`);

function parseArgs(inputArgs) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = inputArgs[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return { flags, values };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("GitHub promotion verification receipt check failed:");
    console.error(`- Could not read ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    process.exit(1);
  }
}

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("Receipt root must be a JSON object.");
    return;
  }
  if (receipt.schemaVersion !== 1) {
    errors.push("Receipt schemaVersion must be 1.");
  }
  requireIsoTimestamp(receipt.verifiedAt, "verifiedAt");
  requireNonEmptyString(receipt.repository, "repository");
  requireNonEmptyString(receipt.artifactName, "artifactName");
  if (receipt.runId !== null && typeof receipt.runId !== "string") {
    errors.push("Receipt runId must be a string or null.");
  }
  requireNonEmptyString(receipt.evidencePath, "evidencePath");
  validateEvidenceSummary(receipt.evidence);
  validateGitHubRun(receipt.githubRun, receipt.evidence?.gitCommit);
  validateChecks(receipt.checks, receipt.githubRun);
  validateSafeMetadata(receipt);
}

function validateEvidenceSummary(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("Receipt evidence must be an object.");
    return;
  }
  if (evidence.schemaVersion !== 1) {
    errors.push("Receipt evidence.schemaVersion must be 1.");
  }
  if (evidence.mode !== "live") {
    errors.push("Receipt evidence.mode must be live.");
  }
  if (evidence.status !== "succeeded") {
    errors.push("Receipt evidence.status must be succeeded.");
  }
  if (typeof evidence.gitCommit !== "string" || !/^[0-9a-f]{40}$/i.test(evidence.gitCommit)) {
    errors.push("Receipt evidence.gitCommit must be a full 40-character git SHA.");
  }
  requireIsoTimestamp(evidence.generatedAt, "evidence.generatedAt");
  requireIsoTimestamp(evidence.finishedAt, "evidence.finishedAt");
  if (typeof evidence.skipPackage !== "boolean") {
    errors.push("Receipt evidence.skipPackage must be boolean.");
  }
  if (!Number.isInteger(evidence.stepCount) || evidence.stepCount < 10) {
    errors.push("Receipt evidence.stepCount must include at least the required live promotion steps.");
  }
}

function validateGitHubRun(githubRun, evidenceGitCommit) {
  if (githubRun === null) {
    return;
  }
  if (!githubRun || typeof githubRun !== "object" || Array.isArray(githubRun)) {
    errors.push("Receipt githubRun must be an object or null.");
    return;
  }
  if (githubRun.status !== "completed") {
    errors.push("Receipt githubRun.status must be completed.");
  }
  if (githubRun.conclusion !== "success") {
    errors.push("Receipt githubRun.conclusion must be success.");
  }
  if (githubRun.event !== "workflow_dispatch") {
    errors.push("Receipt githubRun.event must be workflow_dispatch.");
  }
  if (typeof githubRun.headSha !== "string" || !/^[0-9a-f]{40}$/i.test(githubRun.headSha)) {
    errors.push("Receipt githubRun.headSha must be a full git SHA.");
  } else if (githubRun.headSha.toLowerCase() !== String(evidenceGitCommit ?? "").toLowerCase()) {
    errors.push("Receipt githubRun.headSha must match evidence.gitCommit.");
  }
}

function validateChecks(checks, githubRun) {
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    errors.push("Receipt checks must be an object.");
    return;
  }
  if (checks.productionEvidenceSchema !== "passed") {
    errors.push("Receipt checks.productionEvidenceSchema must be passed.");
  }
  if (typeof checks.allowSkipPackage !== "boolean") {
    errors.push("Receipt checks.allowSkipPackage must be boolean.");
  }
  if (!["passed", "skipped", "not_applicable"].includes(checks.runMetadata)) {
    errors.push("Receipt checks.runMetadata must be passed, skipped, or not_applicable.");
  }
  if (githubRun && checks.runMetadata !== "passed") {
    errors.push("Receipt checks.runMetadata must be passed when githubRun metadata is present.");
  }
  if (typeof checks.secretPolicy !== "string" || !checks.secretPolicy.includes("excludes environment")) {
    errors.push("Receipt checks.secretPolicy must document excluded sensitive material.");
  }
}

function validateSafeMetadata(receipt) {
  const serialized = JSON.stringify(receipt);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`Receipt contains sensitive material matching ${pattern}.`);
    }
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`Receipt ${label} must be a non-empty string.`);
  }
}

function requireIsoTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`Receipt ${label} must be an ISO timestamp.`);
  }
}
