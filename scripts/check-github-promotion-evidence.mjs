#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const skipDownload = options.flags.has("skip-download");
const skipRunMetadata = options.flags.has("skip-run-metadata");
const allowSkipPackage = options.flags.has("allow-skip-package");
const repo = options.values.repo ?? process.env.GITHUB_REPOSITORY ?? "mayowa2133/Gideon";
const runId = options.values["run-id"] ?? process.env.GITHUB_RUN_ID;
const artifactName = options.values["artifact-name"] ?? "Gideon-production-promotion-evidence";
const downloadDir = path.resolve(options.values["download-dir"] ?? path.join("tmp", "github-production-promotion-evidence"));
const evidenceFilename = options.values["evidence-filename"] ?? "production-promotion-evidence.json";
const providerReportFilename = options.values["provider-report-filename"] ?? "provider-canary-report.json";
const releaseReceiptFilename = options.values["release-receipt-filename"] ?? "release-receipt.json";
const receiptPath = options.values["write-receipt"] ? path.resolve(options.values["write-receipt"]) : null;
const SENSITIVE_PATTERNS = [
  /APPLE_APP_SPECIFIC_PASSWORD/i,
  /CSC_KEY_PASSWORD/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /x-amz-signature=/i,
  /signedUrl/i,
  /downloadUrl/i
];

if (dryRun) {
  console.log("GitHub promotion evidence artifact check dry-run:");
  console.log(`1. Resolve repository: ${repo}.`);
  console.log("2. Require --run-id or GITHUB_RUN_ID unless --skip-download is set.");
  console.log(`3. Download artifact ${artifactName} into ${downloadDir} with gh run download.`);
  console.log(`4. Locate ${evidenceFilename}, ${providerReportFilename}, and release receipt evidence recursively inside the artifact directory.`);
  console.log("5. Verify the promotion evidence, provider canary report, and release receipt summary with local checkers.");
  console.log("6. When --run-id is available, verify evidence gitCommit matches gh run view headSha.");
  console.log("7. When --write-receipt is provided, write a safe verification receipt with SHA-256 artifact digests, byte sizes, and without secrets or provider payloads.");
  process.exit(0);
}

if (!skipDownload && !runId) {
  fail(["--run-id or GITHUB_RUN_ID is required unless --skip-download is set."]);
}

if (!skipDownload) {
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  runCommand("gh", ["run", "download", runId, "--repo", repo, "--name", artifactName, "--dir", downloadDir]);
}

const evidencePath = findEvidenceFile(downloadDir, evidenceFilename);
const providerReportPath = findEvidenceFile(downloadDir, providerReportFilename);
const releaseReceiptPath = allowSkipPackage ? null : findEvidenceFile(downloadDir, releaseReceiptFilename);
const verifyArgs = ["scripts/check-production-promotion-evidence.mjs", "--path", evidencePath];
if (allowSkipPackage) {
  verifyArgs.push("--allow-skip-package");
}
runCommand(process.execPath, verifyArgs);
runCommand(process.execPath, ["scripts/check-provider-canary-report.mjs", "--path", providerReportPath]);
const evidence = readEvidence(evidencePath);
const providerReport = readEvidence(providerReportPath);
const releaseReceipt = releaseReceiptPath ? readEvidence(releaseReceiptPath) : null;
if (releaseReceipt) {
  validateArchivedReleaseReceipt(releaseReceipt);
}
let runMetadata = null;
if (runId && !skipRunMetadata) {
  runMetadata = validateRunMetadata({ repo, runId, evidence });
}
if (receiptPath) {
  writeReceipt({
    receiptPath,
    repo,
    runId,
    artifactName,
    evidencePath,
    evidence,
    providerReportPath,
    providerReport,
    releaseReceiptPath,
    releaseReceipt,
    runMetadata,
    allowSkipPackage,
    skipRunMetadata
  });
}

console.log(
  `GitHub promotion evidence artifact check passed for ${path.relative(process.cwd(), evidencePath)}, ${path.relative(
    process.cwd(),
    providerReportPath
  )}${releaseReceiptPath ? `, and ${path.relative(process.cwd(), releaseReceiptPath)}` : ""}.`
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

function findEvidenceFile(rootDir, filename) {
  if (!fs.existsSync(rootDir)) {
    fail([`Evidence download directory does not exist: ${path.relative(process.cwd(), rootDir)}.`]);
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

function validateRunMetadata(input) {
  const result = runCommand(
    "gh",
    ["run", "view", input.runId, "--repo", input.repo, "--json", "headSha,conclusion,status,event,databaseId"],
    { capture: true }
  );
  let run;
  try {
    run = JSON.parse(result.stdout);
  } catch (error) {
    fail([`Could not parse gh run view JSON: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    fail(["gh run view JSON was not an object."]);
  }
  const errors = [];
  if (run.status !== "completed") {
    errors.push(`GitHub run ${input.runId} status must be completed.`);
  }
  if (run.conclusion !== "success") {
    errors.push(`GitHub run ${input.runId} conclusion must be success.`);
  }
  if (run.event !== "workflow_dispatch") {
    errors.push(`GitHub run ${input.runId} event must be workflow_dispatch.`);
  }
  if (typeof run.headSha !== "string" || !/^[0-9a-f]{40}$/i.test(run.headSha)) {
    errors.push(`GitHub run ${input.runId} headSha must be a full git SHA.`);
  } else if (run.headSha.toLowerCase() !== String(input.evidence.gitCommit ?? "").toLowerCase()) {
    errors.push(`Evidence gitCommit ${input.evidence.gitCommit ?? "missing"} does not match GitHub run headSha ${run.headSha}.`);
  }
  if (errors.length > 0) {
    fail(errors);
  }
  return run;
}

function writeReceipt(input) {
  const providerCapabilities = Array.isArray(input.providerReport.results)
    ? input.providerReport.results.map((result) => result?.capability).filter((capability) => typeof capability === "string").sort()
    : [];
  const receipt = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    repository: input.repo,
    runId: input.runId ?? null,
    artifactName: input.artifactName,
    evidencePath: path.relative(process.cwd(), input.evidencePath),
    evidence: {
      schemaVersion: input.evidence.schemaVersion,
      mode: input.evidence.mode,
      status: input.evidence.status,
      gitCommit: input.evidence.gitCommit,
      generatedAt: input.evidence.generatedAt,
      finishedAt: input.evidence.finishedAt,
      skipPackage: Boolean(input.evidence.skipPackage),
      stepCount: Array.isArray(input.evidence.steps) ? input.evidence.steps.length : 0,
      sizeBytes: fileSizeBytes(input.evidencePath),
      sha256: sha256File(input.evidencePath)
    },
    providerCanaryReport: {
      path: path.relative(process.cwd(), input.providerReportPath),
      mode: input.providerReport.mode,
      providerConfigured: input.providerReport.providerConfigured,
      generatedAt: input.providerReport.generatedAt,
      capabilityCount: providerCapabilities.length,
      capabilities: providerCapabilities,
      sizeBytes: fileSizeBytes(input.providerReportPath),
      sha256: sha256File(input.providerReportPath)
    },
    releaseReceipt: input.releaseReceipt
      ? {
          path: path.relative(process.cwd(), input.releaseReceiptPath),
          product: input.releaseReceipt.product,
          version: input.releaseReceipt.version,
          channel: input.releaseReceipt.channel,
          generatedAt: input.releaseReceipt.generatedAt,
          sourceGitCommit: input.releaseReceipt.source?.gitCommit ?? null,
          workflowRunId: input.releaseReceipt.source?.workflowRunId ?? null,
          artifactCount: Array.isArray(input.releaseReceipt.artifacts) ? input.releaseReceipt.artifacts.length : 0,
          notarizationStatus: input.releaseReceipt.notarization?.status ?? null,
          staplingDmg: input.releaseReceipt.stapling?.dmg ?? null,
          gatekeeperAssessment: input.releaseReceipt.gatekeeper?.spctlAssessment ?? null,
          installSmokeResult: input.releaseReceipt.installSmoke?.result ?? null,
          sizeBytes: fileSizeBytes(input.releaseReceiptPath),
          sha256: sha256File(input.releaseReceiptPath)
        }
      : null,
    githubRun: input.runMetadata
      ? {
          databaseId: input.runMetadata.databaseId ?? null,
          status: input.runMetadata.status,
          conclusion: input.runMetadata.conclusion,
          event: input.runMetadata.event,
          headSha: input.runMetadata.headSha
        }
      : null,
    checks: {
      productionEvidenceSchema: "passed",
      providerCanaryReport: "passed",
      releaseReceipt: input.releaseReceipt ? "passed" : "skipped",
      allowSkipPackage: Boolean(input.allowSkipPackage),
      runMetadata: input.runId ? (input.skipRunMetadata ? "skipped" : "passed") : "not_applicable",
      secretPolicy: "receipt excludes environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, media paths, and artifact contents"
    }
  };
  fs.mkdirSync(path.dirname(input.receiptPath), { recursive: true });
  fs.writeFileSync(input.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileSizeBytes(filePath) {
  return fs.statSync(filePath).size;
}

function validateArchivedReleaseReceipt(releaseReceipt) {
  const errors = [];
  if (!releaseReceipt || typeof releaseReceipt !== "object" || Array.isArray(releaseReceipt)) {
    errors.push("Release receipt root must be an object.");
  } else {
    if (releaseReceipt.schemaVersion !== 1) {
      errors.push("Release receipt schemaVersion must be 1.");
    }
    if (releaseReceipt.product !== "Gideon") {
      errors.push("Release receipt product must be Gideon.");
    }
    if (releaseReceipt.channel !== "production") {
      errors.push("Release receipt channel must be production.");
    }
    if (releaseReceipt.notarization?.status !== "accepted") {
      errors.push("Release receipt notarization.status must be accepted.");
    }
    if (releaseReceipt.stapling?.dmg !== "accepted") {
      errors.push("Release receipt stapling.dmg must be accepted.");
    }
    if (releaseReceipt.gatekeeper?.spctlAssessment !== "accepted") {
      errors.push("Release receipt gatekeeper.spctlAssessment must be accepted.");
    }
    if (releaseReceipt.installSmoke?.result !== "passed") {
      errors.push("Release receipt installSmoke.result must be passed.");
    }
    if (typeof releaseReceipt.source?.gitCommit !== "string" || !/^[0-9a-f]{40}$/i.test(releaseReceipt.source.gitCommit)) {
      errors.push("Release receipt source.gitCommit must be a full 40-character git SHA.");
    }
    const serialized = JSON.stringify(releaseReceipt);
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(serialized)) {
        errors.push(`Release receipt contains sensitive material matching ${pattern}.`);
      }
    }
  }
  if (errors.length > 0) {
    fail(errors);
  }
}

function readEvidence(evidencePath) {
  try {
    return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    fail([`Could not read evidence JSON from ${path.relative(process.cwd(), evidencePath)}: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.error) {
    fail([`${command} could not be started: ${result.error.message}.`]);
  }
  if (result.status !== 0) {
    const stderr = options.capture && result.stderr ? ` ${String(result.stderr).trim()}` : "";
    fail([`${[command, ...commandArgs].join(" ")} failed with exit code ${result.status ?? "unknown"}.${stderr}`]);
  }
  return {
    stdout: options.capture ? String(result.stdout ?? "") : "",
    stderr: options.capture ? String(result.stderr ?? "") : ""
  };
}

function fail(errors) {
  console.error("GitHub promotion evidence artifact check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
