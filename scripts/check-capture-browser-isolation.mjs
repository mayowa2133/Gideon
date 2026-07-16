#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";

const requireRuntime = process.argv.includes("--require-runtime");
const errors = [];
const policyPath = "config/capture-browser-runtime-policy-v1.json";
const dockerfile = fs.readFileSync("Dockerfile.capture-browser", "utf8");
const compose = fs.readFileSync("docker-compose.capture-browser.yml", "utf8");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const policyHash = createHash("sha256").update(stable(policy)).digest("hex");

expect(policy.schemaVersion === "1", "runtime policy schema must be versioned");
expect(policy.policyVersion === "capture-browser-isolation-v1", "runtime policy version changed unexpectedly");
expect(/^sha256:[a-f0-9]{64}$/.test(policy.baseImage.digest), "base image must use a SHA-256 digest");
expect(dockerfile.includes(`${policy.baseImage.reference}@${policy.baseImage.digest}`), "Dockerfile must pin the policy image and digest");
expect(dockerfile.includes("USER 1001:1001"), "runtime must use the non-root UID/GID");
expect(dockerfile.includes(`GIDEON_CAPTURE_RUNTIME_POLICY_HASH=${policyHash}`), "Dockerfile policy hash must match canonical policy JSON");
expect(dockerfile.includes('ENTRYPOINT ["node", "dist/main/main/captureBrowserWorkerProcess.js"]'), "browser worker entrypoint is missing");
expect(dockerfile.includes('ENTRYPOINT ["node", "dist/main/main/captureEgressProxyProcess.js"]'), "egress proxy entrypoint is missing");
for (const source of ["src/main/captureBrowserWorkerProcess.ts", "src/main/captureEgressProxyProcess.ts"]) expect(fs.existsSync(source), `${source} is missing`);
for (const token of ['user: "1001:1001"', "read_only: true", 'cap_drop: ["ALL"]', "no-new-privileges:true", "pids_limit: 256", "mem_limit: 2147483648", "cpus: 1.0", "/work:size=512m,mode=1770,uid=1001,gid=1001,noexec,nosuid,nodev", "GIDEON_CAPTURE_PROXY_SERVER: http://capture-egress:8080", 'GIDEON_CAPTURE_WALL_CLOCK_MS: "300000"', 'GIDEON_CAPTURE_MAX_ARTIFACT_BYTES: "524288000"', "internal: true"]) expect(compose.includes(token), `compose isolation control is missing: ${token}`);
expect(!/^\s+volumes:/m.test(compose), "capture runtime must not have host volume mounts");
expect(!compose.includes("docker.sock"), "capture runtime must not expose the container socket");
expect(policy.identity.nonRoot && policy.identity.noNewPrivileges && policy.identity.dropAllCapabilities, "identity policy is incomplete");
expect(policy.filesystem.readOnlyRoot && !policy.filesystem.hostMounts && !policy.filesystem.dockerSocket, "filesystem policy is incomplete");
expect(policy.network.proxyOnly && policy.network.browserNetworkInternal && policy.network.allowedSchemes.join(",") === "https", "network policy is incomplete");
expect(Object.values(policy.cleanup).every(Boolean), "terminal cleanup policy is incomplete");
const staticPolicyPassed = errors.length === 0;

const docker = await runBounded("docker", ["info", "--format", "{{json .ServerVersion}}"], 5_000);
const runtimeAvailable = docker.status === 0 && Boolean(docker.stdout.trim()) && docker.stdout.trim() !== "null";
let runtimeValidation = "not_run";
if (runtimeAvailable) {
  const validation = await runBounded("docker", ["compose", "-f", "docker-compose.capture-browser.yml", "config", "--quiet"], 15_000);
  if (validation.status !== 0) errors.push("Docker Compose rejected the capture isolation definition.");
  else runtimeValidation = "compose_validated";
} else if (requireRuntime) errors.push("Docker engine is unavailable; runtime isolation exercise is externally blocked.");

const report = { ok: errors.length === 0, schemaVersion: "1", policyVersion: policy.policyVersion, policyHash, imageDigest: policy.baseImage.digest, staticPolicy: staticPolicyPassed ? "passed" : "failed", runtime: { available: runtimeAvailable, validation: runtimeValidation, reasonCode: runtimeAvailable ? null : "docker_engine_unavailable" }, errors };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);

function expect(condition, message) { if (!condition) errors.push(message); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
function runBounded(command, args, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    child.stdout.on("data", (chunk) => { if (stdout.length < 10_000) stdout += chunk.toString(); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.once("error", () => { clearTimeout(timer); resolve({ status: null, stdout }); });
    child.once("close", (status) => { clearTimeout(timer); resolve({ status: timedOut ? null : status, stdout }); });
  });
}
