import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as PImage from "pureimage";
import type { CreativeBlueprint, RenderTemporalQa, SceneComposition } from "../shared/types";

export const CREATOR_TEMPORAL_THRESHOLDS = { repeatedDifference: 0.8, maxRepeatedFrameRatio: 0.72, maxFrozenIntervalMs: 1_500 } as const;

export interface TemporalSample { timestampMs: number; sceneId: string; averageLuma: number; lumaDeviation: number; pixels: Uint8Array }

export async function inspectCreatorVideoTemporalQa(videoPath: string, blueprint: CreativeBlueprint, ffmpegPath = process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg"): Promise<RenderTemporalQa> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-creator-temporal-"));
  try {
    const samples: TemporalSample[] = [];
    for (const scene of blueprint.scenes) {
      for (const timestampMs of sceneSampleTimes(scene)) {
        const framePath = path.join(directory, `${safe(scene.id)}-${timestampMs}.png`);
        await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (timestampMs / 1000).toFixed(3), "-i", videoPath, "-frames:v", "1", "-vf", "scale=64:64:force_original_aspect_ratio=decrease,pad=64:64:(ow-iw)/2:(oh-ih)/2,format=rgba", framePath]);
        samples.push({ timestampMs, sceneId: scene.id, ...(await readFrame(framePath)) });
      }
    }
    return analyzeCreatorTemporalSamples(blueprint, samples);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export function analyzeCreatorTemporalSamples(blueprint: CreativeBlueprint, samples: TemporalSample[]): RenderTemporalQa {
  const sceneMap = new Map(blueprint.scenes.map((scene) => [scene.id, scene]));
  const affected = new Set<string>();
  const staleLoops = new Set<string>();
  const black = new Set<string>();
  const blank = new Set<string>();
  let repeated = 0;
  let compared = 0;
  let longestFrozen = 0;
  for (const scene of blueprint.scenes) {
    const current = samples.filter((sample) => sample.sceneId === scene.id).sort((a, b) => a.timestampMs - b.timestampMs);
    if (current.some((sample) => sample.averageLuma < 8 && sample.lumaDeviation < 5)) black.add(scene.id);
    if (current.some((sample) => (sample.averageLuma < 8 || sample.averageLuma > 248) && sample.lumaDeviation < 4)) blank.add(scene.id);
    let frozenStart: number | undefined;
    for (let index = 1; index < current.length; index += 1) {
      const difference = meanDifference(current[index - 1]!.pixels, current[index]!.pixels);
      if (!allowsStatic(scene, blueprint)) compared += 1;
      if (difference < CREATOR_TEMPORAL_THRESHOLDS.repeatedDifference) {
        if (!allowsStatic(scene, blueprint)) {
          repeated += 1;
          frozenStart ??= current[index - 1]!.timestampMs;
          const interval = current[index]!.timestampMs - frozenStart;
          longestFrozen = Math.max(longestFrozen, interval);
          if (interval > CREATOR_TEMPORAL_THRESHOLDS.maxFrozenIntervalMs) affected.add(scene.id);
        }
      } else frozenStart = undefined;
    }
    if (!allowsStatic(scene, blueprint) && hasStaleLoop(current)) staleLoops.add(scene.id);
  }
  const repeatedFrameRatio = compared > 0 ? repeated / compared : 0;
  const result = black.size > 0 || blank.size > 0 || affected.size > 0 || staleLoops.size > 0 || repeatedFrameRatio > CREATOR_TEMPORAL_THRESHOLDS.maxRepeatedFrameRatio
    ? "fail" : repeatedFrameRatio > CREATOR_TEMPORAL_THRESHOLDS.maxRepeatedFrameRatio * 0.75 ? "warning" : "pass";
  return { schemaVersion: "1", sampledFrameCount: samples.length, repeatedFrameRatio: round(repeatedFrameRatio), longestUnexpectedFrozenIntervalMs: longestFrozen, affectedSceneIds: [...affected], staleLoopSceneIds: [...staleLoops], blackSceneIds: [...black], blankSceneIds: [...blank], thresholds: { ...CREATOR_TEMPORAL_THRESHOLDS }, result };
}

function sceneSampleTimes(scene: SceneComposition): number[] { const interval = 400; const first = scene.startMs + Math.min(120, Math.max(20, (scene.endMs - scene.startMs) / 5)); const times: number[] = []; for (let value = first; value < scene.endMs - 40; value += interval) times.push(Math.round(value)); return times.length > 1 ? times : [Math.round((scene.startMs + scene.endMs) / 2)]; }
function allowsStatic(scene: SceneComposition, blueprint: CreativeBlueprint): boolean { if (scene.purpose === "cta" || scene.shotType === "cta_end_card" || scene.shotType === "kinetic_typography") return true; const assets = scene.productAssetIds.map((id) => blueprint.productAssets.find((asset) => asset.id === id)); return !scene.presenter.visible && !assets.some((asset) => asset?.kind === "interaction_clip"); }
function hasStaleLoop(samples: TemporalSample[]): boolean { if (samples.length < 5) return false; for (let offset = 2; offset <= Math.floor(samples.length / 2); offset += 1) { let matches = 0; for (let index = offset; index < samples.length; index += 1) if (meanDifference(samples[index]!.pixels, samples[index - offset]!.pixels) < .35) matches += 1; if (matches >= Math.max(2, samples.length - offset - 1)) return true; } return false; }
async function readFrame(filePath: string): Promise<Omit<TemporalSample, "timestampMs" | "sceneId">> { const image = await PImage.decodePNGFromStream(createReadStream(filePath)); const bitmap = image as unknown as { data: Uint8Array; width: number; height: number }; const pixels = new Uint8Array(bitmap.width * bitmap.height); let total = 0; let squared = 0; for (let index = 0, offset = 0; index < pixels.length; index += 1, offset += 4) { const value = Math.round(.2126 * bitmap.data[offset]! + .7152 * bitmap.data[offset + 1]! + .0722 * bitmap.data[offset + 2]!); pixels[index] = value; total += value; squared += value * value; } const averageLuma = total / pixels.length; return { pixels, averageLuma, lumaDeviation: Math.sqrt(Math.max(0, squared / pixels.length - averageLuma * averageLuma)) }; }
function meanDifference(left: Uint8Array, right: Uint8Array): number { let total = 0; const length = Math.min(left.length, right.length); for (let index = 0; index < length; index += 1) total += Math.abs(left[index]! - right[index]!); return total / Math.max(1, length); }
function safe(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, "-"); }
function round(value: number): number { return Number(value.toFixed(4)); }
async function run(command: string, args: string[]): Promise<void> { await new Promise<void>((resolve, reject) => { const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] }); let bytes = 0; child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; }); child.once("error", () => reject(new Error("Creator temporal analyzer could not start."))); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Creator temporal analyzer failed (${bytes > 0 ? "diagnostics available" : "no diagnostics"}).`))); }); }
