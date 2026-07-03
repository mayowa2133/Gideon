#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const reportPath = path.resolve(
  options.values.path ??
    process.env.GIDEON_PROVIDER_CANARY_REPORT_PATH?.trim() ??
    path.join("tmp", "provider-canary-report.json")
);
const errors = [];

const REQUIRED_CAPABILITIES = ["analysis", "transcription", "ocr", "tts"];
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
  console.log("Provider canary report check dry-run:");
  console.log(`1. Read live provider canary report JSON from ${reportPath}.`);
  console.log("2. Require live mode, configured provider, HTTPS base URL, and generatedAt timestamp.");
  console.log("3. Require passed analysis, transcription, OCR, and TTS canaries.");
  console.log("4. Require every capability cost to be present, non-negative, and within its ceiling.");
  console.log("5. Require prompt/model provenance for analysis, OCR, and TTS canaries.");
  console.log("6. Scan report fields for secret-like material, cookies, signed URLs, and provider keys.");
  process.exit(0);
}

const report = readJson(reportPath);
validateReport(report);

if (errors.length > 0) {
  console.error("Provider canary report check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Provider canary report check passed for ${path.relative(process.cwd(), reportPath)}.`);

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
    console.error("Provider canary report check failed:");
    console.error(`- Could not read ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    process.exit(1);
  }
}

function validateReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    errors.push("Report root must be a JSON object.");
    return;
  }
  if (report.mode !== "live") {
    errors.push("Report mode must be live.");
  }
  if (report.providerConfigured !== true) {
    errors.push("Report providerConfigured must be true.");
  }
  if (typeof report.baseUrl !== "string" || !report.baseUrl.startsWith("https://")) {
    errors.push("Report baseUrl must be HTTPS.");
  }
  requireIsoTimestamp(report.generatedAt, "generatedAt");
  if (!Array.isArray(report.results)) {
    errors.push("Report results must be an array.");
    return;
  }
  for (const capability of REQUIRED_CAPABILITIES) {
    const matching = report.results.filter((result) => result?.capability === capability);
    if (matching.length !== 1) {
      errors.push(`Report must contain exactly one ${capability} result.`);
      continue;
    }
    validateResult(matching[0], capability);
  }
  for (const result of report.results) {
    if (!REQUIRED_CAPABILITIES.includes(result?.capability)) {
      errors.push(`Report contains unexpected capability ${String(result?.capability ?? "unknown")}.`);
    }
    if (result?.status !== "passed") {
      errors.push(`Report result ${String(result?.capability ?? "unknown")} must have status passed.`);
    }
  }
  validateSafeMetadata(report);
}

function validateResult(result, capability) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    errors.push(`Report ${capability} result must be an object.`);
    return;
  }
  if (result.provider !== "openai") {
    errors.push(`Report ${capability} provider must be openai.`);
  }
  if (result.status !== "passed") {
    errors.push(`Report ${capability} status must be passed.`);
  }
  if (typeof result.model !== "string" || !result.model.trim()) {
    errors.push(`Report ${capability} model must be a non-empty string.`);
  }
  if (typeof result.message !== "string" || !result.message.trim()) {
    errors.push(`Report ${capability} message must be a non-empty string.`);
  }
  if (!Number.isFinite(result.durationMs) || result.durationMs < 0) {
    errors.push(`Report ${capability} durationMs must be non-negative.`);
  }
  if (!Number.isFinite(result.costUsd) || result.costUsd < 0) {
    errors.push(`Report ${capability} costUsd must be a non-negative number.`);
  }
  if (!Number.isFinite(result.maxCostUsd) || result.maxCostUsd < 0) {
    errors.push(`Report ${capability} maxCostUsd must be a non-negative number.`);
  }
  if (Number.isFinite(result.costUsd) && Number.isFinite(result.maxCostUsd) && result.costUsd > result.maxCostUsd) {
    errors.push(`Report ${capability} costUsd must not exceed maxCostUsd.`);
  }
  validatePromptProvenance(result, capability);
}

function validatePromptProvenance(result, capability) {
  if (capability === "transcription") {
    return;
  }
  if (typeof result.promptVersion !== "string" || !/^[A-Za-z0-9._-]{2,80}$/.test(result.promptVersion)) {
    errors.push(`Report ${capability} promptVersion must be a safe non-empty prompt version.`);
  }
  if (capability !== "analysis") {
    return;
  }
  if (typeof result.promptReviewedAt !== "string" || Number.isNaN(Date.parse(result.promptReviewedAt))) {
    errors.push("Report analysis promptReviewedAt must be an ISO timestamp.");
  }
  if (!["canary", "staging", "production"].includes(result.promptRolloutStage)) {
    errors.push("Report analysis promptRolloutStage must be canary, staging, or production.");
  }
  if (!Number.isInteger(result.promptRolloutPercent) || result.promptRolloutPercent < 1 || result.promptRolloutPercent > 100) {
    errors.push("Report analysis promptRolloutPercent must be an integer between 1 and 100.");
  }
  if (!Number.isInteger(result.promptCanaryPercent) || result.promptCanaryPercent < 0 || result.promptCanaryPercent > 50) {
    errors.push("Report analysis promptCanaryPercent must be an integer between 0 and 50.");
  }
}

function validateSafeMetadata(report) {
  const serialized = JSON.stringify(report);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`Report contains sensitive material matching ${pattern}.`);
    }
  }
}

function requireIsoTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`Report ${label} must be an ISO timestamp.`);
  }
}
