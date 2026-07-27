import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import * as PImage from "pureimage";
import {
  MASKED_PRESENTER_ENGINE_VERSION,
  MASKED_PRESENTER_SCHEMA_VERSION,
  assertMaskedPresenterSchedule,
  evaluateMaskedPresenterMotion,
  maskedPresenterCharacterSpec,
  sampleMaskedPresenterMotion,
  type MaskedPresenterArmPose,
  type MaskedPresenterGestureSchedule,
  type MaskedPresenterMotionQuality,
  type MaskedPresenterMotionState
} from "./maskedPresenter";

type Bitmap = ReturnType<typeof PImage.make>;
type CanvasContext = ReturnType<Bitmap["getContext"]>;

export interface MaskedPresenterPerformanceManifest {
  schemaVersion: typeof MASKED_PRESENTER_SCHEMA_VERSION;
  engineVersion: typeof MASKED_PRESENTER_ENGINE_VERSION;
  characterId: "solomon-axiom-v1";
  provider: "code_native_masked_rig";
  sourceKind: "code_generated_vector_rig";
  disclosure: "Animated Gideon brand presenter";
  mouthVisible: false;
  lipSyncAttempted: false;
  seed: number;
  width: number;
  height: number;
  fps: 30 | 60;
  durationMs: number;
  frameCount: number;
  backgroundType: "transparent_png_sequence";
  framePattern: string;
  greenScreenVideoPath?: string;
  scheduleChecksum: string;
  frameSequenceChecksum: string;
  motionQuality: MaskedPresenterMotionQuality;
  provenance: {
    owner: "Gideon";
    license: "Gideon-owned code-generated original";
    thirdPartyAssets: [];
    generatedWithoutExternalModel: true;
  };
}

export interface MaskedPresenterRenderResult {
  framesDirectory: string;
  framePattern: string;
  manifestPath: string;
  greenScreenVideoPath?: string;
  manifest: MaskedPresenterPerformanceManifest;
}

export function assertMaskedPresenterPerformanceManifest(manifest: MaskedPresenterPerformanceManifest): void {
  if (
    manifest.schemaVersion !== MASKED_PRESENTER_SCHEMA_VERSION
    || manifest.engineVersion !== MASKED_PRESENTER_ENGINE_VERSION
    || manifest.characterId !== "solomon-axiom-v1"
    || manifest.provider !== "code_native_masked_rig"
    || manifest.sourceKind !== "code_generated_vector_rig"
    || manifest.mouthVisible
    || manifest.lipSyncAttempted
    || ![30, 60].includes(manifest.fps)
    || manifest.frameCount !== Math.ceil(manifest.durationMs / 1_000 * manifest.fps)
    || !/^[a-f0-9]{64}$/.test(manifest.scheduleChecksum)
    || !/^[a-f0-9]{64}$/.test(manifest.frameSequenceChecksum)
    || manifest.motionQuality.status !== "passed"
    || manifest.provenance.owner !== "Gideon"
    || manifest.provenance.thirdPartyAssets.length !== 0
  ) {
    throw new Error("Masked presenter performance manifest is invalid or unsafe.");
  }
}

export async function renderMaskedPresenterPerformance(input: {
  outputDir: string;
  durationMs: number;
  fps: 30 | 60;
  width?: number;
  height?: number;
  seed: number;
  schedule: MaskedPresenterGestureSchedule;
  encodeGreenScreenVideo?: boolean;
  ffmpegPath?: string;
}): Promise<MaskedPresenterRenderResult> {
  if (!path.isAbsolute(input.outputDir)) throw new Error("Masked presenter output directory must be absolute.");
  if (!Number.isInteger(input.durationMs) || input.durationMs < 1_000 || input.durationMs > 60_000) throw new Error("Masked presenter duration must be an integer from 1000 to 60000 milliseconds.");
  if (input.schedule.durationMs !== input.durationMs || input.schedule.seed !== input.seed) throw new Error("Masked presenter render schedule does not match the requested performance.");
  assertMaskedPresenterSchedule(input.schedule);
  const width = input.width ?? 540;
  const height = input.height ?? 960;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 180 || height < 320 || width > 1080 || height > 1920 || Math.abs(width / height - 9 / 16) > 0.001) {
    throw new Error("Masked presenter render dimensions must be a 9:16 canvas from 180x320 through 1080x1920.");
  }
  const framesDirectory = path.join(input.outputDir, "presenter-frames");
  const reusable = await readReusablePerformance({
    outputDir: input.outputDir,
    framesDirectory,
    durationMs: input.durationMs,
    fps: input.fps,
    width,
    height,
    seed: input.seed,
    scheduleChecksum: input.schedule.checksum,
    requireGreenScreenVideo: input.encodeGreenScreenVideo !== false
  });
  if (reusable) return reusable;
  await fs.rm(framesDirectory, { recursive: true, force: true });
  await fs.mkdir(framesDirectory, { recursive: true, mode: 0o700 });
  const frameCount = Math.ceil(input.durationMs / 1_000 * input.fps);
  const sequenceHash = createHash("sha256");

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / input.fps * 1_000;
    const state = sampleMaskedPresenterMotion({ timeMs, seed: input.seed, schedule: input.schedule });
    const bitmap = PImage.make(width, height);
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, width, height);
    drawAxiomCharacter(context, width, height, state);
    const framePath = path.join(framesDirectory, `${String(index).padStart(6, "0")}.png`);
    await encodePng(bitmap, framePath);
    const bytes = await fs.readFile(framePath);
    sequenceHash.update(bytes);
  }

  const framePattern = path.join(framesDirectory, "%06d.png");
  let greenScreenVideoPath: string | undefined;
  if (input.encodeGreenScreenVideo !== false) {
    greenScreenVideoPath = path.join(input.outputDir, "axiom-masked-presenter-green-screen.mp4");
    await encodeGreenScreenVideo({
      ffmpegPath: input.ffmpegPath ?? resolveFfmpeg(),
      framePattern,
      outputPath: greenScreenVideoPath,
      width,
      height,
      fps: input.fps,
      durationMs: input.durationMs
    });
  }
  const motionQuality = evaluateMaskedPresenterMotion({ durationMs: input.durationMs, seed: input.seed, schedule: input.schedule, sampleRate: 120 });
  if (motionQuality.status !== "passed") throw new Error("Masked presenter render failed motion quality gates.");
  const manifest: MaskedPresenterPerformanceManifest = {
    schemaVersion: MASKED_PRESENTER_SCHEMA_VERSION,
    engineVersion: MASKED_PRESENTER_ENGINE_VERSION,
    characterId: maskedPresenterCharacterSpec().id,
    provider: "code_native_masked_rig",
    sourceKind: "code_generated_vector_rig",
    disclosure: "Animated Gideon brand presenter",
    mouthVisible: false,
    lipSyncAttempted: false,
    seed: input.seed,
    width,
    height,
    fps: input.fps,
    durationMs: input.durationMs,
    frameCount,
    backgroundType: "transparent_png_sequence",
    framePattern,
    ...(greenScreenVideoPath ? { greenScreenVideoPath } : {}),
    scheduleChecksum: input.schedule.checksum,
    frameSequenceChecksum: sequenceHash.digest("hex"),
    motionQuality,
    provenance: {
      owner: "Gideon",
      license: "Gideon-owned code-generated original",
      thirdPartyAssets: [],
      generatedWithoutExternalModel: true
    }
  };
  assertMaskedPresenterPerformanceManifest(manifest);
  const manifestPath = path.join(input.outputDir, "masked-presenter-performance.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
  return { framesDirectory, framePattern, manifestPath, greenScreenVideoPath, manifest };
}

async function readReusablePerformance(input: {
  outputDir: string;
  framesDirectory: string;
  durationMs: number;
  fps: 30 | 60;
  width: number;
  height: number;
  seed: number;
  scheduleChecksum: string;
  requireGreenScreenVideo: boolean;
}): Promise<MaskedPresenterRenderResult | undefined> {
  const manifestPath = path.join(input.outputDir, "masked-presenter-performance.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as MaskedPresenterPerformanceManifest;
    assertMaskedPresenterPerformanceManifest(manifest);
    if (
      manifest.schemaVersion !== MASKED_PRESENTER_SCHEMA_VERSION
      || manifest.engineVersion !== MASKED_PRESENTER_ENGINE_VERSION
      || manifest.durationMs !== input.durationMs
      || manifest.fps !== input.fps
      || manifest.width !== input.width
      || manifest.height !== input.height
      || manifest.seed !== input.seed
      || manifest.scheduleChecksum !== input.scheduleChecksum
      || manifest.motionQuality.status !== "passed"
    ) return undefined;
    const frames = (await fs.readdir(input.framesDirectory)).filter((entry) => /^\d{6}\.png$/.test(entry));
    if (frames.length !== manifest.frameCount || !(await isNonEmptyFile(path.join(input.framesDirectory, "000000.png")))) return undefined;
    if (input.requireGreenScreenVideo && (!manifest.greenScreenVideoPath || !(await isNonEmptyFile(manifest.greenScreenVideoPath)))) return undefined;
    return {
      framesDirectory: input.framesDirectory,
      framePattern: manifest.framePattern,
      manifestPath,
      ...(manifest.greenScreenVideoPath ? { greenScreenVideoPath: manifest.greenScreenVideoPath } : {}),
      manifest
    };
  } catch {
    return undefined;
  }
}

async function isNonEmptyFile(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then((stat) => stat.isFile() && stat.size > 0).catch(() => false);
}

export function drawAxiomCharacter(context: CanvasContext, width: number, height: number, state: MaskedPresenterMotionState): void {
  const scale = Math.min(width / 540, height / 960);
  const centerX = width / 2 + state.xShift * scale;
  const baseY = height * 0.965 + state.yShift * scale;
  const bodyLean = Math.tan(state.torsoLeanDeg * Math.PI / 180);
  const bodyRotation = state.bodyRotationDeg * Math.PI / 180;
  const bodyScale = state.breathingScale;
  const shoulderY = baseY - 498 * scale;
  const hipY = baseY - 128 * scale;
  const shoulderHalf = 151 * scale * bodyScale;
  const hipHalf = 112 * scale;
  const shoulderCenterX = centerX + bodyLean * 85 * scale;
  const hipCenterX = centerX - bodyLean * 35 * scale;

  drawEllipse(context, centerX, baseY - 12 * scale, 154 * scale, 24 * scale, "rgba(4,8,20,0.28)");
  drawLeg(context, hipCenterX - 58 * scale, hipY - 4 * scale, centerX - 72 * scale, baseY - 10 * scale, 74 * scale, "#0C1429");
  drawLeg(context, hipCenterX + 58 * scale, hipY - 4 * scale, centerX + 72 * scale, baseY - 10 * scale, 74 * scale, "#0C1429");

  const leftShoulder = rotatePoint({ x: shoulderCenterX - shoulderHalf, y: shoulderY + state.leftShoulderOffset * scale }, { x: shoulderCenterX, y: shoulderY }, bodyRotation);
  const rightShoulder = rotatePoint({ x: shoulderCenterX + shoulderHalf, y: shoulderY + state.rightShoulderOffset * scale }, { x: shoulderCenterX, y: shoulderY }, bodyRotation);
  drawArm(context, leftShoulder, handPoint(centerX, shoulderY, state.arms, "left", scale), "left", state.arms.leftPalmOpen, scale);
  drawArm(context, rightShoulder, handPoint(centerX, shoulderY, state.arms, "right", scale), "right", state.arms.rightPalmOpen, scale);

  const torso = [
    leftShoulder,
    { x: hipCenterX - hipHalf, y: hipY },
    { x: hipCenterX + hipHalf, y: hipY },
    rightShoulder
  ];
  drawPolygon(context, torso, "#101A33");
  drawPolygon(context, [
    { x: leftShoulder.x + 14 * scale, y: leftShoulder.y + 13 * scale },
    { x: hipCenterX - 80 * scale, y: hipY - 5 * scale },
    { x: hipCenterX - 7 * scale, y: hipY - 5 * scale },
    { x: shoulderCenterX - 11 * scale, y: shoulderY + 35 * scale }
  ], "#182848");
  drawPolygon(context, [
    { x: rightShoulder.x - 14 * scale, y: rightShoulder.y + 13 * scale },
    { x: hipCenterX + 80 * scale, y: hipY - 5 * scale },
    { x: hipCenterX + 7 * scale, y: hipY - 5 * scale },
    { x: shoulderCenterX + 11 * scale, y: shoulderY + 35 * scale }
  ], "#14213D");
  drawPolygon(context, [
    { x: shoulderCenterX - 12 * scale, y: shoulderY + 40 * scale },
    { x: hipCenterX - 8 * scale, y: hipY - 12 * scale },
    { x: hipCenterX + 8 * scale, y: hipY - 12 * scale },
    { x: shoulderCenterX + 12 * scale, y: shoulderY + 40 * scale }
  ], "#B8734D");
  drawPolygon(context, [
    { x: shoulderCenterX - 60 * scale, y: shoulderY + 6 * scale },
    { x: shoulderCenterX - 12 * scale, y: shoulderY + 42 * scale },
    { x: hipCenterX - 8 * scale, y: hipY - 14 * scale },
    { x: shoulderCenterX - 94 * scale, y: shoulderY + 88 * scale }
  ], "#26385A");
  drawPolygon(context, [
    { x: shoulderCenterX + 60 * scale, y: shoulderY + 6 * scale },
    { x: shoulderCenterX + 12 * scale, y: shoulderY + 42 * scale },
    { x: hipCenterX + 8 * scale, y: hipY - 14 * scale },
    { x: shoulderCenterX + 94 * scale, y: shoulderY + 88 * scale }
  ], "#223451");
  drawEllipse(context, hipCenterX - 70 * scale, hipY - 84 * scale, 14 * scale, 8 * scale, "#39D3C4");
  drawEllipse(context, hipCenterX + 70 * scale, hipY - 84 * scale, 14 * scale, 8 * scale, "#39D3C4");

  const neckX = shoulderCenterX + bodyLean * -28 * scale;
  const neckY = shoulderY - 42 * scale;
  drawRoundedSegment(context, { x: neckX, y: neckY + 38 * scale }, { x: neckX, y: neckY - 10 * scale }, 49 * scale, "#18233D");
  drawHead(context, neckX, neckY - 104 * scale, scale, state);
}

function drawHead(context: CanvasContext, centerX: number, centerY: number, scale: number, state: MaskedPresenterMotionState): void {
  const turnScale = 1 - Math.abs(state.headTurnDeg) / 90 * 0.35;
  const width = 166 * scale * turnScale;
  const height = 196 * scale;
  const tilt = state.headTiltDeg * Math.PI / 180;
  const turnOffset = state.headTurnDeg * 0.8 * scale;
  const center = { x: centerX + turnOffset, y: centerY };
  const shadowPoints = maskPoints(center.x + 7 * scale, center.y + 9 * scale, width, height).map((point) => rotatePoint(point, center, tilt));
  drawPolygon(context, shadowPoints, "rgba(3,8,20,0.25)");
  const points = maskPoints(center.x, center.y, width, height).map((point) => rotatePoint(point, center, tilt));
  drawPolygon(context, points, "#F4F1E8");
  const brow = [
    { x: center.x - width * 0.43, y: center.y - height * 0.22 },
    { x: center.x + width * 0.24, y: center.y - height * 0.39 },
    { x: center.x + width * 0.47, y: center.y - height * 0.13 },
    { x: center.x - width * 0.15, y: center.y - height * 0.02 }
  ].map((point) => rotatePoint(point, center, tilt));
  drawPolygon(context, brow, "#30345E");
  const intensity = state.eyeIntensity;
  drawEye(context, rotatePoint({ x: center.x - width * 0.19, y: center.y - height * 0.06 }, center, tilt), 18 * scale, intensity);
  drawEye(context, rotatePoint({ x: center.x + width * 0.04, y: center.y - height * 0.09 }, center, tilt), 14 * scale, intensity * 0.92);
  drawEye(context, rotatePoint({ x: center.x + width * 0.25, y: center.y - height * 0.02 }, center, tilt), 9 * scale, intensity * 0.8);
  const cheek = [
    { x: center.x - width * 0.37, y: center.y + height * 0.08 },
    { x: center.x - width * 0.04, y: center.y + height * 0.24 },
    { x: center.x + width * 0.34, y: center.y + height * 0.06 },
    { x: center.x + width * 0.18, y: center.y + height * 0.34 },
    { x: center.x - width * 0.18, y: center.y + height * 0.39 }
  ].map((point) => rotatePoint(point, center, tilt));
  drawPolygon(context, cheek, "#E1DDD2");
}

function drawEye(context: CanvasContext, center: Point, radius: number, intensity: number): void {
  drawEllipse(context, center.x, center.y, radius * 1.55, radius, `rgba(57,211,196,${(0.16 * intensity).toFixed(3)})`);
  drawEllipse(context, center.x, center.y, radius, radius * 0.58, `rgba(184,255,246,${Math.max(0.12, intensity).toFixed(3)})`);
}

function drawArm(context: CanvasContext, shoulder: Point, hand: Point, side: "left" | "right", palmOpen: number, scale: number): void {
  const midpoint = { x: (shoulder.x + hand.x) / 2, y: (shoulder.y + hand.y) / 2 };
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = (side === "left" ? -1 : 1) * clamp(length * 0.20, 34 * scale, 70 * scale);
  const elbow = {
    x: midpoint.x - dy / length * bend,
    y: midpoint.y + dx / length * bend
  };
  drawRoundedSegment(context, shoulder, elbow, 62 * scale, "#15213C");
  drawRoundedSegment(context, elbow, hand, 54 * scale, "#1B2946");
  drawEllipse(context, elbow.x, elbow.y, 31 * scale, 31 * scale, "#1A2845");
  drawGlove(context, hand, palmOpen, side, scale);
}

function drawGlove(context: CanvasContext, hand: Point, openness: number, side: "left" | "right", scale: number): void {
  const width = (28 + openness * 12) * scale;
  const height = (34 + openness * 8) * scale;
  drawEllipse(context, hand.x, hand.y, width, height, "#253654");
  const thumbDirection = side === "left" ? -1 : 1;
  drawEllipse(context, hand.x + thumbDirection * width * 0.72, hand.y + height * 0.12, width * 0.38, height * 0.35, "#2C4162");
  if (openness > 0.42) {
    const fingerY = hand.y - height * 0.72;
    for (let index = -1; index <= 1; index += 1) {
      drawRoundedSegment(context, { x: hand.x + index * width * 0.42, y: hand.y - height * 0.25 }, { x: hand.x + index * width * 0.48, y: fingerY }, width * 0.25, "#2A3D5C");
    }
  }
  drawEllipse(context, hand.x, hand.y + height * 0.16, width * 0.34, height * 0.18, "#39D3C4");
}

function handPoint(centerX: number, shoulderY: number, arms: MaskedPresenterArmPose, side: "left" | "right", scale: number): Point {
  const x = side === "left" ? arms.leftHandX : arms.rightHandX;
  const y = side === "left" ? arms.leftHandY : arms.rightHandY;
  return { x: centerX + x * 510 * scale, y: shoulderY + y * 530 * scale };
}

function drawLeg(context: CanvasContext, startX: number, startY: number, endX: number, endY: number, thickness: number, color: string): void {
  drawRoundedSegment(context, { x: startX, y: startY }, { x: endX, y: endY }, thickness, color);
}

function drawRoundedSegment(context: CanvasContext, start: Point, end: Point, thickness: number, color: string): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / length * thickness / 2;
  const py = dx / length * thickness / 2;
  drawPolygon(context, [
    { x: start.x + px, y: start.y + py },
    { x: end.x + px, y: end.y + py },
    { x: end.x - px, y: end.y - py },
    { x: start.x - px, y: start.y - py }
  ], color);
  drawEllipse(context, start.x, start.y, thickness / 2, thickness / 2, color);
  drawEllipse(context, end.x, end.y, thickness / 2, thickness / 2, color);
}

function drawPolygon(context: CanvasContext, points: Point[], color: string): void {
  if (points.length < 3) return;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.fill();
}

function drawEllipse(context: CanvasContext, centerX: number, centerY: number, radiusX: number, radiusY: number, color: string): void {
  const segments = 24;
  const points = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
  });
  drawPolygon(context, points, color);
}

function maskPoints(centerX: number, centerY: number, width: number, height: number): Point[] {
  return [
    { x: centerX - width * 0.31, y: centerY - height * 0.48 },
    { x: centerX + width * 0.26, y: centerY - height * 0.44 },
    { x: centerX + width * 0.48, y: centerY - height * 0.14 },
    { x: centerX + width * 0.37, y: centerY + height * 0.25 },
    { x: centerX + width * 0.12, y: centerY + height * 0.50 },
    { x: centerX - width * 0.19, y: centerY + height * 0.46 },
    { x: centerX - width * 0.43, y: centerY + height * 0.18 },
    { x: centerX - width * 0.49, y: centerY - height * 0.17 }
  ];
}

function rotatePoint(point: Point, center: Point, angle: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle)
  };
}

async function encodePng(bitmap: Bitmap, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(outputPath, { mode: 0o600 });
    stream.once("error", reject);
    PImage.encodePNGToStream(bitmap, stream).then(resolve, reject);
  });
}

async function encodeGreenScreenVideo(input: {
  ffmpegPath: string;
  framePattern: string;
  outputPath: string;
  width: number;
  height: number;
  fps: 30 | 60;
  durationMs: number;
}): Promise<void> {
  await run(input.ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x00FF00:s=${input.width}x${input.height}:r=${input.fps}:d=${(input.durationMs / 1_000).toFixed(3)}`,
    "-framerate", String(input.fps), "-start_number", "0", "-i", input.framePattern,
    "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1,format=yuv420p[v]",
    "-map", "[v]", "-t", (input.durationMs / 1_000).toFixed(3), "-r", String(input.fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", input.outputPath
  ], 300_000);
}

function run(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Masked presenter media process timed out."));
    }, timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { if (stderr.length < 12_000) stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Masked presenter media process failed with code ${code ?? "unknown"}: ${stderr.slice(-800)}`));
    });
  });
}

function resolveFfmpeg(): string {
  return process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface Point {
  x: number;
  y: number;
}
