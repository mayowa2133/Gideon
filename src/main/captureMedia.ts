import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { RecordingMetadata } from "../shared/types";
import { probeRecording } from "./media";
import { stableSerialize } from "./productFlowCompiler";

export interface CaptureNormalizationManifest {
  schemaVersion: "1";
  normalizerVersion: "capture-normalizer-v1";
  executionReceiptId: string;
  compiledPlanHash: string;
  input: {
    sha256: string;
    byteSize: number;
    contentType: "video/webm";
  };
  output: {
    sha256: string;
    byteSize: number;
    contentType: "video/mp4";
    durationMs: number;
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
  };
  ffmpegVersion: string;
  manifestHash: string;
  createdAt: string;
}

export interface NormalizedCaptureResult {
  outputPath: string;
  recording: RecordingMetadata;
  manifest: CaptureNormalizationManifest;
}

export interface NormalizeCaptureOptions {
  rawCapturePath: string;
  outputPath: string;
  executionReceiptId: string;
  compiledPlanHash: string;
  expectedInputSha256?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  now?: () => string;
}

export interface CaptureAssemblyManifest {
  schemaVersion: "1";
  assemblerVersion: "capture-assembler-v1";
  captureRunId: string;
  clips: Array<{ executionId: string; artifactId: string; sha256: string; durationMs: number }>;
  output: { sha256: string; byteSize: number; durationMs: number; width: number; height: number; fps: number; videoCodec: string };
  ffmpegVersion: string;
  manifestHash: string;
  createdAt: string;
}

export async function assembleNormalizedCaptures(options: {
  captureRunId: string;
  clips: Array<{ path: string; executionId: string; artifactId: string; sha256: string; durationMs: number }>;
  outputPath: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  now?: () => string;
}): Promise<{ outputPath: string; recording: RecordingMetadata; manifest: CaptureAssemblyManifest }> {
  if (options.clips.length < 1 || options.clips.length > 50) throw new Error("Capture assembly requires 1–50 clips.");
  const timeoutMs = options.timeoutMs ?? 300_000;
  const ffmpegPath = options.ffmpegPath ?? process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg";
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  for (const clip of options.clips) {
    const stat = await fs.stat(clip.path);
    if (!stat.isFile() || stat.size < 1) throw new Error("Capture assembly clip is missing or empty.");
    if (await sha256File(clip.path) !== clip.sha256) throw new Error("Capture assembly clip checksum does not match its artifact record.");
  }
  const ffmpegVersion = await readFfmpegVersion(ffmpegPath, timeoutMs);
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const clip of options.clips) args.push("-i", clip.path);
  const streams = options.clips.map((_, index) => `[${index}:v:0]`).join("");
  args.push(
    "-filter_complex",
    `${streams}concat=n=${options.clips.length}:v=1:a=0[v]`,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    options.outputPath
  );
  await runProcess(ffmpegPath, args, timeoutMs);
  const recording = await probeRecording(options.outputPath);
  const outputStat = await fs.stat(options.outputPath);
  const withoutHash = {
    schemaVersion: "1" as const,
    assemblerVersion: "capture-assembler-v1" as const,
    captureRunId: options.captureRunId,
    clips: options.clips.map(({ executionId, artifactId, sha256, durationMs }) => ({ executionId, artifactId, sha256, durationMs })),
    output: {
      sha256: await sha256File(options.outputPath),
      byteSize: outputStat.size,
      durationMs: recording.durationMs,
      width: recording.width,
      height: recording.height,
      fps: recording.fps,
      videoCodec: recording.videoCodec
    },
    ffmpegVersion,
    createdAt: options.now?.() ?? new Date().toISOString()
  };
  return {
    outputPath: path.resolve(options.outputPath),
    recording,
    manifest: { ...withoutHash, manifestHash: createHash("sha256").update(stableSerialize(withoutHash)).digest("hex") }
  };
}

export async function validateCaptureVisualQuality(options: {
  videoPath: string;
  durationMs: number;
  ffmpegPath?: string;
  timeoutMs?: number;
}): Promise<{ blackDurationMs: number; blackRatio: number }> {
  if (options.durationMs <= 0) throw new Error("Capture quality duration is invalid.");
  const diagnostics = await runProcessWithDiagnostics(
    options.ffmpegPath ?? process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg",
    ["-hide_banner", "-nostats", "-i", options.videoPath, "-vf", "blackdetect=d=0.25:pix_th=0.98", "-an", "-f", "null", "-"],
    options.timeoutMs ?? 120_000
  );
  let blackDurationSeconds = 0;
  for (const match of diagnostics.matchAll(/black_duration:([0-9.]+)/g)) blackDurationSeconds += Number(match[1]);
  const blackDurationMs = Math.round(blackDurationSeconds * 1000);
  const blackRatio = Math.min(1, blackDurationMs / options.durationMs);
  if (blackRatio >= 0.8) throw new Error("Capture quality validation found mostly blank frames.");
  return { blackDurationMs, blackRatio };
}

export async function normalizeBrowserCapture(options: NormalizeCaptureOptions): Promise<NormalizedCaptureResult> {
  if (!options.compiledPlanHash.match(/^[a-f0-9]{64}$/)) throw new Error("Compiled plan hash is invalid.");
  const inputStat = await fs.stat(options.rawCapturePath);
  if (!inputStat.isFile() || inputStat.size < 1) throw new Error("Raw browser capture is missing or empty.");
  const inputSha256 = await sha256File(options.rawCapturePath);
  if (options.expectedInputSha256 && options.expectedInputSha256 !== inputSha256) {
    throw new Error("Raw browser capture checksum does not match its artifact record.");
  }
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  const ffmpegPath = options.ffmpegPath ?? process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg";
  const ffmpegVersion = await readFfmpegVersion(ffmpegPath, options.timeoutMs ?? 180_000);
  await runProcess(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      options.rawCapturePath,
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      options.outputPath
    ],
    options.timeoutMs ?? 180_000
  );
  const recording = await probeRecording(options.outputPath);
  if (recording.videoCodec.toLowerCase() !== "h264" || recording.fps < 29 || recording.fps > 31) {
    await fs.rm(options.outputPath, { force: true });
    throw new Error("Normalized capture does not match the H.264 30fps source profile.");
  }
  const outputSha256 = await sha256File(options.outputPath);
  const outputStat = await fs.stat(options.outputPath);
  const withoutHash = {
    schemaVersion: "1" as const,
    normalizerVersion: "capture-normalizer-v1" as const,
    executionReceiptId: options.executionReceiptId,
    compiledPlanHash: options.compiledPlanHash,
    input: {
      sha256: inputSha256,
      byteSize: inputStat.size,
      contentType: "video/webm" as const
    },
    output: {
      sha256: outputSha256,
      byteSize: outputStat.size,
      contentType: "video/mp4" as const,
      durationMs: recording.durationMs,
      width: recording.width,
      height: recording.height,
      fps: recording.fps,
      videoCodec: recording.videoCodec
    },
    ffmpegVersion,
    createdAt: options.now?.() ?? new Date().toISOString()
  };
  return {
    outputPath: path.resolve(options.outputPath),
    recording,
    manifest: {
      ...withoutHash,
      manifestHash: createHash("sha256").update(stableSerialize(withoutHash)).digest("hex")
    }
  };
}

async function readFfmpegVersion(ffmpegPath: string, timeoutMs: number): Promise<string> {
  const output = await runProcess(ffmpegPath, ["-version"], timeoutMs, true);
  const firstLine = output.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine?.startsWith("ffmpeg version ")) throw new Error("FFmpeg version could not be verified.");
  return firstLine.slice(0, 200);
}

async function runProcess(command: string, args: string[], timeoutMs: number, captureStdout = false): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderrBytes = 0;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Capture media processing timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (captureStdout && stdout.length < 4_096) stdout += chunk.toString("utf8", 0, 4_096 - stdout.length);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
    });
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Capture media processor could not be started."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(`Capture media processing failed (${stderrBytes > 0 ? "diagnostics available" : "no diagnostics"}).`));
    });
  });
}

async function runProcessWithDiagnostics(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let diagnostics = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Capture quality validation timed out.")); }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => { if (diagnostics.length < 32_000) diagnostics += chunk.toString("utf8", 0, 32_000 - diagnostics.length); });
    child.on("error", () => { clearTimeout(timeout); reject(new Error("Capture quality validator could not be started.")); });
    child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve(diagnostics) : reject(new Error("Capture quality validation failed.")); });
  });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
