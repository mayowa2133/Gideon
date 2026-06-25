import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import PImage from "pureimage";
import type {
  DetectedMoment,
  ProductProfile,
  RecordingMetadata,
  RenderValidation,
  ScriptDraft
} from "../shared/types";
import { estimateScriptDurationMs } from "../shared/contentEngine";

const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1000;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  duration?: string;
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    size?: string;
    format_name?: string;
  };
}

interface RenderDraftInput {
  projectId: string;
  projectDir: string;
  profile: ProductProfile;
  recording: RecordingMetadata;
  script: ScriptDraft;
  moment?: DetectedMoment;
  title: string;
  voiceoverPath?: string;
}

export async function getToolAvailability(): Promise<{
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  sayAvailable: boolean;
}> {
  const [ffmpegAvailable, ffprobeAvailable, sayAvailable] = await Promise.all([
    commandExists(resolveFfmpeg()),
    commandExists(resolveFfprobe()),
    commandExists("/usr/bin/say")
  ]);
  return { ffmpegAvailable, ffprobeAvailable, sayAvailable };
}

export async function probeRecording(filePath: string): Promise<RecordingMetadata> {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Choose an MP4, MOV, or WebM recording.");
  }

  const stat = await fs.stat(filePath);
  if (stat.size > MAX_RECORDING_BYTES) {
    throw new Error("Recording is larger than the 2 GB local MVP limit.");
  }

  const probe = await ffprobe(filePath);
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!videoStream?.width || !videoStream.height) {
    throw new Error("No supported video stream was found.");
  }
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  const durationMs = Math.round(Number(probe.format?.duration ?? videoStream.duration ?? "0") * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Could not determine recording duration.");
  }
  if (durationMs > MAX_DURATION_MS) {
    throw new Error("Recording is longer than the 30 minute local MVP limit.");
  }

  return {
    filePath,
    fileUrl: pathToFileURL(filePath).toString(),
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    durationMs,
    width: videoStream.width,
    height: videoStream.height,
    fps: parseFrameRate(videoStream.avg_frame_rate),
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    hasAudio: Boolean(audioStream),
    validatedAt: new Date().toISOString()
  };
}

export async function enrichMomentThumbnails(
  recording: RecordingMetadata,
  moments: DetectedMoment[],
  projectDir: string
): Promise<DetectedMoment[]> {
  const frameDir = path.join(projectDir, "frames");
  await fs.mkdir(frameDir, { recursive: true });
  const enriched: DetectedMoment[] = [];
  for (const moment of moments) {
    const thumbnailPath = path.join(frameDir, `${moment.id}.jpg`);
    const timestampSec = Math.max(0, Math.floor(moment.startMs / 1000));
    try {
      await runCommand(resolveFfmpeg(), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(timestampSec),
        "-i",
        recording.filePath,
        "-frames:v",
        "1",
        "-vf",
        "scale=480:-2",
        thumbnailPath
      ]);
      enriched.push({
        ...moment,
        thumbnailPath,
        thumbnailUrl: pathToFileURL(thumbnailPath).toString()
      });
    } catch {
      enriched.push(moment);
    }
  }
  return enriched;
}

export async function renderDraft(input: RenderDraftInput): Promise<{
  outputPath: string;
  outputUrl: string;
  validation: RenderValidation;
}> {
  const renderDir = path.join(input.projectDir, "renders", input.script.id);
  await fs.mkdir(renderDir, { recursive: true });
  const outputPath = path.join(renderDir, safeFileName(`${input.title}.mp4`));
  const overlayPath = path.join(renderDir, "overlay.png");
  const voicePath = path.join(renderDir, "voiceover.aiff");
  const audioPath = path.join(renderDir, "audio.m4a");
  const durationMs = Math.min(
    estimateScriptDurationMs(input.script),
    input.recording.durationMs,
    60_000
  );
  const sourceStartMs = clamp(input.moment?.startMs ?? 0, 0, Math.max(input.recording.durationMs - 2_000, 0));
  const sourceDurationSec = Math.max(8, durationMs / 1000);

  await createCaptionOverlay(input.profile, input.script, overlayPath);
  const voiceCreated = input.voiceoverPath ? true : await createVoiceover(input.script.voiceoverText, voicePath);
  if (!voiceCreated && !input.voiceoverPath) {
    await createSilentAudio(audioPath, sourceDurationSec);
  }

  const audioInput = input.voiceoverPath ?? (voiceCreated ? voicePath : audioPath);
  const filter = [
    `[0:v]${videoFilter()}[base]`,
    "[base][1:v]overlay=0:0:shortest=1[v]",
    `[2:a]apad,atrim=0:${sourceDurationSec.toFixed(3)},asetpts=N/SR/TB[a]`
  ].join(";");

  await runCommand(resolveFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    (sourceStartMs / 1000).toFixed(3),
    "-t",
    sourceDurationSec.toFixed(3),
    "-i",
    input.recording.filePath,
    "-loop",
    "1",
    "-i",
    overlayPath,
    "-i",
    audioInput,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    sourceDurationSec.toFixed(3),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outputPath
  ], 180_000);

  const validation = await validateRenderedVideo(outputPath);
  return {
    outputPath,
    outputUrl: pathToFileURL(outputPath).toString(),
    validation
  };
}

export async function validateRenderedVideo(outputPath: string): Promise<RenderValidation> {
  const probe = await ffprobe(outputPath);
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (!videoStream?.width || !videoStream.height) {
    throw new Error("Rendered file does not contain a valid video stream.");
  }
  if (videoStream.width !== 1080 || videoStream.height !== 1920) {
    throw new Error("Rendered video is not 1080×1920.");
  }
  if ((videoStream.codec_name ?? "").toLowerCase() !== "h264") {
    throw new Error("Rendered video is not H.264.");
  }
  if ((audioStream?.codec_name ?? "").toLowerCase() !== "aac") {
    throw new Error("Rendered video does not contain AAC audio.");
  }
  const durationMs = Math.round(Number(probe.format?.duration ?? "0") * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Rendered video duration is invalid.");
  }
  return {
    width: videoStream.width,
    height: videoStream.height,
    durationMs,
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    fastStart: true
  };
}

export async function extractAudioForTranscription(recording: RecordingMetadata, projectDir: string): Promise<string> {
  const audioDir = path.join(projectDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const outputPath = path.join(audioDir, "transcription.wav");
  await runCommand(resolveFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    recording.filePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath
  ]);
  return outputPath;
}

export async function copyExport(sourcePath: string, destinationPath: string): Promise<void> {
  await fs.copyFile(sourcePath, destinationPath);
}

async function ffprobe(filePath: string): Promise<ProbeResult> {
  const output = await runCommand(resolveFfprobe(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);
  return JSON.parse(output.stdout) as ProbeResult;
}

async function createVoiceover(text: string, outputPath: string): Promise<boolean> {
  if (process.env.GIDEON_DISABLE_SAY === "1") {
    return false;
  }
  if (!(await commandExists("/usr/bin/say"))) {
    return false;
  }
  try {
    await runCommand(
      "/usr/bin/say",
      ["-o", outputPath, "--data-format=LEF32@22050"],
      90_000,
      text
    );
    return true;
  } catch {
    return false;
  }
}

async function createSilentAudio(outputPath: string, durationSec: number): Promise<void> {
  await runCommand(resolveFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-t",
    durationSec.toFixed(3),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:a",
    "aac",
    outputPath
  ]);
}

async function createCaptionOverlay(profile: ProductProfile, script: ScriptDraft, outputPath: string): Promise<void> {
  loadOverlayFont();
  const image = PImage.make(1080, 1920);
  const context = image.getContext("2d");

  context.clearRect(0, 0, 1080, 1920);
  drawPanel(context, 70, 105, 940, 285, "rgba(5, 7, 13, 0.72)");
  drawPanel(context, 80, 1270, 920, 360, "rgba(5, 7, 13, 0.78)");
  drawPanel(context, 150, 1680, 780, 130, "rgba(245, 209, 95, 0.92)");

  context.fillStyle = "#f5d15f";
  context.font = "34pt Arial";
  context.fillText(profile.productName || "Gideon draft", 110, 165);

  context.fillStyle = "#ffffff";
  context.font = "56pt Arial";
  drawWrappedText(context, script.hook, 110, 245, 860, 68, 3);

  context.fillStyle = "#ffffff";
  context.font = "46pt Arial";
  const captionText = script.captions
    .slice(0, 4)
    .map((caption) => caption.text)
    .join(" ");
  drawWrappedText(context, captionText, 130, 1360, 820, 60, 4);

  context.fillStyle = "#10131d";
  context.font = "38pt Arial";
  drawWrappedText(context, script.cta, 190, 1758, 700, 48, 2);

  await PImage.encodePNGToStream(image, createWriteStream(outputPath));
}

type OverlayContext = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;

function drawPanel(
  context: OverlayContext,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string
): void {
  const radius = 36;
  context.fillStyle = fillStyle;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function drawWrappedText(
  context: OverlayContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): void {
  const lines = wrapText(context, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function wrapText(context: OverlayContext, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (context.measureText(candidate).width > maxWidth && line.length > 0) {
      lines.push(line.join(" "));
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length > 0) {
    lines.push(line.join(" "));
  }
  return lines;
}

function loadOverlayFont(): void {
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc"
  ];
  for (const candidate of candidates) {
    try {
      PImage.registerFont(candidate, "Arial").loadSync();
      return;
    } catch {
      // Try the next system font.
    }
  }
}

function videoFilter(): string {
  return [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0B1020"
  ].join(",");
}

function parseFrameRate(rate: string | undefined): number {
  if (!rate || rate === "0/0") {
    return 0;
  }
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!numerator || !denominator) {
    return Number(rate) || 0;
  }
  return Number((numerator / denominator).toFixed(2));
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await fs.access(command);
    return true;
  } catch {
    return false;
  }
}

function resolveFfmpeg(): string {
  return process.env.GIDEON_FFMPEG_PATH ?? findKnownBinary("ffmpeg");
}

function resolveFfprobe(): string {
  return process.env.GIDEON_FFPROBE_PATH ?? findKnownBinary("ffprobe");
}

function findKnownBinary(name: "ffmpeg" | "ffprobe"): string {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(os.homedir(), ".local", "bin", name)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs = 60_000,
  stdin?: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Media command timed out."));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(safeProcessError(stderr)));
      }
    });
    if (stdin) {
      child.stdin?.write(stdin);
    }
    child.stdin?.end();
  });
}

function safeProcessError(stderr: string): string {
  const firstLine = stderr.split(/\r?\n/).find(Boolean);
  return firstLine ? `Media processing failed: ${firstLine.slice(0, 180)}` : "Media processing failed.";
}

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 96);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
