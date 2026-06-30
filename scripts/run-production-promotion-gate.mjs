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

const steps = [
  step("local production readiness gate", [pnpm, "production:check"]),
  step("strict staging readiness gate", [pnpm, "staging:check", "--", "--strict"]),
  step("live provider canaries", [pnpm, "provider:canary", "--", "--live"]),
  step("live staging upload-to-export smoke", [pnpm, "staging:smoke", "--", "--live"]),
  ...(skipPackage
    ? []
    : [
        step("signed macOS package", [pnpm, "package:mac:signed"]),
        step("production macOS release metadata", [pnpm, "release:mac:check"], {
          GIDEON_RELEASE_CHANNEL: "production"
        }),
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
  console.log("Set GIDEON_PRODUCTION_PROMOTION_LIVE=true or pass --live to execute against staging/release infrastructure.");
  process.exit(0);
}

if (!live) {
  console.error("Production promotion gate requires --live or GIDEON_PRODUCTION_PROMOTION_LIVE=true.");
  process.exit(1);
}

for (const item of steps) {
  if (item.requireFile && !fs.existsSync(item.requireFile)) {
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
    console.error(`Production promotion gate failed at step: ${item.name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Production promotion gate passed.");

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
