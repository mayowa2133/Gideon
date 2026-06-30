#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipPackage = args.has("--skip-package");
const pnpm = process.env.GIDEON_PNPM_BIN?.trim() || "pnpm";
const releaseDmg = path.join("release", "Gideon-0.1.0-arm64.dmg");

const steps = [
  step("repository lint", [pnpm, "lint"]),
  step("typecheck", [pnpm, "typecheck"]),
  step("unit/integration tests", [pnpm, "test"]),
  step("optional Redis smoke", [pnpm, "test:redis"]),
  step("PostgreSQL migration dry-run", [pnpm, "db:migrate", "--", "--dry-run"]),
  step("provider canary dry-run", [pnpm, "provider:canary", "--", "--dry-run"]),
  step("hosted review policy", [pnpm, "hosted:review:check"]),
  step("staging readiness dry-run", [pnpm, "staging:check"]),
  step("staging upload-to-export smoke dry-run", [pnpm, "staging:smoke", "--", "--dry-run"]),
  step("staging hosted MCP smoke dry-run", [pnpm, "staging:mcp:smoke", "--", "--dry-run"]),
  step("production promotion gate dry-run", [pnpm, "production:promote:check", "--", "--dry-run"]),
  step("local hosted worker preflight", [pnpm, "worker:hosted:check"], localWorkerEnv()),
  step("production-shaped hosted worker preflight", [pnpm, "worker:hosted:check"], productionWorkerEnv()),
  step("build", [pnpm, "build"]),
  ...(skipPackage
    ? []
    : [
        step("macOS package", [pnpm, "package:mac"]),
        step("macOS release metadata", [pnpm, "release:mac:check"]),
        step("macOS DMG verification", ["hdiutil", "verify", releaseDmg], undefined, {
          skipWhen: () => process.platform !== "darwin" || !fs.existsSync(releaseDmg),
          skipReason: `Skipping DMG verification because ${releaseDmg} is unavailable or this is not macOS.`
        })
      ])
];

if (dryRun) {
  console.log("Production readiness gate dry-run:");
  steps.forEach((item, index) => {
    console.log(`${index + 1}. ${item.name}: ${item.command.join(" ")}`);
  });
  process.exit(0);
}

for (const item of steps) {
  if (item.skipWhen?.()) {
    console.log(`SKIP ${item.name}: ${item.skipReason}`);
    continue;
  }
  console.log(`RUN ${item.name}`);
  const [command, ...commandArgs] = item.command;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...item.env },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`Production readiness gate failed at step: ${item.name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Production readiness gate passed.");

function step(name, command, env, options = {}) {
  return {
    name,
    command,
    env,
    skipWhen: options.skipWhen,
    skipReason: options.skipReason
  };
}

function localWorkerEnv() {
  return {
    GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
    GIDEON_REDIS_URL: "redis://localhost:6379/0",
    GIDEON_WORKER_ID: "hosted-worker-1",
    GIDEON_WORKER_LEASE_SECONDS: "300",
    GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
    GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker"
  };
}

function productionWorkerEnv() {
  return {
    GIDEON_DEPLOYMENT_ENV: "production",
    GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
    GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
    GIDEON_STORE_PROVIDER: "postgres_snapshot",
    GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
    GIDEON_BULLMQ_QUEUE_NAME: "gideon-prod-workers",
    GIDEON_BULLMQ_PREFIX: "gideon-prod",
    GIDEON_WORKER_ID: "worker-prod-1",
    GIDEON_WORKER_LEASE_SECONDS: "300",
    GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
    GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker",
    GIDEON_STORE_PATH: "/var/lib/gideon-worker/store.json",
    GIDEON_PROJECTS_DIR: "/var/lib/gideon-worker/projects",
    GIDEON_STORAGE_ROOT: "/var/lib/gideon-worker/cache",
    GIDEON_STORAGE_PROVIDER: "s3",
    GIDEON_STORAGE_BUCKET: "gideon-private-prod",
    GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
    GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
    GIDEON_OPENAI_API_KEY: "provider-key"
  };
}
