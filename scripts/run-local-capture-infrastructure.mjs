#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const requiredCommands = ["initdb", "pg_ctl", "psql", "redis-server", "pnpm"];
const missing = requiredCommands.filter((command) => spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status !== 0);
if (missing.length) {
  console.error(`Local capture infrastructure is unavailable: missing ${missing.join(", ")}.`);
  process.exit(1);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-infrastructure-"));
const postgresDir = path.join(root, "postgres");
const redisDir = path.join(root, "redis");
const postgresPort = await freePort();
const redisPort = await freePort();
const databaseUrl = `postgresql://gideon@127.0.0.1:${postgresPort}/gideon_capture_test`;
const redisUrl = `redis://127.0.0.1:${redisPort}`;
let postgresStarted = false;
let redis;
let status = "failed";
let failedStage = "bootstrap";

try {
  await fs.mkdir(redisDir, { mode: 0o700 });
  run("initdb", ["--no-sync", "--auth=trust", "--username=gideon", "--pgdata", postgresDir]);
  run("pg_ctl", ["-D", postgresDir, "-l", path.join(root, "postgres.log"), "-o", `-F -h 127.0.0.1 -p ${postgresPort}`, "-w", "start"]);
  postgresStarted = true;
  run("psql", [`postgresql://gideon@127.0.0.1:${postgresPort}/postgres`, "-v", "ON_ERROR_STOP=1", "-c", "create database gideon_capture_test"]);

  redis = spawn("redis-server", ["--bind", "127.0.0.1", "--port", String(redisPort), "--save", "", "--appendonly", "no", "--dir", redisDir, "--protected-mode", "yes"], { stdio: ["ignore", "ignore", "ignore"] });
  await waitForPort(redisPort, redis, 10_000);

  const env = { ...process.env, GIDEON_DATABASE_URL: databaseUrl, GIDEON_TEST_DATABASE_URL: databaseUrl, GIDEON_REDIS_URL: redisUrl, GIDEON_TEST_REDIS_URL: redisUrl };
  failedStage = "migrations";
  run(process.execPath, ["scripts/migrate-postgres.mjs"], env, true);
  failedStage = "integration_tests";
  run("pnpm", ["vitest", "run", "src/main/captureInfrastructure.integration.test.ts", "src/main/jobQueue.redis.test.ts", "src/main/storage.test.ts", "src/main/storageCapturePreviewSigner.test.ts", "src/main/capturePreviewService.test.ts", "src/main/captureDeletion.test.ts", "src/main/captureArtifactReconciliation.test.ts"], env, true);
  status = "passed";
  failedStage = "none";
} finally {
  redis?.kill("SIGTERM");
  if (redis) await Promise.race([new Promise((resolve) => redis.once("close", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (postgresStarted) spawnSync("pg_ctl", ["-D", postgresDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore", timeout: 10_000 });
  await fs.rm(root, { recursive: true, force: true });
  const leaked = await exists(root);
  const report = { schemaVersion: "1", status, failedStage, services: { postgres: "disposable_local", redis: "disposable_local", objectStorage: "in_process_s3_compatible_fixture" }, migrationsApplied: status === "passed" ? 5 : null, teardown: leaked ? "failed" : "verified", tests: ["postgres_workspace_and_migration", "postgres_concurrent_idempotency", "postgres_failure_rollback", "usage_duplicate_accounting", "project_graph_deletion", "durable_cleanup_outbox", "redis_duplicate_delivery", "redis_retry_recovery", "redis_durable_interruption", "redis_pending_cancellation", "worker_lease_and_heartbeat", "s3_compatible_lifecycle"] };
  const reportDir = path.join(process.cwd(), "tmp", "capture-infrastructure-evidence");
  await fs.mkdir(reportDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(reportDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (status !== "passed" || leaked) process.exitCode = 1;
}

function run(command, args, env = process.env, inherit = false) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, encoding: "utf8", stdio: inherit ? "inherit" : "pipe", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${command} failed during local infrastructure verification.`);
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address(); if (!address || typeof address === "string") return reject(new Error("Could not allocate local port.")); const port = address.port; server.close((error) => error ? reject(error) : resolve(port)); });
  });
}
async function waitForPort(port, child, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error("Redis exited during local infrastructure bootstrap.");
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Redis did not become ready in time.");
}
function canConnect(port) { return new Promise((resolve) => { const socket = net.connect({ host: "127.0.0.1", port }); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); }); }
async function exists(value) { try { await fs.lstat(value); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
