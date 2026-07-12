#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const requestFlag = process.argv.indexOf("--request");
const requestPath = requestFlag >= 0 ? process.argv[requestFlag + 1] : undefined;
if (!requestPath || !path.isAbsolute(requestPath)) {
  fail("Expected an absolute --request path.");
}

const request = await readJson(requestPath);
if (!request || typeof request !== "object" || Array.isArray(request)) {
  fail("Avatar request must be a JSON object.");
}
if (!isAbsoluteString(request.audioPath) || !isAbsoluteString(request.outputPath)) {
  fail("Avatar request requires private absolute audio and output paths.");
}
if (request.sourceImagePath !== undefined && !isAbsoluteString(request.sourceImagePath)) {
  fail("Custom avatar source requires a private absolute path.");
}
if (request.provider !== "sadtalker" && request.provider !== "musetalk") {
  fail("Avatar request provider must be sadtalker or musetalk.");
}

const workDir = requiredAbsoluteEnv("GIDEON_AVATAR_WORK_DIR");
const composeFile = path.resolve(process.env.GIDEON_AVATAR_COMPOSE_FILE ?? (
  request.provider === "musetalk" ? "docker-compose.avatar-musetalk.yml" : "docker-compose.avatar-worker.yml"
));
const composeService = request.provider === "musetalk" ? "avatar-musetalk" : "avatar-sadtalker";
const jobId = randomUUID();
const inputDir = path.join(workDir, "input");
const outputDir = path.join(workDir, "output");
const containerAudioPath = `/work/input/${jobId}${path.extname(request.audioPath) || ".wav"}`;
const containerOutputPath = `/work/output/${jobId}.mp4`;
const containerSourcePath = request.sourceImagePath
  ? `/work/input/${jobId}-source${path.extname(request.sourceImagePath) || ".png"}`
  : undefined;
const containerRequestPath = path.join(outputDir, `${jobId}.request.json`);
const hostAudioPath = path.join(inputDir, path.basename(containerAudioPath));
const hostOutputPath = path.join(outputDir, `${jobId}.mp4`);
const hostSourcePath = containerSourcePath ? path.join(inputDir, path.basename(containerSourcePath)) : undefined;

await fs.mkdir(inputDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.copyFile(request.audioPath, hostAudioPath);
if (request.sourceImagePath && hostSourcePath) {
  await fs.copyFile(request.sourceImagePath, hostSourcePath);
}
await fs.writeFile(
  containerRequestPath,
  JSON.stringify({
    ...request,
    audioPath: containerAudioPath,
    outputPath: containerOutputPath,
    sourceImagePath: containerSourcePath
  }),
  "utf8"
);

try {
  const result = await runDockerCompose(composeFile, composeService, `/work/output/${path.basename(containerRequestPath)}`);
  const parsed = await parseResult(result.stdout);
  if (parsed.outputPath !== containerOutputPath) {
    fail("Avatar worker returned an unexpected output path.");
  }
  await fs.mkdir(path.dirname(request.outputPath), { recursive: true });
  await fs.copyFile(hostOutputPath, request.outputPath);
  process.stdout.write(`${JSON.stringify({ ...parsed, outputPath: request.outputPath })}\n`);
} finally {
  await Promise.all([
    fs.rm(hostAudioPath, { force: true }),
    ...(hostSourcePath ? [fs.rm(hostSourcePath, { force: true })] : []),
    fs.rm(containerRequestPath, { force: true }),
    fs.rm(hostOutputPath, { force: true }),
    fs.rm(path.join(outputDir, `${jobId}-sadtalker-result`), { recursive: true, force: true }),
    fs.rm(path.join(outputDir, `${jobId}-musetalk-result`), { recursive: true, force: true }),
    fs.rm(path.join(outputDir, `${jobId}-musetalk.json`), { force: true })
  ]);
}

function runDockerCompose(composeFile, composeService, containerRequestPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", composeFile, "run", "--rm", "-T", composeService, "--request", containerRequestPath], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Avatar Docker worker exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    fail("Could not read avatar request JSON.");
  }
}

async function parseResult(output) {
  try {
    const parsed = JSON.parse(output.trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("Avatar worker returned invalid JSON.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Avatar worker")) {
      throw error;
    }
    fail("Avatar worker returned invalid JSON.");
  }
}

function requiredAbsoluteEnv(name) {
  const value = process.env[name]?.trim();
  if (!value || !path.isAbsolute(value)) {
    fail(`${name} must be an absolute host path.`);
  }
  return value;
}

function isAbsoluteString(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
