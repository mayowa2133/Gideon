import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeSceneRenderCache, sceneRenderCacheKey, transitionDependencySet, type SceneCacheContext } from "./sceneRenderCache";
import type { CreativeBlueprint, SceneComposition } from "../shared/types";

const scene = (id: string, index: number): SceneComposition => ({ id, startMs: index * 1000, endMs: (index + 1) * 1000, purpose: index === 3 ? "cta" : "demo", shotType: index === 3 ? "cta_end_card" : "product_fullscreen", presenter: { visible: false, layout: "medium", crop: { x: .5, y: .5, scale: 1 }, position: "center", scale: 1, expression: "neutral", gestureIntent: "none", motionIntensity: "subtle", eyeline: "camera", backgroundTreatment: "deterministic_fixture", disclosure: "AI-generated brand presenter", sourceScriptId: "script", sourceScriptUpdatedAt: "now" }, productAssetIds: [`asset-${index}`], supportedClaimIds: [], captions: [{ startMs: index * 1000, endMs: (index + 1) * 1000, text: `caption ${index}` }], typography: [{ family: "kinetic_bold", text: `scene ${index}`, emphasizedWords: [], position: "top", maxLines: 2 }], background: { kind: "dark" }, transition: { kind: index ? "wipe" : "none", durationMs: index ? 200 : 0 }, focus: { x: .5, y: .5, scale: 1.2 }, minimumReadableDwellMs: 500, audioCues: [] });
const scenes = [0, 1, 2, 3].map((index) => scene(`scene-${index}`, index));
const blueprint = { schemaVersion: "1", id: "blueprint", templateId: "template", templateVersion: 1, targetDurationMs: 4000, pacePreset: "readable", estimatedWordsPerMinute: 150, hook: "hook", cta: "cta", brandKit: {}, claimIds: [], productAssets: [], scenes, renderPolicy: { canvas: { width: 1080, height: 1920, fps: 30 }, targetLufs: -14, loudnessToleranceLu: 1.5, ctaDurationMs: 1000 }, qualityPolicy: {} } as unknown as CreativeBlueprint;
const context: SceneCacheContext = { sourceRecordingHash: "source", productAssetHashes: Object.fromEntries(scenes.map((_, index) => [`asset-${index}`, `asset-hash-${index}`])), avatarHash: "avatar", narrationHash: "audio", pronunciationDictionaryHash: "pronunciation" };
const valid = { boundaryFrames: true, transitionContinuity: true, timestampContinuity: true, audioContinuity: true, captionAlignment: true, totalDuration: true, codecCompatibility: true };

describe("encoded scene render cache", () => {
  it("renders cold, reuses unchanged hashes, and rerenders only a scene plus transition neighbors", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-scenes-")); const output = path.join(dir, "final.mp4"); const calls: string[] = [];
    const run = (requestedSceneIds?: string[]) => executeSceneRenderCache({ scriptId: "script", blueprint, cacheDir: path.join(dir, "cache"), outputPath: output, requestedSceneIds, context, renderSegment: async (item, target) => { calls.push(item.id); await fs.writeFile(target, `encoded:${item.id}:${item.typography[0]?.text}`); }, spliceSegments: async (paths, target) => fs.writeFile(target, (await Promise.all(paths.map((file) => fs.readFile(file, "utf8")))).join("|")), validateSplice: async () => valid });
    const cold = await run(); expect(cold.regeneratedSceneIds).toEqual(scenes.map(({ id }) => id)); const hashes = Object.fromEntries(cold.entries.map(({ sceneId, sha256 }) => [sceneId, sha256]));
    calls.length = 0; const warm = await run(); expect(calls).toEqual([]); expect(warm.reusedSceneIds).toHaveLength(4);
    calls.length = 0; blueprint.scenes[1]!.typography[0]!.text = "changed"; const partial = await run(["scene-1"]); expect(calls).toEqual(["scene-0", "scene-1", "scene-2"]); expect(partial.entries.find(({ sceneId }) => sceneId === "scene-3")?.sha256).toBe(hashes["scene-3"]); expect(partial.entries.find(({ sceneId }) => sceneId === "scene-1")?.sha256).not.toBe(hashes["scene-1"]);
  });
  it("rejects stale keys and preserves the existing output and manifest on failure", async () => {
    const before = sceneRenderCacheKey(blueprint, scenes[0]!, ["scene-1"], context); const after = sceneRenderCacheKey(blueprint, scenes[0]!, ["scene-1"], { ...context, sourceRecordingHash: "changed" }); expect(after).not.toBe(before); expect(transitionDependencySet(scenes, ["scene-2"])).toEqual(new Set(["scene-1", "scene-2", "scene-3"]));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-scenes-fail-")); const output = path.join(dir, "final.mp4"); const cacheDir = path.join(dir, "cache"); await fs.writeFile(output, "known-good");
    await expect(executeSceneRenderCache({ scriptId: "script", blueprint, cacheDir, outputPath: output, context, renderSegment: async () => { throw new Error("canceled"); }, spliceSegments: async () => undefined, validateSplice: async () => valid })).rejects.toThrow("canceled"); expect(await fs.readFile(output, "utf8")).toBe("known-good");
    await expect(executeSceneRenderCache({ scriptId: "script", blueprint, cacheDir, outputPath: output, context, renderSegment: async (item, target) => fs.writeFile(target, item.id), spliceSegments: async (_paths, target) => fs.writeFile(target, "candidate"), validateSplice: async () => ({ ...valid, audioContinuity: false }) })).rejects.toThrow("audioContinuity"); expect(await fs.readFile(output, "utf8")).toBe("known-good");
  });
});
