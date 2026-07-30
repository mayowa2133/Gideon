import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as PImage from "pureimage";
import type { CreatorEditorialEdl, EditorialCaptionCue, EditorialShot } from "../shared/creatorEditorial";
import type {
  CreatorEditorialV2Edl,
  EditorialV2BackgroundMode,
  EditorialV2CaptionCue,
  EditorialV2Shot
} from "../shared/creatorEditorialV2";
import type {
  CreatorEditorialV3Edl,
  EditorialV3CaptionCue,
  EditorialV3Shot
} from "../shared/creatorEditorialV3";
import type {
  CreatorEditorialV4Edl,
  EditorialV4CaptionCue,
  EditorialV4Shot
} from "../shared/creatorEditorialV4";
import {
  productCardLayoutV4,
  productPresenterLayoutV4,
  rectCenter,
  viewportForCard
} from "../shared/editorialProductFraming";
import type { BrandKit } from "../shared/types";

export const CREATOR_EDITORIAL_RENDERER_VERSION = "creator-editorial-renderer-v1" as const;
export const CREATOR_EDITORIAL_V2_RENDERER_VERSION = "creator-editorial-renderer-v2" as const;
export const CREATOR_EDITORIAL_V3_RENDERER_VERSION = "creator-editorial-renderer-v3.2" as const;
export const CREATOR_EDITORIAL_V4_RENDERER_VERSION = "creator-editorial-renderer-v4.5" as const;

export const creatorEditorialV2EncodingProfiles = {
  master: {
    width: 1080,
    height: 1920,
    fps: 30,
    videoCodec: "libx264",
    profile: "high",
    preset: "slow",
    crf: 17,
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioSampleRate: 48_000,
    audioBitrate: "224k"
  },
  social: {
    width: 720,
    height: 1280,
    fps: 30,
    videoCodec: "libx264",
    profile: "high",
    preset: "slow",
    crf: 20,
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioSampleRate: 48_000,
    audioBitrate: "192k"
  }
} as const;

export const creatorEditorialV3EncodingProfiles = {
  master: {
    ...creatorEditorialV2EncodingProfiles.master,
    crf: 16
  },
  social: {
    ...creatorEditorialV2EncodingProfiles.social,
    crf: 19
  }
} as const;

export const creatorEditorialV4EncodingProfiles = creatorEditorialV3EncodingProfiles;

export interface CreatorEditorialRenderSource {
  evidenceAssetId: string;
  sourcePath: string;
  fallbackStartMs: number;
  workflowId?: string;
  sourceSha256?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceDurationMs?: number;
  framingManifestPath?: string;
  framingManifestSha256?: string;
  verifiedSourceInterval?: { startMs: number; endMs: number };
  focusKeyframes?: Array<{
    id: string;
    kind: "action" | "result";
    startMs: number;
    endMs: number;
    region: { x: number; y: number; width: number; height: number };
    provenance: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
  }>;
  telemetryProvenance?: {
    action: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    result: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    cursor: "recorded_cursor" | "action_target_center" | "unavailable";
  };
  geometryProvenance?: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
}

export async function renderCreatorEditorialShot(input: {
  shot: EditorialShot;
  shotIndex: number;
  sources: CreatorEditorialRenderSource[];
  presenterPath: string;
  brandKit: BrandKit;
  outputPath: string;
  ffmpegPath: string;
}): Promise<void> {
  if (!path.isAbsolute(input.outputPath) || !path.isAbsolute(input.presenterPath)) throw new Error("Editorial renderer paths must be absolute.");
  const duration = seconds(input.shot.endMs - input.shot.startMs);
  const sourceId = input.shot.productEvidenceIds[0];
  const source = input.sources.find(({ evidenceAssetId }) => evidenceAssetId === sourceId)
    ?? input.sources[input.shotIndex % input.sources.length];
  if (!source && input.shot.productEvidenceIds.length > 0) throw new Error(`Editorial shot ${input.shot.id} has no renderable product source.`);
  const sourceStartSeconds = ((input.shot.sourceIntervalMs?.startMs ?? source?.fallbackStartMs ?? 0) / 1_000).toFixed(3);
  const presenterOffset = ((input.shot.startMs / 1_000) % 40).toFixed(3);
  const background = ffmpegColor(input.brandKit.backgroundColor);
  const header = ffmpegColor(input.brandKit.secondaryColor);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${background}:s=1080x1920:r=30:d=${duration}`];
  let filter: string;
  if (input.shot.presenter.visible && input.shot.productEvidenceIds.length > 0 && source) {
    args.push("-ss", sourceStartSeconds, "-i", source.sourcePath, "-ss", presenterOffset, "-i", input.presenterPath);
    const presenterX = input.shot.presenter.placement === "left" ? 20 : 580;
    const productX = input.shot.presenter.placement === "left" ? 440 : 35;
    filter = `${productCropFilter(1, "product", 610, 1_084, input.shot.crop)}` +
      `[2:v]fps=30,chromakey=0x00ff00:0.18:0.06,scale=500:889:flags=lanczos[p];` +
      `[0:v][product]overlay=x=${productX}:y=300:shortest=1[withproduct];` +
      `[withproduct][p]overlay=x=${presenterX}:y=930:shortest=1,drawbox=x=0:y=0:w=1080:h=132:color=${header}@1:t=fill`;
  } else if (input.shot.presenter.visible) {
    args.push("-ss", presenterOffset, "-i", input.presenterPath);
    filter = `[1:v]fps=30,chromakey=0x00ff00:0.18:0.06,scale=790:1404:flags=lanczos[p];` +
      `[0:v][p]overlay=x=145:y=410:shortest=1,drawbox=x=0:y=0:w=1080:h=132:color=${header}@1:t=fill`;
  } else if (input.shot.family === "branded_outro") {
    filter = `drawbox=x=80:y=420:w=920:h=920:color=${ffmpegColor(input.brandKit.primaryColor)}@1:t=fill`;
  } else if (source) {
    args.push("-ss", sourceStartSeconds, "-i", source.sourcePath);
    const slideX = input.shot.transitionIn.kind === "card_slide" ? "if(lt(t,.24),1080-(990*t/.24),90)" : "90";
    filter = `${productCropFilter(1, "product", 900, 1_600, input.shot.crop)}` +
      `[0:v][product]overlay=x='${slideX}':y=180:shortest=1,drawbox=x=0:y=0:w=1080:h=132:color=${header}@1:t=fill`;
  } else {
    filter = `drawbox=x=0:y=0:w=1080:h=132:color=${header}@1:t=fill`;
  }
  args.push("-filter_complex", filter, "-an", "-t", duration, "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", input.outputPath);
  await run(input.ffmpegPath, args, 300_000);
}

export async function renderCreatorEditorialV2Shot(input: {
  shot: EditorialV2Shot;
  shotIndex: number;
  sources: CreatorEditorialRenderSource[];
  presenterPath: string;
  brandKit: BrandKit;
  outputPath: string;
  ffmpegPath: string;
}): Promise<void> {
  if (!path.isAbsolute(input.outputPath) || !path.isAbsolute(input.presenterPath)) {
    throw new Error("Creator editorial v2 renderer paths must be absolute.");
  }
  if (input.shot.evidenceTreatment.syntheticPointerAdded || !input.shot.evidenceTreatment.authenticPixelsPreserved) {
    throw new Error("Creator editorial v2 refuses fabricated evidence or pointer layers.");
  }
  const duration = seconds(input.shot.endMs - input.shot.startMs);
  const sourceId = input.shot.productEvidenceIds[0];
  const source = input.sources.find(({ evidenceAssetId }) => evidenceAssetId === sourceId);
  if (sourceId && !source) throw new Error(`Creator editorial v2 shot ${input.shot.id} has no authentic source.`);
  const sourceStartSeconds = ((input.shot.sourceIntervalMs?.startMs ?? source?.fallbackStartMs ?? 0) / 1_000).toFixed(3);
  const presenterOffset = ((input.shot.startMs / 1_000) % 40).toFixed(3);
  const background = backgroundColor(input.shot.backgroundMode, input.brandKit);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${background}:s=1080x1920:r=30:d=${duration}`
  ];
  const product = Boolean(source);
  if (source) args.push("-ss", sourceStartSeconds, "-i", source.sourcePath);
  if (input.shot.presenter.visible) args.push("-ss", presenterOffset, "-i", input.presenterPath);
  const presenterInput = input.shot.presenter.visible ? product ? 2 : 1 : -1;
  const decoration = backgroundDecoration(input.shot.backgroundMode, input.brandKit);
  const filters: string[] = [];
  let current = "base";
  filters.push(`[0:v]${decoration}[${current}]`);

  if (source) {
    const dimensions = productDimensions(input.shot);
    filters.push(productCameraFilter(1, "product", dimensions.width, dimensions.height, input.shot));
    const position = productPosition(input.shot, dimensions.width);
    filters.push(
      `[${current}]drawbox=x=${position.x - 18}:y=${position.y - 18}:w=${dimensions.width + 36}:h=${dimensions.height + 36}:` +
      `color=0x000000@0.24:t=fill[productshadow]`
    );
    filters.push(`[productshadow][product]overlay=x=${position.x}:y=${position.y}:shortest=1[withproduct]`);
    const borderColor = ffmpegColor(input.brandKit.accentColor);
    filters.push(
      `[withproduct]drawbox=x=${position.x}:y=${position.y}:w=${dimensions.width}:h=${dimensions.height}:` +
      `color=${borderColor}@0.92:t=5[productborder]`
    );
    current = "productborder";
  }

  if (input.shot.presenter.visible) {
    const presenter = presenterGeometry(input.shot);
    filters.push(
      `[${presenterInput}:v]fps=30,chromakey=0x00ff00:0.18:0.06,` +
      `scale=${presenter.width}:${presenter.height}:flags=lanczos,format=rgba,` +
      `split=2[presenter][presentershadowbase]`
    );
    const swaySeconds = (input.shot.presenter.motion.idleSwayPeriodMs / 1_000).toFixed(3);
    const xExpression = `${presenter.x}+${input.shot.presenter.motion.idleSwayAmplitudePx}*sin(2*PI*t/${swaySeconds})`;
    const yExpression = `${presenter.y}+${input.shot.presenter.motion.headAmplitudePx}*sin(2*PI*t/${swaySeconds}+.8)`;
    filters.push("[presentershadowbase]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.42,boxblur=8:1[presentershadow]");
    filters.push(
      `[${current}][presentershadow]overlay=x='${xExpression}+8':y='${yExpression}+10':eval=frame:shortest=1[withshadow]`
    );
    filters.push(`[withshadow][presenter]overlay=x='${xExpression}':y='${yExpression}':eval=frame:shortest=1[withpresenter]`);
    current = "withpresenter";
  }

  const headerColor = input.shot.backgroundMode === "cream_editorial" || input.shot.backgroundMode === "cream_product"
    ? ffmpegColor(input.brandKit.primaryColor)
    : ffmpegColor(input.brandKit.secondaryColor);
  filters.push(
    `[${current}]drawbox=x=0:y=0:w=1080:h=104:color=${headerColor}@0.98:t=fill,` +
    `drawbox=x=62:y=128:w=116:h=6:color=${ffmpegColor(input.brandKit.accentColor)}@0.95:t=fill[out]`
  );
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[out]",
    "-an",
    "-t", duration,
    "-r", "30",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    input.outputPath
  );
  await run(input.ffmpegPath, args, 300_000);
}

export async function renderCreatorEditorialV3Shot(input: {
  shot: EditorialV3Shot;
  shotIndex: number;
  sources: CreatorEditorialRenderSource[];
  presenterPath: string;
  brandKit: BrandKit;
  outputPath: string;
  ffmpegPath: string;
}): Promise<void> {
  if (!path.isAbsolute(input.outputPath) || !path.isAbsolute(input.presenterPath)) {
    throw new Error("Creator editorial v3 renderer paths must be absolute.");
  }
  if (!input.shot.evidenceTreatment.authenticPixelsPreserved || input.shot.evidenceTreatment.cursorLayerCount !== 0) {
    throw new Error("Creator editorial v3 refuses fabricated evidence or pointer layers.");
  }
  if (input.shot.presenter.visible && !input.shot.presenter.performance) {
    throw new Error(`Creator editorial v3 shot ${input.shot.id} is missing an actual presenter performance interval.`);
  }
  const shotDurationMs = input.shot.endMs - input.shot.startMs;
  const duration = seconds(shotDurationMs);
  const sourceId = input.shot.productEvidenceIds[0];
  const source = input.sources.find(({ evidenceAssetId }) => evidenceAssetId === sourceId);
  if (sourceId && !source) throw new Error(`Creator editorial v3 shot ${input.shot.id} has no authentic source.`);
  if (source && isEditorialV4Shot(input.shot)) {
    assertCreatorEditorialV4RenderSource(source, input.shot);
  }
  const sourceStartSeconds = ((input.shot.sourceIntervalMs?.startMs ?? source?.fallbackStartMs ?? 0) / 1_000).toFixed(3);
  const background = backgroundColor(input.shot.backgroundMode, input.brandKit);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${background}:s=1080x1920:r=30:d=${duration}`
  ];
  const hasProduct = Boolean(source);
  if (source) args.push("-ss", sourceStartSeconds, "-i", source.sourcePath);
  const performance = input.shot.presenter.performance;
  if (performance) {
    args.push(
      "-ss", seconds(performance.sourceStartMs),
      "-t", seconds(performance.sourceEndMs - performance.sourceStartMs),
      "-i", input.presenterPath
    );
  }
  const presenterInput = input.shot.presenter.visible ? hasProduct ? 2 : 1 : -1;
  const filters: string[] = [];
  let current = "base";
  filters.push(`[0:v]${backgroundDecorationV3(input.shot, input.brandKit)}[${current}]`);

  if (source) {
    const dimensions = productDimensionsV3(input.shot);
    filters.push(isEditorialV4Shot(input.shot)
      ? productCameraFilterV4(1, "product", dimensions.width, dimensions.height, input.shot as unknown as EditorialV4Shot, source)
      : productCameraFilterV3(1, "product", dimensions.width, dimensions.height, input.shot));
    const position = productPositionV3(input.shot, dimensions.width);
    const entryDirection = input.shot.presenter.placement === "left" ? 1 : -1;
    const entryX = `${position.x}+${entryDirection * 72}*(1-min(t/.48\\,1))*(1-min(t/.48\\,1))`;
    const entryY = `${position.y}+42*(1-min(t/.48\\,1))*(1-min(t/.48\\,1))`;
    filters.push(
      `[${current}]drawbox=x=${position.x - 24}:y=${position.y - 24}:w=${dimensions.width + 48}:h=${dimensions.height + 48}:` +
      `color=0x000000@0.36:t=fill[productshadow]`
    );
    filters.push(`[productshadow][product]overlay=x='${entryX}':y='${entryY}':eval=frame:shortest=1[withproduct]`);
    filters.push(
      `[withproduct]drawbox=x=${position.x}:y=${position.y}:w=${dimensions.width}:h=${dimensions.height}:` +
      `color=${ffmpegColor(input.brandKit.accentColor)}@0.82:t=${input.shot.evidenceTreatment.borderWidthPx}[productborder]`
    );
    current = "productborder";
  }

  if (input.shot.presenter.visible && performance) {
    const presenter = presenterGeometryV3(input.shot);
    const clipDurationSeconds = (performance.sourceEndMs - performance.sourceStartMs) / 1_000;
    const preRollSeconds = (
      "preRollHoldMs" in performance && typeof performance.preRollHoldMs === "number"
        ? Math.max(0, performance.preRollHoldMs) / 1_000
        : 0
    );
    const holdSeconds = Math.max(0, shotDurationMs / 1_000 - clipDurationSeconds - preRollSeconds + 0.2).toFixed(3);
    filters.push(
      `[${presenterInput}:v]fps=30,setpts=PTS-STARTPTS,chromakey=0x00ff00:0.18:0.06,` +
      `scale=${presenter.width}:${presenter.height}:flags=lanczos,format=rgba,` +
      `tpad=start_mode=clone:start_duration=${preRollSeconds.toFixed(3)}:stop_mode=clone:stop_duration=${holdSeconds},` +
      "split=2[presenter][presentershadowbase]"
    );
    const swaySeconds = (input.shot.presenter.motion.idleSwayPeriodMs / 1_000).toFixed(3);
    const directionalTravel = input.shot.presenter.motion.lateralShiftPx;
    const xExpression = `${presenter.x}+${directionalTravel}*min(t/${duration}\\,1)+` +
      `${Math.max(4, input.shot.presenter.motion.idleSwayAmplitudePx * 0.55)}*sin(2*PI*t/${swaySeconds})`;
    const yExpression = `${presenter.y}+${Math.max(3, input.shot.presenter.motion.headAmplitudePx * 0.7)}*sin(2*PI*t/${swaySeconds}+.8)`;
    filters.push("[presentershadowbase]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.48,boxblur=10:1[presentershadow]");
    filters.push(`[${current}][presentershadow]overlay=x='${xExpression}+10':y='${yExpression}+14':eval=frame:shortest=1[withshadow]`);
    filters.push(`[withshadow][presenter]overlay=x='${xExpression}':y='${yExpression}':eval=frame:shortest=1[withpresenter]`);
    current = "withpresenter";
    const v6Direction = (
      input.shot as EditorialV3Shot & {
        v6Direction?: { voiceReactiveAccent?: "visor_pulse" | "eye_glow" | "none" }
      }
    ).v6Direction;
    if (v6Direction?.voiceReactiveAccent && v6Direction.voiceReactiveAccent !== "none") {
      const accentY = Math.round(presenter.y + presenter.height * 0.19);
      const accentX = Math.round(presenter.x + presenter.width * 0.43);
      const pulse = v6Direction.voiceReactiveAccent === "eye_glow" ? 12 : 20;
      filters.push(
        `[${current}]drawbox=x='${accentX}-${pulse / 2}*sin(2*PI*t/.72)':y=${accentY}:` +
        `w='${72 + pulse}+${pulse}*sin(2*PI*t/.72)':h=9:` +
        `color=${ffmpegColor(input.brandKit.accentColor)}@0.58:t=fill[withv6accent]`
      );
      current = "withv6accent";
    }
  }

  const headerColor = input.shot.backgroundMode === "cream_editorial" || input.shot.backgroundMode === "cream_product"
    ? ffmpegColor(input.brandKit.primaryColor)
    : ffmpegColor(input.brandKit.secondaryColor);
  filters.push(
    `[${current}]drawbox=x=0:y=0:w=1080:h=92:color=${headerColor}@0.97:t=fill,` +
    `drawbox=x='62+34*sin(2*PI*t/${Math.max(1.8, shotDurationMs / 1_000).toFixed(3)})':y=118:w=126:h=5:` +
    `color=${ffmpegColor(input.brandKit.accentColor)}@0.95:t=fill[out]`
  );
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[out]",
    "-an",
    "-t", duration,
    "-r", "30",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-preset", "medium",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    input.outputPath
  );
  await run(input.ffmpegPath, args, 300_000);
}

export async function renderCreatorEditorialV4Shot(input: {
  shot: EditorialV4Shot;
  shotIndex: number;
  sources: CreatorEditorialRenderSource[];
  presenterPath: string;
  brandKit: BrandKit;
  outputPath: string;
  ffmpegPath: string;
}): Promise<void> {
  const basePath = path.join(path.dirname(input.outputPath), `.${path.basename(input.outputPath)}.v4-base.mp4`);
  try {
    await renderCreatorEditorialV3Shot({
      ...input,
      shot: input.shot as unknown as EditorialV3Shot,
      outputPath: basePath
    });
    if (input.shot.productEvidenceIds.length > 0) {
      await fs.rm(input.outputPath, { force: true });
      await fs.rename(basePath, input.outputPath);
      return;
    }
    const frameCount = Math.max(1, Math.round((input.shot.endMs - input.shot.startMs) / 1_000 * 30));
    const driftDirection = input.shotIndex % 2 === 0 ? 1 : -1;
    const zoom = `1+0.15*on/${frameCount}`;
    const x = `(iw-iw/zoom)/2+${driftDirection}*0.16*(iw-iw/zoom)*on/${frameCount}`;
    const y = `(ih-ih/zoom)/2-0.09*(ih-ih/zoom)*on/${frameCount}`;
    await run(input.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", basePath,
      "-vf", `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=1080x1920:fps=30,setsar=1`,
      "-an", "-r", "30", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "16",
      "-pix_fmt", "yuv420p", input.outputPath
    ], 300_000);
  } finally {
    await fs.rm(basePath, { force: true });
  }
}

export async function renderCreatorEditorialCaptionOverlay(input: {
  captions: EditorialCaptionCue[];
  durationMs: number;
  outputDir: string;
  brandKit: BrandKit;
  disclosure: string;
}): Promise<{ framePattern: string; frameRate: 10 }> {
  if (!path.isAbsolute(input.outputDir)) throw new Error("Editorial caption output directory must be absolute.");
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  loadOverlayFont();
  const frameRate = 10 as const;
  const frameCount = Math.ceil(input.durationMs / 1_000 * frameRate);
  const outroStartMs = Math.max(0, input.durationMs - 3_000);
  const reusable = new Map<string, string>();
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / frameRate * 1_000;
    const caption = input.captions.find((cue) => timeMs >= cue.startMs && timeMs < cue.endMs);
    const outro = timeMs >= outroStartMs;
    const key = outro ? "outro" : caption?.id ?? "blank";
    const outputPath = path.join(input.outputDir, `${String(index).padStart(6, "0")}.png`);
    const existing = reusable.get(key);
    if (existing) {
      await fs.copyFile(existing, outputPath);
      continue;
    }
    const bitmap = PImage.make(1080, 1920);
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, 1080, 1920);
    if (outro) {
      context.fillStyle = input.brandKit.secondaryColor;
      context.font = "108px GideonEditorial";
      centerText(context, input.brandKit.productName.toUpperCase(), 760);
      context.fillStyle = input.brandKit.accentColor;
      context.font = "42px GideonEditorial";
      centerText(context, input.brandKit.tagline ?? "Evidence beside the next decision.", 860);
      context.fillStyle = "rgba(244,241,232,0.72)";
      context.font = "24px GideonEditorial";
      centerText(context, input.disclosure, 1215);
    } else if (caption) {
      context.fillStyle = input.brandKit.primaryColor;
      context.font = "28px GideonEditorial";
      context.fillText(input.brandKit.productName.toUpperCase(), 62, 82);
      const top = Math.round(caption.safeRegion.y * 1920);
      context.fillStyle = "rgba(7,21,38,0.90)";
      fillRect(context, 55, top, 970, 178);
      context.fillStyle = input.brandKit.accentColor;
      fillRect(context, 78, top + 20, 122, 7);
      context.fillStyle = caption.role === "display_editorial" ? input.brandKit.accentColor : input.brandKit.secondaryColor;
      fitCenteredText(context, caption.words.join(" "), top + 112, caption.role === "display_editorial" ? 76 : 68, 48, 900);
    }
    await encodeOverlayPng(bitmap, outputPath);
    reusable.set(key, outputPath);
  }
  return { framePattern: path.join(input.outputDir, "%06d.png"), frameRate };
}

export async function renderCreatorEditorialV2CaptionOverlay(input: {
  captions: EditorialV2CaptionCue[];
  durationMs: number;
  outputDir: string;
  brandKit: BrandKit;
  disclosure: string;
}): Promise<{ framePattern: string; frameRate: 10 }> {
  if (!path.isAbsolute(input.outputDir)) throw new Error("Creator editorial v2 caption directory must be absolute.");
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  loadOverlayFont();
  const frameRate = 10 as const;
  const frameCount = Math.ceil(input.durationMs / 1_000 * frameRate);
  const outroStartMs = input.durationMs - 3_000;
  const reusable = new Map<string, string>();
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / frameRate * 1_000;
    const caption = input.captions.find((cue) => timeMs >= cue.startMs && timeMs < cue.endMs);
    const outro = timeMs >= outroStartMs;
    const animationFrame = caption
      ? Math.min(3, Math.floor(Math.max(0, timeMs - caption.startMs) / 100))
      : 0;
    const key = outro ? "v2-outro" : caption ? `${caption.id}:${animationFrame}` : "v2-blank";
    const outputPath = path.join(input.outputDir, `${String(index).padStart(6, "0")}.png`);
    const existing = reusable.get(key);
    if (existing) {
      await fs.copyFile(existing, outputPath);
      continue;
    }
    const bitmap = PImage.make(1080, 1920);
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, 1080, 1920);
    if (outro) {
      context.fillStyle = input.brandKit.secondaryColor;
      context.font = "118px GideonEditorial";
      centerText(context, input.brandKit.productName.toUpperCase(), 760);
      context.fillStyle = input.brandKit.accentColor;
      context.font = "46px GideonEditorial";
      centerText(context, input.brandKit.tagline ?? "Evidence beside the next decision.", 868);
      context.fillStyle = "rgba(244,241,232,0.72)";
      context.font = "24px GideonEditorial";
      centerText(context, input.disclosure, 1220);
    } else if (caption) {
      context.fillStyle = caption.safeRegion.y < 0.4 ? input.brandKit.primaryColor : input.brandKit.secondaryColor;
      context.font = "24px GideonEditorial";
      context.fillText(input.brandKit.productName.toUpperCase(), 62, 72);
      const progress = Math.min(1, Math.max(0, animationFrame / 2));
      const regionTop = Math.round(caption.safeRegion.y * 1920);
      if (caption.role === "full_frame_editorial") {
        const fontSize = Math.round(80 + progress * 22);
        context.fillStyle = "rgba(7,21,38,0.82)";
        fillRect(context, 52, regionTop - 12, 976, 248);
        context.fillStyle = input.brandKit.accentColor;
        context.font = `${fontSize}px GideonEditorial`;
        fitCenteredText(context, caption.words.join(" "), regionTop + 142, fontSize, 68, 900);
      } else if (caption.role === "keyword_emphasis") {
        const fontSize = Math.round(72 + progress * 18);
        context.fillStyle = "rgba(7,21,38,0.88)";
        fillRect(context, 80, regionTop + Math.round((1 - progress) * 18), 920, 158);
        context.fillStyle = input.brandKit.accentColor;
        fitCenteredText(context, caption.words.join(" "), regionTop + 104, fontSize, 62, 850);
      } else {
        const y = regionTop + Math.round((1 - progress) * 20);
        context.fillStyle = "rgba(7,21,38,0.82)";
        fillRect(context, 100, y, 880, 132);
        context.fillStyle = input.brandKit.secondaryColor;
        fitCenteredText(context, caption.words.join(" "), y + 88, 64, 50, 800);
      }
    }
    await encodeOverlayPng(bitmap, outputPath);
    reusable.set(key, outputPath);
  }
  return { framePattern: path.join(input.outputDir, "%06d.png"), frameRate };
}

export async function renderCreatorEditorialV3CaptionOverlay(input: {
  captions: EditorialV3CaptionCue[];
  durationMs: number;
  outputDir: string;
  brandKit: BrandKit;
  disclosure: string;
  conceptualRanges?: Array<{ startMs: number; endMs: number; label: string }>;
  persistentCtaText?: string;
}): Promise<{ framePattern: string; frameRate: 10 }> {
  if (!path.isAbsolute(input.outputDir)) throw new Error("Creator editorial v3 caption directory must be absolute.");
  await fs.mkdir(input.outputDir, { recursive: true, mode: 0o700 });
  loadOverlayFont();
  const frameRate = 10 as const;
  const frameCount = Math.ceil(input.durationMs / 1_000 * frameRate);
  const outroStartMs = input.durationMs - 3_000;
  const reusable = new Map<string, string>();
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / frameRate * 1_000;
    const caption = input.captions.find((cue) => timeMs >= cue.startMs && timeMs < cue.endMs);
    const outro = timeMs >= outroStartMs;
    const conceptual = input.conceptualRanges?.find(({ startMs, endMs }) => timeMs >= startMs && timeMs < endMs);
    const animationFrame = caption
      ? Math.min(4, Math.floor(Math.max(0, timeMs - caption.startMs) / 80))
      : outro
        ? Math.min(12, Math.floor((timeMs - outroStartMs) / 100))
        : 0;
    const key = [
      outro ? `v3-outro:${animationFrame}` : caption ? `${caption.id}:${animationFrame}` : "v3-blank",
      conceptual?.label ?? ""
    ].join(":");
    const outputPath = path.join(input.outputDir, `${String(index).padStart(6, "0")}.png`);
    const existing = reusable.get(key);
    if (existing) {
      await fs.copyFile(existing, outputPath);
      continue;
    }
    const bitmap = PImage.make(1080, 1920);
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, 1080, 1920);
    if (outro) {
      const progress = Math.min(1, animationFrame / 8);
      context.fillStyle = input.brandKit.secondaryColor;
      context.font = `${Math.round(92 + progress * 34)}px GideonDisplay`;
      centerText(context, input.brandKit.productName.toUpperCase(), 765);
      context.fillStyle = input.brandKit.accentColor;
      fillRect(context, 300, 810, Math.round(480 * progress), 6);
      context.font = "42px GideonEditorial";
      centerText(context, input.brandKit.tagline ?? "Evidence beside the next decision.", 885);
      if (input.persistentCtaText) {
        context.fillStyle = input.brandKit.accentColor;
        fillRect(context, 248, 952, 584, 92);
        context.fillStyle = input.brandKit.primaryColor;
        context.font = "38px GideonEditorial";
        centerText(context, input.persistentCtaText.toUpperCase(), 1_013);
      }
      context.fillStyle = "rgba(244,241,232,0.72)";
      context.font = "23px GideonEditorial";
      centerText(context, input.disclosure, 1220);
    } else if (caption) {
      context.fillStyle = caption.contrast === "dark_text" ? input.brandKit.primaryColor : input.brandKit.secondaryColor;
      context.font = "22px GideonEditorial";
      context.fillText(input.brandKit.productName.toUpperCase(), 62, 68);
      const progress = Math.min(1, animationFrame / 3);
      const x = Math.round(caption.safeRegion.x * 1080);
      const y = Math.round(caption.safeRegion.y * 1920);
      const width = Math.round(caption.safeRegion.width * 1080);
      const height = Math.round(caption.safeRegion.height * 1920);
      if (caption.visualStyle === "editorial_takeover") {
        const plateColor = caption.contrast === "dark_text" ? "rgba(244,241,232,0.94)" : "rgba(7,21,38,0.90)";
        context.fillStyle = plateColor;
        fillRect(context, x - 18, y - 20, width + 36, Math.min(height, 360));
        context.fillStyle = input.brandKit.accentColor;
        fillRect(context, x, y + 12, Math.round(width * progress), 7);
        context.font = `${Math.round(84 + progress * 30)}px GideonDisplay`;
        fitTextInRegion(context, caption.words.join(" "), x, y + 168, width, 114, 62, "center");
      } else if (caption.visualStyle === "accent_underline") {
        const rise = Math.round((1 - progress) * 24);
        context.fillStyle = input.brandKit.accentColor;
        context.font = `${Math.round(78 + progress * 24)}px GideonEditorial`;
        fitTextInRegion(context, caption.words.join(" "), x, y + 104 + rise, width, 102, 58, caption.placementKey.endsWith("left") ? "left" : "center");
        fillRect(context, x, y + 132 + rise, Math.round(width * 0.68 * progress), 7);
      } else {
        const rise = Math.round((1 - progress) * 18);
        if (caption.plate === "soft") {
          context.fillStyle = caption.contrast === "dark_text" ? "rgba(244,241,232,0.82)" : "rgba(7,21,38,0.70)";
          fillRect(context, x - 12, y + rise, width + 24, 112);
        }
        context.fillStyle = caption.contrast === "dark_text" ? input.brandKit.primaryColor : input.brandKit.secondaryColor;
        context.font = "58px GideonEditorial";
        fitTextInRegion(
          context,
          caption.words.join(" "),
          x,
          y + 76 + rise,
          width,
          62,
          42,
          caption.placementKey.endsWith("left") ? "left" : caption.placementKey.endsWith("right") ? "right" : "center"
        );
      }
    }
    if (conceptual) {
      context.fillStyle = "rgba(7,21,38,0.88)";
      fillRect(context, 62, 126, 304, 54);
      context.fillStyle = input.brandKit.secondaryColor;
      context.font = "22px GideonEditorial";
      context.fillText(conceptual.label.toUpperCase(), 82, 161);
    }
    await encodeOverlayPng(bitmap, outputPath);
    reusable.set(key, outputPath);
  }
  return { framePattern: path.join(input.outputDir, "%06d.png"), frameRate };
}

export async function renderCreatorEditorialV4CaptionOverlay(input: {
  captions: EditorialV4CaptionCue[];
  durationMs: number;
  outputDir: string;
  brandKit: BrandKit;
  disclosure: string;
  conceptualRanges?: Array<{ startMs: number; endMs: number; label: string }>;
  persistentCtaText?: string;
}): Promise<{ framePattern: string; frameRate: 10 }> {
  return renderCreatorEditorialV3CaptionOverlay({
    ...input,
    captions: input.captions as unknown as EditorialV3CaptionCue[]
  });
}

export function editorialRendererCacheContext(input: {
  edl: CreatorEditorialEdl;
  presenterSha256: string;
}): string {
  return JSON.stringify({
    rendererVersion: CREATOR_EDITORIAL_RENDERER_VERSION,
    templateId: input.edl.templateId,
    compilerVersion: input.edl.compilerVersion,
    brandKit: input.edl.brandKit,
    presenterSha256: input.presenterSha256
  });
}

export function editorialV2RendererCacheContext(input: {
  edl: CreatorEditorialV2Edl;
  presenterSha256: string;
}): string {
  return JSON.stringify({
    rendererVersion: CREATOR_EDITORIAL_V2_RENDERER_VERSION,
    templateId: input.edl.templateId,
    compilerVersion: input.edl.compilerVersion,
    brandKit: input.edl.brandKit,
    presenterSha256: input.presenterSha256,
    encodingProfiles: creatorEditorialV2EncodingProfiles
  });
}

export function editorialV3RendererCacheContext(input: {
  edl: CreatorEditorialV3Edl;
  presenterSha256: string;
}): string {
  return JSON.stringify({
    rendererVersion: CREATOR_EDITORIAL_V3_RENDERER_VERSION,
    templateId: input.edl.templateId,
    compilerVersion: input.edl.compilerVersion,
    brandKit: input.edl.brandKit,
    presenterSha256: input.presenterSha256,
    performances: input.edl.shots.map(({ id, presenter }) => ({ id, performance: presenter.performance })),
    encodingProfiles: creatorEditorialV3EncodingProfiles
  });
}

export function editorialV4RendererCacheContext(input: {
  edl: CreatorEditorialV4Edl;
  presenterSha256: string;
}): string {
  return JSON.stringify({
    rendererVersion: CREATOR_EDITORIAL_V4_RENDERER_VERSION,
    templateId: input.edl.templateId,
    compilerVersion: input.edl.compilerVersion,
    brandKit: input.edl.brandKit,
    presenterSha256: input.presenterSha256,
    performances: input.edl.shots.map(({ id, presenter, choreography }) => ({
      id,
      performance: presenter.performance,
      choreography
    })),
    evidenceFocus: input.edl.shots.map(({ id, evidenceTreatment }) => ({
      id,
      criticalRegion: evidenceTreatment.criticalRegion,
      postFocusDrift: evidenceTreatment.postFocusDrift
    })),
    encodingProfiles: creatorEditorialV4EncodingProfiles
  });
}

function run(executable: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} failed: ${stderr}`));
    });
  });
}

function ffmpegColor(value: string): string {
  if (!/^#[a-f0-9]{6}$/i.test(value)) throw new Error(`Brand color is invalid: ${value}`);
  return `0x${value.slice(1)}`;
}

function productCropFilter(
  inputIndex: number,
  outputLabel: string,
  targetWidth: number,
  targetHeight: number,
  focus: EditorialShot["crop"]
): string {
  const scale = Math.min(2.15, Math.max(1, focus.scale));
  const scaledWidth = even(Math.ceil(targetWidth * scale));
  const scaledHeight = even(Math.ceil(targetHeight * scale));
  const focusX = Math.min(1, Math.max(0, focus.x)).toFixed(5);
  const focusY = Math.min(1, Math.max(0, focus.y)).toFixed(5);
  return `[${inputIndex}:v]fps=30,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,` +
    `crop=${targetWidth}:${targetHeight}:x='min(max(iw*${focusX}-ow/2\\,0)\\,iw-ow)':y='min(max(ih*${focusY}-oh/2\\,0)\\,ih-oh)',setsar=1[${outputLabel}];`;
}

function productCameraFilter(
  inputIndex: number,
  outputLabel: string,
  targetWidth: number,
  targetHeight: number,
  shot: EditorialV2Shot
): string {
  const from = shot.camera.from;
  const to = shot.camera.to;
  const eased = "min(on/18\\,1)*min(on/18\\,1)*(3-2*min(on/18\\,1))";
  const zoom = `${from.scale.toFixed(5)}+(${to.scale.toFixed(5)}-${from.scale.toFixed(5)})*${eased}`;
  const focusX = `${from.x.toFixed(5)}+(${to.x.toFixed(5)}-${from.x.toFixed(5)})*${eased}`;
  const focusY = `${from.y.toFixed(5)}+(${to.y.toFixed(5)}-${from.y.toFixed(5)})*${eased}`;
  return `[${inputIndex}:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,zoompan=z='${zoom}':x='iw*(${focusX})-iw/zoom/2':` +
    `y='ih*(${focusY})-ih/zoom/2':d=1:s=${targetWidth}x${targetHeight}:fps=30,setsar=1[${outputLabel}]`;
}

function productCameraFilterV3(
  inputIndex: number,
  outputLabel: string,
  targetWidth: number,
  targetHeight: number,
  shot: EditorialV3Shot
): string {
  const from = shot.camera.from;
  const to = shot.camera.to;
  const contextFrames = Math.max(12, Math.round(shot.evidenceTreatment.contextMs / 1_000 * 30));
  const actionFrames = Math.max(contextFrames + 1, Math.round((shot.evidenceTreatment.contextMs + shot.evidenceTreatment.actionMs) / 1_000 * 30));
  const totalFrames = Math.max(actionFrames + 1, Math.round((shot.endMs - shot.startMs) / 1_000 * 30));
  const progress = `max(0\\,min((on-${contextFrames})/${Math.max(1, actionFrames - contextFrames)}\\,1))`;
  const eased = `(${progress})*(${progress})*(3-2*(${progress}))`;
  const postProgress = `max(0\\,min((on-${actionFrames})/${Math.max(1, totalFrames - actionFrames)}\\,1))`;
  const postEased = `(${postProgress})*(${postProgress})*(3-2*(${postProgress}))`;
  const driftDirection = [...shot.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
  const zoom = `${from.scale.toFixed(5)}+(${to.scale.toFixed(5)}-${from.scale.toFixed(5)})*${eased}+0.035*${postEased}`;
  const focusX = `${from.x.toFixed(5)}+(${to.x.toFixed(5)}-${from.x.toFixed(5)})*${eased}+${(driftDirection * 0.008).toFixed(3)}*${postEased}`;
  const focusY = `${from.y.toFixed(5)}+(${to.y.toFixed(5)}-${from.y.toFixed(5)})*${eased}-0.006*${postEased}`;
  return `[${inputIndex}:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,zoompan=z='${zoom}':x='min(max(iw*(${focusX})-iw/zoom/2\\,0)\\,iw-iw/zoom)':` +
    `y='min(max(ih*(${focusY})-ih/zoom/2\\,0)\\,ih-ih/zoom)':d=1:s=${targetWidth}x${targetHeight}:fps=30,` +
    `unsharp=5:5:0.32:5:5:0.0,setsar=1[${outputLabel}]`;
}

function productCameraFilterV4(
  inputIndex: number,
  outputLabel: string,
  targetWidth: number,
  targetHeight: number,
  shot: EditorialV4Shot,
  source: CreatorEditorialRenderSource
): string {
  const sourceWidth = source.sourceWidth ?? shot.evidenceTreatment.sourceDimensions?.width ?? 1_440;
  const sourceHeight = source.sourceHeight ?? shot.evidenceTreatment.sourceDimensions?.height ?? 900;
  const fallbackViewport = viewportForCard(
    shot.evidenceTreatment.criticalRegion ?? { x: 0.10, y: 0.08, width: 0.80, height: 0.84 },
    { x: 0, y: 0, width: targetWidth, height: targetHeight },
    { sourceSize: { width: sourceWidth, height: sourceHeight } }
  );
  const actionViewport = shot.evidenceTreatment.actionViewport ?? fallbackViewport;
  const resultViewport = shot.evidenceTreatment.resultViewport ?? fallbackViewport;
  const isUserStoryV7 = "v7Direction" in shot;
  if (isUserStoryV7) {
    const totalFrames = Math.max(2, Math.round((shot.endMs - shot.startMs) / 1_000 * 30));
    const settleFrames = Math.max(4, Math.round(totalFrames * 0.12));
    const moveFrames = Math.max(1, totalFrames - settleFrames * 2);
    const progress = `max(0\\,min((n-${settleFrames})/${moveFrames}\\,1))`;
    const eased = `(${progress})*(${progress})*(3-2*(${progress}))`;
    const width = `${actionViewport.width.toFixed(8)}+${(resultViewport.width - actionViewport.width).toFixed(8)}*${eased}`;
    const height = `${actionViewport.height.toFixed(8)}+${(resultViewport.height - actionViewport.height).toFixed(8)}*${eased}`;
    const x = `${actionViewport.x.toFixed(8)}+${(resultViewport.x - actionViewport.x).toFixed(8)}*${eased}`;
    const y = `${actionViewport.y.toFixed(8)}+${(resultViewport.y - actionViewport.y).toFixed(8)}*${eased}`;
    return `[${inputIndex}:v]fps=30,crop=w='max(2\\,floor(iw*(${width})/2)*2)':` +
      `h='max(2\\,floor(ih*(${height})/2)*2)':` +
      `x='min(max(iw*(${x})\\,0)\\,iw-ow)':y='min(max(ih*(${y})\\,0)\\,ih-oh)',` +
      `scale=${targetWidth}:${targetHeight}:flags=lanczos,unsharp=5:5:0.26:5:5:0.0,setsar=1[${outputLabel}]`;
  }
  const viewportWidth = Math.min(1, Math.max(actionViewport.width, resultViewport.width));
  const viewportHeight = Math.min(1, Math.max(actionViewport.height, resultViewport.height));
  const actionCenter = rectCenter(shot.evidenceTreatment.actionRegion ?? shot.evidenceTreatment.criticalRegion ?? actionViewport);
  const resultCenter = rectCenter(shot.evidenceTreatment.resultRegion ?? shot.evidenceTreatment.criticalRegion ?? resultViewport);
  const actionX = clamp(actionCenter.x - viewportWidth / 2, 0, 1 - viewportWidth);
  const actionY = clamp(actionCenter.y - viewportHeight / 2, 0, 1 - viewportHeight);
  const resultX = clamp(resultCenter.x - viewportWidth / 2, 0, 1 - viewportWidth);
  const resultY = clamp(resultCenter.y - viewportHeight / 2, 0, 1 - viewportHeight);
  const contextFrames = Math.max(8, Math.round(shot.evidenceTreatment.contextMs / 1_000 * 30));
  const actionFrames = Math.max(contextFrames + 1, Math.round(
    (shot.evidenceTreatment.contextMs + shot.evidenceTreatment.actionMs) / 1_000 * 30
  ));
  const totalFrames = Math.max(actionFrames + 1, Math.round((shot.endMs - shot.startMs) / 1_000 * 30));
  const resultHoldFrames = Math.max(12, Math.round(shot.evidenceTreatment.resultHoldMs / 1_000 * 30));
  const resultMoveEnd = Math.max(actionFrames + 1, totalFrames - resultHoldFrames);
  const progress = `max(0\\,min((n-${actionFrames})/${Math.max(1, resultMoveEnd - actionFrames)}\\,1))`;
  const eased = `(${progress})*(${progress})*(3-2*(${progress}))`;
  const cropWidth = `max(2\\,floor(iw*${viewportWidth.toFixed(8)}/2)*2)`;
  const cropHeight = `max(2\\,floor(ih*${viewportHeight.toFixed(8)}/2)*2)`;
  const cropX = `iw*(${actionX.toFixed(8)}+${(resultX - actionX).toFixed(8)}*${eased})`;
  const cropY = `ih*(${actionY.toFixed(8)}+${(resultY - actionY).toFixed(8)}*${eased})`;
  return `[${inputIndex}:v]fps=30,crop=w='${cropWidth}':h='${cropHeight}':` +
    `x='min(max(${cropX}\\,0)\\,iw-ow)':y='min(max(${cropY}\\,0)\\,ih-oh)',` +
    `scale=${targetWidth}:${targetHeight}:flags=lanczos,unsharp=5:5:0.26:5:5:0.0,setsar=1[${outputLabel}]`;
}

function assertCreatorEditorialV4RenderSource(
  source: CreatorEditorialRenderSource,
  shot: Pick<EditorialV3Shot, "id" | "sourceIntervalMs">
): void {
  const interval = shot.sourceIntervalMs;
  if (
    !source.workflowId
    || !source.sourceSha256 || !/^[a-f0-9]{64}$/.test(source.sourceSha256)
    || !source.sourceWidth || !source.sourceHeight || !source.sourceDurationMs
    || !source.framingManifestPath || !path.isAbsolute(source.framingManifestPath)
    || !source.framingManifestSha256 || !/^[a-f0-9]{64}$/.test(source.framingManifestSha256)
    || !source.verifiedSourceInterval
    || !source.telemetryProvenance
    || !source.focusKeyframes?.some(({ kind }) => kind === "action")
    || !source.focusKeyframes.some(({ kind }) => kind === "result")
  ) {
    throw new Error(`Creator editorial v4 source ${source.evidenceAssetId} has an incomplete reproducibility contract.`);
  }
  if (
    interval
    && (
      interval.startMs < source.verifiedSourceInterval.startMs
      || interval.endMs > source.verifiedSourceInterval.endMs
      || interval.endMs > source.sourceDurationMs
    )
  ) {
    throw new Error(`Creator editorial v4 shot ${shot.id} leaves its verified source interval.`);
  }
}

function backgroundColor(mode: EditorialV2BackgroundMode, brandKit: BrandKit): string {
  if (mode === "cream_editorial" || mode === "cream_product") return ffmpegColor(brandKit.secondaryColor);
  if (mode === "teal_reverse" || mode === "teal_split") return ffmpegColor(brandKit.accentColor);
  return ffmpegColor(brandKit.backgroundColor);
}

function backgroundDecoration(mode: EditorialV2BackgroundMode, brandKit: BrandKit): string {
  const primary = ffmpegColor(brandKit.primaryColor);
  const secondary = ffmpegColor(brandKit.secondaryColor);
  const accent = ffmpegColor(brandKit.accentColor);
  if (mode === "cream_editorial") {
    return `drawbox=x=0:y=1180:w=1080:h=740:color=${primary}@0.96:t=fill,drawbox=x=720:y=170:w=260:h=260:color=${accent}@0.18:t=fill`;
  }
  if (mode === "cream_product") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${secondary}@1:t=fill,drawbox=x=0:y=0:w=220:h=1920:color=${accent}@0.13:t=fill`;
  }
  if (mode === "teal_split") {
    return `drawbox=x=0:y=0:w=420:h=1920:color=${primary}@1:t=fill,drawbox=x=420:y=0:w=660:h=1920:color=${secondary}@0.96:t=fill`;
  }
  if (mode === "teal_reverse") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${primary}@0.72:t=fill,drawbox=x=90:y=150:w=900:h=1620:color=${secondary}@0.10:t=fill`;
  }
  if (mode === "navy_spotlight") {
    return `drawbox=x=70:y=240:w=940:h=1120:color=${accent}@0.10:t=fill,drawbox=x=0:y=1510:w=1080:h=410:color=${primary}@0.82:t=fill`;
  }
  if (mode === "outro_navy") {
    return `drawbox=x=80:y=420:w=920:h=920:color=${primary}@1:t=fill,drawbox=x=106:y=446:w=868:h=868:color=${accent}@0.10:t=fill`;
  }
  return `drawbox=x=0:y=0:w=1080:h=1920:color=${primary}@0.18:t=fill,drawbox=x=760:y=160:w=220:h=540:color=${accent}@0.08:t=fill`;
}

function backgroundDecorationV3(shot: EditorialV3Shot, brandKit: BrandKit): string {
  const primary = ffmpegColor(brandKit.primaryColor);
  const secondary = ffmpegColor(brandKit.secondaryColor);
  const accent = ffmpegColor(brandKit.accentColor);
  const referenceVisualKind = "referenceVisualKind" in shot
    ? (shot as EditorialV3Shot & { referenceVisualKind?: string }).referenceVisualKind
    : undefined;
  if (referenceVisualKind === "connected_decision_trail") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${secondary}@1:t=fill,` +
      `drawbox=x=108:y=260:w=150:h=112:color=${primary}@0.96:t=fill,` +
      `drawbox=x=314:y=260:w=150:h=112:color=${primary}@0.96:t=fill,` +
      `drawbox=x=520:y=260:w=150:h=112:color=${primary}@0.96:t=fill,` +
      `drawbox=x=726:y=260:w=150:h=112:color=${primary}@0.96:t=fill,` +
      `drawbox=x=258:y=311:w='min(56\\,56*t/.35)':h=10:color=${accent}@0.95:t=fill,` +
      `drawbox=x=464:y=311:w='min(56\\,56*max(0\\,t-.35)/.35)':h=10:color=${accent}@0.95:t=fill,` +
      `drawbox=x=670:y=311:w='min(56\\,56*max(0\\,t-.70)/.35)':h=10:color=${accent}@0.95:t=fill,` +
      `drawbox=x=0:y=1160:w=1080:h=760:color=${primary}@0.98:t=fill`;
  }
  if (shot.compositionFamily === "editorial_phrase") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${secondary}@1:t=fill,` +
      `drawbox=x='690+42*sin(2*PI*t/3.2)':y=170:w=280:h=280:color=${accent}@0.20:t=fill,` +
      `drawbox=x=0:y=1160:w=1080:h=760:color=${primary}@0.98:t=fill`;
  }
  if (shot.compositionFamily === "product_macro") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${primary}@0.96:t=fill,` +
      `drawbox=x='-80+34*sin(2*PI*t/3.8)':y=210:w=360:h=1380:color=${accent}@0.10:t=fill`;
  }
  if (shot.compositionFamily === "product_comparison") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${secondary}@1:t=fill,` +
      `drawbox=x='720+30*sin(2*PI*t/3.2)':y=0:w=360:h=1920:color=${accent}@0.28:t=fill,` +
      `drawbox=x=0:y=1380:w=1080:h=540:color=${primary}@0.94:t=fill`;
  }
  if (shot.compositionFamily === "rapid_recap") {
    return `drawbox=x=0:y=0:w=1080:h=1920:color=${primary}@0.76:t=fill,` +
      `drawbox=x='620+52*sin(2*PI*t/2.4)':y=120:w=390:h=1680:color=${secondary}@0.12:t=fill`;
  }
  if (shot.compositionFamily === "branded_outro") {
    return `drawbox=x='80+10*sin(2*PI*t/4)':y='420+8*sin(2*PI*t/4+.8)':w=920:h=920:color=${primary}@1:t=fill,` +
      `drawbox=x=106:y=446:w='min(868\\,868*t/.9)':h=868:color=${accent}@0.11:t=fill`;
  }
  return backgroundDecoration(shot.backgroundMode, brandKit);
}

function productDimensions(shot: EditorialV2Shot): { width: number; height: number } {
  if (shot.presenter.visible) return { width: 650, height: 1_180 };
  if (shot.family === "recap_montage") return { width: 900, height: 1_420 };
  return { width: 940, height: 1_560 };
}

function productDimensionsV3(shot: EditorialV3Shot): { width: number; height: number } {
  if (isEditorialV4Shot(shot) && shot.productEvidenceIds.length > 0) {
    const card = productCardLayoutV4({
      composition: productCompositionV4(shot.compositionFamily),
      presenterVisible: shot.presenter.visible,
      presenterPlacement: productPresenterPlacementV4(shot.presenter.placement)
    });
    return { width: card.width, height: card.height };
  }
  if (shot.compositionFamily === "product_macro") return { width: 1_000, height: 1_680 };
  if (shot.compositionFamily === "product_comparison") return { width: 880, height: 1_480 };
  if (shot.compositionFamily === "rapid_recap") return { width: 930, height: 1_500 };
  if (shot.presenter.visible) return { width: 710, height: 1_260 };
  return { width: 980, height: 1_640 };
}

function productPosition(shot: EditorialV2Shot, width: number): { x: number; y: number } {
  if (!shot.presenter.visible) return { x: Math.round((1080 - width) / 2), y: 190 };
  if (shot.presenter.placement === "left") return { x: 400, y: 300 };
  if (shot.presenter.placement === "right") return { x: 30, y: 300 };
  return { x: Math.round((1080 - width) / 2), y: 235 };
}

function productPositionV3(shot: EditorialV3Shot, width: number): { x: number; y: number } {
  if (isEditorialV4Shot(shot) && shot.productEvidenceIds.length > 0) {
    const card = productCardLayoutV4({
      composition: productCompositionV4(shot.compositionFamily),
      presenterVisible: shot.presenter.visible,
      presenterPlacement: productPresenterPlacementV4(shot.presenter.placement)
    });
    return { x: card.x, y: card.y };
  }
  if (shot.compositionFamily === "product_comparison") return { x: 90, y: 210 };
  if (!shot.presenter.visible) return { x: Math.round((1080 - width) / 2), y: 150 };
  if (shot.presenter.placement === "left") return { x: Math.max(340, 1080 - width - 16), y: 250 };
  if (shot.presenter.placement === "right") return { x: 16, y: 250 };
  return { x: Math.round((1080 - width) / 2), y: 205 };
}

function presenterGeometry(shot: EditorialV2Shot): { width: number; height: number; x: number; y: number } {
  if (shot.presenter.framing === "intimate_closeup") return { width: 940, height: 1_671, x: 70, y: 315 };
  if (shot.presenter.framing === "chest_up") {
    if (shot.presenter.placement === "left") return { width: 580, height: 1_031, x: -50, y: 850 };
    if (shot.presenter.placement === "right") return { width: 580, height: 1_031, x: 550, y: 850 };
    return { width: 780, height: 1_387, x: 150, y: 540 };
  }
  return { width: 690, height: 1_227, x: 195, y: 690 };
}

function presenterGeometryV3(shot: EditorialV3Shot): { width: number; height: number; x: number; y: number } {
  if (isEditorialV4Shot(shot) && shot.productEvidenceIds.length > 0) {
    return productPresenterLayoutV4({
      visible: shot.presenter.visible,
      placement: productPresenterPlacementV4(shot.presenter.placement)
    }) ?? { width: 0, height: 0, x: 0, y: 0 };
  }
  if (shot.presenter.framing === "intimate_closeup") return { width: 1_000, height: 1_778, x: 40, y: 250 };
  if (shot.presenter.framing === "chest_up") {
    if (shot.presenter.placement === "left") return { width: 630, height: 1_120, x: -70, y: 800 };
    if (shot.presenter.placement === "right") return { width: 630, height: 1_120, x: 520, y: 800 };
    return { width: 820, height: 1_458, x: 130, y: 480 };
  }
  return { width: 740, height: 1_316, x: 170, y: 625 };
}

function isEditorialV4Shot(shot: EditorialV3Shot): boolean {
  return "focusSequence" in shot.evidenceTreatment;
}

function productCompositionV4(composition: EditorialV3Shot["compositionFamily"]) {
  if (
    composition === "asymmetric_split"
    || composition === "product_macro"
    || composition === "product_reaction"
    || composition === "product_comparison"
    || composition === "rapid_recap"
  ) {
    return composition;
  }
  return "product_macro" as const;
}

function productPresenterPlacementV4(placement: EditorialV3Shot["presenter"]["placement"]) {
  return placement === "left" || placement === "right" || placement === "bottom" ? placement : "none";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

let overlayFontLoaded = false;
function loadOverlayFont(): void {
  if (overlayFontLoaded) return;
  const selected = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  ].find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("A local font is required for editorial captions.");
  PImage.registerFont(selected, "GideonEditorial").loadSync();
  const display = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
    selected
  ].find((candidate) => existsSync(candidate));
  if (!display) throw new Error("A local display font is required for editorial captions.");
  PImage.registerFont(display, "GideonDisplay").loadSync();
  overlayFontLoaded = true;
}

function centerText(context: CanvasContext, value: string, y: number): void {
  context.fillText(value, (1080 - context.measureText(value).width) / 2, y);
}

function fitCenteredText(context: CanvasContext, value: string, y: number, preferredSize: number, minimumSize: number, maximumWidth: number): void {
  let size = preferredSize;
  context.font = `${size}px GideonEditorial`;
  while (size > minimumSize && context.measureText(value).width > maximumWidth) {
    size -= 2;
    context.font = `${size}px GideonEditorial`;
  }
  centerText(context, value, y);
}

function fitTextInRegion(
  context: CanvasContext,
  value: string,
  x: number,
  y: number,
  width: number,
  preferredSize: number,
  minimumSize: number,
  alignment: "left" | "center" | "right"
): void {
  const family = context.font.includes("GideonDisplay") ? "GideonDisplay" : "GideonEditorial";
  let size = preferredSize;
  context.font = `${size}px ${family}`;
  while (size > minimumSize && context.measureText(value).width > width) {
    size -= 2;
    context.font = `${size}px ${family}`;
  }
  const measured = context.measureText(value).width;
  const drawX = alignment === "left" ? x : alignment === "right" ? x + width - measured : x + (width - measured) / 2;
  context.fillText(value, drawX, y);
}

function fillRect(context: CanvasContext, x: number, y: number, width: number, height: number): void {
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.closePath();
  context.fill();
}

function encodeOverlayPng(bitmap: ReturnType<typeof PImage.make>, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath, { mode: 0o600 });
    stream.once("error", reject);
    PImage.encodePNGToStream(bitmap, stream).then(resolve, reject);
  });
}

type CanvasContext = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;
function even(value: number): number { return value % 2 === 0 ? value : value + 1; }
function seconds(milliseconds: number): string { return (milliseconds / 1_000).toFixed(3); }
