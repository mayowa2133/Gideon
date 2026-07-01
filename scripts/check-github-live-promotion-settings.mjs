#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const repo = options.values.repo ?? process.env.GITHUB_REPOSITORY ?? "mayowa2133/Gideon";

if (dryRun) {
  console.log("GitHub live promotion repo settings check dry-run:");
  console.log(`1. Repository: ${repo}.`);
  console.log("2. Read expected workflow inputs, GitHub Secrets, and GitHub Variables from production:github-config:check -- --json.");
  console.log("3. Query configured repository secret names with gh secret list --json name.");
  console.log("4. Query configured repository variable names with gh variable list --json name.");
  console.log("5. Report missing names only; secret and variable values are never read.");
  process.exit(0);
}

const expected = readExpectedConfiguration();
const secrets = readGitHubNames("secret", repo);
const variables = readGitHubNames("variable", repo);
const missingSecrets = expected.secrets.filter((name) => !secrets.has(name));
const missingVars = expected.vars.filter((name) => !variables.has(name));

if (missingSecrets.length > 0 || missingVars.length > 0) {
  console.error("GitHub live promotion repo settings check failed:");
  if (missingSecrets.length > 0) {
    console.error("Missing GitHub Secrets:");
    missingSecrets.forEach((name) => console.error(`- ${name}`));
  }
  if (missingVars.length > 0) {
    console.error("Missing GitHub Variables:");
    missingVars.forEach((name) => console.error(`- ${name}`));
  }
  process.exit(1);
}

console.log(
  `GitHub live promotion repo settings check passed for ${repo}: ${expected.secrets.length} secrets and ${expected.vars.length} variables are configured.`
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

function readExpectedConfiguration() {
  const result = runCommand(process.execPath, ["scripts/check-live-promotion-github-config.mjs", "--json"], { capture: true });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    fail([`Could not parse production:github-config:check JSON: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
  if (!Array.isArray(parsed?.secrets) || !Array.isArray(parsed?.vars)) {
    fail(["production:github-config:check -- --json did not return secrets and vars arrays."]);
  }
  return {
    secrets: parsed.secrets.filter((name) => typeof name === "string" && name.trim()),
    vars: parsed.vars.filter((name) => typeof name === "string" && name.trim())
  };
}

function readGitHubNames(kind, targetRepo) {
  const commandArgs =
    kind === "secret"
      ? ["secret", "list", "--repo", targetRepo, "--json", "name", "--limit", "200"]
      : ["variable", "list", "--repo", targetRepo, "--json", "name", "--limit", "200"];
  const result = runCommand("gh", commandArgs, { capture: true });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    fail([`Could not parse gh ${kind} list JSON: ${error instanceof Error ? error.message : "unknown error"}.`]);
  }
  if (!Array.isArray(parsed)) {
    fail([`gh ${kind} list JSON was not an array.`]);
  }
  return new Set(
    parsed
      .map((entry) => (entry && typeof entry === "object" ? entry.name : undefined))
      .filter((name) => typeof name === "string" && name.trim())
  );
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
  console.error("GitHub live promotion repo settings check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
