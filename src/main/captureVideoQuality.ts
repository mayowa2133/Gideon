import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as PImage from "pureimage";
import type { FlowExecutionReceipt, ProductFlowRevision } from "../shared/productFlowCapture";
import { probeRecording } from "./media";
import { stableSerialize } from "./productFlowCompiler";
import type { CaptureFramingManifest } from "./captureFraming";
import rawThresholds from "./captureQualityThresholds.json";

export interface CaptureQualityThresholds {
  schemaVersion: "1";
  thresholdsVersion: "capture-quality-thresholds-v1";
  sampleFrames: number;
  maxBlackFrameRatio: number;
  maxBlankFrameRatio: number;
  warnFrozenPairRatio: number;
  maxFrozenPairRatio: number;
  minimumEdgeDensity: number;
  minimumEffectiveUiTextPx: number;
  captionMaxLines: number;
  captionMinimumMarginPx: number;
  captionMinimumUiGapPx: number;
  pointerMoveMinimumMs: number;
  pointerMoveMaximumMs: number;
  typingDelayMinimumMs: number;
  typingDelayMaximumMs: number;
  afterActionMinimumMs: number;
  afterActionMaximumMs: number;
  cueMinimumMs: number;
  cueMaximumMs: number;
  stepPacingMinimumMs: number;
  stepPacingMaximumMs: number;
  maximumPanCropWidthsPerSecond: number;
}

export type CaptureQualityCheckStatus = "pass" | "warning" | "fail";
export interface CaptureQualityCheck {
  code: string;
  status: CaptureQualityCheckStatus;
  message: string;
  measured?: number;
  threshold?: number;
}

export interface CaptureVideoQualityReport {
  schemaVersion: "1";
  qualityVersion: "capture-video-quality-v1";
  thresholdsVersion: "capture-quality-thresholds-v1";
  profile: "landscape" | "vertical";
  status: "ready" | "warning" | "failed";
  media: { durationMs: number; width: number; height: number; fps: number; videoCodec: string; audioCodec: string | null };
  samples: Array<{ timestampMs: number; averageLuma: number; lumaDeviation: number; edgeDensity: number; differenceFromPrevious?: number }>;
  presentation: {
    effectiveUiTextPx: number;
    captionMaximumLines: number;
    captionMarginPx: number;
    captionUiGapPx: number;
    targetEvidenceRatio: number;
    averageStepMs: number;
    maximumPanCropWidthsPerSecond: number;
  };
  checks: CaptureQualityCheck[];
  contactSheet: { sampledFrames: number; columns: number; rows: number };
  reportHash: string;
  createdAt: string;
}

export interface CaptureVideoQualityResult {
  report: CaptureVideoQualityReport;
  reportPath: string;
  contactSheetPath: string;
}

export async function analyzeCaptureVideoQuality(input: {
  videoPath: string;
  outputDir: string;
  profile: "landscape" | "vertical";
  flow: ProductFlowRevision;
  receipt: FlowExecutionReceipt;
  cues?: Array<{ startMs: number; endMs: number; text: string }>;
  framing?: CaptureFramingManifest;
  minimumSourceTextPx: number;
  presentation: { showPointer: boolean; clickFeedback: boolean; pointerMoveMs: number; typingDelayMs: number; afterActionMs: number };
  thresholds?: CaptureQualityThresholds;
  ffmpegPath?: string;
  now?: () => string;
}): Promise<CaptureVideoQualityResult> {
  const thresholds = input.thresholds ?? parseCaptureQualityThresholds(rawThresholds);
  assertQualityInput(input);
  const recording = await probeRecording(input.videoPath);
  await preparePrivateDirectory(input.outputDir);
  const frameDir = path.join(input.outputDir, "quality-frames");
  await preparePrivateDirectory(frameDir);
  const timestamps = sampleTimestamps(recording.durationMs, thresholds.sampleFrames);
  const samples: CaptureVideoQualityReport["samples"] = [];
  let previous: Uint8Array | undefined;
  for (let index = 0; index < timestamps.length; index += 1) {
    const framePath = path.join(frameDir, `frame-${String(index).padStart(2, "0")}.png`);
    await runFfmpeg(input.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (timestamps[index]! / 1000).toFixed(3), "-i", input.videoPath, "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,format=rgba", framePath]);
    const frame = await readFrame(framePath);
    samples.push({ timestampMs: timestamps[index]!, averageLuma: round(frame.averageLuma), lumaDeviation: round(frame.lumaDeviation), edgeDensity: round(frame.edgeDensity, 4), ...(previous ? { differenceFromPrevious: round(meanDifference(previous, frame.luma)) } : {}) });
    previous = frame.luma;
  }
  const contactSheetPath = path.join(input.outputDir, "contact-sheet.jpg");
  await runFfmpeg(input.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-start_number", "0", "-i", path.join(frameDir, "frame-%02d.png"), "-vf", "tile=4x2:padding=4:margin=4:color=black", "-frames:v", "1", contactSheetPath]);

  const checks: CaptureQualityCheck[] = [];
  const blackRatio = ratio(samples.filter((sample) => sample.averageLuma < 8 && sample.lumaDeviation < 5).length, samples.length);
  const blankRatio = ratio(samples.filter((sample) => (sample.averageLuma < 8 || sample.averageLuma > 248) && sample.lumaDeviation < 4).length, samples.length);
  checks.push(metricCheck("black_frames", blackRatio <= thresholds.maxBlackFrameRatio ? "pass" : "fail", "Black-frame ratio is within the approved limit.", blackRatio, thresholds.maxBlackFrameRatio));
  checks.push(metricCheck("blank_frames", blankRatio <= thresholds.maxBlankFrameRatio ? "pass" : "fail", "Blank-frame ratio is within the approved limit.", blankRatio, thresholds.maxBlankFrameRatio));
  const differences = samples.slice(1).map((sample) => sample.differenceFromPrevious ?? 0);
  const frozenPairRatio = ratio(differences.filter((difference) => difference < 0.8).length, differences.length);
  checks.push(metricCheck("frozen_frames", recording.durationMs >= 10_000 && frozenPairRatio > thresholds.maxFrozenPairRatio ? "fail" : frozenPairRatio > thresholds.warnFrozenPairRatio ? "warning" : "pass", "Repeated-frame ratio was measured across representative samples.", frozenPairRatio, thresholds.maxFrozenPairRatio));
  const minimumEdgeDensity = Math.min(...samples.map((sample) => sample.edgeDensity));
  checks.push(metricCheck("visual_detail", minimumEdgeDensity < thresholds.minimumEdgeDensity ? "warning" : "pass", "Representative frames retain measurable interface detail.", minimumEdgeDensity, thresholds.minimumEdgeDensity));

  const pageSignals = input.receipt.steps.map((step) => step.visualEvidence?.pageSignal).filter((signal): signal is NonNullable<typeof signal> => Boolean(signal));
  checks.push(stateCheck(pageSignals));
  const sourceWidth = input.framing?.source.width ?? recording.width;
  const cropWidth = input.framing?.crop?.width ?? sourceWidth;
  const foregroundWidth = input.profile === "vertical" ? 1000 : recording.width;
  const effectiveUiTextPx = input.minimumSourceTextPx * foregroundWidth / cropWidth;
  checks.push(metricCheck("effective_ui_text", effectiveUiTextPx < thresholds.minimumEffectiveUiTextPx ? "fail" : "pass", "Effective interface text size meets the configured lower bound.", effectiveUiTextPx, thresholds.minimumEffectiveUiTextPx));

  const captionLines = (input.cues ?? []).map((cue) => estimatedCaptionLines(cue.text));
  const captionMaximumLines = captionLines.length > 0 ? Math.max(...captionLines) : 0;
  checks.push(metricCheck("caption_lines", captionMaximumLines > thresholds.captionMaxLines ? "fail" : "pass", "Caption line count fits the versioned overlay profile.", captionMaximumLines, thresholds.captionMaxLines));
  const captionMarginPx = input.cues?.length ? 80 : recording.width;
  checks.push(metricCheck("caption_safe_margin", captionMarginPx < thresholds.captionMinimumMarginPx ? "fail" : "pass", "Caption overlay stays inside the mobile safe margin.", captionMarginPx, thresholds.captionMinimumMarginPx));
  const cropHeight = input.framing?.crop?.height ?? (recording.height || 1);
  const foregroundHeight = input.profile === "vertical" ? Math.min(1120, cropHeight * 1000 / cropWidth) : recording.height;
  const captionUiGapPx = input.profile === "vertical" && input.cues?.length ? 1460 - (340 + foregroundHeight) : recording.height;
  checks.push(metricCheck("caption_ui_collision", captionUiGapPx < thresholds.captionMinimumUiGapPx ? "fail" : "pass", "Caption overlay does not obscure the focused product surface.", captionUiGapPx, thresholds.captionMinimumUiGapPx));

  const interactiveSteps = input.flow.steps.filter((step) => ["click", "fill", "select"].includes(step.action.type));
  const evidencedTargets = input.flow.steps.reduce((count, step, index) => count + (["click", "fill", "select"].includes(step.action.type) && Boolean(input.receipt.steps[index]?.visualEvidence?.actionTarget || input.receipt.steps[index]?.visualEvidence?.resultTarget || input.receipt.steps[index]?.visualEvidence?.modalRegion) ? 1 : 0), 0);
  const targetEvidenceRatio = ratio(evidencedTargets, Math.max(1, interactiveSteps.length));
  checks.push(metricCheck("target_evidence", interactiveSteps.length > 0 && targetEvidenceRatio < 0.8 ? "fail" : "pass", "Interactive steps retain geometry evidence for focus and pointer review.", targetEvidenceRatio, 0.8));
  checks.push(pointerCheck(input.presentation, interactiveSteps.length, thresholds));
  const fillCount = input.flow.steps.filter((step) => step.action.type === "fill").length;
  checks.push(typingCheck(input.presentation.typingDelayMs, fillCount, thresholds));
  checks.push(metricCheck("action_dwell", input.presentation.afterActionMs < thresholds.afterActionMinimumMs || input.presentation.afterActionMs > thresholds.afterActionMaximumMs ? "fail" : "pass", "Post-action dwell is within the human-readable range.", input.presentation.afterActionMs, thresholds.afterActionMinimumMs));
  const cueDurations = (input.cues ?? []).map((cue) => cue.endMs - cue.startMs);
  const rushedCue = cueDurations.find((duration) => duration < thresholds.cueMinimumMs);
  const lingeringCue = cueDurations.find((duration) => duration > thresholds.cueMaximumMs);
  checks.push(metricCheck(
    "caption_dwell",
    rushedCue !== undefined ? "fail" : lingeringCue !== undefined ? "warning" : "pass",
    rushedCue !== undefined ? "A caption disappears before the approved reading minimum." : lingeringCue !== undefined ? "A caption remains longer than the preferred reading range and should be reviewed." : "Caption dwell is within the approved reading range.",
    rushedCue ?? lingeringCue,
    rushedCue !== undefined ? thresholds.cueMinimumMs : lingeringCue !== undefined ? thresholds.cueMaximumMs : undefined
  ));
  const averageStepMs = recording.durationMs / Math.max(1, input.flow.steps.length);
  checks.push(metricCheck("step_pacing", averageStepMs < thresholds.stepPacingMinimumMs || averageStepMs > thresholds.stepPacingMaximumMs ? "fail" : "pass", "Average step pacing is within the approved range.", averageStepMs, thresholds.stepPacingMinimumMs));
  const panSpeed = maximumPanSpeed(input.framing);
  checks.push(metricCheck("camera_motion", panSpeed > thresholds.maximumPanCropWidthsPerSecond ? "fail" : "pass", "Automatic focus motion remains below the configured speed limit.", panSpeed, thresholds.maximumPanCropWidthsPerSecond));

  const status: CaptureVideoQualityReport["status"] = checks.some((check) => check.status === "fail") ? "failed" : checks.some((check) => check.status === "warning") ? "warning" : "ready";
  const withoutHash = {
    schemaVersion: "1" as const,
    qualityVersion: "capture-video-quality-v1" as const,
    thresholdsVersion: thresholds.thresholdsVersion,
    profile: input.profile,
    status,
    media: { durationMs: recording.durationMs, width: recording.width, height: recording.height, fps: recording.fps, videoCodec: recording.videoCodec, audioCodec: recording.audioCodec },
    samples,
    presentation: { effectiveUiTextPx: round(effectiveUiTextPx), captionMaximumLines, captionMarginPx: round(captionMarginPx), captionUiGapPx: round(captionUiGapPx), targetEvidenceRatio: round(targetEvidenceRatio), averageStepMs: round(averageStepMs), maximumPanCropWidthsPerSecond: round(panSpeed) },
    checks,
    contactSheet: { sampledFrames: samples.length, columns: 4, rows: 2 },
    createdAt: input.now?.() ?? new Date().toISOString()
  };
  const report: CaptureVideoQualityReport = { ...withoutHash, reportHash: createHash("sha256").update(stableSerialize(withoutHash)).digest("hex") };
  const reportPath = path.join(input.outputDir, "quality-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  return { report, reportPath, contactSheetPath };
}

export function parseCaptureQualityThresholds(value: unknown): CaptureQualityThresholds {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capture quality thresholds must be an object.");
  const result = value as Record<string, unknown>;
  const keys: Array<keyof CaptureQualityThresholds> = ["schemaVersion", "thresholdsVersion", "sampleFrames", "maxBlackFrameRatio", "maxBlankFrameRatio", "warnFrozenPairRatio", "maxFrozenPairRatio", "minimumEdgeDensity", "minimumEffectiveUiTextPx", "captionMaxLines", "captionMinimumMarginPx", "captionMinimumUiGapPx", "pointerMoveMinimumMs", "pointerMoveMaximumMs", "typingDelayMinimumMs", "typingDelayMaximumMs", "afterActionMinimumMs", "afterActionMaximumMs", "cueMinimumMs", "cueMaximumMs", "stepPacingMinimumMs", "stepPacingMaximumMs", "maximumPanCropWidthsPerSecond"];
  if (Object.keys(result).some((key) => !keys.includes(key as keyof CaptureQualityThresholds)) || keys.some((key) => !(key in result))) throw new Error("Capture quality thresholds have unknown or missing fields.");
  if (result.schemaVersion !== "1" || result.thresholdsVersion !== "capture-quality-thresholds-v1") throw new Error("Capture quality threshold version is invalid.");
  for (const key of keys.slice(2)) if (typeof result[key] !== "number" || !Number.isFinite(result[key]) || (result[key] as number) < 0) throw new Error(`Capture quality threshold ${key} is invalid.`);
  if (!Number.isInteger(result.sampleFrames) || (result.sampleFrames as number) < 4 || (result.sampleFrames as number) > 16) throw new Error("Capture quality sampleFrames must be an integer from 4 to 16.");
  if ((result.warnFrozenPairRatio as number) > (result.maxFrozenPairRatio as number)) throw new Error("Capture quality frozen thresholds are invalid.");
  return structuredClone(result) as unknown as CaptureQualityThresholds;
}

function assertQualityInput(input: Parameters<typeof analyzeCaptureVideoQuality>[0]): void {
  if (!path.isAbsolute(input.videoPath) || !path.isAbsolute(input.outputDir) || !Number.isInteger(input.minimumSourceTextPx) || input.minimumSourceTextPx < 4 || input.minimumSourceTextPx > 72) throw new Error("Capture quality input is invalid.");
  if (input.receipt.flowId !== input.flow.id || input.receipt.flowRevision !== input.flow.revision) throw new Error("Capture quality receipt does not match the approved flow revision.");
  for (const value of [input.presentation.pointerMoveMs, input.presentation.typingDelayMs, input.presentation.afterActionMs]) if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error("Capture quality presentation timing is invalid.");
}

async function preparePrivateDirectory(directory: string): Promise<void> {
  try { if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("Capture quality output directory must not be a symlink."); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
}

function sampleTimestamps(durationMs: number, count: number): number[] { return Array.from({ length: count }, (_, index) => Math.max(0, Math.round(durationMs * (index + 0.5) / count))); }

async function readFrame(framePath: string): Promise<{ luma: Uint8Array; averageLuma: number; lumaDeviation: number; edgeDensity: number }> {
  const image = await PImage.decodePNGFromStream(createReadStream(framePath));
  const bitmap = image as unknown as { data: Uint8Array; width: number; height: number };
  const pixels = bitmap.width * bitmap.height;
  const luma = new Uint8Array(pixels);
  let total = 0;
  let squared = 0;
  let edges = 0;
  for (let index = 0, offset = 0; index < pixels; index += 1, offset += 4) {
    const value = Math.round(0.2126 * bitmap.data[offset]! + 0.7152 * bitmap.data[offset + 1]! + 0.0722 * bitmap.data[offset + 2]!);
    luma[index] = value; total += value; squared += value * value;
    if (index % bitmap.width > 0 && Math.abs(value - luma[index - 1]!) >= 24) edges += 1;
    if (index >= bitmap.width && Math.abs(value - luma[index - bitmap.width]!) >= 24) edges += 1;
  }
  const averageLuma = total / Math.max(1, pixels);
  return { luma, averageLuma, lumaDeviation: Math.sqrt(Math.max(0, squared / Math.max(1, pixels) - averageLuma * averageLuma)), edgeDensity: edges / Math.max(1, pixels * 2) };
}

function meanDifference(left: Uint8Array, right: Uint8Array): number { let total = 0; const count = Math.min(left.length, right.length); for (let index = 0; index < count; index += 1) total += Math.abs(left[index]! - right[index]!); return total / Math.max(1, count); }
function ratio(numerator: number, denominator: number): number { return denominator > 0 ? numerator / denominator : 0; }
function round(value: number, digits = 2): number { return Number(value.toFixed(digits)); }
function metricCheck(code: string, status: CaptureQualityCheckStatus, message: string, measured?: number, threshold?: number): CaptureQualityCheck { return { code, status, message, ...(measured === undefined ? {} : { measured: round(measured, 4) }), ...(threshold === undefined ? {} : { threshold: round(threshold, 4) }) }; }

function stateCheck(signals: Array<"loading" | "login" | "browser_error" | "failure">): CaptureQualityCheck {
  if (signals.includes("browser_error") || signals.includes("failure")) return { code: "page_state", status: "fail", message: "A browser or application failure state was observed." };
  if (signals.includes("login")) return { code: "page_state", status: "fail", message: "A login state remained in the recorded flow." };
  if (signals.includes("loading")) return { code: "page_state", status: "warning", message: "A loading state was observed and should be reviewed." };
  return { code: "page_state", status: "pass", message: "No loading, login, browser-error, or failure state was observed." };
}

function estimatedCaptionLines(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let width = 0;
  for (const word of words) {
    const wordWidth = word.length * 22 + (width > 0 ? 14 : 0);
    if (width > 0 && width + wordWidth > 830) { lines += 1; width = word.length * 22; } else width += wordWidth;
  }
  return words.length === 0 ? 0 : lines;
}

function pointerCheck(presentation: { showPointer: boolean; clickFeedback: boolean; pointerMoveMs: number }, interactiveSteps: number, thresholds: CaptureQualityThresholds): CaptureQualityCheck {
  if (interactiveSteps === 0) return { code: "pointer_presentation", status: "pass", message: "The flow has no pointer-driven actions." };
  const passed = presentation.showPointer && presentation.clickFeedback && presentation.pointerMoveMs >= thresholds.pointerMoveMinimumMs && presentation.pointerMoveMs <= thresholds.pointerMoveMaximumMs;
  return metricCheck("pointer_presentation", passed ? "pass" : "fail", "Pointer visibility, movement, and click feedback match the approved profile.", presentation.pointerMoveMs, thresholds.pointerMoveMinimumMs);
}

function typingCheck(delayMs: number, fillCount: number, thresholds: CaptureQualityThresholds): CaptureQualityCheck {
  if (fillCount === 0) return { code: "typing_presentation", status: "pass", message: "The flow has no typing actions." };
  return metricCheck("typing_presentation", delayMs >= thresholds.typingDelayMinimumMs && delayMs <= thresholds.typingDelayMaximumMs ? "pass" : "fail", "Character-by-character typing speed matches the approved profile.", delayMs, thresholds.typingDelayMinimumMs);
}

function maximumPanSpeed(framing: CaptureFramingManifest | undefined): number {
  if (!framing?.crop || framing.keyframes.length < 2 || framing.transitionMs <= 0) return 0;
  let maximum = 0;
  for (let index = 1; index < framing.keyframes.length; index += 1) {
    const previous = framing.keyframes[index - 1]!;
    const current = framing.keyframes[index]!;
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y) / framing.crop.width;
    maximum = Math.max(maximum, distance / (framing.transitionMs / 1000));
  }
  return maximum;
}

async function runFfmpeg(command: string | undefined, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command ?? process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg", args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderrBytes = 0;
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Capture video quality analysis timed out.")); }, 120_000);
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; });
    child.once("error", () => { clearTimeout(timeout); reject(new Error("Capture video quality analyzer could not start.")); });
    child.once("close", (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Capture video quality analysis failed (${stderrBytes > 0 ? "diagnostics available" : "no diagnostics"}).`)); });
  });
}
