import { createHash } from "node:crypto";

export type MaskedPresenterClipProvider =
  | "code_native_rig"
  | "recorded_transparent_clips"
  | "recorded_keyed_clips"
  | "approved_ai_video";
export type MaskedPresenterEyeState = "neutral" | "wide" | "narrow" | "concerned" | "bright" | "dim" | "blink" | "confirmation_pulse";
export type MaskedPresenterGazeTarget = "camera" | "product" | "caption" | "cta";
export type MaskedPresenterFraming = "close" | "medium" | "desk" | "picture_in_picture";

export interface MaskedPresenterClipEntry {
  clipId: string;
  provider: Exclude<MaskedPresenterClipProvider, "code_native_rig">;
  sourcePath: string;
  sourceSha256: string;
  durationFrames: number;
  fps: 30 | 60;
  framing: MaskedPresenterFraming;
  gesture: string;
  emotion: string;
  gazeTarget: MaskedPresenterGazeTarget;
  eyeState: MaskedPresenterEyeState;
  energy: "low" | "medium" | "high";
  phases: { entranceEnd: number; peak: number; holdEnd: number; recoveryEnd: number };
  alpha: { mode: "straight" | "premultiplied" | "none" };
  keying?: { color: string; similarity: number; blend: number };
  loopSafe: boolean;
  safeRegions: {
    face: { x: number; y: number; width: number; height: number };
    hands: { x: number; y: number; width: number; height: number };
    caption: { x: number; y: number; width: number; height: number };
    product: { x: number; y: number; width: number; height: number };
  };
  provenance: { owner: string; license: string; consentReceipt?: string; approved: boolean };
}

export interface MaskedPresenterClipLibraryManifest {
  schemaVersion: "1";
  providerBoundary: "masked_presenter_asset_provider";
  clips: MaskedPresenterClipEntry[];
  checksum: string;
}

export function assertMaskedPresenterClipEntry(entry: MaskedPresenterClipEntry): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(entry.clipId) || !entry.sourcePath.trim() || !/^[a-f0-9]{64}$/.test(entry.sourceSha256)) {
    throw new Error("Recorded presenter clip identity or source provenance is invalid.");
  }
  if (!Number.isInteger(entry.durationFrames) || entry.durationFrames < 12 || ![30, 60].includes(entry.fps)) throw new Error("Recorded presenter clip timing is invalid.");
  const { entranceEnd, peak, holdEnd, recoveryEnd } = entry.phases;
  if (!(entranceEnd >= 0 && entranceEnd < peak && peak <= holdEnd && holdEnd < recoveryEnd && recoveryEnd <= entry.durationFrames)) {
    throw new Error("Recorded presenter performance phases must be ordered inside the clip.");
  }
  if (entry.alpha.mode === "none" && !entry.keying) throw new Error("A non-alpha presenter clip requires keyed-background metadata.");
  if (entry.provider === "approved_ai_video" && (!entry.provenance.consentReceipt || !entry.provenance.approved)) {
    throw new Error("AI presenter clips require explicit approval and a consent receipt.");
  }
  if (!entry.provenance.owner.trim() || !entry.provenance.license.trim()) throw new Error("Presenter clip ownership and license are required.");
  for (const region of Object.values(entry.safeRegions)) {
    if ([region.x, region.y, region.width, region.height].some((value) => value < 0 || value > 1) || region.width <= 0 || region.height <= 0 ||
        region.x + region.width > 1 || region.y + region.height > 1) throw new Error("Presenter safe regions must fit normalized clip bounds.");
  }
}

export function createMaskedPresenterClipLibrary(clips: MaskedPresenterClipEntry[]): MaskedPresenterClipLibraryManifest {
  const ids = new Set<string>();
  for (const clip of clips) {
    assertMaskedPresenterClipEntry(clip);
    if (ids.has(clip.clipId)) throw new Error("Presenter clip IDs must be unique.");
    ids.add(clip.clipId);
  }
  const checksum = createHash("sha256").update(JSON.stringify(clips)).digest("hex");
  return { schemaVersion: "1", providerBoundary: "masked_presenter_asset_provider", clips: structuredClone(clips), checksum };
}
