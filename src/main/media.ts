import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
  const subtitlePath = path.join(renderDir, "captions.ass");
  const voicePath = path.join(renderDir, "voiceover.aiff");
  const audioPath = path.join(renderDir, "audio.m4a");
  const durationMs = Math.min(
    estimateScriptDurationMs(input.script),
    input.recording.durationMs,
    60_000
  );
  const sourceStartMs = clamp(input.moment?.startMs ?? 0, 0, Math.max(input.recording.durationMs - 2_000, 0));
  const sourceDurationSec = Math.max(8, durationMs / 1000);

  await fs.writeFile(subtitlePath, buildAssSubtitles(input.script, input.profile, durationMs), "utf8");
  const voiceCreated = await createVoiceover(input.script.voiceoverText, voicePath);
  if (!voiceCreated) {
    await createSilentAudio(audioPath, sourceDurationSec);
  }

  const audioInput = voiceCreated ? voicePath : audioPath;
  const filter = [
    `[0:v]${videoFilter(subtitlePath)}[v]`,
    `[1:a]apad,atrim=0:${sourceDurationSec.toFixed(3)},asetpts=N/SR/TB[a]`
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
    "-i",
    audioInput,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "[a]",
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

function buildAssSubtitles(script: ScriptDraft, profile: ProductProfile, durationMs: number): string {
  const hookEnd = Math.min(4_000, durationMs);
  const ctaStart = Math.max(durationMs - 4_000, hookEnd);
  const events = [
    assDialogue(0, hookEnd, "Hook", script.hook),
    ...script.captions.map((caption) =>
      assDialogue(caption.startMs, Math.min(caption.endMs, durationMs), "Caption", caption.text)
    ),
    assDialogue(ctaStart, durationMs, "Cta", script.cta)
  ];
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    `Title: Gideon ${escapeAss(profile.productName || "render")}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Hook,Arial,74,&H00FFFFFF,&H00FFFFFF,&H7A000000,&HAA000000,1,0,0,0,100,100,0,0,1,5,2,8,80,80,230,1",
    "Style: Caption,Arial,58,&H00FFFFFF,&H00FFFFFF,&H7A000000,&HAA000000,1,0,0,0,100,100,0,0,1,4,2,2,90,90,250,1",
    "Style: Cta,Arial,54,&H00F5D15F,&H00FFFFFF,&H7A000000,&HAA000000,1,0,0,0,100,100,0,0,1,4,2,2,100,100,135,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events
  ].join("\n");
}

function assDialogue(startMs: number, endMs: number, style: string, text: string): string {
  return `Dialogue: 0,${assTime(startMs)},${assTime(Math.max(endMs, startMs + 750))},${style},,0,0,0,,${escapeAss(wrapCaption(text))}`;
}

function wrapCaption(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (candidate.length > 30 && line.length > 0) {
      lines.push(line.join(" "));
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length > 0) {
    lines.push(line.join(" "));
  }
  return lines.slice(0, 3).join("\\N");
}

function assTime(ms: number): string {
  const centiseconds = Math.floor(ms / 10) % 100;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds
  ).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
}

function videoFilter(subtitlePath: string): string {
  return [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0B1020",
    `ass=${escapeFilterPath(subtitlePath)}`
  ].join(",");
}

function escapeFilterPath(filePath: string): string {
  const escaped = filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
  return `'${escaped}'`;
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
  return candidates[0] ?? name;
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

