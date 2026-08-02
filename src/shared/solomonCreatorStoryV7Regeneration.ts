import { createHash } from "node:crypto";
import { z } from "zod";
import type { SolomonCreatorStoryV7Manifest, V7Scene } from "./solomonCreatorStoryV7";

export const v7SceneRegenerationRequestSchema = z.object({
  sceneId: z.string().min(1),
  expectedManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().min(8),
  requestedChanges: z.object({
    narration: z.string().optional(),
    visibleResult: z.string().optional(),
    semanticEventFrames: z.array(z.number().int().nonnegative()).optional(),
    camera: z.object({ zoomStart: z.number(), zoomEnd: z.number(), anchorX: z.number(), anchorY: z.number(), settleFrames: z.number().int().positive(), cursorRequired: z.boolean() }).optional(),
    robot: z.unknown().optional()
  }).refine((value) => Object.keys(value).length > 0, "At least one scene change is required.")
});

export interface V7RegenerationReceipt {
  schemaVersion: "1";
  parentManifestHash: string;
  outputManifestHash: string;
  sceneId: string;
  preservedSceneIds: string[];
  changedFields: string[];
  reviewRequired: true;
}

export function hashV7Manifest(manifest: SolomonCreatorStoryV7Manifest): string {
  return createHash("sha256").update(stableStringify(manifest)).digest("hex");
}

export function regenerateV7Scene(manifest: SolomonCreatorStoryV7Manifest, requestValue: z.input<typeof v7SceneRegenerationRequestSchema>): { manifest: SolomonCreatorStoryV7Manifest; receipt: V7RegenerationReceipt } {
  const request = v7SceneRegenerationRequestSchema.parse(requestValue);
  const parentManifestHash = hashV7Manifest(manifest);
  if (request.expectedManifestHash !== parentManifestHash) throw new Error("V7 scene regeneration rejected a stale parent manifest.");
  const index = manifest.scenes.findIndex(({ id }) => id === request.sceneId);
  if (index < 0) throw new Error(`Unknown V7 scene: ${request.sceneId}`);
  const original = manifest.scenes[index]!;
  const next: V7Scene = { ...original, ...request.requestedChanges } as V7Scene;
  if (next.from !== original.from || next.to !== original.to || next.id !== original.id || next.claimIds.join("|") !== original.claimIds.join("|") || next.assetId !== original.assetId) {
    throw new Error("Scene regeneration cannot change timeline, evidence lineage, source identity, or claim binding.");
  }
  const output = structuredClone(manifest);
  output.scenes[index] = next;
  const changedFields = Object.keys(request.requestedChanges).filter((key) => stableStringify(original[key as keyof V7Scene]) !== stableStringify(next[key as keyof V7Scene]));
  if (changedFields.length === 0) throw new Error("Scene regeneration made no material change.");
  return {
    manifest: output,
    receipt: {
      schemaVersion: "1",
      parentManifestHash,
      outputManifestHash: hashV7Manifest(output),
      sceneId: request.sceneId,
      preservedSceneIds: manifest.scenes.filter(({ id }) => id !== request.sceneId).map(({ id }) => id),
      changedFields,
      reviewRequired: true
    }
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
