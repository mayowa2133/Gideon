import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import * as PImage from "pureimage";
import type {
  BrandKit,
  CaptionSegment,
  DetectedMoment,
  EditDecisionList,
  ProductProfile,
  RecordingMetadata,
  RenderFocusPoint,
  RenderOverlayCue,
  RenderValidation,
  ScriptDraft
} from "../shared/types";
import { estimateScriptDurationMs } from "../shared/contentEngine";
import { buildEditDecisionList, buildEvidenceClaims, buildVisualBeatsForTemplate, normalizeBrandKit } from "../shared/renderTemplates";

const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1000;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OVERLAY_FRAME_RATE = 4;

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
  const overlayDir = path.join(renderDir, "overlay-frames");
  const voicePath = path.join(renderDir, "voiceover.aiff");
  const audioPath = path.join(renderDir, "audio.m4a");
  const editDecisionList = ensureEditDecisionList(input.profile, input.script, input.moment);
  const durationMs = Math.min(
    editDecisionList.durationMs,
    input.recording.durationMs,
    60_000
  );
  const timeline = buildVideoTimelineFilter(editDecisionList, input.recording.durationMs, durationMs);
  const sourceDurationSec = timeline.durationSec;

  validateRenderManifest(editDecisionList);
  const overlaySequence = await createTimedOverlaySequence(
    input.profile,
    input.script,
    editDecisionList,
    overlayDir,
    sourceDurationSec
  );
  validateOverlaySequenceForRender(overlaySequence, sourceDurationSec);
  const voiceCreated = input.voiceoverPath ? true : await createVoiceover(input.script.voiceoverText, voicePath);
  if (!voiceCreated && !input.voiceoverPath) {
    await createSilentAudio(audioPath, sourceDurationSec);
  }

  const audioInput = input.voiceoverPath ?? (voiceCreated ? voicePath : audioPath);
  const filter = [
    timeline.filter,
    "[1:v]fps=30,format=rgba[overlay]",
    "[base][overlay]overlay=0:0:shortest=1[v]",
    buildAudioMixFilter(editDecisionList, sourceDurationSec)
  ].join(";");

  await runCommand(resolveFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input.recording.filePath,
    "-framerate",
    String(overlaySequence.frameRate),
    "-start_number",
    "0",
    "-i",
    overlaySequence.pattern,
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
  validateRenderedTimeline(validation, sourceDurationSec);
  return {
    outputPath,
    outputUrl: pathToFileURL(outputPath).toString(),
    validation
  };
}

function validateRenderedTimeline(validation: RenderValidation, expectedDurationSec: number): void {
  const expectedDurationMs = Math.round(expectedDurationSec * 1000);
  const driftMs = Math.abs(validation.durationMs - expectedDurationMs);
  if (driftMs > 1_500) {
    throw new Error("Rendered video duration does not match the manifest timeline.");
  }
  if (!validation.audioCodec) {
    throw new Error("Rendered video is missing audio for caption alignment.");
  }
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
  const frameQa = await inspectRenderedFrameQa(outputPath, durationMs);
  return {
    width: videoStream.width,
    height: videoStream.height,
    durationMs,
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    fastStart: true,
    frameQa
  };
}

interface RenderFrameLumaSample {
  averageLuma: number;
  minLuma: number;
  maxLuma: number;
  lumaStandardDeviation: number;
}

export function summarizeRenderFrameQa(samples: RenderFrameLumaSample[]): NonNullable<RenderValidation["frameQa"]> {
  if (samples.length === 0) {
    throw new Error("Rendered video QA could not sample output frames.");
  }
  const sampledFrames = samples.length;
  const informativeFrames = samples.filter(isInformativeFrameSample).length;
  const averageLuma = samples.reduce((total, sample) => total + sample.averageLuma, 0) / sampledFrames;
  return {
    sampledFrames,
    informativeFrames,
    averageLuma: roundMetric(averageLuma),
    minLuma: roundMetric(Math.min(...samples.map((sample) => sample.minLuma))),
    maxLuma: roundMetric(Math.max(...samples.map((sample) => sample.maxLuma))),
    minLumaStandardDeviation: roundMetric(Math.min(...samples.map((sample) => sample.lumaStandardDeviation)))
  };
}

export function validateRenderFrameQa(frameQa: NonNullable<RenderValidation["frameQa"]>): void {
  if (frameQa.sampledFrames < 1) {
    throw new Error("Rendered video QA could not sample output frames.");
  }
  if (frameQa.informativeFrames < 1) {
    throw new Error("Rendered video appears blank or visually empty.");
  }
}

async function inspectRenderedFrameQa(outputPath: string, durationMs: number): Promise<NonNullable<RenderValidation["frameQa"]>> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-render-qa-"));
  try {
    const timestampsSec = sampleTimestampsSec(durationMs);
    const samples: RenderFrameLumaSample[] = [];
    for (const [index, timestampSec] of timestampsSec.entries()) {
      const framePath = path.join(tempDir, `frame-${index + 1}.png`);
      await runCommand(resolveFfmpeg(), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        timestampSec.toFixed(3),
        "-i",
        outputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=32:32:force_original_aspect_ratio=decrease,pad=32:32:(ow-iw)/2:(oh-ih)/2,format=rgba",
        framePath
      ]);
      samples.push(await readPngLumaSample(framePath));
    }
    const frameQa = summarizeRenderFrameQa(samples);
    validateRenderFrameQa(frameQa);
    return frameQa;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sampleTimestampsSec(durationMs: number): number[] {
  const durationSec = Math.max(0.1, durationMs / 1000);
  return [0.12, 0.5, 0.88].map((ratio) => Math.max(0, Math.min(durationSec - 0.05, durationSec * ratio)));
}

async function readPngLumaSample(framePath: string): Promise<RenderFrameLumaSample> {
  const image = await PImage.decodePNGFromStream(createReadStream(framePath));
  const bitmap = image as unknown as { data: Uint8Array; width: number; height: number };
  let total = 0;
  let squaredTotal = 0;
  let minLuma = 255;
  let maxLuma = 0;
  const pixels = bitmap.width * bitmap.height;
  for (let offset = 0; offset < bitmap.data.length; offset += 4) {
    const luma = 0.2126 * bitmap.data[offset]! + 0.7152 * bitmap.data[offset + 1]! + 0.0722 * bitmap.data[offset + 2]!;
    total += luma;
    squaredTotal += luma * luma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
  }
  const averageLuma = pixels > 0 ? total / pixels : 0;
  const variance = pixels > 0 ? Math.max(0, squaredTotal / pixels - averageLuma * averageLuma) : 0;
  return {
    averageLuma,
    minLuma,
    maxLuma,
    lumaStandardDeviation: Math.sqrt(variance)
  };
}

function isInformativeFrameSample(sample: RenderFrameLumaSample): boolean {
  const lumaRange = sample.maxLuma - sample.minLuma;
  return lumaRange >= 24 && sample.lumaStandardDeviation >= 4 && sample.averageLuma > 3 && sample.averageLuma < 252;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
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

export function buildAudioMixFilter(editDecisionList: EditDecisionList, durationSec: number): string {
  const duration = durationSec.toFixed(3);
  const filters = [
    `[2:a]apad,atrim=0:${duration},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=stereo[voice]`
  ];
  const layerLabels = ["[voice]"];
  if (editDecisionList.music.enabled && editDecisionList.music.mood !== "none") {
    filters.push(
      `sine=frequency=${musicFrequency(editDecisionList.music.mood)}:duration=${duration}:sample_rate=44100,` +
      `volume=${editDecisionList.music.gainDb}dB,aformat=channel_layouts=stereo[music]`
    );
    layerLabels.push("[music]");
  }
  editDecisionList.sfx.slice(0, 12).forEach((cue, index) => {
    const tone = sfxTone(cue.kind);
    const delayMs = Math.max(0, Math.round(cue.startMs));
    filters.push(
      `sine=frequency=${tone.frequency}:duration=${tone.durationSec.toFixed(3)}:sample_rate=44100,` +
      `volume=${cue.gainDb}dB,adelay=${delayMs}|${delayMs},apad,atrim=0:${duration},` +
      `aformat=channel_layouts=stereo[sfx${index}]`
    );
    layerLabels.push(`[sfx${index}]`);
  });
  if (layerLabels.length === 1) {
    filters.push("[voice]anull[a]");
  } else {
    filters.push(`${layerLabels.join("")}amix=inputs=${layerLabels.length}:duration=first:dropout_transition=0,atrim=0:${duration},asetpts=N/SR/TB[a]`);
  }
  return filters.join(";");
}

function musicFrequency(mood: EditDecisionList["music"]["mood"]): number {
  if (mood === "upbeat") {
    return 330;
  }
  return 220;
}

function sfxTone(kind: EditDecisionList["sfx"][number]["kind"]): { frequency: number; durationSec: number } {
  if (kind === "pop") {
    return { frequency: 660, durationSec: 0.09 };
  }
  if (kind === "whoosh") {
    return { frequency: 440, durationSec: 0.16 };
  }
  return { frequency: 980, durationSec: 0.055 };
}

interface OverlaySequence {
  pattern: string;
  frameRate: number;
  frameCount: number;
}

interface ZoomFilterExpressions {
  scale: string;
  cropX: string;
  cropY: string;
}

async function createTimedOverlaySequence(
  profile: ProductProfile,
  script: ScriptDraft,
  editDecisionList: EditDecisionList,
  outputDir: string,
  durationSec: number
): Promise<OverlaySequence> {
  loadOverlayFont();
  await fs.mkdir(outputDir, { recursive: true });
  const durationMs = Math.max(1, Math.round(durationSec * 1000));
  const frameCount = Math.max(1, Math.ceil(durationSec * OVERLAY_FRAME_RATE) + 2);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const timestampMs = Math.min(durationMs, Math.round((frameIndex / OVERLAY_FRAME_RATE) * 1000));
    await createTimedOverlayFrame(
      profile,
      script,
      editDecisionList,
      timestampMs,
      path.join(outputDir, overlayFrameName(frameIndex))
    );
  }
  return {
    pattern: path.join(outputDir, "overlay-%04d.png"),
    frameRate: OVERLAY_FRAME_RATE,
    frameCount
  };
}

async function createTimedOverlayFrame(
  profile: ProductProfile,
  script: ScriptDraft,
  editDecisionList: EditDecisionList,
  timestampMs: number,
  outputPath: string
): Promise<void> {
  const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const context = image.getContext("2d");
  const brandKit = editDecisionList.brandKit;
  const isPresenterTemplate = editDecisionList.presenter.enabled || editDecisionList.templateKey === "brand_presenter";
  const activeHook = activeOverlayCue(editDecisionList.overlays, "hook", timestampMs);
  const activeCta = activeOverlayCue(editDecisionList.overlays, "cta", timestampMs);
  const activeCaption = activeCaptionAt(editDecisionList.captions, timestampMs);
  const activeWordIndex = activeCaption ? activeWordIndexAt(activeCaption, timestampMs) : -1;

  context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  drawFocusFrame(context, brandKit, timestampMs);
  drawTemplateChrome(context, editDecisionList, script, {
    showCta: Boolean(activeCta && activeCta.position !== "center"),
    showPresenterHook: Boolean(activeHook)
  });
  if (isPresenterTemplate) {
    await drawBrandPresenter(
      context,
      brandKit,
      editDecisionList.presenter,
      timestampMs,
      Boolean(activeCaption && activeWordIndex >= 0)
    );
  }

  context.fillStyle = brandKit.primaryColor;
  context.font = "34pt Arial";
  context.fillText(profile.productName || brandKit.productName || "Gideon draft", 110, 165);
  if (brandKit.tagline) {
    context.fillStyle = "#ffffff";
    context.font = "18pt Arial";
    drawWrappedText(context, brandKit.tagline, 110, 203, 760, 28, 1);
  }

  if (activeHook) {
    drawHookOverlay(context, activeHook, editDecisionList, timestampMs);
  }

  drawVisualBeatCallouts(context, editDecisionList, timestampMs);
  drawCursorEmphasis(context, editDecisionList, timestampMs);

  if (activeCaption) {
    context.font = brandKit.captionStyle === "educational_stack" ? "39pt Arial" : "46pt Arial";
    drawCaptionWithWordHighlight(
      context,
      activeCaption,
      activeWordIndex,
      130,
      1360,
      isPresenterTemplate ? 700 : 820,
      58,
      brandKit,
      brandKit.captionStyle === "educational_stack" ? 3 : 2
    );
  }

  if (activeCta) {
    drawCtaOverlay(context, activeCta, brandKit);
  }

  await PImage.encodePNGToStream(image, createWriteStream(outputPath));
}

function overlayFrameName(frameIndex: number): string {
  return `overlay-${String(frameIndex).padStart(4, "0")}.png`;
}

type OverlayContext = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;

function drawFocusFrame(context: OverlayContext, brandKit: BrandKit, timestampMs: number): void {
  const pulse = 0.66 + Math.sin(timestampMs / 240) * 0.08;
  drawRectOutline(context, 54, 485, 972, 650, 7, alpha(brandKit.primaryColor, pulse));
  drawRectOutline(context, 74, 505, 932, 610, 2, "rgba(255, 255, 255, 0.28)");
  drawPanel(context, 74, 1135, 280, 62, alpha(brandKit.primaryColor, 0.92));
  context.fillStyle = "#10131D";
  context.font = "24pt Arial";
  context.fillText("FOCUS PUNCH", 102, 1176);
}

function drawRectOutline(
  context: OverlayContext,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  fillStyle: string
): void {
  drawSolidRect(context, x, y, width, thickness, fillStyle);
  drawSolidRect(context, x, y + height - thickness, width, thickness, fillStyle);
  drawSolidRect(context, x, y, thickness, height, fillStyle);
  drawSolidRect(context, x + width - thickness, y, thickness, height, fillStyle);
}

function drawSolidRect(
  context: OverlayContext,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string
): void {
  context.fillStyle = fillStyle;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.closePath();
  context.fill();
}

function drawTemplateChrome(
  context: OverlayContext,
  editDecisionList: EditDecisionList,
  script: ScriptDraft,
  options: { showCta: boolean; showPresenterHook: boolean }
): void {
  const brandKit = editDecisionList.brandKit;
  const hookPanelHeight = editDecisionList.templateKey === "three_reasons" ? 310 : 285;
  drawPanel(context, 70, 105, 940, hookPanelHeight, "rgba(5, 7, 13, 0.74)");
  drawPanel(context, 80, 1270, editDecisionList.presenter.enabled ? 780 : 920, 360, "rgba(5, 7, 13, 0.80)");
  if (options.showCta) {
    drawPanel(context, 150, 1680, 780, 130, alpha(brandKit.primaryColor, 0.92));
  }
  if (editDecisionList.templateKey === "before_after_workflow") {
    drawPanel(context, 90, 430, 250, 70, alpha(brandKit.accentColor, 0.9));
    drawPanel(context, 740, 430, 250, 70, alpha(brandKit.primaryColor, 0.9));
    context.fillStyle = "#FFFFFF";
    context.font = "24pt Arial";
    context.fillText("BEFORE", 144, 475);
    context.fillStyle = "#10131D";
    context.fillText("AFTER", 805, 475);
  }
  if (editDecisionList.templateKey === "brand_presenter" && options.showPresenterHook) {
    drawPanel(context, 690, 1180, 295, 70, "rgba(255,255,255,0.14)");
    context.fillStyle = "#FFFFFF";
    context.font = "20pt Arial";
    drawWrappedText(context, script.hook, 720, 1224, 235, 26, 1);
  }
}

function drawVisualBeatCallouts(
  context: OverlayContext,
  editDecisionList: EditDecisionList,
  timestampMs: number
): void {
  const callouts = activeCalloutsAt(editDecisionList.callouts, timestampMs).slice(0, 3);
  if (callouts.length === 0) {
    return;
  }
  const positions = [
    { x: 90, y: 500, width: 390 },
    { x: 600, y: 690, width: 390 },
    { x: 90, y: 910, width: 390 }
  ];
  callouts.forEach((callout, index) => {
    const position = positions[index];
    if (!position) {
      return;
    }
    drawPanel(context, position.x, position.y, position.width, 118, "rgba(5, 7, 13, 0.82)");
    drawPanel(context, position.x + 18, position.y + 21, 58, 58, alpha(editDecisionList.brandKit.primaryColor, 0.92));
    context.fillStyle = "#10131D";
    context.font = "28pt Arial";
    context.fillText(String(index + 1), position.x + 40, position.y + 61);
    context.fillStyle = "#ffffff";
    context.font = "24pt Arial";
    drawWrappedText(context, callout.text, position.x + 96, position.y + 47, position.width - 125, 30, 2);
  });
}

function drawCursorEmphasis(context: OverlayContext, editDecisionList: EditDecisionList, timestampMs: number): void {
  const activeCallout = activeCalloutsAt(editDecisionList.callouts, timestampMs)[0];
  if (!activeCallout?.anchor) {
    return;
  }
  const anchor = activeCallout.anchor;
  const x = 90 + anchor.x * 900;
  const y = 500 + anchor.y * 600;
  const radius = 24 + Math.sin(timestampMs / 130) * 7;
  context.fillStyle = alpha(editDecisionList.brandKit.accentColor, 0.88);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  drawRectOutline(context, x - 44, y - 44, 88, 88, 3, "rgba(255,255,255,0.72)");
}

async function drawBrandPresenter(
  context: OverlayContext,
  brandKit: BrandKit,
  presenter: EditDecisionList["presenter"],
  timestampMs: number,
  speaking: boolean
): Promise<void> {
  if (!presenter.enabled || !isCueActive(presenter, timestampMs)) {
    return;
  }
  const baseX = presenter.position === "lower_left" ? 82 : 795;
  const bob = presenter.motion === "caption_sync"
    ? Math.sin(timestampMs / (speaking ? 115 : 320)) * (speaking ? 9 : 4)
    : Math.sin(timestampMs / 360) * 4;
  const baseY = 1425 + bob;
  const ringPulse = speaking ? 1 + Math.sin(timestampMs / 90) * 0.04 : 1;
  drawPanel(context, baseX + 36, baseY + 245, 170, 250, "rgba(247,248,243,0.92)");
  drawPanel(context, baseX + 10, baseY + 398, 230, 160, alpha(brandKit.primaryColor, 0.9));
  context.fillStyle = "rgba(255,255,255,0.18)";
  context.beginPath();
  context.arc(baseX + 122, baseY + 172, 118 * ringPulse, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = brandKit.backgroundColor;
  context.beginPath();
  context.arc(baseX + 122, baseY + 158, 96, 0, Math.PI * 2);
  context.fill();
  const drewLogo = await drawLogoImage(context, brandKit.logoPath, baseX + 56, baseY + 92, 132);
  if (!drewLogo) {
    context.fillStyle = brandKit.primaryColor;
    context.font = "44pt Arial";
    context.fillText(initials(brandKit.productName), baseX + 78, baseY + 176);
  }
  drawSolidRect(
    context,
    baseX + 76,
    baseY + 268,
    92,
    speaking ? 28 : 12,
    speaking ? alpha(brandKit.accentColor, 0.88) : "rgba(16,19,29,0.32)"
  );
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.font = "18pt Arial";
  context.fillText("brand presenter", baseX + 39, baseY + 585);
}

function drawHookOverlay(
  context: OverlayContext,
  overlay: RenderOverlayCue,
  editDecisionList: EditDecisionList,
  timestampMs: number
): void {
  const entrance = clamp((timestampMs - overlay.startMs) / 320, 0, 1);
  const y = 260 + (1 - entrance) * 24;
  drawSolidRect(context, 110, 230, 220 + entrance * 560, 8, alpha(editDecisionList.brandKit.primaryColor, 0.92));
  context.fillStyle = "#ffffff";
  context.font = editDecisionList.templateKey === "three_reasons" ? "50pt Arial" : "56pt Arial";
  drawWrappedText(context, overlay.text, 110, y, 860, 66, 3);
}

function drawCaptionWithWordHighlight(
  context: OverlayContext,
  caption: CaptionSegment,
  activeWordIndex: number,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  brandKit: BrandKit,
  maxLines: number
): void {
  const words = caption.text.split(/\s+/).filter(Boolean);
  const spaceWidth = context.measureText(" ").width;
  let cursorX = x;
  let lineIndex = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const wordWidth = context.measureText(word).width;
    if (cursorX > x && cursorX + wordWidth > x + maxWidth) {
      lineIndex += 1;
      cursorX = x;
    }
    if (lineIndex >= maxLines) {
      return;
    }
    const baselineY = y + lineIndex * lineHeight;
    const isActive = index === activeWordIndex;
    if (isActive) {
      drawSolidRect(
        context,
        cursorX - 9,
        baselineY - lineHeight + 9,
        wordWidth + 18,
        lineHeight - 1,
        alpha(brandKit.primaryColor, 0.94)
      );
    }
    context.fillStyle = isActive ? "#10131D" : "#ffffff";
    context.fillText(word, cursorX, baselineY);
    cursorX += wordWidth + spaceWidth;
  }
}

function drawCtaOverlay(context: OverlayContext, overlay: RenderOverlayCue, brandKit: BrandKit): void {
  const isCenter = overlay.position === "center";
  const x = isCenter ? 130 : 190;
  const y = isCenter ? 880 : 1758;
  const width = isCenter ? 820 : 700;
  if (isCenter) {
    drawPanel(context, 110, 790, 860, 210, alpha(brandKit.primaryColor, 0.94));
  }
  context.fillStyle = "#10131D";
  context.font = isCenter ? "44pt Arial" : "38pt Arial";
  drawWrappedText(context, overlay.text, x, y, width, isCenter ? 54 : 48, isCenter ? 3 : 2);
}

function activeOverlayCue(
  overlays: RenderOverlayCue[],
  kind: RenderOverlayCue["kind"],
  timestampMs: number
): RenderOverlayCue | undefined {
  return overlays.find((overlay) => overlay.kind === kind && isCueActive(overlay, timestampMs));
}

function activeCaptionAt(captions: CaptionSegment[], timestampMs: number): CaptionSegment | undefined {
  return captions.find((caption) => isCueActive(caption, timestampMs));
}

function activeWordIndexAt(caption: CaptionSegment, timestampMs: number): number {
  return caption.words?.findIndex((word) => isCueActive(word, timestampMs)) ?? -1;
}

function activeCalloutsAt(
  callouts: EditDecisionList["callouts"],
  timestampMs: number
): EditDecisionList["callouts"] {
  return callouts.filter((callout) => isCueActive(callout, timestampMs));
}

function isCueActive(cue: { startMs: number; endMs: number }, timestampMs: number): boolean {
  return timestampMs >= cue.startMs && timestampMs < cue.endMs;
}

export function calloutTextFromInstruction(instruction: string): string {
  return instruction
    .replace(/^show\s+/i, "")
    .replace(/\s+with readable framing\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureEditDecisionList(
  profile: ProductProfile,
  script: ScriptDraft,
  moment: DetectedMoment | undefined
): EditDecisionList {
  if (script.editDecisionList?.schemaVersion === "2") {
    const manifest = script.editDecisionList as EditDecisionList & {
      sfx?: EditDecisionList["sfx"];
      music?: EditDecisionList["music"];
    };
    return {
      ...manifest,
      sfx: manifest.sfx ?? [],
      music: manifest.music ?? { enabled: false, mood: "none", gainDb: -30 }
    };
  }
  const durationMs = estimateScriptDurationMs(script);
  const moments = moment ? [moment] : [];
  const templateKey = script.templateKey ?? profile.defaultTemplateKey ?? "problem_demo_payoff";
  const visualBeats = script.visualBeats.length
    ? script.visualBeats
    : buildVisualBeatsForTemplate({ moments, durationMs, templateKey });
  const captions = script.captions.length ? script.captions : [];
  const cta = script.cta || `Try ${profile.productName || "this workflow"}.`;
  return buildEditDecisionList({
    profile: {
      ...profile,
      brandKit: normalizeBrandKit(profile.brandKit, profile.productName)
    },
    templateKey,
    durationMs,
    captions,
    visualBeats,
    hook: script.hook,
    cta,
    moments
  });
}

export function validateRenderManifest(editDecisionList: EditDecisionList): void {
  if (editDecisionList.durationMs < 1_000 || editDecisionList.durationMs > 60_000) {
    throw new Error("Render manifest duration is outside the supported short-form range.");
  }
  validateSourceSegmentTimings(editDecisionList.sourceSegments, editDecisionList.durationMs);
  validateTimedCueCollection("Zoom", editDecisionList.zooms, editDecisionList.durationMs);
  validateTimedCueCollection("Caption", editDecisionList.captions, editDecisionList.durationMs);
  validateTimedCueCollection("Overlay", editDecisionList.overlays, editDecisionList.durationMs);
  validateTimedCueCollection("Callout", editDecisionList.callouts, editDecisionList.durationMs);
  validateSfxCueTimings(editDecisionList.sfx, editDecisionList.durationMs);
  validatePresenterTiming(editDecisionList.presenter, editDecisionList.durationMs);
  editDecisionList.sourceSegments.forEach((segment, index) => {
    validateFocusPoint(`Source segment ${index + 1}`, segment.focus);
  });
  editDecisionList.zooms.forEach((zoom, index) => {
    validateFocusPoint(`Zoom cue ${index + 1}`, zoom.focus);
    if (zoom.fromScale < 1 || zoom.toScale < zoom.fromScale || zoom.toScale > 2.5) {
      throw new Error(`Zoom cue ${index + 1} has an unsupported scale range.`);
    }
  });
  editDecisionList.callouts.forEach((callout, index) => {
    validateFocusPoint(`Callout ${index + 1}`, callout.anchor);
  });
  validateCaptionWordTimings(editDecisionList.captions);
  if (editDecisionList.qualityGates.requireCaptionSafeArea) {
    validateCaptionSafeAreas(editDecisionList);
  }
  if (editDecisionList.qualityGates.requireEvidenceBackedClaims && editDecisionList.sourceSegments.length === 0) {
    throw new Error("Render manifest has no source-backed visual moments.");
  }
}

function validateSourceSegmentTimings(segments: EditDecisionList["sourceSegments"], durationMs: number): void {
  segments.forEach((segment, index) => {
    if (
      segment.sourceStartMs < 0 ||
      segment.sourceEndMs <= segment.sourceStartMs ||
      segment.timelineStartMs < 0 ||
      segment.timelineEndMs <= segment.timelineStartMs ||
      segment.timelineEndMs > durationMs
    ) {
      throw new Error(`Source segment ${index + 1} has timings outside the render timeline.`);
    }
  });
}

function validateOverlaySequenceForRender(overlaySequence: OverlaySequence, expectedDurationSec: number): void {
  const minimumFrameCount = Math.ceil(expectedDurationSec * overlaySequence.frameRate);
  if (overlaySequence.frameCount < minimumFrameCount) {
    throw new Error("Overlay frame sequence does not cover the render timeline.");
  }
}

function validateTimedCueCollection(
  label: string,
  cues: Array<{ startMs: number; endMs: number }>,
  durationMs: number
): void {
  cues.forEach((cue, index) => {
    if (cue.startMs < 0 || cue.endMs <= cue.startMs || cue.endMs > durationMs) {
      throw new Error(`${label} cue ${index + 1} has timings outside the render timeline.`);
    }
  });
}

function validateSfxCueTimings(sfx: EditDecisionList["sfx"], durationMs: number): void {
  sfx.forEach((cue, index) => {
    if (cue.startMs < 0 || cue.startMs >= durationMs || cue.gainDb < -60 || cue.gainDb > 0) {
      throw new Error(`SFX cue ${index + 1} is outside the supported render range.`);
    }
  });
}

function validateFocusPoint(label: string, focus: RenderFocusPoint): void {
  if (
    focus.x < 0 ||
    focus.x > 1 ||
    focus.y < 0 ||
    focus.y > 1 ||
    focus.scale < 1 ||
    focus.scale > 2.5
  ) {
    throw new Error(`${label} focus is outside the supported render range.`);
  }
}

function validatePresenterTiming(presenter: EditDecisionList["presenter"], durationMs: number): void {
  if (!presenter.enabled) {
    return;
  }
  if (presenter.startMs < 0 || presenter.endMs <= presenter.startMs || presenter.endMs > durationMs) {
    throw new Error("Brand presenter timing is outside the render timeline.");
  }
}

function validateCaptionWordTimings(captions: CaptionSegment[]): void {
  captions.forEach((caption, captionIndex) => {
    caption.words?.forEach((word, wordIndex) => {
      if (
        word.startMs < caption.startMs ||
        word.endMs > caption.endMs ||
        word.endMs <= word.startMs ||
        word.text.trim().length === 0
      ) {
        throw new Error(`Caption ${captionIndex + 1} word ${wordIndex + 1} has invalid timing.`);
      }
    });
  });
}

function validateCaptionSafeAreas(editDecisionList: EditDecisionList): void {
  if (editDecisionList.captions.length === 0) {
    throw new Error("Render manifest needs caption segments for the selected template.");
  }
  loadOverlayFont();
  const context = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT).getContext("2d");
  const isPresenterTemplate = editDecisionList.presenter.enabled || editDecisionList.templateKey === "brand_presenter";
  const captionMaxWidth = isPresenterTemplate ? 700 : 820;
  const captionMaxLines = editDecisionList.brandKit.captionStyle === "educational_stack" ? 3 : 2;
  context.font = editDecisionList.brandKit.captionStyle === "educational_stack" ? "39pt Arial" : "46pt Arial";
  const overflowingCaption = editDecisionList.captions.find(
    (caption) => !textFitsWithinLines(context, caption.text, captionMaxWidth, captionMaxLines)
  );
  if (overflowingCaption) {
    throw new Error("Caption text is too long for the selected safe-area preset.");
  }

  const hook = editDecisionList.overlays.find((overlay) => overlay.kind === "hook");
  if (hook) {
    context.font = editDecisionList.templateKey === "three_reasons" ? "50pt Arial" : "56pt Arial";
    if (!textFitsWithinLines(context, hook.text, 860, 3)) {
      throw new Error("Hook text is too long for the selected safe-area preset.");
    }
  }

  const cta = editDecisionList.overlays.find((overlay) => overlay.kind === "cta");
  if (cta) {
    const isCenter = cta.position === "center";
    context.font = isCenter ? "44pt Arial" : "38pt Arial";
    if (!textFitsWithinLines(context, cta.text, isCenter ? 820 : 700, isCenter ? 3 : 2)) {
      throw new Error("CTA text is too long for the selected safe-area preset.");
    }
  }
}

function textFitsWithinLines(
  context: OverlayContext,
  text: string,
  maxWidth: number,
  maxLines: number
): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return false;
  }
  const hasOversizedWord = words.some((word) => context.measureText(word).width > maxWidth);
  return !hasOversizedWord && wrapText(context, text, maxWidth).length <= maxLines;
}

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

function buildVideoTimelineFilter(
  editDecisionList: EditDecisionList,
  recordingDurationMs: number,
  fallbackDurationMs: number
): { filter: string; durationSec: number } {
  const segments = normalizedSourceSegments(editDecisionList, recordingDurationMs, fallbackDurationMs);
  const segmentFilters = segments.map((segment, index) => {
    const sourceStartSec = (segment.sourceStartMs / 1000).toFixed(3);
    const sourceEndSec = (segment.sourceEndMs / 1000).toFixed(3);
    const actualDurationMs = Math.max(1, segment.sourceEndMs - segment.sourceStartMs);
    const desiredDurationMs = Math.max(1, segment.timelineEndMs - segment.timelineStartMs);
    const setptsFactor = (desiredDurationMs / actualDurationMs).toFixed(6);
    return `[0:v]trim=start=${sourceStartSec}:end=${sourceEndSec},setpts=(PTS-STARTPTS)*${setptsFactor},${videoFilter(
      editDecisionList,
      segment.timelineStartMs,
      desiredDurationMs
    )}[seg${index}]`;
  });
  const concat =
    segments.length === 1
      ? "[seg0]null[base]"
      : `${segments.map((_segment, index) => `[seg${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[base]`;
  const durationMs = segments.reduce((total, segment) => total + Math.max(1, segment.timelineEndMs - segment.timelineStartMs), 0);
  return {
    filter: [...segmentFilters, concat].join(";"),
    durationSec: Math.max(8, Math.min(60, durationMs / 1000))
  };
}

function normalizedSourceSegments(
  editDecisionList: EditDecisionList,
  recordingDurationMs: number,
  fallbackDurationMs: number
): EditDecisionList["sourceSegments"] {
  const sourceSegments = editDecisionList.sourceSegments.length
    ? editDecisionList.sourceSegments
    : [
        {
          momentId: "source",
          sourceStartMs: 0,
          sourceEndMs: Math.min(recordingDurationMs, fallbackDurationMs),
          timelineStartMs: 0,
          timelineEndMs: Math.min(recordingDurationMs, fallbackDurationMs),
          fit: "contain" as const,
          focus: { x: 0.5, y: 0.5, scale: 1.1 }
        }
      ];
  let timelineCursorMs = 0;
  return sourceSegments.slice(0, 8).map((segment) => {
    const desiredDurationMs = Math.max(750, segment.timelineEndMs - segment.timelineStartMs);
    const maxSourceStartMs = Math.max(0, recordingDurationMs - 500);
    const sourceStartMs = clamp(segment.sourceStartMs, 0, maxSourceStartMs);
    const sourceEndMs = clamp(
      Math.max(segment.sourceEndMs, sourceStartMs + 500),
      sourceStartMs + 500,
      recordingDurationMs
    );
    const normalized = {
      ...segment,
      sourceStartMs,
      sourceEndMs,
      timelineStartMs: timelineCursorMs,
      timelineEndMs: timelineCursorMs + desiredDurationMs
    };
    timelineCursorMs = normalized.timelineEndMs;
    return normalized;
  });
}

function videoFilter(editDecisionList: EditDecisionList, timelineOffsetMs: number, durationMs: number): string {
  const filters = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(editDecisionList.brandKit.backgroundColor)}`,
    "setsar=1"
  ];
  const zoomExpressions = zoomFilterExpressions(editDecisionList, timelineOffsetMs, durationMs);
  if (zoomExpressions.scale !== "1") {
    filters.push(`scale=w='1080*(${zoomExpressions.scale})':h='1920*(${zoomExpressions.scale})':eval=frame`);
    filters.push(`crop=w=1080:h=1920:x='${zoomExpressions.cropX}':y='${zoomExpressions.cropY}'`);
    filters.push("setsar=1");
  }
  return filters.join(",");
}

export function zoomFilterExpressions(
  editDecisionList: EditDecisionList,
  timelineOffsetMs: number,
  durationMs: number
): ZoomFilterExpressions {
  const segmentStartMs = timelineOffsetMs;
  const segmentEndMs = timelineOffsetMs + durationMs;
  const activeZooms = editDecisionList.zooms.slice(0, 8).flatMap((zoom) => {
    const localStartMs = Math.max(0, zoom.startMs - segmentStartMs);
    const localEndMs = Math.min(durationMs, zoom.endMs - segmentStartMs);
    if (zoom.endMs <= segmentStartMs || zoom.startMs >= segmentEndMs || localEndMs <= localStartMs) {
      return [];
    }
    return [{ zoom, localStartMs, localEndMs }];
  });
  if (activeZooms.length === 0) {
    return {
      scale: "1",
      cropX: "0",
      cropY: "0"
    };
  }
  const scaleParts: string[] = [];
  const focusXParts: string[] = [];
  const focusYParts: string[] = [];
  for (const { zoom, localStartMs, localEndMs } of activeZooms) {
    const active = activeWindowExpression(localStartMs, localEndMs);
    const ease = easingProgressExpression(localStartMs, localEndMs, zoom.easing);
    const fromDelta = Math.max(0, zoom.fromScale - 1);
    const scaleDelta = Math.max(0, zoom.toScale - zoom.fromScale);
    scaleParts.push(`(${active})*(${fromDelta.toFixed(3)}+${scaleDelta.toFixed(3)}*(${ease}))`);
    focusXParts.push(`(${active})*${(zoom.focus.x - 0.5).toFixed(3)}`);
    focusYParts.push(`(${active})*${(zoom.focus.y - 0.5).toFixed(3)}`);
  }
  const focusXExpression = focusXParts.length ? `0.5+${focusXParts.join("+")}` : "0.5";
  const focusYExpression = focusYParts.length ? `0.5+${focusYParts.join("+")}` : "0.5";
  return {
    scale: `1+${scaleParts.join("+")}`,
    cropX: `(iw-1080)*(${focusXExpression})`,
    cropY: `(ih-1920)*(${focusYExpression})`
  };
}

function activeWindowExpression(startMs: number, endMs: number): string {
  const start = (startMs / 1000).toFixed(3);
  const end = (endMs / 1000).toFixed(3);
  return `between(t\\,${start}\\,${end})`;
}

function easingProgressExpression(startMs: number, endMs: number, easing: EditDecisionList["zooms"][number]["easing"]): string {
  if (easing === "snap") {
    return "1";
  }
  const start = (startMs / 1000).toFixed(3);
  const duration = Math.max(0.001, (endMs - startMs) / 1000).toFixed(3);
  const progress = `clip((t-${start})/${duration}\\,0\\,1)`;
  return `(${progress})*(${progress})*(3-2*(${progress}))`;
}

async function drawLogoImage(
  context: OverlayContext,
  logoPath: string | undefined,
  x: number,
  y: number,
  size: number
): Promise<boolean> {
  if (!logoPath) {
    return false;
  }
  try {
    const extension = path.extname(logoPath).toLowerCase();
    const stream = createReadStream(logoPath);
    const image = extension === ".jpg" || extension === ".jpeg"
      ? await PImage.decodeJPEGFromStream(stream)
      : await PImage.decodePNGFromStream(stream);
    context.drawImage(image, x, y, size, size);
    return true;
  } catch {
    return false;
  }
}

function initials(productName: string): string {
  const words = productName.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "G";
  }
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function alpha(hexColor: string, opacity: number): string {
  const { r, g, b } = parseHexColor(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1).toFixed(2)})`;
}

function ffmpegColor(hexColor: string): string {
  return `0x${hexColor.replace("#", "").toUpperCase()}`;
}

function parseHexColor(hexColor: string): { r: number; g: number; b: number } {
  const clean = /^#[0-9a-f]{6}$/i.test(hexColor) ? hexColor.slice(1) : "B8F34A";
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  };
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
