#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const releaseDir = path.resolve(process.env.GIDEON_RELEASE_DIR?.trim() || "release");
const receiptPath = path.resolve(process.env.GIDEON_RELEASE_RECEIPT_PATH?.trim() || path.join(releaseDir, "release-receipt.json"));
const packageJson = readJson(path.resolve("package.json"));
const version = String(packageJson.version ?? "");
const errors = [];

const sensitivePatterns = [
  /APPLE_APP_SPECIFIC_PASSWORD/i,
  /CSC_KEY_PASSWORD/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /x-amz-signature=/i,
  /signedUrl/i,
  /downloadUrl/i
];

if (dryRun) {
  console.log("Production release receipt check dry-run:");
  console.log(`1. Read safe release receipt JSON from ${path.relative(process.cwd(), receiptPath)}.`);
  console.log("2. Require production channel, matching product/version, timestamps, and source git commit metadata.");
  console.log("3. Require accepted notarization, stapling, Gatekeeper assessment, and install smoke result.");
  console.log("4. Verify receipt artifact SHA-256 values match generated DMG, ZIP, latest metadata, and provenance files.");
  console.log("5. Scan receipt fields for credential-like material before accepting it as release evidence.");
  process.exit(0);
}

const receipt = readJson(receiptPath);
validateReceipt(receipt);

if (errors.length > 0) {
  console.error("Production release receipt check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Production release receipt check passed for ${path.relative(process.cwd(), receiptPath)}.`);

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("Release receipt root must be a JSON object.");
    return;
  }
  if (receipt.schemaVersion !== 1) {
    errors.push("Release receipt schemaVersion must be 1.");
  }
  if (receipt.product !== "Gideon") {
    errors.push("Release receipt product must be Gideon.");
  }
  if (receipt.version !== version) {
    errors.push(`Release receipt version must match package.json version ${version}.`);
  }
  if (receipt.channel !== "production") {
    errors.push("Release receipt channel must be production.");
  }
  requireIsoTimestamp(receipt.generatedAt, "generatedAt");
  validateSource(receipt.source);
  validateArtifacts(receipt.artifacts);
  validateNotarization(receipt.notarization);
  validateStapling(receipt.stapling);
  validateGatekeeper(receipt.gatekeeper);
  validateInstallSmoke(receipt.installSmoke);
  validateSafeMetadata(receipt);
}

function validateSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    errors.push("Release receipt source must be an object.");
    return;
  }
  if (typeof source.gitCommit !== "string" || !/^[0-9a-f]{40}$/i.test(source.gitCommit)) {
    errors.push("Release receipt source.gitCommit must be a full 40-character git SHA.");
  }
  if (typeof source.workflowRunId !== "string" || source.workflowRunId.trim().length < 1) {
    errors.push("Release receipt source.workflowRunId must identify the release workflow run.");
  }
}

function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length < 4) {
    errors.push("Release receipt artifacts must include DMG, ZIP, latest metadata, and provenance entries.");
    return;
  }
  const required = [
    `Gideon-${version}-arm64.dmg`,
    `Gideon-${version}-arm64-mac.zip`,
    "latest-mac.yml",
    "provenance.json"
  ];
  for (const fileName of required) {
    const artifact = artifacts.find((candidate) => candidate?.fileName === fileName);
    if (!artifact) {
      errors.push(`Release receipt is missing artifact ${fileName}.`);
      continue;
    }
    validateArtifact(artifact);
  }
}

function validateArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    errors.push("Release receipt artifact entries must be objects.");
    return;
  }
  const fileName = typeof artifact.fileName === "string" ? artifact.fileName : "";
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
    errors.push("Release receipt artifact fileName must be a simple file name.");
    return;
  }
  const artifactPath = path.join(releaseDir, fileName);
  if (!fs.existsSync(artifactPath)) {
    errors.push(`Release artifact ${path.relative(process.cwd(), artifactPath)} does not exist.`);
    return;
  }
  const bytes = fs.readFileSync(artifactPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (artifact.sha256 !== sha256) {
    errors.push(`Release receipt sha256 does not match ${fileName}.`);
  }
  if (artifact.size !== bytes.length) {
    errors.push(`Release receipt size does not match ${fileName}.`);
  }
}

function validateNotarization(notarization) {
  if (!notarization || typeof notarization !== "object" || Array.isArray(notarization)) {
    errors.push("Release receipt notarization must be an object.");
    return;
  }
  if (notarization.status !== "accepted") {
    errors.push("Release receipt notarization.status must be accepted.");
  }
  if (typeof notarization.requestId !== "string" || notarization.requestId.trim().length < 6) {
    errors.push("Release receipt notarization.requestId must identify the Apple notarization submission.");
  }
  requireIsoTimestamp(notarization.completedAt, "notarization.completedAt");
}

function validateStapling(stapling) {
  if (!stapling || typeof stapling !== "object" || Array.isArray(stapling)) {
    errors.push("Release receipt stapling must be an object.");
    return;
  }
  if (stapling.dmg !== "accepted") {
    errors.push("Release receipt stapling.dmg must be accepted.");
  }
}

function validateGatekeeper(gatekeeper) {
  if (!gatekeeper || typeof gatekeeper !== "object" || Array.isArray(gatekeeper)) {
    errors.push("Release receipt gatekeeper must be an object.");
    return;
  }
  if (gatekeeper.spctlAssessment !== "accepted") {
    errors.push("Release receipt gatekeeper.spctlAssessment must be accepted.");
  }
  requireIsoTimestamp(gatekeeper.checkedAt, "gatekeeper.checkedAt");
}

function validateInstallSmoke(installSmoke) {
  if (!installSmoke || typeof installSmoke !== "object" || Array.isArray(installSmoke)) {
    errors.push("Release receipt installSmoke must be an object.");
    return;
  }
  if (installSmoke.result !== "passed") {
    errors.push("Release receipt installSmoke.result must be passed.");
  }
  requireIsoTimestamp(installSmoke.checkedAt, "installSmoke.checkedAt");
}

function validateSafeMetadata(receipt) {
  const serialized = JSON.stringify(receipt);
  for (const pattern of sensitivePatterns) {
    if (pattern.test(serialized)) {
      errors.push(`Release receipt contains sensitive material matching ${pattern}.`);
    }
  }
}

function requireIsoTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    errors.push(`Release receipt ${label} must be an ISO-8601 timestamp.`);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (filePath === path.resolve("package.json")) {
      return {};
    }
    console.error("Production release receipt check failed:");
    console.error(`- Could not read ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    process.exit(1);
  }
}
