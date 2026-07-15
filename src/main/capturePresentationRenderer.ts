import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { ProductFlowRevision } from "../shared/productFlowCapture";
import type { RenderValidation } from "../shared/types";
import { buildFocusedCropFilter, compileCaptureFraming, type CaptureFramingConfig, type CaptureFramingManifest } from "./captureFraming";
import { createCaptureCaptionOverlaySequence, probeRecording, validateRenderedVideo } from "./media";

export interface CaptureStepTiming {
  stepId: string;
  startedAt: string;
  completedAt: string;
  visualEvidence?: import("../shared/productFlowCapture").FlowStepVisualEvidence;
}

export interface CaptureNarrationProvider {
  synthesize(input: { text: string; outputPath: string }): Promise<{ outputPath: string }>;
}

export async function renderCapturePresentation(input: {
  sourcePath: string;
  outputDir: string;
  flow: ProductFlowRevision;
  receiptStartedAt: string;
  stepTimings: CaptureStepTiming[];
  narration: "none" | "provider";
  framing: CaptureFramingConfig;
  narrationProvider?: CaptureNarrationProvider;
}): Promise<{ videoPath: string; captionsPath: string; framingManifestPath: string; framingManifest: CaptureFramingManifest; voiceoverPath?: string; validation: RenderValidation; cues: Array<{ stepId: string; startMs: number; endMs: number; text: string }> }> {
  if (input.narration === "provider" && !input.narrationProvider) throw new Error("Capture presentation narration requires an explicitly configured provider.");
  const recording = await probeRecording(input.sourcePath);
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  const cues = buildCaptureCaptionCues({ flow: input.flow, receiptStartedAt: input.receiptStartedAt, stepTimings: input.stepTimings, durationMs: recording.durationMs });
  const captionsPath = path.join(input.outputDir, `${input.flow.id}.vtt`);
  await fs.writeFile(captionsPath, toWebVtt(cues), { encoding: "utf8", mode: 0o600 });
  const framingManifest = compileCaptureFraming({
    config: input.framing,
    source: { width: recording.width, height: recording.height, durationMs: recording.durationMs },
    receiptStartedAt: input.receiptStartedAt,
    stepTimings: input.stepTimings
  });
  const framingManifestPath = path.join(input.outputDir, `${input.flow.id}-framing.json`);
  await fs.writeFile(framingManifestPath, JSON.stringify(framingManifest, null, 2), { encoding: "utf8", mode: 0o600 });

  let voiceoverPath: string | undefined;
  if (input.narration === "provider") {
    const requestedPath = path.join(input.outputDir, `${input.flow.id}-voiceover.wav`);
    const result = await input.narrationProvider!.synthesize({ text: cues.map((cue) => cue.text).join(" "), outputPath: requestedPath });
    voiceoverPath = path.resolve(result.outputPath);
    if (voiceoverPath !== path.resolve(requestedPath)) throw new Error("Capture narration provider returned an unexpected output path.");
    const stat = await fs.stat(voiceoverPath);
    if (!stat.isFile() || stat.size < 44 || stat.size > 25 * 1024 * 1024) throw new Error("Capture narration provider returned unusable audio.");
  }

  const videoPath = path.join(input.outputDir, `${input.flow.id}-vertical.mp4`);
  const durationSec = (recording.durationMs / 1_000).toFixed(3);
  const overlaySequence = await createCaptureCaptionOverlaySequence({ cues, outputDir: path.join(input.outputDir, "caption-frames"), durationSec: recording.durationMs / 1_000 });
  const audioInput = voiceoverPath
    ? ["-i", voiceoverPath]
    : ["-f", "lavfi", "-t", durationSec, "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"];
  const focusedCrop = buildFocusedCropFilter(framingManifest);
  const foregroundFilter = focusedCrop ? `[foreground]${focusedCrop},scale=1000:1120:force_original_aspect_ratio=decrease[product]` : "[foreground]scale=1000:1120:force_original_aspect_ratio=decrease[product]";
  const videoFilter = [
    "[0:v]split=2[background][foreground]",
    "[background]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=32[blurred]",
    foregroundFilter,
    "[blurred][product]overlay=(W-w)/2:340[framed]",
    "[1:v]fps=30,format=rgba[captions]",
    "[framed][captions]overlay=0:0:shortest=1[v]"
  ].join(";");
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y", "-i", input.sourcePath,
    "-framerate", String(overlaySequence.frameRate), "-start_number", "0", "-i", overlaySequence.pattern,
    ...audioInput, "-filter_complex", videoFilter, "-map", "[v]", "-map", "2:a:0", "-af", "apad",
    "-t", durationSec, "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", videoPath
  ]);
  const validation = await validateRenderedVideo(videoPath);
  return { videoPath, captionsPath, framingManifestPath, framingManifest, voiceoverPath, validation, cues };
}

export function buildCaptureCaptionCues(input: { flow: ProductFlowRevision; receiptStartedAt: string; stepTimings: CaptureStepTiming[]; durationMs: number }) {
  const receiptStart = Date.parse(input.receiptStartedAt);
  if (!Number.isFinite(receiptStart) || !Number.isFinite(input.durationMs) || input.durationMs <= 0) throw new Error("Capture presentation timing input is invalid.");
  const timingByStep = new Map(input.stepTimings.map((timing) => [timing.stepId, timing]));
  return input.flow.steps.map((step, index) => {
    const timing = timingByStep.get(step.id);
    const fallbackStart = Math.round(index * input.durationMs / Math.max(1, input.flow.steps.length));
    const fallbackEnd = Math.round((index + 1) * input.durationMs / Math.max(1, input.flow.steps.length));
    const parsedStart = timing ? Date.parse(timing.startedAt) - receiptStart : fallbackStart;
    const parsedEnd = timing ? Date.parse(timing.completedAt) - receiptStart : fallbackEnd;
    const proposedStart = clamp(Number.isFinite(parsedStart) ? parsedStart : fallbackStart, 0, Math.max(0, input.durationMs - 250));
    const endMs = clamp(Math.max(proposedStart + 750, Number.isFinite(parsedEnd) ? parsedEnd + 500 : fallbackEnd), proposedStart + 250, input.durationMs);
    const startMs = endMs - proposedStart < 750 && input.durationMs >= 750 ? Math.max(0, endMs - 750) : proposedStart;
    return { stepId: step.id, startMs: Math.round(startMs), endMs: Math.round(endMs), text: safeCaption(step.intent) };
  });
}

function toWebVtt(cues: Array<{ startMs: number; endMs: number; text: string }>): string {
  return `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}\n${cue.text}\n`).join("\n")}`;
}

function safeCaption(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/-->/g, "→").replace(/[{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 180) || "Product step";
}

function vttTimestamp(milliseconds: number): string {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor(value % 3_600_000 / 60_000);
  const seconds = Math.floor(value % 60_000 / 1_000);
  const ms = value % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_000) stderr += chunk.toString("utf8"); });
    child.once("error", () => reject(new Error("Capture presentation FFmpeg could not start.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Capture presentation FFmpeg failed with code ${code ?? "unknown"}.`)));
  });
}
