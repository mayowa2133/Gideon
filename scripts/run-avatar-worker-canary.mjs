#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

if (process.argv.includes("--dry-run")) {
  process.stdout.write([
    "Avatar worker canary dry-run:",
    "1. Validate approved worker, model mounts, and catalog hashes.",
    "2. Generate a one-second synthetic WAV without reference voice data.",
    "3. Render the Orbit fictional avatar through the isolated worker.",
    "4. Validate MP4 codec, duration, model receipt, and disclosure.",
    "5. Remove temporary media and emit a path-free JSON report."
  ].join("\n") + "\n");
  process.exit(0);
}

const commandPath = requiredAbsoluteEnv("GIDEON_AVATAR_WORKER_COMMAND");
const modelVersion = requiredEnv("GIDEON_AVATAR_MODEL_VERSION");
const modelLicense = requiredEnv("GIDEON_AVATAR_MODEL_LICENSE");
const ffmpeg = process.env.GIDEON_FFMPEG_PATH?.trim() || "ffmpeg";
const ffprobe = process.env.GIDEON_FFPROBE_PATH?.trim() || "ffprobe";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-canary-"));
const audioPath = path.join(root, "narration.wav");
const outputPath = path.join(root, "presenter.mp4");
const requestPath = path.join(root, "request.json");

try {
  await run(process.execPath, [path.join(process.cwd(), "scripts/check-avatar-worker-config.mjs")]);
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=16000",
    "-t", "1", "-c:a", "pcm_s16le", audioPath
  ]);
  await fs.writeFile(requestPath, JSON.stringify({
    avatarId: "orbit",
    audioPath,
    outputPath,
    durationMs: 1_000,
    disclosure: "AI-generated brand presenter",
    consent: { assetType: "fictional_catalog", status: "not_required" }
  }), "utf8");
  const worker = await run(commandPath, ["--request", requestPath], 1_200_000);
  const result = parseWorkerResult(worker.stdout, { outputPath, modelVersion, modelLicense });
  const probe = JSON.parse((await run(ffprobe, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", result.outputPath
  ])).stdout);
  const videoStream = Array.isArray(probe.streams)
    ? probe.streams.find((stream) => stream?.codec_type === "video")
    : undefined;
  const durationSec = Number(probe.format?.duration ?? videoStream?.duration);
  if (!videoStream?.codec_name || !Number.isFinite(durationSec) || durationSec < 0.5 || durationSec > 10) {
    throw new Error("Avatar worker canary returned an invalid video stream or duration.");
  }
  const report = {
    status: "passed",
    provider: result.receipt.provider,
    modelVersion: result.receipt.modelVersion,
    modelLicense: result.receipt.modelLicense,
    avatarId: result.receipt.avatarId,
    avatarProvenance: result.receipt.avatarProvenance,
    disclosure: result.receipt.disclosure,
    videoCodec: videoStream.codec_name,
    durationMs: Math.round(durationSec * 1000),
    checkedAt: new Date().toISOString()
  };
  const reportPath = process.env.GIDEON_AVATAR_CANARY_REPORT_PATH?.trim();
  if (reportPath) {
    if (!path.isAbsolute(reportPath)) {
      throw new Error("GIDEON_AVATAR_CANARY_REPORT_PATH must be absolute.");
    }
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Avatar worker canary failed."}\n`);
  process.exitCode = 1;
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

function parseWorkerResult(output, expected) {
  let result;
  try {
    result = JSON.parse(output.trim());
  } catch {
    throw new Error("Avatar worker canary received invalid worker JSON.");
  }
  if (
    result?.outputPath !== expected.outputPath ||
    result.receipt?.provider !== "sadtalker" ||
    result.receipt?.modelVersion !== expected.modelVersion ||
    result.receipt?.modelLicense !== expected.modelLicense ||
    result.receipt?.avatarId !== "orbit" ||
    result.receipt?.avatarProvenance !== "gideon_fictional_catalog" ||
    result.receipt?.disclosure !== "AI-generated brand presenter"
  ) {
    throw new Error("Avatar worker canary receipt does not match the approved configuration.");
  }
  return result;
}

function run(command, args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Avatar canary command failed with code ${code ?? "unknown"}.`));
    });
  });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredAbsoluteEnv(name) {
  const value = requiredEnv(name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute.`);
  return value;
}
