#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const live = args.has("--live") || process.env.GIDEON_PRODUCTION_PROMOTION_LIVE === "true";
const dryRun = args.has("--dry-run") || !live;
const skipPackage = args.has("--skip-package");
const pnpm = process.env.GIDEON_PNPM_BIN?.trim() || "pnpm";
const releaseDmg = path.join("release", "Gideon-0.1.0-arm64.dmg");
const evidencePath =
  process.env.GIDEON_PRODUCTION_PROMOTION_EVIDENCE_PATH?.trim() ||
  path.join("tmp", "production-promotion-evidence.json");
const providerCanaryReportPath =
  process.env.GIDEON_PROVIDER_CANARY_REPORT_PATH?.trim() ||
  path.join("tmp", "provider-canary-report.json");

const steps = [
  step("local production readiness gate", [pnpm, "production:check"]),
  step("strict staging readiness gate", [pnpm, "staging:check", "--", "--strict"]),
  step("production MCP access policy", [pnpm, "production:mcp:check"]),
  step("production billing reconciliation", [pnpm, "production:billing:check", "--", "--live"]),
  step("production PostgreSQL policy", [pnpm, "production:db:check"]),
  step("production BullMQ policy", [pnpm, "production:queue:check"]),
  step("production observability policy", [pnpm, "production:observability:check"]),
  step("production storage lifecycle policy", [pnpm, "production:storage:check", "--", "--verify-bucket-lifecycle"]),
  step("production storage signed-download smoke", [pnpm, "production:storage-download:smoke"]),
  step("production TTS policy", [pnpm, "production:tts:check"]),
  step("live provider canaries", [pnpm, "provider:canary", "--", "--live"], {
    GIDEON_PROVIDER_CANARY_REPORT_PATH: providerCanaryReportPath
  }),
  step("provider canary report", [pnpm, "production:provider-canary-report:check"], {
    GIDEON_PROVIDER_CANARY_REPORT_PATH: providerCanaryReportPath
  }),
  step("live staging upload-to-export smoke", [pnpm, "staging:smoke", "--", "--live"]),
  step("live staging hosted MCP smoke", [pnpm, "staging:mcp:smoke", "--", "--live", "--require-metric-export"]),
  ...(skipPackage
    ? []
    : [
        step("signed macOS package", [pnpm, "package:mac:signed"]),
        step("production macOS release metadata", [pnpm, "release:mac:check"], {
          GIDEON_RELEASE_CHANNEL: "production"
        }),
        step("production release notarization receipt", [pnpm, "production:release-receipt:check"]),
        step("production macOS DMG verification", ["hdiutil", "verify", releaseDmg], undefined, {
          requireFile: releaseDmg
        })
      ])
];

if (dryRun) {
  console.log("Production promotion gate dry-run:");
  steps.forEach((item, index) => {
    const envPrefix = Object.keys(item.env ?? {}).length > 0 ? `${formatEnv(item.env)} ` : "";
    console.log(`${index + 1}. ${item.name}: ${envPrefix}${item.command.join(" ")}`);
  });
  console.log(`Live evidence report path: ${evidencePath}`);
  console.log("Set GIDEON_PRODUCTION_PROMOTION_LIVE=true or pass --live to execute against staging/release infrastructure.");
  process.exit(0);
}

if (!live) {
  console.error("Production promotion gate requires --live or GIDEON_PRODUCTION_PROMOTION_LIVE=true.");
  process.exit(1);
}

const evidence = createEvidenceSkeleton();

for (const item of steps) {
  const startedAt = new Date();
  const evidenceStep = {
    name: item.name,
    command: item.command,
    env: safeEnv(item.env),
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    status: "running",
    exitCode: null,
    error: null
  };
  evidence.steps.push(evidenceStep);

  if (item.requireFile && !fs.existsSync(item.requireFile)) {
    finishEvidenceStep(evidenceStep, startedAt, "failed", 1, `Missing required file: ${item.requireFile}`);
    evidence.status = "failed";
    evidence.failedStep = item.name;
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(evidence);
    console.error(`Production promotion gate failed at step: ${item.name}`);
    console.error(`Missing required file: ${item.requireFile}`);
    process.exit(1);
  }
  console.log(`RUN ${item.name}`);
  const [command, ...commandArgs] = item.command;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...item.env },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    finishEvidenceStep(evidenceStep, startedAt, "failed", result.status ?? 1, "Command exited with non-zero status.");
    evidence.status = "failed";
    evidence.failedStep = item.name;
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(evidence);
    console.error(`Production promotion gate failed at step: ${item.name}`);
    process.exit(result.status ?? 1);
  }
  finishEvidenceStep(evidenceStep, startedAt, "succeeded", 0, null);
}

evidence.status = "succeeded";
evidence.finishedAt = new Date().toISOString();
writeEvidence(evidence);
verifyEvidence(evidencePath);
console.log("Production promotion gate passed.");
console.log(`Production promotion evidence written to ${evidencePath}.`);

function step(name, command, env, options = {}) {
  return {
    name,
    command,
    env,
    requireFile: options.requireFile
  };
}

function formatEnv(env) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function createEvidenceSkeleton() {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    failedStep: null,
    mode: "live",
    skipPackage,
    gitCommit: currentGitCommit(),
    steps: [],
    safety: {
      secretPolicy:
        "Commands, step names, exit codes, safe env overrides, and timings are recorded. Process environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, and media paths are not recorded."
    }
  };
}

function finishEvidenceStep(evidenceStep, startedAt, status, exitCode, error) {
  const finishedAt = new Date();
  evidenceStep.finishedAt = finishedAt.toISOString();
  evidenceStep.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  evidenceStep.status = status;
  evidenceStep.exitCode = exitCode;
  evidenceStep.error = error;
}

function safeEnv(env) {
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(([key]) => key === "GIDEON_RELEASE_CHANNEL" || key === "GIDEON_PROVIDER_CANARY_REPORT_PATH")
  );
}

function currentGitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeEvidence(evidence) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function verifyEvidence(filePath) {
  const args = ["scripts/check-production-promotion-evidence.mjs", "--path", filePath];
  if (skipPackage) {
    args.push("--allow-skip-package");
  }
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error("Production promotion gate failed while verifying promotion evidence.");
    process.exit(result.status ?? 1);
  }
}
