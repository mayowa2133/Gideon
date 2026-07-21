import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import * as PImage from "pureimage";
import type {
  AvatarModelReceipt,
  AvatarPerformanceMetadata,
  BrandKit,
  CaptionSegment,
  DetectedMoment,
  EditDecisionList,
  ProductProfile,
  ProductEvidenceAsset,
  RecordingMetadata,
  RenderFocusPoint,
  RenderOverlayCue,
  RenderValidation,
  SceneComposition,
  ScriptDraft
} from "../shared/types";
import { estimateScriptDurationMs } from "../shared/contentEngine";
import { validateCreativeBlueprint } from "../shared/creativeBlueprint";
import { calculateBlueprintLayout, choosePlacement } from "../shared/creatorVideoLayout";
import { inspectCreatorVideoTemporalQa } from "./creatorVideoTemporalQuality";
import { buildVisualReadinessQa, treatmentContentLines } from "./creatorVideoVisualReadiness";
import { executeSceneRenderCache, type SceneCacheContext } from "./sceneRenderCache";
import { checkViseme2dAssetPacks } from "./viseme2dAvatarWorker";
import { normalizePronunciationDictionary, pronunciationDictionaryHash } from "../shared/pronunciation";
import { CLICK_FEEDBACK_MS, easePointerPosition } from "../shared/creatorVideoInteraction";
import { createHash } from "node:crypto";
import {
  brandKitIdForProductName,
  buildEditDecisionList,
  buildEvidenceClaims,
  buildVisualBeatsForTemplate,
  fictionalAvatarPresenterCatalog,
  normalizeBrandKit,
  templateManifestId
} from "../shared/renderTemplates";

const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1000;
const SUPPORTED_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OVERLAY_FRAME_RATE = 4;
const overlayImageCache = new Map<string, Awaited<ReturnType<typeof PImage.decodePNGFromStream>>>();
let typographyReceipt: NonNullable<RenderValidation["typographyQa"]> | undefined;

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

export interface AvatarPresenterInput {
  path: string;
  provider: AvatarModelReceipt["provider"];
  backgroundType: AvatarPerformanceMetadata["backgroundType"];
  cropSafeRegion: AvatarPerformanceMetadata["cropSafeRegion"];
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
  avatarPresenter?: AvatarPresenterInput;
  /** @deprecated Use avatarPresenter so render metadata remains explicit. */
  avatarPresenterPath?: string;
  sceneIds?: string[];
  sceneCacheContext?: Partial<SceneCacheContext>;
  skipBlueprintValidation?: boolean;
  skipPostRenderQa?: boolean;
}

export async function getToolAvailability(): Promise<{
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  sayAvailable: boolean;
  localAvatar: {
    available: boolean;
    cueExtractorAvailable: boolean;
    primaryCueExtractorAvailable: boolean;
    fallbackCueExtractorAvailable: boolean;
    orbitPackAvailable: boolean;
    novaPackAvailable: boolean;
    message: string;
  };
}> {
  const [ffmpegAvailable, ffprobeAvailable, sayAvailable, packs] = await Promise.all([
    commandExists(resolveFfmpeg()),
    commandExists(resolveFfprobe()),
    commandExists("/usr/bin/say"),
    checkViseme2dAssetPacks(process.env.GIDEON_VISEME_ASSET_ROOT?.trim())
  ]);
  const available = ffmpegAvailable && ffprobeAvailable && packs.orbitPackAvailable && packs.novaPackAvailable;
  return {
    ffmpegAvailable,
    ffprobeAvailable,
    sayAvailable,
    localAvatar: {
      available,
      cueExtractorAvailable: true,
      primaryCueExtractorAvailable: false,
      fallbackCueExtractorAvailable: true,
      ...packs,
      message: available ? "Local animated presenters are ready and run without an API or GPU." : packs.message
    }
  };
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
  sceneCache?: import("../shared/types").SceneRenderCacheReport;
}> {
  const blueprint = input.script.creativeBlueprint ?? input.script.editDecisionList?.creativeBlueprint;
  if (blueprint && !input.skipBlueprintValidation) return renderDraftWithSceneCache(input, blueprint);
  return renderDraftWhole(input);
}

async function renderDraftWhole(input: RenderDraftInput): Promise<{
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
  const avatarPresenter = normalizedAvatarPresenter(input);
  const durationMs = Math.min(
    editDecisionList.durationMs,
    input.recording.durationMs,
    60_000
  );
  const timeline = buildVideoTimelineFilter(editDecisionList, input.recording.durationMs, durationMs, input.skipBlueprintValidation ? 0.1 : 8);
  const sourceDurationSec = timeline.durationSec;

  validateRenderManifest(editDecisionList, input.skipBlueprintValidation);
  const overlaySequence = await createTimedOverlaySequence(
    input.profile,
    input.script,
    editDecisionList,
    overlayDir,
    sourceDurationSec,
    Boolean(avatarPresenter)
  );
  validateOverlaySequenceForRender(overlaySequence, sourceDurationSec);
  const voiceCreated = input.voiceoverPath ? true : await createVoiceover(input.script.voiceoverText, voicePath);
  if (!voiceCreated && !input.voiceoverPath) {
    await createSilentAudio(audioPath, sourceDurationSec);
  }

  const audioInput = input.voiceoverPath ?? (voiceCreated ? voicePath : audioPath);
  const presenterInputIndex = avatarPresenter ? 2 : undefined;
  const audioInputIndex = avatarPresenter ? 3 : 2;
  const presenterFilters = presenterInputIndex
    ? buildGeneratedPresenterFilters(editDecisionList, presenterInputIndex, sourceDurationSec, avatarPresenter, "base_decorated")
    : { filters: [] as string[], outputLabel: "base" };
  const filter = [
    timeline.filter,
    "[1:v]fps=30,format=rgba[overlay]",
    avatarPresenter ? "[base][overlay]overlay=0:0:shortest=1[base_decorated]" : "[base][overlay]overlay=0:0:shortest=1[v]",
    ...presenterFilters.filters,
    ...(avatarPresenter ? [`[${presenterFilters.outputLabel}]null[v]`] : []),
    buildAudioMixFilter(editDecisionList, sourceDurationSec, audioInputIndex)
  ].join(";");

  const presenterInputArgs = avatarPresenter
    ? ["-stream_loop", "-1", "-i", avatarPresenter.path]
    : [];

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
    ...presenterInputArgs,
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

  if (!input.skipPostRenderQa) await normalizeRenderedAudio(outputPath);
  const validation = input.skipPostRenderQa ? await probeBasicRenderValidation(outputPath) : await validateRenderedVideo(outputPath, editDecisionList.creativeBlueprint, editDecisionList);
  validateRenderedTimeline(validation, sourceDurationSec);
  return {
    outputPath,
    outputUrl: pathToFileURL(outputPath).toString(),
    validation
  };
}

async function renderDraftWithSceneCache(input: RenderDraftInput, blueprint: import("../shared/types").CreativeBlueprint): Promise<{ outputPath: string; outputUrl: string; validation: RenderValidation; sceneCache: import("../shared/types").SceneRenderCacheReport }> {
  const renderDir = path.join(input.projectDir, "renders", input.script.id);
  const cacheDir = path.join(input.projectDir, "scene-cache", input.script.id);
  await fs.mkdir(renderDir, { recursive: true, mode: 0o700 });
  const outputPath = path.join(renderDir, safeFileName(`${input.title}.mp4`));
  const fullVoiceoverPath = await ensureSceneCacheVoiceover(input, cacheDir, blueprint.targetDurationMs / 1000);
  const editDecisionList = ensureEditDecisionList(input.profile, input.script, input.moment);
  validateRenderManifest(editDecisionList);
  const context: SceneCacheContext = {
    sourceRecordingHash: input.sceneCacheContext?.sourceRecordingHash ?? input.recording.sha256 ?? await hashFile(input.recording.filePath),
    productAssetHashes: input.sceneCacheContext?.productAssetHashes ?? Object.fromEntries(blueprint.productAssets.map((asset) => [asset.id, asset.contentHash ?? "unmaterialized"])),
    avatarHash: input.sceneCacheContext?.avatarHash ?? (normalizedAvatarPresenter(input) ? await hashFile(normalizedAvatarPresenter(input)!.path) : "deterministic-fixture"),
    narrationHash: input.sceneCacheContext?.narrationHash ?? await hashFile(fullVoiceoverPath),
    pronunciationDictionaryHash: input.sceneCacheContext?.pronunciationDictionaryHash ?? pronunciationDictionaryHash(normalizePronunciationDictionary(input.profile.pronunciationDictionary))
  };
  const sceneCache = await executeSceneRenderCache({
    scriptId: input.script.id,
    blueprint,
    cacheDir,
    outputPath,
    requestedSceneIds: input.sceneIds,
    context,
    renderSegment: async (scene, temporaryPath) => {
      const localized = localizeSceneRender(input.script, editDecisionList, blueprint, scene);
      const sceneAudio = path.join(cacheDir, `.audio-${safeFileName(scene.id)}-${process.pid}.m4a`);
      await runCommand(resolveFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", "-ss", (scene.startMs / 1000).toFixed(3), "-i", fullVoiceoverPath, "-t", ((scene.endMs - scene.startMs) / 1000).toFixed(3), "-c:a", "aac", "-b:a", "160k", sceneAudio]);
      try {
        const rendered = await renderDraftWhole({ ...input, projectDir: path.join(cacheDir, "work"), script: localized, title: scene.id, voiceoverPath: sceneAudio, sceneIds: undefined, skipBlueprintValidation: true, skipPostRenderQa: true });
        await fs.copyFile(rendered.outputPath, temporaryPath);
      } finally { await fs.rm(sceneAudio, { force: true }); }
    },
    spliceSegments: async (segmentPaths, temporaryOutput) => spliceSceneSegments(segmentPaths, temporaryOutput),
    validateSplice: async (temporaryOutput, entries) => validateSceneSplice(temporaryOutput, entries, blueprint)
  });
  await normalizeRenderedAudio(outputPath, blueprint.renderPolicy.targetLufs);
  const validation = await validateRenderedVideo(outputPath, blueprint, editDecisionList);
  validateRenderedTimeline(validation, blueprint.targetDurationMs / 1000);
  return { outputPath, outputUrl: pathToFileURL(outputPath).toString(), validation, sceneCache };
}

async function ensureSceneCacheVoiceover(input: RenderDraftInput, cacheDir: string, durationSec: number): Promise<string> {
  if (input.voiceoverPath) return input.voiceoverPath;
  await fs.mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const voicePath = path.join(cacheDir, "narration.aiff");
  if (await fileExists(voicePath)) return voicePath;
  if (!await createVoiceover(input.script.voiceoverText, voicePath)) {
    const silent = path.join(cacheDir, "narration.m4a");
    await createSilentAudio(silent, durationSec);
    return silent;
  }
  return voicePath;
}

function localizeSceneRender(script: ScriptDraft, edit: EditDecisionList, blueprint: import("../shared/types").CreativeBlueprint, scene: SceneComposition): ScriptDraft {
  const offset = scene.startMs; const duration = scene.endMs - scene.startMs;
  const shift = <T extends { startMs: number; endMs: number }>(cue: T): T => ({ ...cue, startMs: Math.max(0, cue.startMs - offset), endMs: Math.min(duration, cue.endMs - offset) });
  const sourceSegments = edit.sourceSegments.filter((segment) => segment.timelineEndMs > scene.startMs && segment.timelineStartMs < scene.endMs).map((segment) => ({ ...segment, timelineStartMs: Math.max(0, segment.timelineStartMs - offset), timelineEndMs: Math.min(duration, segment.timelineEndMs - offset) }));
  const localizeCaption = (caption: CaptionSegment): CaptionSegment => ({ ...shift(caption), words: caption.words?.filter((word) => word.endMs > offset && word.startMs < scene.endMs).map((word) => shift(word)) });
  const localScene: SceneComposition = { ...structuredClone(scene), startMs: 0, endMs: duration, captions: scene.captions.filter((caption) => caption.endMs > offset && caption.startMs < scene.endMs).map(localizeCaption), transition: { ...scene.transition }, audioCues: scene.audioCues.map((cue) => ({ ...cue, startMs: Math.max(0, cue.startMs - offset) })) };
  const localBlueprint = { ...structuredClone(blueprint), id: `${blueprint.id}:${scene.id}`, targetDurationMs: duration, scenes: [localScene], renderPolicy: { ...blueprint.renderPolicy, ctaDurationMs: scene.purpose === "cta" ? duration : 0 } };
  const filterCues = <T extends { startMs: number; endMs: number }>(items: T[]) => items.filter((cue) => cue.endMs > offset && cue.startMs < scene.endMs).map(shift);
  const localCaptions = edit.captions.filter((caption) => caption.endMs > offset && caption.startMs < scene.endMs).map(localizeCaption);
  const localEdit: EditDecisionList = { ...structuredClone(edit), durationMs: duration, sourceSegments: sourceSegments.length ? sourceSegments : [{ ...edit.sourceSegments[0]!, timelineStartMs: 0, timelineEndMs: duration }], zooms: filterCues(edit.zooms), transitions: filterCues(edit.transitions), captions: localCaptions, overlays: filterCues(edit.overlays), callouts: filterCues(edit.callouts), cursorCues: filterCues(edit.cursorCues), sfx: edit.sfx.filter((cue) => cue.startMs >= offset && cue.startMs < scene.endMs).map((cue) => ({ ...cue, startMs: cue.startMs - offset })), presenter: { ...edit.presenter, startMs: 0, endMs: duration }, qualityGates: { ...edit.qualityGates, requireCaptionSafeArea: localCaptions.length > 0 && edit.qualityGates.requireCaptionSafeArea, requireAudioAlignment: localCaptions.length > 0 && edit.qualityGates.requireAudioAlignment }, creativeBlueprint: localBlueprint };
  return { ...script, captions: localEdit.captions, editDecisionList: localEdit, creativeBlueprint: localBlueprint };
}

async function spliceSceneSegments(segmentPaths: string[], outputPath: string): Promise<void> { const listPath = `${outputPath}.txt`; const escape = (value: string) => value.replace(/'/g, "'\\''"); await fs.writeFile(listPath, segmentPaths.map((file) => `file '${escape(file)}'`).join("\n"), { mode: 0o600 }); try { await runCommand(resolveFfmpeg(), ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", "-f", "mp4", outputPath], 180_000); } finally { await fs.rm(listPath, { force: true }); } }
async function validateSceneSplice(outputPath: string, entries: import("../shared/types").SceneRenderCacheEntry[], blueprint: import("../shared/types").CreativeBlueprint): Promise<import("../shared/types").SceneRenderCacheReport["validation"]> { const output = await ffprobe(outputPath); const video = output.streams?.find((stream) => stream.codec_type === "video"); const audio = output.streams?.find((stream) => stream.codec_type === "audio"); const duration = Number(output.format?.duration ?? 0) * 1000; const expected = entries.reduce((total, entry) => total + entry.durationMs, 0); const boundaries = await validateBoundaryFrames(outputPath, entries); const captionsAligned = blueprint.scenes.every((scene) => scene.captions.every((caption) => caption.startMs >= 0 && caption.endMs <= blueprint.targetDurationMs && caption.startMs < scene.endMs && caption.endMs > scene.startMs && (caption.words ?? []).every((word) => word.startMs >= caption.startMs && word.endMs <= caption.endMs))); return { boundaryFrames: boundaries, transitionContinuity: boundaries && entries.every((entry) => entry.dependencySceneIds.every((id) => blueprint.scenes.some((scene) => scene.id === id))), timestampContinuity: Math.abs(duration - expected) <= Math.max(250, entries.length * 30), audioContinuity: Boolean(audio), captionAlignment: captionsAligned, totalDuration: Math.abs(duration - blueprint.targetDurationMs) <= Math.max(250, entries.length * 30), codecCompatibility: video?.codec_name === "h264" && audio?.codec_name === "aac" }; }
async function validateBoundaryFrames(outputPath: string, entries: import("../shared/types").SceneRenderCacheEntry[]): Promise<boolean> { let cursor = 0; for (const entry of entries.slice(0, -1)) { cursor += entry.durationMs; for (const delta of [-34, 34]) { try { await runCommand(resolveFfmpeg(), ["-hide_banner", "-loglevel", "error", "-ss", (Math.max(0, cursor + delta) / 1000).toFixed(3), "-i", outputPath, "-frames:v", "1", "-f", "null", "-"], 30_000); } catch { return false; } } } return true; }
async function hashFile(filePath: string): Promise<string> { return createHash("sha256").update(await fs.readFile(filePath)).digest("hex"); }
async function fileExists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function probeBasicRenderValidation(outputPath: string): Promise<RenderValidation> { const probe = await ffprobe(outputPath); const video = probe.streams?.find((stream) => stream.codec_type === "video"); const audio = probe.streams?.find((stream) => stream.codec_type === "audio"); return { width: video?.width ?? 0, height: video?.height ?? 0, durationMs: Math.round(Number(probe.format?.duration ?? 0) * 1000), videoCodec: video?.codec_name ?? "unknown", audioCodec: audio?.codec_name ?? null, fastStart: true }; }

export async function normalizeRenderedAudio(outputPath: string, targetLufs = -14): Promise<void> {
  const parsed = path.parse(outputPath);
  let currentPath = outputPath;
  const temporaryPaths: string[] = [];
  try {
    let measured = await inspectRenderedAudioQa(currentPath, targetLufs);
    for (let pass = 0; pass < 3 && Math.abs(measured.integratedLufs - targetLufs) > 0.5; pass += 1) {
      const adjustmentDb = targetLufs - measured.integratedLufs;
      const normalizedPath = path.join(parsed.dir, `${parsed.name}.audio-normalized-${pass}${parsed.ext}`);
      temporaryPaths.push(normalizedPath);
      await runCommand(resolveFfmpeg(), [
        "-hide_banner", "-loglevel", "error", "-y", "-i", currentPath,
        "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "copy",
        "-af", `volume=${adjustmentDb.toFixed(2)}dB,alimiter=limit=0.8414:level=false`,
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        normalizedPath
      ], 120_000);
      currentPath = normalizedPath;
      measured = await inspectRenderedAudioQa(currentPath, targetLufs);
    }
    if (!measured.withinTarget || Math.abs(measured.integratedLufs - targetLufs) > 0.5) {
      throw new Error(
        `Rendered audio normalization missed the ${targetLufs} LUFS target (measured ${measured.integratedLufs} LUFS).`
      );
    }
    if (currentPath !== outputPath) {
      await fs.rename(currentPath, outputPath);
    }
  } catch (error) {
    throw error;
  } finally {
    await Promise.all(temporaryPaths.map((temporaryPath) => fs.rm(temporaryPath, { force: true })));
  }
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

export async function validateRenderedVideo(outputPath: string, blueprint?: import("../shared/types").CreativeBlueprint, editDecisionList?: EditDecisionList): Promise<RenderValidation> {
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
  const audioQa = await inspectRenderedAudioQa(outputPath);
  const temporalQa = blueprint ? await inspectCreatorVideoTemporalQa(outputPath, blueprint) : undefined;
  const placements = blueprint ? calculateBlueprintLayout(blueprint) : [];
  const resolvedTypography = blueprint ? resolveOverlayTypography() : undefined;
  const visualReadinessQa = blueprint ? await inspectVisualReadinessQa(outputPath, blueprint, editDecisionList) : undefined;
  return {
    width: videoStream.width,
    height: videoStream.height,
    durationMs,
    videoCodec: videoStream.codec_name ?? "unknown",
    audioCodec: audioStream?.codec_name ?? null,
    fastStart: true,
    frameQa,
    audioQa,
    temporalQa,
    typographyQa: resolvedTypography,
    visualReadinessQa,
    ...(blueprint ? { layoutQa: { schemaVersion: "1", placements, impossibleSceneIds: [...new Set(placements.filter((placement) => !placement.collisionFree).map(({ sceneId }) => sceneId))] } as const } : {})
  };
}

export function parseRenderedAudioQa(log: string, targetLufs = -14): NonNullable<RenderValidation["audioQa"]> {
  const integratedMatches = [...log.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s+LUFS/g)];
  const rangeMatches = [...log.matchAll(/LRA:\s*(\d+(?:\.\d+)?)\s+LU/g)];
  const silenceDurationsMs = [...log.matchAll(/silence_duration:\s*(\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]) * 1_000)
    .filter(Number.isFinite);
  const integratedLufs = Number(integratedMatches.at(-1)?.[1] ?? Number.NaN);
  const loudnessRangeLu = Number(rangeMatches.at(-1)?.[1] ?? 0);
  if (!Number.isFinite(integratedLufs)) {
    throw new Error("Rendered audio loudness could not be measured.");
  }
  return {
    integratedLufs: roundMetric(integratedLufs),
    loudnessRangeLu: roundMetric(loudnessRangeLu),
    maxContinuousSilenceMs: Math.round(Math.max(0, ...silenceDurationsMs)),
    targetLufs,
    withinTarget: Math.abs(integratedLufs - targetLufs) <= 1.5
  };
}

async function inspectRenderedAudioQa(
  outputPath: string,
  targetLufs = -14
): Promise<NonNullable<RenderValidation["audioQa"]>> {
  const result = await runCommand(resolveFfmpeg(), [
    "-hide_banner", "-nostats", "-i", outputPath,
    "-af", "ebur128=framelog=verbose,silencedetect=noise=-35dB:d=0.25",
    "-f", "null", "-"
  ], 120_000);
  return parseRenderedAudioQa(result.stderr, targetLufs);
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

async function inspectVisualReadinessQa(
  outputPath: string,
  blueprint: import("../shared/types").CreativeBlueprint,
  editDecisionList?: EditDecisionList
): Promise<NonNullable<RenderValidation["visualReadinessQa"]>> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-visual-qa-"));
  try {
    const ctaScene = blueprint.scenes.find((scene) => scene.purpose === "cta" && scene.shotType === "cta_end_card");
    const ctaTimestamps = ctaScene
      ? [ctaScene.startMs + 500, Math.round((ctaScene.startMs + ctaScene.endMs) / 2), ctaScene.endMs - 150]
      : [];
    let ctaInformativeSamples = 0;
    for (const [index, timestampMs] of ctaTimestamps.entries()) {
      const sample = await sampleVideoRegion(outputPath, tempDir, `cta-${index}`, timestampMs, { x: 175, y: 775, width: 730, height: 205 });
      if (isInformativeFrameSample(sample) && sample.averageLuma >= 80) ctaInformativeSamples += 1;
    }

    const presenterAverageLumaByScene: Record<string, number> = {};
    for (const scene of blueprint.scenes.filter(({ presenter }) => presenter.visible)) {
      const rect = presenterVideoRect(scene.presenter.layout);
      const sample = await sampleVideoRegion(outputPath, tempDir, `presenter-${scene.id}`, Math.round((scene.startMs + scene.endMs) / 2), rect);
      presenterAverageLumaByScene[scene.id] = roundMetric(sample.averageLuma);
    }

    const transitionSignalFailures: Array<{ sceneId: string; timestampMs: number; elementId: string }> = [];
    for (const scene of blueprint.scenes.slice(1)) {
      for (const timestampMs of [Math.max(0, scene.startMs - 100), scene.startMs, Math.min(blueprint.targetDurationMs - 1, scene.startMs + 100)]) {
        const sample = await sampleVideoRegion(outputPath, tempDir, `boundary-${scene.id}-${timestampMs}`, timestampMs, { x: 0, y: 0, width: 1080, height: 1920 });
        if (!isInformativeFrameSample(sample) || sample.averageLuma < 10) transitionSignalFailures.push({ sceneId: scene.id, timestampMs, elementId: "canvas-signal" });
      }
    }
    return buildVisualReadinessQa({ blueprint, editDecisionList, ctaInformativeSamples, presenterAverageLumaByScene, transitionSignalFailures });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function sampleVideoRegion(
  outputPath: string,
  tempDir: string,
  name: string,
  timestampMs: number,
  rect: { x: number; y: number; width: number; height: number }
): Promise<RenderFrameLumaSample> {
  const framePath = path.join(tempDir, `${safeFileName(name)}.png`);
  const x = Math.max(0, Math.min(1079, Math.round(rect.x)));
  const y = Math.max(0, Math.min(1919, Math.round(rect.y)));
  const width = Math.max(1, Math.min(1080 - x, Math.round(rect.width)));
  const height = Math.max(1, Math.min(1920 - y, Math.round(rect.height)));
  await runCommand(resolveFfmpeg(), [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", (Math.max(0, timestampMs) / 1_000).toFixed(3),
    "-i", outputPath, "-frames:v", "1", "-vf", `crop=${width}:${height}:${x}:${y},scale=32:32,format=rgba`, framePath
  ], 30_000);
  return readPngLumaSample(framePath);
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

export function buildAudioMixFilter(editDecisionList: EditDecisionList, durationSec: number, audioInputIndex = 2): string {
  const duration = durationSec.toFixed(3);
  const filters = [
    `[${audioInputIndex}:a]apad,atrim=0:${duration},asetpts=N/SR/TB,aresample=44100,aformat=channel_layouts=stereo[voice]`
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
    filters.push("[voice]loudnorm=I=-14:TP=-1.5:LRA=7[a]");
  } else {
    filters.push(`${layerLabels.join("")}amix=inputs=${layerLabels.length}:duration=first:dropout_transition=0,` +
      `atrim=0:${duration},asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=7[a]`);
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

export async function createCaptureCaptionOverlaySequence(input: {
  cues: Array<{ startMs: number; endMs: number; text: string }>;
  outputDir: string;
  durationSec: number;
}): Promise<OverlaySequence> {
  loadOverlayFont();
  await fs.mkdir(input.outputDir, { recursive: true });
  const durationMs = Math.max(1, Math.round(input.durationSec * 1_000));
  const frameCount = Math.max(1, Math.ceil(input.durationSec * OVERLAY_FRAME_RATE) + 2);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const timestampMs = Math.min(durationMs, Math.round(frameIndex / OVERLAY_FRAME_RATE * 1_000));
    const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const context = image.getContext("2d");
    context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const cue = input.cues.find((candidate) => timestampMs >= candidate.startMs && timestampMs <= candidate.endMs);
    if (cue) {
      drawSolidRect(context, 80, 1460, 920, 250, "rgba(9, 16, 31, 0.90)");
      drawSolidRect(context, 80, 1460, 12, 250, "#4F8CFF");
      context.fillStyle = "#FFFFFF";
      context.font = "42pt Arial";
      drawWrappedText(context, cue.text, 125, 1535, 830, 58, 3);
    }
    await PImage.encodePNGToStream(image, createWriteStream(path.join(input.outputDir, `caption-${String(frameIndex).padStart(4, "0")}.png`)));
  }
  return { pattern: path.join(input.outputDir, "caption-%04d.png"), frameRate: OVERLAY_FRAME_RATE, frameCount };
}

async function createTimedOverlaySequence(
  profile: ProductProfile,
  script: ScriptDraft,
  editDecisionList: EditDecisionList,
  outputDir: string,
  durationSec: number,
  hasGeneratedPresenter = false
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
      path.join(outputDir, overlayFrameName(frameIndex)),
      hasGeneratedPresenter
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
  outputPath: string,
  hasGeneratedPresenter = false
): Promise<void> {
  const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const context = image.getContext("2d");
  const brandKit = editDecisionList.brandKit;
  const isPresenterTemplate = editDecisionList.presenter.enabled || editDecisionList.templateKey === "brand_presenter";
  const activeHook = activeOverlayCue(editDecisionList.overlays, "hook", timestampMs);
  const activeCta = activeOverlayCue(editDecisionList.overlays, "cta", timestampMs);
  const activeCaption = activeCaptionAt(editDecisionList.captions, timestampMs);
  const activeWordIndex = activeCaption ? activeWordIndexAt(activeCaption, timestampMs) : -1;
  const blueprintScene = editDecisionList.creativeBlueprint?.scenes.find((scene) => isCueActive(scene, timestampMs));

  context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  if (blueprintScene) {
    await drawBlueprintScene(context, editDecisionList, blueprintScene, timestampMs, hasGeneratedPresenter);
  } else {
    drawFocusFrame(context, brandKit, timestampMs);
    drawTemplateChrome(context, editDecisionList, script, {
      showCta: Boolean(activeCta && activeCta.position !== "center"),
      showPresenterHook: Boolean(activeHook)
    });
    if (isPresenterTemplate) {
      if (hasGeneratedPresenter && isCueActive(editDecisionList.presenter, timestampMs)) {
        drawGeneratedPresenterDisclosure(context, editDecisionList.presenter);
      } else if (!hasGeneratedPresenter) {
        await drawBrandPresenter(
          context,
          brandKit,
          editDecisionList.presenter,
          timestampMs,
          Boolean(activeCaption && activeWordIndex >= 0)
        );
      }
    }
  }

  context.fillStyle = brandKit.primaryColor;
  context.font = "34pt Arial";
  context.fillText(profile.productName || brandKit.productName || "Gideon draft", 110, 165);
  if (brandKit.tagline) {
    context.fillStyle = "#ffffff";
    context.font = "18pt Arial";
    drawWrappedText(context, brandKit.tagline, 110, 203, 760, 28, 1);
  }

  if (activeHook && !blueprintScene) {
    drawHookOverlay(context, activeHook, editDecisionList, timestampMs);
  }

  drawTransitionCue(context, editDecisionList, timestampMs);
  if (!blueprintScene || !["presenter_fullscreen", "kinetic_typography", "cta_end_card"].includes(blueprintScene.shotType)) {
    drawVisualBeatCallouts(context, editDecisionList, timestampMs);
    drawCursorEmphasis(context, editDecisionList, timestampMs);
  }

  if (activeCaption) {
    const captionLayout = blueprintCaptionLayout(blueprintScene, hasGeneratedPresenter, editDecisionList);
    const lineHeight = 58;
    const maxLines = brandKit.captionStyle === "educational_stack" ? 3 : 2;
    const backdrop = captionBackdropRect(captionLayout, lineHeight, maxLines);
    drawPanel(context, backdrop.x, backdrop.y, backdrop.width, backdrop.height, "rgba(5,7,13,.82)");
    context.font = brandKit.captionStyle === "educational_stack" ? "39pt Arial" : "46pt Arial";
    drawCaptionWithWordHighlight(
      context,
      activeCaption,
      activeWordIndex,
      captionLayout.x,
      captionLayout.y,
      captionLayout.width,
      lineHeight,
      brandKit,
      maxLines
    );
  }

  if (activeCta && !blueprintScene) {
    drawCtaOverlay(context, activeCta, brandKit);
  }

  await PImage.encodePNGToStream(image, createWriteStream(outputPath));
}

async function drawBlueprintScene(
  context: OverlayContext,
  editDecisionList: EditDecisionList,
  scene: SceneComposition,
  timestampMs: number,
  hasGeneratedPresenter: boolean
): Promise<void> {
  const brand = editDecisionList.brandKit;
  const asset = scene.productAssetIds
    .map((id) => editDecisionList.creativeBlueprint?.productAssets.find((candidate) => candidate.id === id))
    .find((candidate): candidate is ProductEvidenceAsset => Boolean(candidate));
  const temporalProduct = asset?.kind === "interaction_clip";
  if (scene.background.kind === "dark" || scene.shotType === "cta_end_card") {
    drawSolidRect(context, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT, temporalProduct ? "rgba(5, 7, 13, 0.12)" : "rgba(5, 7, 13, 0.90)");
  } else if (scene.background.kind === "light" || scene.shotType === "kinetic_typography") {
    drawSolidRect(context, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT, "rgba(247, 248, 243, 0.96)");
  } else if (scene.background.kind === "brand") {
    drawSolidRect(context, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT, alpha(brand.backgroundColor, 0.82));
  } else {
    drawSolidRect(context, 0, 0, OUTPUT_WIDTH, 300, "rgba(247, 248, 243, 0.94)");
    drawSolidRect(context, 0, 1540, OUTPUT_WIDTH, 380, "rgba(5, 7, 13, 0.78)");
  }

  await drawBlueprintProductTreatment(context, scene, asset, brand, timestampMs, editDecisionList.creativeBlueprint?.renderPolicy.mode === "debug");

  if (scene.presenter.visible) {
    if (hasGeneratedPresenter) {
      drawBlueprintPresenterDisclosure(context, scene);
    } else {
      await drawBlueprintPresenter(context, editDecisionList, scene, timestampMs);
    }
  }
  drawBlueprintTypography(context, scene, brand, asset);
  if (scene.shotType === "cta_end_card") drawBlueprintCta(context, editDecisionList, scene);
  drawSceneProgress(context, scene, editDecisionList.durationMs, brand);
}

function drawBlueprintCta(context: OverlayContext, editDecisionList: EditDecisionList, scene: SceneComposition): void {
  const text = editDecisionList.creativeBlueprint?.cta.trim()
    || editDecisionList.overlays.find((cue) => cue.kind === "cta")?.text.trim()
    || "Review the scenes, then render your product.";
  const x = 110;
  const y = 660;
  const width = 860;
  const height = 430;
  drawPanel(context, x, y, width, height, "rgba(248,250,252,0.98)");
  drawSolidRect(context, x, y, 16, height, editDecisionList.brandKit.primaryColor);
  context.fillStyle = "#3F4A5A";
  context.font = "22pt Arial";
  context.fillText("NEXT STEP", x + 72, y + 62);
  context.fillStyle = "#0B1220";
  context.font = "46pt Arial";
  drawWrappedText(context, text, x + 72, y + 145, width - 144, 62, 3);
  drawPanel(context, x + 72, y + height - 104, 310, 62, editDecisionList.brandKit.primaryColor);
  context.fillStyle = "#10131D";
  context.font = "22pt Arial";
  context.fillText("REVIEW & RENDER", x + 104, y + height - 64);
  if (editDecisionList.creativeBlueprint?.renderPolicy.mode === "debug") {
    drawRectOutline(context, x, y, width, height, 4, "#3B82F6");
    context.fillStyle = "#3B82F6";
    context.font = "16pt monospace";
    context.fillText(`DEBUG CTA ${scene.id}`, x + 520, y + height - 62);
  }
}

async function drawBlueprintProductTreatment(
  context: OverlayContext,
  scene: SceneComposition,
  asset: ProductEvidenceAsset | undefined,
  brand: BrandKit,
  timestampMs: number,
  debug = false
): Promise<void> {
  if (!asset && !["product_fullscreen", "product_hero"].includes(scene.shotType)) return;
  const splitLeft = scene.presenter.layout === "split_left";
  const x = scene.shotType === "split_presenter_product" ? (splitLeft ? 530 : 70) : 90;
  const y = scene.shotType === "presenter_with_card" ? 170 : 360;
  const width = scene.shotType === "split_presenter_product" ? 480 : 900;
  const height = scene.shotType === "presenter_with_card" ? 720 : 940;
  const treatment = productTreatmentSpec(asset?.kind ?? "screenshot");
  if (treatment.opaquePanel) drawPanel(context, x, y, width, height, treatment.background);
  if (treatment.device === "browser") {
    drawPanel(context, x, y, width, height, "rgba(255,255,255,0.98)");
    drawSolidRect(context, x, y, width, 70, "#E9ECF2");
    ["#EF4444", "#F59E0B", "#22C55E"].forEach((color, index) => drawSolidRect(context, x + 28 + index * 34, y + 25, 16, 16, color));
    drawPanel(context, x + 142, y + 17, width - 172, 38, "#FFFFFF");
  } else if (treatment.device === "phone") {
    drawPanel(context, x + width * .2, y, width * .6, height, "#080A0F");
    drawPanel(context, x + width * .23, y + 24, width * .54, height - 48, "#FFFFFF");
    drawPanel(context, x + width * .41, y + 10, width * .18, 22, "#080A0F");
  } else if (treatment.device === "terminal") {
    drawPanel(context, x, y, width, height, "#07110B");
    drawSolidRect(context, x, y, width, 62, "#17231B");
    const lines = asset ? treatmentContentLines(asset) : ["$ verify product evidence", "evidence: linked", "claims: supported", "status: verified output"];
    const progress = Math.max(0, Math.min(1, (timestampMs - scene.startMs) / Math.max(1, scene.endMs - scene.startMs)));
    const visibleLines = Math.max(1, Math.min(lines.length, Math.ceil(progress * lines.length)));
    context.fillStyle = "#75F59A"; context.font = "23pt monospace";
    lines.slice(0, visibleLines).forEach((line, index) => context.fillText(line, x + 42, y + 132 + index * 66));
    drawPanel(context, x + 38, y + 440, width - 76, 330, "rgba(18,39,27,.92)");
    context.fillStyle = "#A7F3D0"; context.font = "18pt monospace";
    context.fillText("VALIDATION RECEIPT", x + 70, y + 500);
    context.fillStyle = "#E7FBEF"; context.font = "24pt GideonKinetic";
    context.fillText("Source evidence linked", x + 70, y + 572);
    context.fillText("Lifecycle value retained", x + 70, y + 640);
    context.fillText("Save confirmation observed", x + 70, y + 708);
  } else if (treatment.device === "before_after") {
    drawPanel(context, x, y, width, height, "rgba(255,255,255,.98)");
    drawSolidRect(context, x + width / 2 - 2, y + 70, 4, height - 110, brand.accentColor);
    context.fillStyle = "#6B7280"; context.font = productTreatmentFont("GideonKinetic", 20);
    context.fillText("BEFORE", x + 30, y + 48); context.fillText("AFTER", x + width / 2 + 30, y + 48);
  } else if (treatment.device === "comparison") {
    drawPanel(context, x, y, width, height, treatment.background);
    drawSolidRect(context, x + width / 2 - 2, y + 90, 4, height - 150, alpha(brand.accentColor, .7));
    context.fillStyle = "#10131D"; context.font = productTreatmentFont("GideonKinetic", 22);
    context.fillText("EVIDENCE", x + 32, y + 58); context.fillText(asset?.factualUseAllowed ? "VERIFIED" : "CONCEPT", x + width / 2 + 32, y + 58);
  } else if (treatment.device === "hero") {
    drawPanel(context, x, y, width, height, alpha(brand.backgroundColor, .95));
    drawSolidRect(context, x, y, 18, height, brand.primaryColor);
    context.fillStyle = "#FFFFFF"; context.font = productTreatmentFont("GideonEditorial", 44);
    drawWrappedText(context, brand.productName, x + 50, y + 78, width - 100, 58, 2);
  } else if (treatment.device === "conceptual") {
    drawPanel(context, x, y, width, height, "rgba(255,247,237,.98)");
    drawSolidRect(context, x, y, 12, height, "#C2410C");
    context.fillStyle = "#9A3412"; context.font = productTreatmentFont("GideonKinetic", 25); context.fillText("CONCEPTUAL VISUAL", x + 34, y + 52);
    context.fillStyle = "#431407"; context.font = productTreatmentFont("GideonEditorial", 38);
    drawWrappedText(context, asset?.label ?? "Proposed product direction", x + 54, y + 180, width - 108, 54, 4);
    context.fillStyle = "#7C2D12"; context.font = "22pt Arial";
    drawWrappedText(context, "A labelled direction for review — not captured factual evidence.", x + 54, y + 430, width - 108, 34, 3);
    const lines = asset ? treatmentContentLines(asset).slice(1) : ["Proposed direction", "Not captured product evidence", "Human approval required"];
    lines.forEach((line, index) => {
      const cardY = y + 575 + index * 92;
      drawPanel(context, x + 54, cardY, width - 108, 68, index === 2 ? "rgba(154,52,18,.12)" : "rgba(255,255,255,.76)");
      context.fillStyle = "#431407"; context.font = "21pt GideonKinetic";
      context.fillText(`${index + 1}. ${line}`, x + 82, cardY + 43);
    });
  } else if (treatment.device === "feature") {
    drawPanel(context, x, y, width, height, "rgba(248,250,252,.98)");
    drawSolidRect(context, x + 28, y + 90, 12, height - 150, brand.primaryColor);
    context.fillStyle = "#10131D"; context.font = productTreatmentFont("GideonKinetic", 28);
    drawWrappedText(context, `✓ ${asset?.label ?? "Evidence-backed feature"}`, x + 65, y + 130, width - 105, 48, 4);
    const lines = asset ? treatmentContentLines(asset).slice(1) : ["Focused field update", "Evidence remains linked", "Saved result stays visible"];
    lines.forEach((line, index) => {
      const cardY = y + 330 + index * 150;
      drawPanel(context, x + 72, cardY, width - 144, 112, "rgba(255,255,255,.98)");
      drawPanel(context, x + 94, cardY + 25, 62, 62, brand.primaryColor);
      context.fillStyle = "#10131D"; context.font = productTreatmentFont("GideonKinetic", 23);
      context.fillText(String(index + 1), x + 116, cardY + 65);
      context.font = "24pt GideonKinetic";
      context.fillText(line, x + 186, cardY + 66);
    });
  }
  const imagePath = asset?.imagePath;
  if (imagePath && !["terminal", "feature", "conceptual"].includes(treatment.device)) {
    const insetX = treatment.device === "phone" ? x + width * .25 : x + 28;
    const insetWidth = treatment.device === "phone" ? width * .5 : width - 56;
    await drawImageInRect(context, imagePath, insetX, y + 84, insetWidth, height - 170);
  }
  if (treatment.device !== "conceptual") {
    context.fillStyle = "#10131D";
    context.font = productTreatmentFont("GideonKinetic", 26);
    drawWrappedText(context, asset?.label ?? (scene.shotType === "comparison_card" ? "Evidence-backed comparison" : "Product proof"), x + 34, y + 48, width - 68, 34, 2);
  }
  if (!asset?.factualUseAllowed) {
    context.fillStyle = "#9A3412";
    context.font = "17pt Arial";
    context.fillText("CONCEPTUAL — VERIFY BEFORE FACTUAL USE", x + 34, y + height - 28);
  }
  if (debug) {
    drawRectOutline(context, treatment.device === "phone" ? x + width * .2 : x, y, treatment.device === "phone" ? width * .6 : width, height, 4, "#3B82F6");
    context.fillStyle = "#3B82F6"; context.font = "16pt monospace"; context.fillText(`DEBUG ${scene.id}`, x + 18, y + height - 56);
  }
}

export function productTreatmentSpec(kind: ProductEvidenceAsset["kind"]): { device: "clean" | "temporal" | "browser" | "phone" | "terminal" | "before_after" | "feature" | "comparison" | "hero" | "conceptual"; opaquePanel: boolean; background: string } {
  switch (kind) {
    case "screenshot": return { device: "clean", opaquePanel: true, background: "rgba(255,255,255,.98)" };
    case "interaction_clip": return { device: "temporal", opaquePanel: false, background: "transparent" };
    case "browser_mockup": return { device: "browser", opaquePanel: true, background: "#FFFFFF" };
    case "phone_mockup": return { device: "phone", opaquePanel: false, background: "#080A0F" };
    case "terminal_card": return { device: "terminal", opaquePanel: true, background: "#07110B" };
    case "before_after_pair": return { device: "before_after", opaquePanel: true, background: "#FFFFFF" };
    case "feature_card": return { device: "feature", opaquePanel: true, background: "#F8FAFC" };
    case "comparison_card": return { device: "comparison", opaquePanel: true, background: "#F8FAFC" };
    case "product_hero": return { device: "hero", opaquePanel: true, background: "#10131D" };
    case "conceptual_card": return { device: "conceptual", opaquePanel: true, background: "#FFF7ED" };
  }
}

export function productTreatmentFont(family: "GideonKinetic" | "GideonEditorial", sizePt: number): string {
  return `${sizePt}pt ${family}`;
}

async function drawBlueprintPresenter(
  context: OverlayContext,
  editDecisionList: EditDecisionList,
  scene: SceneComposition,
  timestampMs: number
): Promise<void> {
  const layout = scene.presenter.layout;
  const bob = Math.sin(timestampMs / (scene.presenter.motionIntensity === "energetic" ? 95 : 220)) * (scene.presenter.motionIntensity === "subtle" ? 3 : 8);
  const rect = presenterRect(layout, bob);
  const avatarPath = catalogAvatarPath(editDecisionList.presenter.avatarId);
  drawPanel(context, rect.x, rect.y, rect.width, rect.height, "rgba(12,18,28,0.72)");
  const drew = await drawImageInRect(context, avatarPath, rect.x, rect.y, rect.width, rect.height);
  if (!drew) {
    context.fillStyle = editDecisionList.brandKit.primaryColor;
    context.font = "72pt Arial";
    context.fillText(initials(editDecisionList.brandKit.productName), rect.x + rect.width * 0.38, rect.y + rect.height * 0.5);
  }
  drawBlueprintPresenterDisclosure(context, scene);
}

function presenterRect(layout: SceneComposition["presenter"]["layout"], bob: number): { x: number; y: number; width: number; height: number } {
  if (layout === "fullscreen") return { x: 90, y: 330 + bob, width: 900, height: 1320 };
  if (layout === "close_up") return { x: 80, y: 500 + bob, width: 920, height: 1040 };
  if (layout === "lower_third") return { x: 610, y: 1110 + bob, width: 400, height: 650 };
  if (layout === "split_left") return { x: 35, y: 540 + bob, width: 470, height: 980 };
  if (layout === "split_right") return { x: 575, y: 540 + bob, width: 470, height: 980 };
  return { x: 260, y: 700 + bob, width: 560, height: 850 };
}

function drawBlueprintPresenterDisclosure(context: OverlayContext, scene: SceneComposition): void {
  const rect = presenterRect(scene.presenter.layout, 0);
  const x = clamp(rect.x, 40, 690);
  const y = Math.max(235, Math.min(1800, rect.y - 58));
  drawPanel(context, x, y, 350, 44, "rgba(5, 7, 13, 0.82)");
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.font = "14pt Arial";
  context.fillText(scene.presenter.disclosure.toLowerCase(), x + 18, y + 29);
}

function drawBlueprintTypography(context: OverlayContext, scene: SceneComposition, brand: BrandKit, asset?: ProductEvidenceAsset): void {
  for (const cue of scene.typography.slice(0, 2)) {
    const receipt = choosePlacement(scene, asset, "typography", cue.position, cue.maxLines);
    const placement = { x: receipt.chosen.x * OUTPUT_WIDTH, y: receipt.chosen.y * OUTPUT_HEIGHT, width: receipt.chosen.width * OUTPUT_WIDTH };
    const editorial = cue.family === "editorial_serif_italic";
    context.fillStyle = scene.background.kind === "light" ? "#10131D" : "#FFFFFF";
    context.font = editorial ? "italic 58pt GideonEditorial" : "bold 48pt GideonKinetic";
    drawWrappedText(context, cue.text, placement.x, placement.y, placement.width, editorial ? 72 : 58, cue.maxLines);
    if (cue.emphasizedWords.length > 0) {
      drawSolidRect(context, placement.x, placement.y + cue.maxLines * 66 + 18, Math.min(placement.width, 410), 8, alpha(brand.primaryColor, 0.92));
    }
  }
}

function typographyPlacement(
  position: SceneComposition["typography"][number]["position"],
  presenterLayout: SceneComposition["presenter"]["layout"]
): { x: number; y: number; width: number } {
  if (position === "left") return { x: 75, y: 260, width: presenterLayout === "split_right" ? 430 : 760 };
  if (position === "right") return { x: 570, y: 260, width: 430 };
  if (position === "center") return { x: 110, y: 760, width: 860 };
  if (position === "bottom") return { x: 110, y: 1650, width: 860 };
  return { x: 110, y: 165, width: 860 };
}

function drawSceneProgress(context: OverlayContext, scene: SceneComposition, durationMs: number, brand: BrandKit): void {
  drawSolidRect(context, 70, 1840, 940, 5, "rgba(255,255,255,0.18)");
  drawSolidRect(context, 70, 1840, 940 * clamp(scene.endMs / durationMs, 0, 1), 5, alpha(brand.primaryColor, 0.9));
}

function blueprintCaptionLayout(
  scene: SceneComposition | undefined,
  hasGeneratedPresenter: boolean,
  editDecisionList: EditDecisionList
): { x: number; y: number; width: number } {
  if (!scene) {
    const presenterOnLeft = hasGeneratedPresenter && editDecisionList.presenter.position === "lower_left";
    return { x: presenterOnLeft ? 470 : 130, y: 1360, width: hasGeneratedPresenter ? 480 : (editDecisionList.presenter.enabled ? 700 : 820) };
  }
  const asset = scene.productAssetIds.map((id) => editDecisionList.creativeBlueprint?.productAssets.find((candidate) => candidate.id === id)).find(Boolean);
  const receipt = choosePlacement(scene, asset, "caption", "bottom", 2);
  if (receipt.collisionFree) return { x: receipt.chosen.x * OUTPUT_WIDTH, y: receipt.chosen.y * OUTPUT_HEIGHT, width: receipt.chosen.width * OUTPUT_WIDTH };
  if (scene.presenter.visible && scene.presenter.layout === "split_left") return { x: 570, y: 1500, width: 430 };
  if (scene.presenter.visible && scene.presenter.layout === "split_right") return { x: 80, y: 1500, width: 430 };
  if (scene.presenter.visible && scene.presenter.layout === "lower_third") return { x: 90, y: 1420, width: 470 };
  if (scene.shotType === "cta_end_card") return { x: 160, y: 1620, width: 760 };
  return { x: 120, y: 1550, width: 840 };
}

export function captionBackdropRect(
  layout: { x: number; y: number; width: number },
  lineHeight: number,
  maxLines: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, layout.x - 22),
    y: Math.max(0, layout.y - lineHeight),
    width: Math.min(OUTPUT_WIDTH - Math.max(0, layout.x - 22), layout.width + 44),
    height: lineHeight * maxLines + 20
  };
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
  if (editDecisionList.templateKey === "saves_you_time") {
    drawPanel(context, 90, 430, 330, 74, alpha(brandKit.primaryColor, 0.92));
    drawPanel(context, 430, 430, 455, 74, "rgba(255,255,255,0.16)");
    context.fillStyle = "#10131D";
    context.font = "24pt Arial";
    context.fillText("SAVES TIME", 132, 477);
    drawSolidRect(context, 460, 464, 330, 8, alpha(brandKit.accentColor, 0.9));
    drawSolidRect(context, 460, 464, 112, 8, alpha(brandKit.primaryColor, 0.95));
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
    if ((callout.arrow?.enabled ?? true) && callout.anchor) {
      drawCalloutArrow(context, editDecisionList.brandKit, position, callout.anchor);
    }
  });
}

function drawTransitionCue(context: OverlayContext, editDecisionList: EditDecisionList, timestampMs: number): void {
  const transition = activeTransitionCuesAt(editDecisionList.transitions ?? [], timestampMs)[0];
  if (!transition) {
    return;
  }
  const progress = clamp((timestampMs - transition.startMs) / Math.max(1, transition.endMs - transition.startMs), 0, 1);
  const color = transition.emphasis === "primary" ? editDecisionList.brandKit.primaryColor : editDecisionList.brandKit.accentColor;
  if (transition.kind === "wipe") {
    drawSolidRect(context, 0, 420, OUTPUT_WIDTH * progress, 14, alpha(color, 0.84));
    drawSolidRect(context, OUTPUT_WIDTH * (1 - progress), 1180, OUTPUT_WIDTH * progress, 14, alpha(color, 0.84));
    return;
  }
  const flashAlpha = transition.kind === "snap_cut" ? 0.18 * (1 - progress) : 0.1 * (1 - progress);
  drawSolidRect(context, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT, alpha(color, flashAlpha));
  if (editDecisionList.creativeBlueprint?.renderPolicy.mode !== "debug") return;
  drawPanel(context, 74, 438, 214, 58, alpha(color, transition.kind === "snap_cut" ? 0.88 : 0.72));
  context.fillStyle = transition.emphasis === "primary" ? "#10131D" : "#FFFFFF";
  context.font = "22pt Arial";
  context.fillText(transition.kind === "match_cut" ? "MATCH CUT" : "QUICK CUT", 104, 476);
}

function drawCalloutArrow(
  context: OverlayContext,
  brandKit: BrandKit,
  position: { x: number; y: number; width: number },
  anchor: RenderFocusPoint
): void {
  const startX = position.x + position.width - 22;
  const startY = position.y + 59;
  const targetX = 90 + anchor.x * 900;
  const targetY = 500 + anchor.y * 600;
  const midX = startX + (targetX - startX) * 0.62;
  const midY = startY + (targetY - startY) * 0.62;
  drawDottedLine(context, brandKit, startX, startY, midX, midY);
  drawDottedLine(context, brandKit, midX, midY, targetX, targetY);
  drawArrowHead(context, brandKit, midX, midY, targetX, targetY);
}

function drawDottedLine(
  context: OverlayContext,
  brandKit: BrandKit,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  const distance = Math.max(1, Math.hypot(toX - fromX, toY - fromY));
  const steps = Math.max(2, Math.floor(distance / 24));
  context.fillStyle = alpha(brandKit.accentColor, 0.78);
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawArrowHead(
  context: OverlayContext,
  brandKit: BrandKit,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 22;
  context.fillStyle = alpha(brandKit.accentColor, 0.92);
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  context.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function drawCursorEmphasis(context: OverlayContext, editDecisionList: EditDecisionList, timestampMs: number): void {
  const cursorCues = editDecisionList.cursorCues ?? [];
  const activeCursorCue = activeCursorCuesAt(cursorCues, timestampMs)[0];
  if (activeCursorCue) {
    const cueIndex = cursorCues.findIndex((cue) => cue.id === activeCursorCue.id);
    const previousAnchor = cueIndex > 0 ? cursorCues[cueIndex - 1]!.anchor : activeCursorCue.anchor;
    const movementProgress = clamp(
      (timestampMs - activeCursorCue.startMs) / Math.max(1, (activeCursorCue.endMs - activeCursorCue.startMs) * 0.62),
      0,
      1
    );
    const pointer = easePointerPosition(
      { x: 90 + previousAnchor.x * 900, y: 500 + previousAnchor.y * 600 },
      { x: 90 + activeCursorCue.anchor.x * 900, y: 500 + activeCursorCue.anchor.y * 600 },
      movementProgress
    );
    const clickStartMs = activeCursorCue.endMs - CLICK_FEEDBACK_MS;
    if (activeCursorCue.kind === "click_target" && timestampMs >= clickStartMs) {
      const progress = clamp((timestampMs - clickStartMs) / CLICK_FEEDBACK_MS, 0, 1);
      context.fillStyle = alpha(editDecisionList.brandKit.accentColor, 0.48 * (1 - progress));
      context.beginPath();
      context.arc(pointer.x, pointer.y, 12 + progress * 28, 0, Math.PI * 2);
      context.fill();
    }
    drawNativeArrowPointer(context, pointer.x, pointer.y);
    if (activeCursorCue.label) {
      drawPanel(context, pointer.x + 28, pointer.y - 54, 260, 56, "rgba(5, 7, 13, 0.82)");
      context.fillStyle = "#ffffff";
      context.font = "20pt Arial";
      drawWrappedText(context, activeCursorCue.label, pointer.x + 48, pointer.y - 19, 220, 24, 1);
    }
    return;
  }

  const activeCallout = activeCalloutsAt(editDecisionList.callouts, timestampMs)[0];
  if (!activeCallout?.anchor) {
    return;
  }
  const anchor = activeCallout.anchor;
  const x = 90 + anchor.x * 900;
  const y = 500 + anchor.y * 600;
  drawNativeArrowPointer(context, x, y);
}

function drawNativeArrowPointer(context: OverlayContext, tipX: number, tipY: number): void {
  const draw = (scale: number, color: string): void => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tipX + 13 * scale, tipY + 42 * scale);
    context.lineTo(tipX + 23 * scale, tipY + 30 * scale);
    context.lineTo(tipX + 35 * scale, tipY + 55 * scale);
    context.lineTo(tipX + 47 * scale, tipY + 49 * scale);
    context.lineTo(tipX + 34 * scale, tipY + 25 * scale);
    context.lineTo(tipX + 51 * scale, tipY + 23 * scale);
    context.closePath();
    context.fill();
  };
  draw(1.12, "rgba(3,7,18,0.96)");
  draw(0.93, "rgba(255,255,255,0.98)");
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
  const gesture = presenter.motion === "caption_sync" && speaking ? Math.sin(timestampMs / 105) * 34 : 0;
  drawSolidRect(context, baseX + 96, baseY + 246, 52, 70, "rgba(247,248,243,0.92)");
  drawPanel(context, baseX + 36, baseY + 304, 170, 176, "rgba(247,248,243,0.92)");
  drawPanel(context, baseX + 10, baseY + 398, 230, 160, alpha(brandKit.primaryColor, 0.9));
  drawPanel(context, baseX + 12, baseY + 386 - gesture * 0.2, 34, 108, alpha(brandKit.primaryColor, 0.9));
  drawPanel(context, baseX + 196, baseY + 386 + gesture * 0.28, 34, 108, alpha(brandKit.primaryColor, 0.9));
  context.fillStyle = "rgba(255,255,255,0.18)";
  context.beginPath();
  context.arc(baseX + 122, baseY + 172, 118 * ringPulse, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = brandKit.backgroundColor;
  context.beginPath();
  context.arc(baseX + 122, baseY + 158, 96, 0, Math.PI * 2);
  context.fill();
  const drewLogo = presenter.style === "logo_head" && await drawLogoImage(context, brandKit.logoPath, baseX + 56, baseY + 92, 132);
  if (presenter.style === "logo_head" && !drewLogo) {
    context.fillStyle = brandKit.primaryColor;
    context.font = "44pt Arial";
    context.fillText(initials(brandKit.productName), baseX + 78, baseY + 176);
  }
  if (presenter.style !== "logo_head") {
    const drewCatalogAvatar = await drawLogoImage(
      context,
      catalogAvatarPath(presenter.avatarId),
      baseX + 47,
      baseY + 83,
      150
    );
    if (!drewCatalogAvatar) {
      drawFictionalAvatarFace(context, presenter.avatarId, baseX, baseY, brandKit, speaking);
    }
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
  context.fillText(presenter.disclosure.toLowerCase(), baseX + 39, baseY + 585);
}

function drawGeneratedPresenterDisclosure(
  context: OverlayContext,
  presenter: EditDecisionList["presenter"]
): void {
  if (!presenter.enabled) {
    return;
  }
  const x = presenter.position === "lower_left" ? 70 : 650;
  drawPanel(context, x, 1400, 360, 48, "rgba(5, 7, 13, 0.84)");
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.font = "15pt Arial";
  context.fillText(presenter.disclosure.toLowerCase(), x + 22, 1431);
}

function drawFictionalAvatarFace(
  context: OverlayContext,
  avatarId: EditDecisionList["presenter"]["avatarId"],
  baseX: number,
  baseY: number,
  brandKit: BrandKit,
  speaking: boolean
): void {
  const skin = avatarId === "nova" ? "#B6D8FF" : "#F6C99C";
  const hair = avatarId === "nova" ? brandKit.accentColor : "#2B1A32";
  context.fillStyle = skin;
  context.beginPath();
  context.arc(baseX + 122, baseY + 158, 76, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = hair;
  context.beginPath();
  context.arc(baseX + 122, baseY + 111, 73, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#10131D";
  context.beginPath();
  context.arc(baseX + 94, baseY + 154, 7, 0, Math.PI * 2);
  context.arc(baseX + 150, baseY + 154, 7, 0, Math.PI * 2);
  context.fill();
  drawSolidRect(context, baseX + 101, baseY + 193, 42, speaking ? 14 : 7, alpha(brandKit.primaryColor, 0.8));
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

function activeTransitionCuesAt(
  transitions: EditDecisionList["transitions"],
  timestampMs: number
): EditDecisionList["transitions"] {
  return transitions.filter((transition) => isCueActive(transition, timestampMs));
}

function activeCursorCuesAt(
  cursorCues: EditDecisionList["cursorCues"],
  timestampMs: number
): EditDecisionList["cursorCues"] {
  return cursorCues.filter((cue) => isCueActive(cue, timestampMs));
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
      transitions?: EditDecisionList["transitions"];
      cursorCues?: EditDecisionList["cursorCues"];
      sfx?: EditDecisionList["sfx"];
      music?: EditDecisionList["music"];
      presenter: EditDecisionList["presenter"] & Partial<Pick<EditDecisionList["presenter"], "avatarId" | "provenance" | "disclosure">>;
    };
    return {
      ...manifest,
      templateId: manifest.templateId ?? templateManifestId(manifest.templateKey, manifest.templateVersion),
      brandKitId: manifest.brandKitId ?? manifest.brandKit.id ?? brandKitIdForProductName(manifest.brandKit.productName),
      callouts: manifest.callouts.map((callout) => ({
        ...callout,
        arrow: callout.arrow ?? { enabled: true, direction: "auto" as const }
      })),
      transitions: manifest.transitions ?? [],
      cursorCues: manifest.cursorCues ?? [],
      sfx: manifest.sfx ?? [],
      music: manifest.music ?? { enabled: false, mood: "none", gainDb: -30 },
      presenter: {
        ...manifest.presenter,
        avatarId: manifest.presenter.avatarId ?? "logo_head",
        provenance: manifest.presenter.provenance ?? "brand_logo",
        disclosure: manifest.presenter.disclosure ?? "AI-generated brand presenter"
      }
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

export function validateRenderManifest(editDecisionList: EditDecisionList, skipBlueprintValidation = false): void {
  if (editDecisionList.durationMs < 1_000 || editDecisionList.durationMs > 60_000) {
    throw new Error("Render manifest duration is outside the supported short-form range.");
  }
  const cursorCues = editDecisionList.cursorCues ?? [];
  validateSourceSegmentTimings(editDecisionList.sourceSegments, editDecisionList.durationMs);
  validateTimedCueCollection("Zoom", editDecisionList.zooms, editDecisionList.durationMs);
  validateTimedCueCollection("Caption", editDecisionList.captions, editDecisionList.durationMs);
  validateTimedCueCollection("Overlay", editDecisionList.overlays, editDecisionList.durationMs);
  validateTimedCueCollection("Callout", editDecisionList.callouts, editDecisionList.durationMs);
  validateTimedCueCollection("Transition", editDecisionList.transitions ?? [], editDecisionList.durationMs);
  validateTimedCueCollection("Cursor", cursorCues, editDecisionList.durationMs);
  validateSfxCueTimings(editDecisionList.sfx, editDecisionList.durationMs);
  validatePresenterTiming(editDecisionList.presenter, editDecisionList.durationMs);
  if (editDecisionList.creativeBlueprint && !skipBlueprintValidation) {
    const blueprint = editDecisionList.creativeBlueprint;
    if (blueprint.targetDurationMs !== editDecisionList.durationMs) {
      throw new Error("CreativeBlueprint duration does not match the render manifest.");
    }
    const blockingIssue = validateCreativeBlueprint(blueprint).find((issue) => issue.severity === "blocking");
    if (blockingIssue) {
      throw new Error(`CreativeBlueprint is not renderable: ${blockingIssue.message}`);
    }
  }
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
    if (callout.arrow && !["auto", "left", "right", "up", "down"].includes(callout.arrow.direction)) {
      throw new Error(`Callout ${index + 1} arrow direction is unsupported.`);
    }
  });
  (editDecisionList.transitions ?? []).forEach((transition, index) => {
    if (!["snap_cut", "match_cut", "wipe"].includes(transition.kind)) {
      throw new Error(`Transition cue ${index + 1} kind is unsupported.`);
    }
  });
  cursorCues.forEach((cue, index) => {
    validateFocusPoint(`Cursor cue ${index + 1}`, cue.anchor);
    if (cue.confidence < 0 || cue.confidence > 1) {
      throw new Error(`Cursor cue ${index + 1} confidence is outside the supported render range.`);
    }
  });
  validateCaptionWordTimings(editDecisionList.captions);
  if (editDecisionList.qualityGates.requireCaptionSafeArea) {
    validateCaptionSafeAreas(editDecisionList);
  }
  if (editDecisionList.qualityGates.requireAudioAlignment) {
    validateCaptionAudioAlignment(editDecisionList.captions, editDecisionList.durationMs);
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
  const avatar = fictionalAvatarPresenterCatalog.find((candidate) => candidate.id === presenter.avatarId);
  if (!avatar || !avatar.commercialApproved || avatar.style !== presenter.style || avatar.provenance !== presenter.provenance) {
    throw new Error("Brand presenter must reference an approved fictional avatar.");
  }
  if (presenter.disclosure !== "AI-generated brand presenter") {
    throw new Error("Brand presenter disclosure is required.");
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

function validateCaptionAudioAlignment(captions: CaptionSegment[], durationMs: number): void {
  if (captions.length === 0) {
    throw new Error("Render manifest needs caption timing for audio alignment.");
  }
  const sorted = [...captions].sort((left, right) => left.startMs - right.startMs);
  const firstCaption = sorted[0]!;
  const lastCaption = sorted[sorted.length - 1]!;
  const maxLeadInMs = 1_500;
  const maxTrailingSilenceMs = editDecisionListCtaTailMs(captions, durationMs);
  const maxCaptionGapMs = 3_000;
  if (firstCaption.startMs > maxLeadInMs) {
    throw new Error("Caption timing starts too late for voiceover alignment.");
  }
  if (durationMs - lastCaption.endMs > maxTrailingSilenceMs) {
    throw new Error("Caption timing ends too early for voiceover alignment.");
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.startMs - previous.endMs > maxCaptionGapMs) {
      throw new Error(`Caption ${index + 1} has a gap too large for voiceover alignment.`);
    }
  }
}

function editDecisionListCtaTailMs(captions: CaptionSegment[], durationMs: number): number {
  const lastCaptionEndMs = Math.max(0, ...captions.map((caption) => caption.endMs));
  const observedTailMs = durationMs - lastCaptionEndMs;
  return observedTailMs >= 4_000 && observedTailMs <= 5_000
    ? 5_000
    : Math.min(3_000, Math.max(1_500, Math.round(durationMs * 0.18)));
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

  context.font = "24pt Arial";
  const overflowingCallout = editDecisionList.callouts.find(
    (callout) => !textFitsWithinLines(context, callout.text, 265, 2)
  );
  if (overflowingCallout) {
    throw new Error("Callout text is too long for the selected safe-area preset.");
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
  resolveOverlayTypography();
}

export function resolveOverlayTypography(): NonNullable<RenderValidation["typographyQa"]> {
  if (typographyReceipt) return typographyReceipt;
  const kinetic = registerFirstFont("GideonKinetic", [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  ]);
  const editorial = registerFirstFont("GideonEditorial", [
    "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
    "/System/Library/Fonts/Supplemental/STIXTwoText-Italic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
    kinetic.file
  ].filter((candidate): candidate is string => Boolean(candidate)));
  // Legacy overlays retain the established Arial alias while blueprint typography uses explicit families.
  if (kinetic.file) {
    try { PImage.registerFont(kinetic.file, "Arial").loadSync(); } catch { /* already registered or unsupported */ }
  }
  typographyReceipt = {
    schemaVersion: "1",
    kinetic: { requestedFamily: "kinetic_bold", resolvedFamily: "GideonKinetic", fontFile: kinetic.file ? path.basename(kinetic.file) : undefined, fallbackUsed: kinetic.index > 0 },
    editorial: { requestedFamily: "editorial_serif_italic", resolvedFamily: "GideonEditorial", fontFile: editorial.file ? path.basename(editorial.file) : undefined, fallbackUsed: editorial.index > 0, italic: true }
  };
  return typographyReceipt;
}

function registerFirstFont(family: string, candidates: string[]): { file?: string; index: number } {
  for (const [index, candidate] of candidates.entries()) {
    if (!existsSync(candidate)) continue;
    try { PImage.registerFont(candidate, family).loadSync(); return { file: candidate, index }; } catch { /* try deterministic fallback */ }
  }
  return { index: candidates.length };
}

function buildVideoTimelineFilter(
  editDecisionList: EditDecisionList,
  recordingDurationMs: number,
  fallbackDurationMs: number,
  minimumDurationSec = 8
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
    durationSec: Math.max(minimumDurationSec, Math.min(60, durationMs / 1000))
  };
}

export function buildGeneratedPresenterFilters(
  editDecisionList: EditDecisionList,
  presenterInputIndex: number,
  durationSec: number,
  avatarPresenter?: Pick<AvatarPresenterInput, "backgroundType">,
  baseInputLabel = "base"
): { filters: string[]; outputLabel: string } {
  const hasBlueprint = Boolean(editDecisionList.creativeBlueprint);
  const blueprintScenes = editDecisionList.creativeBlueprint?.scenes.filter((scene) => scene.presenter.visible) ?? [];
  const sourceKeyFilter = avatarPresenter?.backgroundType === "green_screen" || avatarPresenter?.backgroundType === "deterministic_fixture"
    ? ",chromakey=0x00FF00:0.18:0.08,format=rgba"
    : ",format=rgba";
  if (hasBlueprint && blueprintScenes.length === 0) {
    return { filters: [], outputLabel: baseInputLabel };
  }
  if (blueprintScenes.length === 0) {
    const position = editDecisionList.presenter.position === "lower_left" ? 70 : 650;
    const startSec = (editDecisionList.presenter.startMs / 1000).toFixed(3);
    const endSec = (editDecisionList.presenter.endMs / 1000).toFixed(3);
    return {
      filters: [
        `[${presenterInputIndex}:v]fps=30${sourceKeyFilter},scale=360:360:force_original_aspect_ratio=increase,crop=360:360,` +
          `trim=duration=${durationSec.toFixed(3)},setpts=PTS-STARTPTS[presenter]`,
        `[${baseInputLabel}][presenter]overlay=x=${position}:y=1030:shortest=1:` +
          `enable='between(t,${startSec},${endSec})'[base_with_presenter]`
      ],
      outputLabel: "base_with_presenter"
    };
  }
  const filters: string[] = [
    `[${presenterInputIndex}:v]fps=30${sourceKeyFilter},trim=duration=${durationSec.toFixed(3)},setpts=PTS-STARTPTS[presenter_source]`,
    `[presenter_source]split=${blueprintScenes.length}${blueprintScenes.map((_scene, index) => `[presenter_branch_${index}]`).join("")}`
  ];
  let baseLabel = baseInputLabel;
  blueprintScenes.forEach((scene, index) => {
    const rect = presenterVideoRect(scene.presenter.layout);
    filters.push(
      `[presenter_branch_${index}]scale=${rect.width}:${rect.height}:force_original_aspect_ratio=increase,` +
      `crop=${rect.width}:${rect.height},format=rgba[presenter_scene_${index}]`
    );
    const outputLabel = `base_presenter_${index}`;
    filters.push(
      `[${baseLabel}][presenter_scene_${index}]overlay=x=${rect.x}:y=${rect.y}:shortest=1:` +
      `enable='between(t,${(scene.startMs / 1000).toFixed(3)},${(scene.endMs / 1000).toFixed(3)})'[${outputLabel}]`
    );
    baseLabel = outputLabel;
  });
  return { filters, outputLabel: baseLabel };
}

function normalizedAvatarPresenter(input: RenderDraftInput): AvatarPresenterInput | undefined {
  if (input.avatarPresenter) return input.avatarPresenter;
  if (!input.avatarPresenterPath) return undefined;
  return {
    path: input.avatarPresenterPath,
    provider: "deterministic_fixture",
    backgroundType: "baked",
    cropSafeRegion: { x: 0, y: 0, width: 1, height: 1 }
  };
}

function presenterVideoRect(layout: SceneComposition["presenter"]["layout"]): { x: number; y: number; width: number; height: number } {
  if (layout === "fullscreen") return { x: 0, y: 0, width: 1080, height: 1920 };
  if (layout === "close_up") return { x: 0, y: 220, width: 1080, height: 1700 };
  if (layout === "lower_third") return { x: 620, y: 1000, width: 430, height: 765 };
  if (layout === "split_left") return { x: 0, y: 470, width: 520, height: 925 };
  if (layout === "split_right") return { x: 560, y: 470, width: 520, height: 925 };
  return { x: 220, y: 590, width: 640, height: 1138 };
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
  return sourceSegments.slice(0, 30).map((segment) => {
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

async function drawImageInRect(
  context: OverlayContext,
  imagePath: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<boolean> {
  if (!imagePath || !path.isAbsolute(imagePath) || !existsSync(imagePath)) {
    return false;
  }
  try {
    let image = overlayImageCache.get(imagePath);
    if (!image) {
      const extension = path.extname(imagePath).toLowerCase();
      const stream = createReadStream(imagePath);
      image = extension === ".jpg" || extension === ".jpeg"
        ? await PImage.decodeJPEGFromStream(stream)
        : await PImage.decodePNGFromStream(stream);
      if (overlayImageCache.size >= 24) {
        overlayImageCache.clear();
      }
      overlayImageCache.set(imagePath, image);
    }
    const imageWidth = Number((image as { width?: number }).width ?? width);
    const imageHeight = Number((image as { height?: number }).height ?? height);
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    return true;
  } catch {
    return false;
  }
}

function catalogAvatarPath(avatarId: EditDecisionList["presenter"]["avatarId"]): string | undefined {
  if (avatarId !== "orbit" && avatarId !== "nova") {
    return undefined;
  }
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const root = process.env.GIDEON_AVATAR_CATALOG_DIR ?? (resourcesPath ? path.join(resourcesPath, "assets", "avatar-catalog") : path.join(process.cwd(), "assets", "avatar-catalog"));
  return path.join(root, `${avatarId}.png`);
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
