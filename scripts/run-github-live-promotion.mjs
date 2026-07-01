#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const confirmLive = options.flags.has("confirm-live");
const skipPackage = options.flags.has("skip-package");
const repo = options.values.repo ?? process.env.GITHUB_REPOSITORY ?? "mayowa2133/Gideon";
const workflow = options.values.workflow ?? "mac-build.yml";
const ref = options.values.ref ?? "main";
const providedRunId = options.values["run-id"] ?? process.env.GITHUB_RUN_ID;

if (dryRun) {
  console.log("GitHub live promotion runner dry-run:");
  console.log(`1. Repository: ${repo}.`);
  console.log(`2. Workflow: ${workflow}.`);
  console.log(`3. Ref: ${ref}.`);
  console.log(`4. Live promotion input run_live_promotion=true.`);
  console.log(`5. Package mode: ${skipPackage ? "skip signed package/release steps" : "require signed package/release steps"}.`);
  if (providedRunId) {
    console.log(`6. Watch existing run ${providedRunId}.`);
  } else {
    console.log("6. Dispatch the workflow only when --confirm-live is present.");
  }
  console.log("7. Wait for GitHub Actions to finish with gh run watch --exit-status.");
  console.log("8. Download and verify Gideon-production-promotion-evidence with production:github-evidence:check.");
  process.exit(0);
}

let runId = providedRunId;
if (!runId) {
  if (!confirmLive) {
    fail(["Dispatching the live promotion workflow requires --confirm-live."]);
  }
  const dispatchedAfter = new Date(Date.now() - 60_000);
  runCommand("gh", [
    "workflow",
    "run",
    workflow,
    "--repo",
    repo,
    "--ref",
    ref,
    "-f",
    "run_live_promotion=true",
    "-f",
    `skip_package=${skipPackage ? "true" : "false"}`
  ]);
  runId = resolveDispatchedRunId({ repo, workflow, ref, dispatchedAfter });
}

runCommand("gh", ["run", "watch", runId, "--repo", repo, "--exit-status"]);
const verifyArgs = ["scripts/check-github-promotion-evidence.mjs", "--run-id", runId, "--repo", repo];
if (skipPackage) {
  verifyArgs.push("--allow-skip-package");
}
runCommand(process.execPath, verifyArgs);

console.log(`GitHub live promotion workflow passed and evidence verified for run ${runId}.`);

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

function resolveDispatchedRunId(input) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const result = runCommand(
      "gh",
      [
        "run",
        "list",
        "--repo",
        input.repo,
        "--workflow",
        input.workflow,
        "--branch",
        input.ref,
        "--event",
        "workflow_dispatch",
        "--json",
        "databaseId,createdAt,status,conclusion,headBranch",
        "--limit",
        "20"
      ],
      { capture: true }
    );
    const candidate = latestRunAfter(result.stdout, input.dispatchedAfter);
    if (candidate) {
      return String(candidate.databaseId);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000);
  }
  fail(["Could not resolve the dispatched workflow_dispatch run id from gh run list."]);
}

function latestRunAfter(stdout, dispatchedAfter) {
  let runs;
  try {
    runs = JSON.parse(stdout);
  } catch (error) {
    fail([`Could not parse gh run list JSON: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
  if (!Array.isArray(runs)) {
    fail(["gh run list JSON was not an array."]);
  }
  return runs
    .filter((run) => {
      if (!run || typeof run !== "object") {
        return false;
      }
      if (!Number.isFinite(run.databaseId)) {
        return false;
      }
      if (typeof run.createdAt !== "string") {
        return false;
      }
      return Date.parse(run.createdAt) >= dispatchedAfter.getTime();
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
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
  console.error("GitHub live promotion runner failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
