import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CreativeBlueprint, SceneComposition, SceneRenderCacheEntry, SceneRenderCacheReport } from "../shared/types";

export const CREATOR_SCENE_RENDERER_VERSION = "creator-scene-renderer-v8";

export interface SceneCacheContext {
  sourceRecordingHash: string;
  productAssetHashes: Record<string, string>;
  avatarHash: string;
  narrationHash: string;
  pronunciationDictionaryHash: string;
}

interface StoredManifest { schemaVersion: "1"; rendererVersion: string; scriptId: string; entries: SceneRenderCacheEntry[] }

export interface ExecuteSceneRenderCacheInput {
  scriptId: string;
  blueprint: CreativeBlueprint;
  cacheDir: string;
  outputPath: string;
  requestedSceneIds?: string[];
  context: SceneCacheContext;
  renderSegment(scene: SceneComposition, outputPath: string): Promise<void>;
  spliceSegments(segmentPaths: string[], outputPath: string): Promise<void>;
  validateSplice(outputPath: string, entries: SceneRenderCacheEntry[]): Promise<SceneRenderCacheReport["validation"]>;
}

export async function executeSceneRenderCache(input: ExecuteSceneRenderCacheInput): Promise<SceneRenderCacheReport> {
  await fs.mkdir(input.cacheDir, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(input.cacheDir, "scene-cache.json");
  const previous = await readManifest(manifestPath, input.scriptId);
  const previousByScene = new Map((previous?.entries ?? []).map((entry) => [entry.sceneId, entry]));
  const forced = transitionDependencySet(input.blueprint.scenes, input.requestedSceneIds ?? []);
  const entries: SceneRenderCacheEntry[] = [];
  const staged: string[] = [];
  const segmentPaths = new Map<string, string>();
  const outputTemporary = `${input.outputPath}.partial-${process.pid}`;
  try {
    for (const scene of input.blueprint.scenes) {
      const dependencySceneIds = transitionDependencies(input.blueprint.scenes, scene.id);
      const cacheKey = sceneRenderCacheKey(input.blueprint, scene, dependencySceneIds, input.context);
      const fileName = `${safe(scene.id)}-${cacheKey.slice(0, 20)}.mp4`;
      const segmentPath = path.join(input.cacheDir, fileName);
      const prior = previousByScene.get(scene.id);
      const reusable = !forced.has(scene.id) && prior?.cacheKey === cacheKey && prior.fileName === fileName && await exists(segmentPath) && await sha256File(segmentPath) === prior.sha256;
      if (reusable) { entries.push({ ...prior, status: "reused", dependencySceneIds }); segmentPaths.set(scene.id, segmentPath); continue; }
      const temporary = path.join(input.cacheDir, `.${fileName}.partial-${process.pid}`);
      staged.push(temporary);
      await input.renderSegment(scene, temporary);
      const sha256 = await sha256File(temporary);
      segmentPaths.set(scene.id, temporary);
      entries.push({ sceneId: scene.id, cacheKey, sha256, durationMs: scene.endMs - scene.startMs, status: "rendered", dependencySceneIds, fileName });
    }
    await input.spliceSegments(entries.map((entry) => segmentPaths.get(entry.sceneId)!), outputTemporary);
    const validation = await input.validateSplice(outputTemporary, entries);
    const failedChecks = Object.entries(validation).filter(([, passed]) => !passed).map(([name]) => name);
    if (failedChecks.length > 0) throw new Error(`Scene splice continuity validation failed: ${failedChecks.join(", ")}.`);
    for (const entry of entries.filter(({ status }) => status === "rendered")) await fs.rename(segmentPaths.get(entry.sceneId)!, path.join(input.cacheDir, entry.fileName));
    const stableManifest: StoredManifest = { schemaVersion: "1", rendererVersion: CREATOR_SCENE_RENDERER_VERSION, scriptId: input.scriptId, entries: entries.map((entry) => ({ ...entry, status: "reused" })) };
    await writeAtomicJson(manifestPath, stableManifest);
    await fs.rename(outputTemporary, input.outputPath);
    return { schemaVersion: "1", rendererVersion: CREATOR_SCENE_RENDERER_VERSION, scriptId: input.scriptId, requestedSceneIds: input.requestedSceneIds ?? [], regeneratedSceneIds: entries.filter(({ status }) => status === "rendered").map(({ sceneId }) => sceneId), reusedSceneIds: entries.filter(({ status }) => status === "reused").map(({ sceneId }) => sceneId), entries, validation };
  } catch (error) {
    await fs.rm(outputTemporary, { force: true });
    throw error;
  } finally {
    await Promise.all(staged.map((filePath) => fs.rm(filePath, { force: true })));
  }
}

export function sceneRenderCacheKey(blueprint: CreativeBlueprint, scene: SceneComposition, dependencySceneIds: string[], context: SceneCacheContext): string {
  const dependencies = dependencySceneIds.map((id) => blueprint.scenes.find((candidate) => candidate.id === id)).filter(Boolean);
  const assetIds = [...new Set([scene, ...dependencies].flatMap((item) => item!.productAssetIds))];
  const payload = { rendererVersion: CREATOR_SCENE_RENDERER_VERSION, schemaVersion: blueprint.schemaVersion, templateId: blueprint.templateId, templateVersion: blueprint.templateVersion, scene, transitionDependencies: dependencies, sourceRecordingHash: context.sourceRecordingHash, productAssetHashes: Object.fromEntries(assetIds.sort().map((id) => [id, context.productAssetHashes[id] ?? "missing"])), avatarHash: context.avatarHash, narrationHash: context.narrationHash, pronunciationDictionaryHash: context.pronunciationDictionaryHash, narrationRange: { startMs: scene.startMs, endMs: scene.endMs }, captions: scene.captions, typography: scene.typography, renderPolicy: blueprint.renderPolicy, qualityPolicy: blueprint.qualityPolicy };
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

export function transitionDependencies(scenes: SceneComposition[], sceneId: string): string[] { const index = scenes.findIndex(({ id }) => id === sceneId); if (index < 0) return []; return [scenes[index - 1]?.id, scenes[index + 1]?.id].filter((id): id is string => Boolean(id)); }
export function transitionDependencySet(scenes: SceneComposition[], requested: string[]): Set<string> { const known = new Set(scenes.map(({ id }) => id)); for (const id of requested) if (!known.has(id)) throw new Error(`Requested scene ${id} does not exist.`); return new Set(requested.flatMap((id) => [id, ...transitionDependencies(scenes, id)])); }
function stableSerialize(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`; return JSON.stringify(value); }
async function readManifest(filePath: string, scriptId: string): Promise<StoredManifest | undefined> { try { const value = JSON.parse(await fs.readFile(filePath, "utf8")) as StoredManifest; return value.schemaVersion === "1" && value.rendererVersion === CREATOR_SCENE_RENDERER_VERSION && value.scriptId === scriptId && Array.isArray(value.entries) ? value : undefined; } catch { return undefined; } }
async function writeAtomicJson(filePath: string, value: unknown): Promise<void> { const temporary = `${filePath}.partial-${process.pid}`; await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(temporary, filePath); }
async function exists(filePath: string): Promise<boolean> { try { await fs.access(filePath); return true; } catch { return false; } }
async function sha256File(filePath: string): Promise<string> { return createHash("sha256").update(await fs.readFile(filePath)).digest("hex"); }
function safe(value: string): string { const result = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80); if (!result) throw new Error("Scene ID cannot produce a safe cache filename."); return result; }
