#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const allowSkipPackage = options.flags.has("allow-skip-package");
const archiveDir = path.resolve(options.values["archive-dir"] ?? path.join("tmp", "github-production-promotion-evidence"));
const evidenceFilename = options.values["evidence-filename"] ?? "production-promotion-evidence.json";
const providerReportFilename = options.values["provider-report-filename"] ?? "provider-canary-report.json";
const artifactName = options.values["artifact-name"] ?? "Gideon-production-promotion-evidence";
const evidencePath = options.values["evidence-path"] ? path.resolve(options.values["evidence-path"]) : null;
const providerReportPath = options.values["provider-report-path"] ? path.resolve(options.values["provider-report-path"]) : null;
const receiptPath = options.values["receipt-path"] ? path.resolve(options.values["receipt-path"]) : null;

if (dryRun) {
  console.log("GitHub promotion archive bundle check dry-run:");
  console.log(`1. Resolve archive directory: ${archiveDir}.`);
  console.log(`2. Locate exactly one ${evidenceFilename} and ${providerReportFilename} unless explicit paths are provided.`);
  console.log("3. Locate verification-receipt.json unless --receipt-path is provided.");
  console.log("4. Re-run production evidence, provider canary report, and GitHub receipt validators against the archived files.");
  console.log("5. Compare the receipt evidence and provider report summaries to the archived JSON files.");
  console.log("6. Require artifact name, git commit, timestamps, skip-package flag, step count, and provider capabilities to stay consistent.");
  process.exit(0);
}

const resolvedEvidencePath = evidencePath ?? findUniqueFile(archiveDir, evidenceFilename);
const resolvedProviderReportPath = providerReportPath ?? findUniqueFile(archiveDir, providerReportFilename);
const resolvedReceiptPath = receiptPath ?? resolveReceiptPath(archiveDir);

const evidenceArgs = ["scripts/check-production-promotion-evidence.mjs", "--path", resolvedEvidencePath];
if (allowSkipPackage) {
  evidenceArgs.push("--allow-skip-package");
}
runCommand(process.execPath, evidenceArgs);
runCommand(process.execPath, ["scripts/check-provider-canary-report.mjs", "--path", resolvedProviderReportPath]);
runCommand(process.execPath, ["scripts/check-github-promotion-receipt.mjs", "--path", resolvedReceiptPath]);

const evidence = readJson(resolvedEvidencePath, "evidence");
const providerReport = readJson(resolvedProviderReportPath, "provider canary report");
const receipt = readJson(resolvedReceiptPath, "receipt");
const errors = [];

validateArchiveConsistency({
  evidence,
  providerReport,
  receipt,
  evidencePath: resolvedEvidencePath,
  providerReportPath: resolvedProviderReportPath,
  artifactName,
  errors
});

if (errors.length > 0) {
  console.error("GitHub promotion archive bundle check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `GitHub promotion archive bundle check passed for ${path.relative(process.cwd(), resolvedEvidencePath)}, ${path.relative(
    process.cwd(),
    resolvedProviderReportPath
  )}, and ${path.relative(
    process.cwd(),
    resolvedReceiptPath
  )}.`
);

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

function resolveReceiptPath(rootDir) {
  const directPath = path.join(rootDir, "verification-receipt.json");
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  return findUniqueFile(rootDir, "verification-receipt.json");
}

function findUniqueFile(rootDir, filename) {
  if (!fs.existsSync(rootDir)) {
    fail([`Archive directory does not exist: ${path.relative(process.cwd(), rootDir)}.`]);
  }
  const matches = [];
  walk(rootDir, (filePath) => {
    if (path.basename(filePath) === filename) {
      matches.push(filePath);
    }
  });
  if (matches.length === 0) {
    fail([`Could not find ${filename} under ${path.relative(process.cwd(), rootDir)}.`]);
  }
  if (matches.length > 1) {
    fail([
      `Found multiple ${filename} files under ${path.relative(process.cwd(), rootDir)}:`,
      ...matches.map((match) => `  - ${path.relative(process.cwd(), match)}`)
    ]);
  }
  return matches[0];
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, visit);
    } else if (entry.isFile()) {
      visit(entryPath);
    }
  }
}

function runCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    fail([`${command} could not be started: ${result.error.message}.`]);
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? ` ${String(result.stderr).trim()}` : "";
    fail([`${[command, ...commandArgs].join(" ")} failed with exit code ${result.status ?? "unknown"}.${stderr}`]);
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail([`Could not read ${label} JSON from ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
}

function validateArchiveConsistency(input) {
  if (input.receipt.artifactName !== input.artifactName) {
    input.errors.push(`Receipt artifactName must be ${input.artifactName}.`);
  }
  if (path.basename(String(input.receipt.evidencePath ?? "")) !== path.basename(input.evidencePath)) {
    input.errors.push("Receipt evidencePath must identify the archived evidence file.");
  }
  if (path.basename(String(input.receipt.providerCanaryReport?.path ?? "")) !== path.basename(input.providerReportPath)) {
    input.errors.push("Receipt providerCanaryReport.path must identify the archived provider canary report file.");
  }
  requireEqual(input.receipt.evidence?.schemaVersion, input.evidence.schemaVersion, "evidence.schemaVersion", input.errors);
  requireEqual(input.receipt.evidence?.mode, input.evidence.mode, "evidence.mode", input.errors);
  requireEqual(input.receipt.evidence?.status, input.evidence.status, "evidence.status", input.errors);
  requireEqual(input.receipt.evidence?.gitCommit, input.evidence.gitCommit, "evidence.gitCommit", input.errors);
  requireEqual(input.receipt.evidence?.generatedAt, input.evidence.generatedAt, "evidence.generatedAt", input.errors);
  requireEqual(input.receipt.evidence?.finishedAt, input.evidence.finishedAt, "evidence.finishedAt", input.errors);
  requireEqual(Boolean(input.receipt.evidence?.skipPackage), Boolean(input.evidence.skipPackage), "evidence.skipPackage", input.errors);
  requireEqual(input.receipt.evidence?.stepCount, Array.isArray(input.evidence.steps) ? input.evidence.steps.length : 0, "evidence.stepCount", input.errors);
  if (input.receipt.githubRun?.headSha && input.receipt.githubRun.headSha !== input.evidence.gitCommit) {
    input.errors.push("Receipt githubRun.headSha must match archived evidence gitCommit.");
  }
  requireEqual(input.receipt.providerCanaryReport?.mode, input.providerReport.mode, "providerCanaryReport.mode", input.errors);
  requireEqual(
    input.receipt.providerCanaryReport?.providerConfigured,
    input.providerReport.providerConfigured,
    "providerCanaryReport.providerConfigured",
    input.errors
  );
  requireEqual(input.receipt.providerCanaryReport?.generatedAt, input.providerReport.generatedAt, "providerCanaryReport.generatedAt", input.errors);
  const capabilities = Array.isArray(input.providerReport.results)
    ? input.providerReport.results.map((result) => result?.capability).filter((capability) => typeof capability === "string").sort()
    : [];
  requireEqual(input.receipt.providerCanaryReport?.capabilityCount, capabilities.length, "providerCanaryReport.capabilityCount", input.errors);
  if (JSON.stringify(input.receipt.providerCanaryReport?.capabilities ?? []) !== JSON.stringify(capabilities)) {
    input.errors.push("Receipt providerCanaryReport.capabilities must match archived provider canary report.");
  }
}

function requireEqual(receiptValue, evidenceValue, label, errors) {
  if (receiptValue !== evidenceValue) {
    errors.push(`Receipt ${label} must match archived promotion evidence.`);
  }
}

function fail(errors) {
  console.error("GitHub promotion archive bundle check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
