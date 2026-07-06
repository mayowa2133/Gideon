import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import * as PImage from "pureimage";
import type {
  BrandKit,
  DetectedMoment,
  EditDecisionList,
  ProductProfile,
  RecordingMetadata,
  RenderValidation,
  ScriptDraft
} from "../shared/types";
import { estimateScriptDurationMs } from "../shared/contentEngine";
import { buildEditDecisionList, buildEvidenceClaims, buildVisualBeatsForTemplate, normalizeBrandKit } from "../shared/renderTemplates";

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
  const editDecisionList = ensureEditDecisionList(input.profile, input.script, input.moment);
  const durationMs = Math.min(
    editDecisionList.durationMs,
    input.recording.durationMs,
    60_000
  );
  const sourceStartMs = clamp(
    editDecisionList.sourceSegments[0]?.sourceStartMs ?? input.moment?.startMs ?? 0,
    0,
    Math.max(input.recording.durationMs - 2_000, 0)
  );
  const sourceDurationSec = Math.max(8, durationMs / 1000);

  validateEditDecisionListForRender(editDecisionList);
  await createCaptionOverlay(input.profile, input.script, editDecisionList, overlayPath);
  const voiceCreated = input.voiceoverPath ? true : await createVoiceover(input.script.voiceoverText, voicePath);
  if (!voiceCreated && !input.voiceoverPath) {
    await createSilentAudio(audioPath, sourceDurationSec);
  }

  const audioInput = input.voiceoverPath ?? (voiceCreated ? voicePath : audioPath);
  const filter = [
    `[0:v]${videoFilter(editDecisionList)}[base]`,
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

async function createCaptionOverlay(
  profile: ProductProfile,
  script: ScriptDraft,
  editDecisionList: EditDecisionList,
  outputPath: string
): Promise<void> {
  loadOverlayFont();
  const image = PImage.make(1080, 1920);
  const context = image.getContext("2d");
  const brandKit = editDecisionList.brandKit;
  const isPresenterTemplate = editDecisionList.presenter.enabled || editDecisionList.templateKey === "brand_presenter";

  context.clearRect(0, 0, 1080, 1920);
  drawFocusFrame(context, brandKit);
  drawTemplateChrome(context, editDecisionList, script);
  if (isPresenterTemplate) {
    await drawBrandPresenter(context, brandKit, editDecisionList.presenter);
  }

  context.fillStyle = brandKit.primaryColor;
  context.font = "34pt Arial";
  context.fillText(profile.productName || brandKit.productName || "Gideon draft", 110, 165);
  if (brandKit.tagline) {
    context.fillStyle = "#ffffff";
    context.font = "18pt Arial";
    drawWrappedText(context, brandKit.tagline, 110, 203, 760, 28, 1);
  }

  context.fillStyle = "#ffffff";
  context.font = editDecisionList.templateKey === "three_reasons" ? "50pt Arial" : "56pt Arial";
  drawWrappedText(context, script.hook, 110, 260, 860, 66, 3);

  drawVisualBeatCallouts(context, editDecisionList);
  drawCursorEmphasis(context, editDecisionList);

  context.fillStyle = "#ffffff";
  context.font = brandKit.captionStyle === "educational_stack" ? "39pt Arial" : "46pt Arial";
  const captionText = editDecisionList.captions
    .slice(0, brandKit.captionStyle === "educational_stack" ? 5 : 4)
    .map((caption) => caption.text)
    .join(" ");
  drawWrappedText(context, captionText, 130, 1360, isPresenterTemplate ? 700 : 820, 58, 4);

  context.fillStyle = "#10131D";
  context.font = "38pt Arial";
  drawWrappedText(context, script.cta, 190, 1758, 700, 48, 2);

  await PImage.encodePNGToStream(image, createWriteStream(outputPath));
}

type OverlayContext = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;

function drawFocusFrame(context: OverlayContext, brandKit: BrandKit): void {
  drawRectOutline(context, 54, 485, 972, 650, 7, alpha(brandKit.primaryColor, 0.74));
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

function drawTemplateChrome(context: OverlayContext, editDecisionList: EditDecisionList, script: ScriptDraft): void {
  const brandKit = editDecisionList.brandKit;
  const hookPanelHeight = editDecisionList.templateKey === "three_reasons" ? 310 : 285;
  drawPanel(context, 70, 105, 940, hookPanelHeight, "rgba(5, 7, 13, 0.74)");
  drawPanel(context, 80, 1270, editDecisionList.presenter.enabled ? 780 : 920, 360, "rgba(5, 7, 13, 0.80)");
  drawPanel(context, 150, 1680, 780, 130, alpha(brandKit.primaryColor, 0.92));
  if (editDecisionList.templateKey === "before_after_workflow") {
    drawPanel(context, 90, 430, 250, 70, alpha(brandKit.accentColor, 0.9));
    drawPanel(context, 740, 430, 250, 70, alpha(brandKit.primaryColor, 0.9));
    context.fillStyle = "#FFFFFF";
    context.font = "24pt Arial";
    context.fillText("BEFORE", 144, 475);
    context.fillStyle = "#10131D";
    context.fillText("AFTER", 805, 475);
  }
  if (editDecisionList.templateKey === "brand_presenter") {
    drawPanel(context, 690, 1180, 295, 70, "rgba(255,255,255,0.14)");
    context.fillStyle = "#FFFFFF";
    context.font = "20pt Arial";
    drawWrappedText(context, script.hook, 720, 1224, 235, 26, 1);
  }
}

function drawVisualBeatCallouts(context: OverlayContext, editDecisionList: EditDecisionList): void {
  const callouts = editDecisionList.callouts.slice(0, 3);
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

function drawCursorEmphasis(context: OverlayContext, editDecisionList: EditDecisionList): void {
  const anchor = editDecisionList.callouts[0]?.anchor;
  if (!anchor) {
    return;
  }
  const x = 90 + anchor.x * 900;
  const y = 500 + anchor.y * 600;
  context.fillStyle = alpha(editDecisionList.brandKit.accentColor, 0.88);
  context.beginPath();
  context.arc(x, y, 28, 0, Math.PI * 2);
  context.fill();
  drawRectOutline(context, x - 44, y - 44, 88, 88, 3, "rgba(255,255,255,0.72)");
}

async function drawBrandPresenter(
  context: OverlayContext,
  brandKit: BrandKit,
  presenter: EditDecisionList["presenter"]
): Promise<void> {
  if (!presenter.enabled) {
    return;
  }
  const baseX = presenter.position === "lower_left" ? 82 : 795;
  const baseY = 1425;
  drawPanel(context, baseX + 36, baseY + 245, 170, 250, "rgba(247,248,243,0.92)");
  drawPanel(context, baseX + 10, baseY + 398, 230, 160, alpha(brandKit.primaryColor, 0.9));
  context.fillStyle = "rgba(255,255,255,0.18)";
  context.beginPath();
  context.arc(baseX + 122, baseY + 172, 118, 0, Math.PI * 2);
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
  context.fillStyle = "rgba(255,255,255,0.9)";
  context.font = "18pt Arial";
  context.fillText("brand presenter", baseX + 39, baseY + 585);
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
    return script.editDecisionList;
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

function validateEditDecisionListForRender(editDecisionList: EditDecisionList): void {
  if (editDecisionList.durationMs < 1_000 || editDecisionList.durationMs > 60_000) {
    throw new Error("Render manifest duration is outside the supported short-form range.");
  }
  if (editDecisionList.qualityGates.requireCaptionSafeArea) {
    const overflowing = editDecisionList.captions.find((caption) => caption.text.length > 96);
    if (overflowing) {
      throw new Error("Caption text is too long for the selected safe-area preset.");
    }
  }
  if (editDecisionList.qualityGates.requireEvidenceBackedClaims && editDecisionList.sourceSegments.length === 0) {
    throw new Error("Render manifest has no source-backed visual moments.");
  }
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

function videoFilter(editDecisionList: EditDecisionList): string {
  const filters = [
    "scale=1080:1920:force_original_aspect_ratio=decrease",
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(editDecisionList.brandKit.backgroundColor)}`
  ];
  const zoomExpression = zoomScaleExpression(editDecisionList);
  if (zoomExpression !== "1") {
    filters.push(`scale=w='1080*(${zoomExpression})':h='1920*(${zoomExpression})':eval=frame`);
    filters.push("crop=1080:1920:(iw-1080)/2:(ih-1920)/2");
  }
  return filters.join(",");
}

function zoomScaleExpression(editDecisionList: EditDecisionList): string {
  const parts = editDecisionList.zooms.slice(0, 6).map((zoom) => {
    const start = (zoom.startMs / 1000).toFixed(3);
    const end = (zoom.endMs / 1000).toFixed(3);
    const delta = Math.max(0, zoom.toScale - 1).toFixed(3);
    return `${delta}*between(t\\,${start}\\,${end})`;
  });
  return parts.length ? `1+${parts.join("+")}` : "1";
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
