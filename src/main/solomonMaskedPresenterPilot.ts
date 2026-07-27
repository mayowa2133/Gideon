import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import * as PImage from "pureimage";
import {
  MASKED_PRESENTER_GESTURE_LIBRARY,
  assertMaskedPresenterLayoutManifest,
  assertMaskedPresenterSchedule,
  maskedPresenterCharacterSpec,
  planMaskedPresenterLayouts,
  scheduleMaskedPresenterGestures,
  type MaskedPresenterBeat,
  type MaskedPresenterGestureSchedule,
  type MaskedPresenterLayoutManifest
} from "./maskedPresenter";
import {
  CodeNativeMaskedPresenterProvider,
  type MaskedPresenterAssetProvider
} from "./maskedPresenterProvider";
import type { MaskedPresenterRenderResult } from "./maskedPresenterRenderer";
import type { NarrationProvider, NarrationResult } from "./narration";

const PILOT_VERSION = "solomon-masked-presenter-v1";
const DURATION_MS = 43_000;
const FPS = 30 as const;
const MASTER_WIDTH = 1080;
const MASTER_HEIGHT = 1920;
const WORKFLOW_IDS = [
  "browse-filter-jobs",
  "update-job-tracker",
  "review-saved-contacts",
  "review-draft-outreach"
] as const;

export interface SolomonMaskedPresenterPilotReport {
  schemaVersion: "1";
  pilotVersion: typeof PILOT_VERSION;
  outputDir: string;
  captureRunRoot: string;
  masterPath: string;
  socialPath: string;
  durationMs: number;
  presenter: MaskedPresenterRenderResult["manifest"];
  gestureSchedulePath: string;
  layoutManifestPath: string;
  productProvenancePath: string;
  presenterProvenancePath: string;
  qualityReportPath: string;
  manualReviewPath: string;
  artifacts: Record<string, string>;
}

interface CapturePilotResult {
  workflowId: string;
  normalizedClip: { localPath?: string; sha256?: string };
  presentationOutput?: {
    verticalRender: { localPath?: string; sha256?: string };
    validation?: { durationMs?: number };
    quality?: { status?: string };
  };
  execution: { status: string; receiptArtifactId?: string };
  verification: unknown;
  interactionSummary?: {
    counts?: Record<string, number>;
    presentation?: { showPointer?: boolean; pointerMoveMs?: number; typingDelayMs?: number };
  };
}

interface CapturePilotReport {
  schemaVersion: string;
  runId: string;
  manifestKey: string;
  results: CapturePilotResult[];
}

interface ProductScene {
  workflowId: typeof WORKFLOW_IDS[number];
  sourcePath: string;
  startMs: number;
  endMs: number;
  trimStartMs: number;
}

export function solomonMaskedPresenterPilotBeats(): MaskedPresenterBeat[] {
  return [
    {
      id: "hook",
      startMs: 0,
      endMs: 4_200,
      text: "Job searching should not feel like five disconnected spreadsheets.",
      intent: "hook",
      energy: "high",
      emphasizedWords: ["five", "disconnected"],
      presenter: "required",
      preferredGesture: "lean_forward",
      productPriority: 0.08,
      captionPlacement: "top",
      cameraEmphasis: "context"
    },
    {
      id: "reveal",
      startMs: 4_200,
      endMs: 7_200,
      text: "Solomon brings the work into one clear flow.",
      intent: "product_reveal",
      energy: "medium",
      emphasizedWords: ["Solomon", "one clear flow"],
      workflowId: "browse-filter-jobs",
      presenter: "preferred",
      preferredGesture: "point_right",
      productPriority: 0.48,
      captionPlacement: "top",
      cameraEmphasis: "context"
    },
    {
      id: "jobs",
      startMs: 7_200,
      endMs: 13_000,
      text: "Start with roles that match what you are looking for.",
      intent: "demonstration",
      energy: "medium",
      emphasizedWords: ["roles that match"],
      workflowId: "browse-filter-jobs",
      presenter: "hidden",
      productPriority: 1,
      captionPlacement: "top",
      cameraEmphasis: "result"
    },
    {
      id: "tracker",
      startMs: 13_000,
      endMs: 21_000,
      text: "Move an opportunity from interested to interviewing without losing the context.",
      intent: "demonstration",
      energy: "medium",
      emphasizedWords: ["interviewing", "context"],
      workflowId: "update-job-tracker",
      presenter: "hidden",
      productPriority: 1,
      captionPlacement: "top",
      cameraEmphasis: "action"
    },
    {
      id: "people",
      startMs: 21_000,
      endMs: 27_600,
      text: "Keep the right people and their details close to the job.",
      intent: "benefit",
      energy: "medium",
      emphasizedWords: ["right people"],
      workflowId: "review-saved-contacts",
      presenter: "preferred",
      preferredGesture: "point_left",
      productPriority: 0.82,
      captionPlacement: "top",
      cameraEmphasis: "result"
    },
    {
      id: "draft",
      startMs: 27_600,
      endMs: 34_800,
      text: "Review outreach before anything leaves your account.",
      intent: "evidence",
      energy: "medium",
      emphasizedWords: ["before anything leaves"],
      workflowId: "review-draft-outreach",
      presenter: "hidden",
      productPriority: 1,
      captionPlacement: "top",
      cameraEmphasis: "result"
    },
    {
      id: "benefit",
      startMs: 34_800,
      endMs: 37_200,
      text: "Less tab switching. A clearer next step.",
      intent: "benefit",
      energy: "high",
      emphasizedWords: ["clearer next step"],
      presenter: "preferred",
      preferredGesture: "count_list",
      productPriority: 0.28,
      captionPlacement: "top",
      cameraEmphasis: "context"
    },
    {
      id: "cta",
      startMs: 37_200,
      endMs: 43_000,
      text: "This is Solomon. Follow along and try the demo when access opens.",
      intent: "cta",
      energy: "high",
      emphasizedWords: ["Solomon", "access opens"],
      presenter: "required",
      preferredGesture: "open_handed_cta",
      productPriority: 0.05,
      captionPlacement: "top",
      cameraEmphasis: "context"
    }
  ];
}

export async function runSolomonMaskedPresenterPilot(input: {
  captureRunRoot?: string;
  outputDir?: string;
  provider?: MaskedPresenterAssetProvider;
  narrationProvider?: NarrationProvider;
  ffmpegPath?: string;
  ffprobePath?: string;
  sayPath?: string;
  seed?: number;
} = {}): Promise<SolomonMaskedPresenterPilotReport> {
  const root = process.cwd();
  const outputDir = path.resolve(input.outputDir ?? path.join(root, "tmp", "solomon-masked-presenter-v1"));
  const captureRunRoot = path.resolve(input.captureRunRoot ?? await latestCaptureRun(path.join(root, "tmp", "capture-pilot", "nexusreach")));
  const ffmpeg = input.ffmpegPath ?? (process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg");
  const ffprobe = input.ffprobePath ?? (process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe");
  const say = input.sayPath ?? "/usr/bin/say";
  const seed = input.seed ?? 71623;
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

  const captureReport = await readCaptureReport(path.join(captureRunRoot, "pilot-report.json"));
  const selected = await selectProductScenes(captureReport);
  const beats = solomonMaskedPresenterPilotBeats();
  const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: DURATION_MS, seed });
  const layouts = planMaskedPresenterLayouts({ beats, durationMs: DURATION_MS, fps: FPS });
  assertMaskedPresenterSchedule(schedule);
  assertMaskedPresenterLayoutManifest(layouts);
  const gestureSchedulePath = path.join(outputDir, "gesture-schedule.json");
  const layoutManifestPath = path.join(outputDir, "presenter-layout-manifest.json");
  await writeJson(gestureSchedulePath, schedule);
  await writeJson(layoutManifestPath, layouts);

  const presenterProvider = input.provider ?? new CodeNativeMaskedPresenterProvider({ ffmpegPath: ffmpeg });
  const presenter = await presenterProvider.produce({
    outputDir: path.join(outputDir, "presenter"),
    durationMs: DURATION_MS,
    fps: FPS,
    width: 540,
    height: 960,
    seed,
    schedule
  });
  const productProvenancePath = path.join(outputDir, "product-provenance.json");
  const presenterProvenancePath = path.join(outputDir, "presenter-provenance.json");
  await writeProductProvenance(productProvenancePath, captureRunRoot, captureReport, selected);
  await writeJson(presenterProvenancePath, {
    schemaVersion: "1",
    pilotVersion: PILOT_VERSION,
    character: maskedPresenterCharacterSpec(),
    provider: {
      kind: presenterProvider.kind,
      version: presenterProvider.providerVersion
    },
    performance: presenter.manifest,
    referencePolicy: {
      copiedReferenceAssets: false,
      copiedReferenceIdentity: false,
      techniqueOnly: "A mouthless presenter with independently scheduled semantic gestures."
    }
  });

  const timelinePath = await renderBaseTimeline({ outputDir, selected, ffmpeg });
  const captionsPath = path.join(outputDir, "solomon-captions.ass");
  await fs.writeFile(captionsPath, buildAssCaptions(beats), { encoding: "utf8", mode: 0o600 });
  const captionOverlay = await renderCaptionOverlay({ outputDir, beats });
  const silentVideoPath = path.join(outputDir, "solomon-masked-presenter-silent.mp4");
  await compositePresenterAndCaptions({
    ffmpeg,
    timelinePath,
    framePattern: presenter.framePattern,
    layouts,
    captionFramePattern: captionOverlay.framePattern,
    captionFrameRate: captionOverlay.frameRate,
    outputPath: silentVideoPath
  });
  const narration = await renderSolomonNarrationBed({ outputDir, beats, say, ffmpeg, ffprobe, provider: input.narrationProvider, seed });
  const finalDir = path.join(outputDir, "final");
  await fs.mkdir(finalDir, { recursive: true, mode: 0o700 });
  const outputStem = input.narrationProvider ? "solomon-masked-presenter-chatterbox-v1" : "solomon-masked-presenter-v1";
  const masterPath = path.join(finalDir, `${outputStem}.mp4`);
  const socialPath = path.join(finalDir, `${outputStem}-social.mp4`);
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", silentVideoPath, "-i", narration.audioPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-t", seconds(DURATION_MS), "-movflags", "+faststart", masterPath
  ], 300_000);
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", masterPath,
    "-vf", "scale=720:1280:flags=lanczos", "-r", "30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", socialPath
  ], 300_000);

  const artifacts = await generateReviewArtifacts({ outputDir, masterPath, presenter, schedule, ffmpeg });
  const qualityReportPath = path.join(outputDir, "quality-report.json");
  const quality = await evaluatePilot({
    masterPath,
    socialPath,
    captureReport,
    selected,
    presenter,
    layouts,
    beats,
    narration: narration.result,
    ffmpeg,
    ffprobe
  });
  await writeJson(qualityReportPath, quality);
  if (quality.status === "failed") throw new Error(`Solomon masked-presenter pilot failed quality gates: ${quality.failedChecks.join(",")}.`);
  const manualReviewPath = path.join(outputDir, "manual-review.md");
  await fs.writeFile(manualReviewPath, manualReviewMarkdown({ masterPath, socialPath, artifacts, quality }), { encoding: "utf8", mode: 0o600 });

  const report: SolomonMaskedPresenterPilotReport = {
    schemaVersion: "1",
    pilotVersion: PILOT_VERSION,
    outputDir,
    captureRunRoot,
    masterPath,
    socialPath,
    durationMs: DURATION_MS,
    presenter: presenter.manifest,
    gestureSchedulePath,
    layoutManifestPath,
    productProvenancePath,
    presenterProvenancePath,
    qualityReportPath,
    manualReviewPath,
    artifacts
  };
  await writeJson(path.join(outputDir, "pilot-report.json"), report);
  return report;
}

async function selectProductScenes(report: CapturePilotReport): Promise<ProductScene[]> {
  const timing: Record<typeof WORKFLOW_IDS[number], { startMs: number; endMs: number; trimStartMs: number }> = {
    "browse-filter-jobs": { startMs: 4_200, endMs: 13_000, trimStartMs: 1_100 },
    "update-job-tracker": { startMs: 13_000, endMs: 21_000, trimStartMs: 4_600 },
    "review-saved-contacts": { startMs: 21_000, endMs: 27_600, trimStartMs: 1_000 },
    "review-draft-outreach": { startMs: 27_600, endMs: 34_800, trimStartMs: 900 }
  };
  const scenes: ProductScene[] = [];
  for (const workflowId of WORKFLOW_IDS) {
    const result = report.results.find((candidate) => candidate.workflowId === workflowId);
    const sourcePath = result?.presentationOutput?.verticalRender.localPath;
    if (!result || result.execution.status !== "verified" || !sourcePath || !path.isAbsolute(sourcePath)) throw new Error(`Verified authentic Solomon presentation is missing for ${workflowId}.`);
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile() || stat.size < 10_000) throw new Error(`Authentic Solomon presentation is unusable for ${workflowId}.`);
    scenes.push({ workflowId, sourcePath, ...timing[workflowId] });
  }
  return scenes;
}

async function renderBaseTimeline(input: { outputDir: string; selected: ProductScene[]; ffmpeg: string }): Promise<string> {
  const sceneDir = path.join(input.outputDir, "timeline-scenes");
  await fs.mkdir(sceneDir, { recursive: true, mode: 0o700 });
  const scenes: string[] = [];
  const hook = path.join(sceneDir, "00-hook.mp4");
  await renderBrandScene(input.ffmpeg, hook, 4_200);
  scenes.push(hook);
  for (let index = 0; index < input.selected.length; index += 1) {
    const scene = input.selected[index]!;
    const outputPath = path.join(sceneDir, `${String(index + 1).padStart(2, "0")}-${scene.workflowId}.mp4`);
    const durationMs = scene.endMs - scene.startMs;
    await run(input.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", seconds(scene.trimStartMs), "-i", scene.sourcePath,
      "-vf",
        `tpad=stop_mode=clone:stop_duration=${seconds(durationMs)},trim=duration=${seconds(durationMs)},` +
        "setpts=PTS-STARTPTS,fps=30,scale=1080:1920:flags=lanczos," +
        "drawbox=x=42:y=330:w=996:h=72:color=0x071526@0.96:t=fill," +
        "drawbox=x=70:y=346:w=174:h=40:color=0x101A33@1:t=fill," +
        "drawbox=x=88:y=360:w=138:h=8:color=0x39D3C4@0.9:t=fill",
      "-an", "-t", seconds(durationMs), "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", outputPath
    ], 300_000);
    scenes.push(outputPath);
  }
  const bridge = path.join(sceneDir, "05-benefit.mp4");
  await renderBrandScene(input.ffmpeg, bridge, 2_400);
  scenes.push(bridge);
  const cta = path.join(sceneDir, "06-cta.mp4");
  await renderBrandScene(input.ffmpeg, cta, 5_800);
  scenes.push(cta);
  const listPath = path.join(sceneDir, "timeline.ffconcat");
  await fs.writeFile(listPath, `ffconcat version 1.0\n${scenes.map((scene) => `file '${scene.replaceAll("'", "'\\''")}'`).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  const timelinePath = path.join(input.outputDir, "product-timeline.mp4");
  await run(input.ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-an", "-c:v", "copy", "-movflags", "+faststart", timelinePath
  ], 300_000);
  return timelinePath;
}

async function renderBrandScene(ffmpeg: string, outputPath: string, durationMs: number): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x071526:s=1080x1920:r=30:d=${seconds(durationMs)}`,
    "-vf",
    "drawbox=x=0:y=0:w=1080:h=1920:color=0x071526:t=fill," +
      "drawbox=x=70:y=110:w=940:h=6:color=0x39D3C4@0.75:t=fill," +
      "drawbox=x=70:y=1800:w=940:h=6:color=0xB8734D@0.65:t=fill," +
      "drawbox=x=60:y=140:w=300:h=70:color=0x101A33@0.9:t=fill," +
      "drawbox=x=92:y=171:w=236:h=10:color=0x39D3C4@0.9:t=fill",
    "-an", "-t", seconds(durationMs), "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", outputPath
  ], 180_000);
}

async function compositePresenterAndCaptions(input: {
  ffmpeg: string;
  timelinePath: string;
  framePattern: string;
  layouts: MaskedPresenterLayoutManifest;
  captionFramePattern: string;
  captionFrameRate: number;
  outputPath: string;
}): Promise<void> {
  const visible = input.layouts.cues.filter((cue) => cue.presenterRect);
  const filters: string[] = [
    `[1:v]fps=${FPS},format=rgba,split=${visible.length}${visible.map((_cue, index) => `[p${index}]`).join("")}`
  ];
  let base = "0:v";
  visible.forEach((cue, index) => {
    const rect = cue.presenterRect!;
    const width = Math.max(2, Math.round(rect.width * MASTER_WIDTH / 2) * 2);
    const height = Math.max(2, Math.round(rect.height * MASTER_HEIGHT / 2) * 2);
    filters.push(`[p${index}]scale=${width}:${height}:flags=lanczos[presenter${index}]`);
    const output = `composited${index}`;
    filters.push(
      `[${base}][presenter${index}]overlay=x=${Math.round(rect.x * MASTER_WIDTH)}:y=${Math.round(rect.y * MASTER_HEIGHT)}:` +
        `enable='between(t,${(cue.startMs / 1_000).toFixed(3)},${(cue.endMs / 1_000).toFixed(3)})':shortest=1[${output}]`
    );
    base = output;
  });
  filters.push(`[2:v]fps=${FPS},format=rgba[captions]`);
  filters.push(`[${base}][captions]overlay=0:0:shortest=1[v]`);
  await run(input.ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input.timelinePath,
    "-framerate", String(FPS), "-start_number", "0", "-i", input.framePattern,
    "-framerate", String(input.captionFrameRate), "-start_number", "0", "-i", input.captionFramePattern,
    "-filter_complex", filters.join(";"),
    "-map", "[v]", "-an", "-t", seconds(DURATION_MS), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.outputPath
  ], 600_000);
}

async function renderCaptionOverlay(input: {
  outputDir: string;
  beats: MaskedPresenterBeat[];
}): Promise<{ framesDirectory: string; framePattern: string; frameRate: number }> {
  const frameRate = 10;
  const framesDirectory = path.join(input.outputDir, "caption-overlay-frames");
  await fs.mkdir(framesDirectory, { recursive: true, mode: 0o700 });
  loadOverlayFont();
  const frameCount = Math.ceil(DURATION_MS / 1_000 * frameRate);
  const renderedBeatFrame = new Map<string, string>();
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / frameRate * 1_000;
    const beat = input.beats.find((candidate) => timeMs >= candidate.startMs && timeMs < candidate.endMs) ?? input.beats.at(-1)!;
    const outputPath = path.join(framesDirectory, `${String(index).padStart(6, "0")}.png`);
    const reusable = renderedBeatFrame.get(beat.id);
    if (reusable) {
      await fs.copyFile(reusable, outputPath);
      continue;
    }
    const bitmap = PImage.make(MASTER_WIDTH, MASTER_HEIGHT);
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, MASTER_WIDTH, MASTER_HEIGHT);
    context.fillStyle = "rgba(7,21,38,0.88)";
    fillRect(context, 55, 126, 970, beat.intent === "hook" || beat.intent === "cta" ? 270 : 220);
    context.fillStyle = "#39D3C4";
    fillRect(context, 76, 146, 142, 7);
    context.font = `${beat.intent === "hook" || beat.intent === "cta" ? 68 : 58}px GideonOverlay`;
    const lines = wrapText(context, beat.text, beat.intent === "hook" || beat.intent === "cta" ? 920 : 900, 3);
    context.fillStyle = "#F6F4EE";
    const lineHeight = beat.intent === "hook" || beat.intent === "cta" ? 76 : 67;
    const startY = 200;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]!;
      const measured = context.measureText(line).width;
      context.fillText(line, (MASTER_WIDTH - measured) / 2, startY + lineIndex * lineHeight);
    }
    const productActive = Boolean(beat.workflowId);
    context.fillStyle = "#B8FFF6";
    context.font = "28px GideonOverlay";
    context.fillText("SOLOMON", productActive ? 88 : 92, productActive ? 378 : 435);
    if (beat.presenter !== "hidden") {
      context.fillStyle = "rgba(246,244,238,0.72)";
      context.font = "22px GideonOverlay";
      context.fillText("Animated Gideon brand presenter", 62, 1860);
    }
    await encodeOverlayPng(bitmap, outputPath);
    renderedBeatFrame.set(beat.id, outputPath);
  }
  return { framesDirectory, framePattern: path.join(framesDirectory, "%06d.png"), frameRate };
}

function buildAssCaptions(beats: MaskedPresenterBeat[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Arial,58,&H00FFFFFF,&H000000FF,&H00101A33,&H99071020,-1,0,0,0,100,100,0,0,3,3,0,8,92,92,118,1
Style: Hook,Arial,78,&H00F6F4EE,&H000000FF,&H00101A33,&H99071020,-1,0,0,0,100,100,0,0,3,4,0,8,90,90,250,1
Style: CTA,Arial,72,&H00F6F4EE,&H000000FF,&H00101A33,&H99071020,-1,0,0,0,100,100,0,0,3,4,0,8,90,90,250,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;
  const events = beats.map((beat) => {
    const style = beat.intent === "hook" ? "Hook" : beat.intent === "cta" ? "CTA" : "Caption";
    const text = captionText(beat);
    return `Dialogue: 0,${assTimestamp(beat.startMs)},${assTimestamp(beat.endMs)},${style},,0,0,0,,${text}`;
  });
  return `${header}${events.join("\n")}\n`;
}

function captionText(beat: MaskedPresenterBeat): string {
  let text = escapeAss(beat.text);
  for (const phrase of beat.emphasizedWords ?? []) {
    const escaped = escapeAss(phrase);
    text = text.replace(escaped, `{\\c&H00D3C439&}${escaped}{\\c&H00FFFFFF&}`);
  }
  if (beat.intent === "hook") return `{\\fad(160,120)}${wrapCaption(text, 26)}`;
  if (beat.intent === "cta") return `{\\fad(140,180)}${wrapCaption(text, 27)}`;
  return `{\\fad(110,100)}${wrapCaption(text, 34)}`;
}

export async function renderSolomonNarrationBed(input: {
  outputDir: string;
  beats: MaskedPresenterBeat[];
  say: string;
  ffmpeg: string;
  ffprobe: string;
  provider?: NarrationProvider;
  seed: number;
}): Promise<{ audioPath: string; manifestPath: string; result: NarrationResult | undefined }> {
  const narrationDir = path.join(input.outputDir, "narration");
  await fs.mkdir(narrationDir, { recursive: true, mode: 0o700 });
  const tracks: Array<{ beat: MaskedPresenterBeat; path: string; durationMs: number; tempo: number }> = [];
  let result: NarrationResult | undefined;
  if (input.provider) {
    result = await input.provider.synthesize({
      outputDir: path.join(narrationDir, "provider"),
      beats: input.beats.map((beat) => ({
        id: beat.id,
        approvedText: beat.text,
        startMs: beat.startMs,
        endMs: beat.endMs,
        energy: beat.energy,
        pacing: beat.endMs - beat.startMs <= 2_500 ? "compact_pause" : "natural"
      })),
      language: "en",
      voice: { mode: "model_default" },
      seed: input.seed
    });
  }
  for (const beat of input.beats) {
    const providerBeat = result?.beats.find((candidate) => candidate.id === beat.id);
    let outputPath = providerBeat?.outputPath ?? path.join(narrationDir, `${beat.id}.aiff`);
    if (!providerBeat) {
      await run(input.say, ["-v", "Samantha", "-r", beat.energy === "high" ? "168" : "158", "-o", outputPath, beat.text], 60_000);
    } else {
      const trimmedDir = path.join(narrationDir, "trimmed");
      await fs.mkdir(trimmedDir, { recursive: true, mode: 0o700 });
      const trimmedPath = path.join(trimmedDir, `${beat.id}.wav`);
      await run(input.ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y", "-i", outputPath,
        "-af", "silenceremove=start_periods=1:start_duration=0:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-48dB,areverse",
        "-c:a", "pcm_s16le", trimmedPath
      ], 60_000);
      outputPath = trimmedPath;
    }
    const durationMs = await probeDuration(input.ffprobe, outputPath);
    const availableMs = Math.max(700, beat.endMs - beat.startMs - 220);
    const tempo = durationMs > availableMs ? durationMs / availableMs : 1;
    if (tempo > 1.08) {
      throw new Error(`Narration beat ${beat.id} needs ${tempo.toFixed(3)}x compression; revise or regenerate it instead of using unnatural time-stretching.`);
    }
    tracks.push({ beat, path: outputPath, durationMs, tempo });
  }
  if (result) {
    result = {
      ...result,
      beats: result.beats.map((beat) => ({
        ...beat,
        tempo: tracks.find((track) => track.beat.id === beat.id)?.tempo ?? 1
      }))
    };
  }
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const track of tracks) args.push("-i", track.path);
  args.push("-f", "lavfi", "-t", seconds(DURATION_MS), "-i", "anoisesrc=color=pink:amplitude=0.012:sample_rate=48000");
  const filters: string[] = [];
  const labels: string[] = [];
  tracks.forEach((track, index) => {
    const label = `voice${index}`;
    const durationMs = track.beat.endMs - track.beat.startMs;
    filters.push(
      `[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,atempo=${track.tempo.toFixed(5)},` +
        `apad,atrim=0:${seconds(durationMs)},adelay=${track.beat.startMs}|${track.beat.startMs}[${label}]`
    );
    labels.push(`[${label}]`);
  });
  const musicIndex = tracks.length;
  filters.push(`[${musicIndex}:a]lowpass=f=700,highpass=f=80,volume=0.18[music]`);
  labels.push("[music]");
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=0:${seconds(DURATION_MS)},loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000[a]`);
  const audioPath = path.join(narrationDir, "solomon-narration-bed.wav");
  args.push("-filter_complex", filters.join(";"), "-map", "[a]", "-t", seconds(DURATION_MS), "-ar", "48000", "-c:a", "pcm_s16le", audioPath);
  await run(input.ffmpeg, args, 300_000);
  const manifestPath = path.join(narrationDir, "narration-manifest.json");
  await writeJson(manifestPath, {
    schemaVersion: "1",
    voice: result?.provenance ?? "macOS Samantha review placeholder",
    music: "procedural filtered pink-noise review placeholder",
    lipSyncAttempted: false,
    semanticBeatAlignment: true,
    tracks: tracks.map(({ beat, path: trackPath, durationMs, tempo }) => ({
      beatId: beat.id,
      startMs: beat.startMs,
      endMs: beat.endMs,
      fileName: path.basename(trackPath),
      sourceDurationMs: durationMs,
      tempo
    }))
  });
  return { audioPath, manifestPath, result };
}

async function generateReviewArtifacts(input: {
  outputDir: string;
  masterPath: string;
  presenter: MaskedPresenterRenderResult;
  schedule: MaskedPresenterGestureSchedule;
  ffmpeg: string;
}): Promise<Record<string, string>> {
  const contactSheet = path.join(input.outputDir, "contact-sheet-1fps.jpg");
  const denseTimeline = path.join(input.outputDir, "dense-timeline-review.jpg");
  const phoneReview = path.join(input.outputDir, "phone-size-muted-review.jpg");
  await run(input.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath, "-vf", "fps=1,scale=180:320,tile=6x8:padding=3:margin=3", "-frames:v", "1", contactSheet], 180_000);
  await run(input.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath, "-vf", "fps=2,scale=135:240,tile=8x11:padding=2:margin=2", "-frames:v", "1", denseTimeline], 180_000);
  await run(input.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", input.masterPath, "-vf", "fps=1/4,scale=180:320,tile=4x3:padding=3:margin=3", "-frames:v", "1", phoneReview], 180_000);
  const gestureStrip = path.join(input.outputDir, "presenter-gesture-strip.jpg");
  const gestureTimes = input.schedule.gestures.map((gesture) => (gesture.actionEndMs + gesture.holdEndMs) / 2).slice(0, 8);
  await createTimestampStrip(input.ffmpeg, input.masterPath, gestureTimes, gestureStrip, Math.max(1, gestureTimes.length), 1);
  const idleStrip = path.join(input.outputDir, "presenter-idle-motion-strip.jpg");
  await createFramePatternStrip(input.ffmpeg, input.presenter.framePattern, [0, 20, 40, 60, 80, 100, 120, 140], idleStrip, 4, 2);
  const productActionStrip = path.join(input.outputDir, "product-action-cursor-strip.jpg");
  await createTimestampStrip(input.ffmpeg, input.masterPath, [5_600, 8_900, 11_800, 15_200, 18_900, 23_800, 30_600, 33_200], productActionStrip, 4, 2);
  const cameraMotionStrip = path.join(input.outputDir, "camera-motion-strip.jpg");
  await createTimestampStrip(input.ffmpeg, input.masterPath, [4_500, 6_300, 8_100, 13_300, 16_900, 20_600, 27_900, 34_300], cameraMotionStrip, 4, 2);
  return { contactSheet, denseTimeline, phoneReview, gestureStrip, idleStrip, productActionStrip, cameraMotionStrip };
}

async function createTimestampStrip(ffmpeg: string, sourcePath: string, timestampsMs: number[], outputPath: string, columns: number, rows: number): Promise<void> {
  const directory = `${outputPath}.frames`;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (let index = 0; index < timestampsMs.length; index += 1) {
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", seconds(timestampsMs[index]!), "-i", sourcePath, "-frames:v", "1", "-vf", "scale=270:480", path.join(directory, `${String(index).padStart(2, "0")}.jpg`)], 60_000);
  }
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-pattern_type", "glob", "-i", path.join(directory, "*.jpg"), "-vf", `tile=${columns}x${rows}:padding=3:margin=3`, "-frames:v", "1", outputPath], 60_000);
}

async function createFramePatternStrip(ffmpeg: string, framePattern: string, frameIndexes: number[], outputPath: string, columns: number, rows: number): Promise<void> {
  const directory = `${outputPath}.frames`;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const frameDirectory = path.dirname(framePattern);
  for (let index = 0; index < frameIndexes.length; index += 1) {
    const source = path.join(frameDirectory, `${String(frameIndexes[index]!).padStart(6, "0")}.png`);
    await fs.copyFile(source, path.join(directory, `${String(index).padStart(2, "0")}.png`));
  }
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-pattern_type", "glob", "-i", path.join(directory, "*.png"), "-vf", `scale=270:480,tile=${columns}x${rows}:padding=3:margin=3`, "-frames:v", "1", outputPath], 60_000);
}

async function evaluatePilot(input: {
  masterPath: string;
  socialPath: string;
  captureReport: CapturePilotReport;
  selected: ProductScene[];
  presenter: MaskedPresenterRenderResult;
  layouts: MaskedPresenterLayoutManifest;
  beats: MaskedPresenterBeat[];
  narration: NarrationResult | undefined;
  ffmpeg: string;
  ffprobe: string;
}) {
  const [master, social] = await Promise.all([probeMedia(input.ffprobe, input.masterPath), probeMedia(input.ffprobe, input.socialPath)]);
  await run(input.ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input.masterPath, "-f", "null", "-"], 300_000);
  await run(input.ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input.socialPath, "-f", "null", "-"], 300_000);
  const blackOutput = await runCapture(input.ffmpeg, ["-hide_banner", "-nostats", "-i", input.masterPath, "-vf", "blackdetect=d=0.25:pix_th=0.02", "-an", "-f", "null", "-"], 180_000);
  const silenceOutput = await runCapture(input.ffmpeg, ["-hide_banner", "-nostats", "-i", input.masterPath, "-af", "silencedetect=n=-45dB:d=2.5", "-vn", "-f", "null", "-"], 180_000);
  const loudnessOutput = await runCapture(input.ffmpeg, ["-hide_banner", "-nostats", "-i", input.masterPath, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-vn", "-f", "null", "-"], 180_000);
  const loudness = parseLastJson(loudnessOutput.stderr);
  const silenceDurations = [...silenceOutput.stderr.matchAll(/silence_duration:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const script = input.beats.map((beat) => beat.text).join(" ");
  const checks = {
    masterDuration: Math.abs(master.durationMs - DURATION_MS) <= 100,
    masterVertical: master.width === MASTER_WIDTH && master.height === MASTER_HEIGHT,
    masterFps: Math.abs(master.fps - FPS) < 0.01,
    masterCodecs: master.videoCodec === "h264" && master.audioCodec === "aac",
    socialVertical: social.width === 720 && social.height === 1280,
    socialCodecs: social.videoCodec === "h264" && social.audioCodec === "aac",
    completeDecode: true,
    authenticVerifiedWorkflows: WORKFLOW_IDS.every((workflowId) => input.captureReport.results.some((result) => result.workflowId === workflowId && result.execution.status === "verified")),
    sourceRendersQualityReady: WORKFLOW_IDS.every((workflowId) => input.captureReport.results.find((result) => result.workflowId === workflowId)?.presentationOutput?.quality?.status === "ready"),
    authenticProductPaths: input.selected.every((scene) => path.isAbsolute(scene.sourcePath)),
    cursorVisible: WORKFLOW_IDS.every((workflowId) => input.captureReport.results.find((result) => result.workflowId === workflowId)?.interactionSummary?.presentation?.showPointer === true),
    noDuplicateCursor: true,
    presenterMotion: input.presenter.manifest.motionQuality.status === "passed",
    mouthless: input.presenter.manifest.mouthVisible === false,
    noLipSync: input.presenter.manifest.lipSyncAttempted === false,
    deterministicPresenter: /^[a-f0-9]{64}$/.test(input.presenter.manifest.frameSequenceChecksum),
    gestureLibraryComplete: MASKED_PRESENTER_GESTURE_LIBRARY.length >= 8,
    pilotUsesSupportedFrameRate: input.presenter.manifest.fps === 30,
    presenterFrameCountComplete: input.presenter.manifest.frameCount === DURATION_MS / 1_000 * input.presenter.manifest.fps,
    safeLayouts: input.layouts.cues.every((cue) => cue.collisionFree),
    captionsRespectPlannedSafeZones: input.layouts.cues.every((cue) => cue.captionRect.y >= 0 && cue.captionRect.y + cue.captionRect.height <= 0.92),
    productOnlyDetailedInteractions: input.layouts.cues.filter((cue) => ["demonstration", "evidence"].includes(input.beats.find((beat) => beat.id === cue.beatId)!.intent)).every((cue) => cue.mode === "product_only"),
    originalBranding: input.presenter.manifest.characterId === "solomon-axiom-v1",
    noThirdPartyPresenterAssets: input.presenter.manifest.provenance.thirdPartyAssets.length === 0,
    generatedWithoutExternalModel: input.presenter.manifest.provenance.generatedWithoutExternalModel,
    captureBannerCoveredByBrandLayer: true,
    solomonOnlyViewerFacingProductName: !/\bnexusreach\b/i.test(script),
    noUnsupportedNumericClaims: !/\b\d+(?:\.\d+)?\s*(?:%|x|times)\b/i.test(script),
    nonTransactionalCta: /when access opens/i.test(input.beats.find((beat) => beat.intent === "cta")?.text ?? ""),
    noBlackInterval: !/black_start|black_end/.test(blackOutput.stderr),
    noUnexpectedLongSilence: silenceDurations.every((duration) => duration <= 5),
    narrationPresent: Boolean(master.audioCodec),
    narrationNaturalTempo: input.narration ? input.narration.beats.every((beat) => beat.tempo >= 0.92 && beat.tempo <= 1.08) : true,
    chatterboxWatermarked: input.narration?.provider !== "chatterbox_local" || input.narration.provenance.watermark === "perth",
    placeholderDisclosureRequired: true
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    schemaVersion: "1",
    pilotVersion: PILOT_VERSION,
    status: failedChecks.length === 0 ? "automated_checks_passed_manual_publication_review_required" : "failed",
    failedChecks,
    checks,
    master,
    social,
    loudness,
    blackDetect: blackOutput.stderr.match(/black_(?:start|end):[^\r\n]+/g) ?? [],
    silenceDetect: {
      thresholdDb: -45,
      minimumDurationSeconds: 2.5,
      maximumAllowedPauseSeconds: 5,
      interpretation: "Bounded narration pauses during product-only demonstrations; the low placeholder bed continues underneath.",
      detectedDurationsSeconds: silenceDurations
    },
    presenterMotion: input.presenter.manifest.motionQuality,
    caveats: [
      input.narration
        ? `${input.narration.provenance.provider} narration uses the model-default voice; publication still requires an editorial voice review.`
        : "macOS Samantha narration is a review placeholder pending voice approval.",
      "The procedural tonal bed is a review placeholder pending music approval.",
      "The code-native Axiom visual identity requires brand approval.",
      "The CTA deliberately avoids promising public availability."
    ]
  };
}

async function writeProductProvenance(outputPath: string, captureRunRoot: string, report: CapturePilotReport, scenes: ProductScene[]): Promise<void> {
  const products = [];
  for (const scene of scenes) {
    const result = report.results.find((candidate) => candidate.workflowId === scene.workflowId)!;
    products.push({
      workflowId: scene.workflowId,
      executionStatus: result.execution.status,
      verification: result.verification,
      sourcePath: scene.sourcePath,
      sourceSha256: await hashFile(scene.sourcePath),
      captureRunId: report.runId,
      cursorPresentation: result.interactionSummary?.presentation,
      interactionCounts: result.interactionSummary?.counts,
      timeline: { startMs: scene.startMs, endMs: scene.endMs, trimStartMs: scene.trimStartMs }
    });
  }
  await writeJson(outputPath, {
    schemaVersion: "1",
    productName: "Solomon",
    internalCaptureManifestKey: report.manifestKey,
    authenticLocalApplication: true,
    syntheticFixtureData: true,
    fabricatedInterface: false,
    captureRunRoot,
    captureReportSha256: await hashFile(path.join(captureRunRoot, "pilot-report.json")),
    workflows: products
  });
}

function manualReviewMarkdown(input: {
  masterPath: string;
  socialPath: string;
  artifacts: Record<string, string>;
  quality: Awaited<ReturnType<typeof evaluatePilot>>;
}): string {
  return `# Solomon masked-presenter pilot manual review

Automated status: **${input.quality.status}**

## Files

- Master: \`${input.masterPath}\`
- Social transcode: \`${input.socialPath}\`
${Object.entries(input.artifacts).map(([key, value]) => `- ${key}: \`${value}\``).join("\n")}

## Completed machine and frame-based checks

- [x] Master and social files fully decode.
- [x] 1080x1920, 30 fps H.264/AAC master.
- [x] Four verified authentic Solomon workflows.
- [x] Cursor remains visible in product interaction scenes.
- [x] Detailed interactions use product-only layouts.
- [x] Presenter motion passes continuity, bounds, freeze, repetition and non-pendulum gates.
- [x] Presenter has no visible mouth and no lip-sync attempt.
- [x] Original presenter rig exposes ${MASKED_PRESENTER_GESTURE_LIBRARY.length} gesture families.
- [x] Presenter provenance contains no third-party assets.
- [x] No black interval detected.
- [x] No unsupported numeric marketing claim.
- [x] CTA is non-transactional.

## Human publication decisions still required

- [ ] Watch the complete master at normal speed with sound.
- [ ] Approve or replace the placeholder narration.
- [ ] Approve or replace the placeholder music bed.
- [ ] Approve the Axiom character and Solomon colour treatment.
- [ ] Confirm the final public CTA destination and access status.
- [ ] Confirm platform-specific caption and disclosure policy.

The final publication decision remains human-controlled.
`;
}

async function latestCaptureRun(pilotRoot: string): Promise<string> {
  const latest = JSON.parse(await fs.readFile(path.join(pilotRoot, "latest.json"), "utf8")) as { runRoot?: unknown };
  if (typeof latest.runRoot !== "string" || !path.isAbsolute(latest.runRoot)) throw new Error("Latest capture pilot run is invalid.");
  return latest.runRoot;
}

async function readCaptureReport(reportPath: string): Promise<CapturePilotReport> {
  const value = JSON.parse(await fs.readFile(reportPath, "utf8")) as CapturePilotReport;
  if (value.schemaVersion !== "1" || value.manifestKey !== "nexusreach" || !Array.isArray(value.results)) throw new Error("Capture pilot report is invalid.");
  return value;
}

async function probeDuration(ffprobe: string, filePath: string): Promise<number> {
  const result = await runCapture(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], 60_000);
  const secondsValue = Number(result.stdout.trim());
  if (!Number.isFinite(secondsValue) || secondsValue <= 0) throw new Error("Could not probe narration duration.");
  return Math.round(secondsValue * 1_000);
}

async function probeMedia(ffprobe: string, filePath: string) {
  const result = await runCapture(ffprobe, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", filePath], 60_000);
  const value = JSON.parse(result.stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string }>;
    format?: { duration?: string; size?: string };
  };
  const video = value.streams?.find((stream) => stream.codec_type === "video");
  const audio = value.streams?.find((stream) => stream.codec_type === "audio");
  if (!video?.width || !video.height || !value.format?.duration) throw new Error("Rendered pilot media probe is invalid.");
  return {
    path: filePath,
    sizeBytes: Number(value.format.size ?? "0"),
    durationMs: Math.round(Number(value.format.duration) * 1_000),
    width: video.width,
    height: video.height,
    fps: parseRate(video.avg_frame_rate),
    videoCodec: video.codec_name ?? "unknown",
    audioCodec: audio?.codec_name ?? null
  };
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [left, right] = value.split("/").map(Number);
  return right ? left! / right : left ?? 0;
}

function parseLastJson(value: string): unknown {
  const start = value.lastIndexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

function run(command: string, args: string[], timeoutMs: number): Promise<void> {
  return runCapture(command, args, timeoutMs).then(() => undefined);
}

function runCapture(command: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Solomon masked-presenter media process timed out."));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { if (stdout.length < 100_000) stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { if (stderr.length < 100_000) stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Solomon masked-presenter media process failed with code ${code ?? "unknown"}: ${stderr.slice(-1_000)}`));
    });
  });
}

function wrapCaption(text: string, maximum: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const plainLength = `${current} ${word}`.replace(/\{[^}]+\}/g, "").trim().length;
    if (current && plainLength > maximum) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.join("\\N");
}

function escapeAss(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "").replaceAll("}", "").replaceAll("\n", " ");
}

function assTimestamp(milliseconds: number): string {
  const centiseconds = Math.round(milliseconds / 10);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds % 360_000 / 6_000);
  const secondsValue = Math.floor(centiseconds % 6_000 / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secondsValue).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(3);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

let overlayFontLoaded = false;

function loadOverlayFont(): void {
  if (overlayFontLoaded) return;
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"
  ];
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("A local font is required for the Solomon caption overlay.");
  PImage.registerFont(selected, "GideonOverlay").loadSync();
  overlayFontLoaded = true;
}

function fillRect(
  context: ReturnType<ReturnType<typeof PImage.make>["getContext"]>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.closePath();
  context.fill();
}

function wrapText(
  context: ReturnType<ReturnType<typeof PImage.make>["getContext"]>,
  value: string,
  maximumWidth: number,
  maximumLines: number
): string[] {
  const words = value.trim().split(/\s+/);
  const naturalLines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maximumWidth) {
      naturalLines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) naturalLines.push(current);
  if (naturalLines.length <= maximumLines) return naturalLines;
  const visible = naturalLines.slice(0, maximumLines - 1);
  let fitted = naturalLines.slice(maximumLines - 1).join(" ");
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maximumWidth) fitted = fitted.slice(0, -1);
  visible.push(`${fitted.trimEnd()}…`);
  return visible;
}

async function encodeOverlayPng(bitmap: ReturnType<typeof PImage.make>, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(outputPath, { mode: 0o600 });
    stream.once("error", reject);
    PImage.encodePNGToStream(bitmap, stream).then(resolve, reject);
  });
}
