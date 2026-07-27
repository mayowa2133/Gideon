import { createHash } from "node:crypto";
import path from "node:path";

export type NarrationProviderKind = "chatterbox_local" | "macos_say";
export type ChatterboxModelId = "chatterbox-turbo" | "chatterbox";
export type NarrationDevice = "mps" | "cpu";
export type NarrationEnergy = "low" | "medium" | "high";

export interface NarrationConsent {
  schemaVersion: "1";
  subjectId: string;
  grantedAt: string;
  permittedUse: "gideon_product_narration";
  referenceSha256: string;
}

export interface NarrationVoice {
  mode: "model_default" | "approved_reference";
  referencePath?: string;
  referenceSha256?: string;
  consent?: NarrationConsent;
  voiceLabel?: string;
}

export interface NarrationBeatRequest {
  id: string;
  approvedText: string;
  startMs: number;
  endMs: number;
  energy: NarrationEnergy;
  pacing?: "natural" | "compact_pause";
}

export interface NarrationRequest {
  outputDir: string;
  beats: NarrationBeatRequest[];
  language: "en";
  voice: NarrationVoice;
  seed: number;
}

export interface NarrationBeatResult {
  id: string;
  outputPath: string;
  approvedText: string;
  preparedText: string;
  startMs: number;
  endMs: number;
  sourceDurationMs: number;
  tempo: number;
  cacheKey: string;
  cacheHit: boolean;
  preparedTextSha256: string;
  outputSha256: string;
  sampleRate: number;
  channels: number;
  generationSeconds?: number;
}

export interface NarrationProvenance {
  schemaVersion: "1";
  provider: NarrationProviderKind;
  providerVersion: string;
  model: string;
  modelRevision?: string;
  device: NarrationDevice | "macos";
  seed: number;
  voiceMode: NarrationVoice["mode"];
  referenceSha256?: string;
  consentSubjectId?: string;
  generatedAt: string;
  watermark: "perth" | "none";
  fallbackFrom?: NarrationProviderKind;
}

export interface NarrationResult {
  provider: NarrationProviderKind;
  beats: NarrationBeatResult[];
  provenance: NarrationProvenance;
}

export interface NarrationProvider {
  readonly kind: NarrationProviderKind;
  readonly providerVersion: string;
  isAvailable(): Promise<boolean>;
  synthesize(request: NarrationRequest): Promise<NarrationResult>;
}

export function assertNarrationRequest(request: NarrationRequest): void {
  if (!request.outputDir || !Number.isSafeInteger(request.seed)) throw new Error("Narration request is invalid.");
  if (request.language !== "en" || request.beats.length === 0) throw new Error("Narration language or beats are invalid.");
  const ids = new Set<string>();
  for (const beat of request.beats) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(beat.id) || ids.has(beat.id)) throw new Error("Narration beat identifiers must be unique and safe.");
    if (!beat.approvedText.trim() || beat.approvedText.length > 2_000 || beat.endMs <= beat.startMs) throw new Error(`Narration beat ${beat.id} is invalid.`);
    ids.add(beat.id);
  }
  if (request.voice.mode === "approved_reference") {
    const consent = request.voice.consent;
    if (!request.voice.referencePath || !path.isAbsolute(request.voice.referencePath) || !request.voice.referenceSha256 || !consent || !request.voice.voiceLabel?.trim()) {
      throw new Error("Reference-voice narration requires an absolute approved reference, non-sensitive voice label, and consent record.");
    }
    if (request.voice.voiceLabel.length > 80) throw new Error("Reference-voice label is too long.");
    if (consent.permittedUse !== "gideon_product_narration" || consent.referenceSha256 !== request.voice.referenceSha256) {
      throw new Error("Reference-voice consent does not match the supplied recording.");
    }
  } else if (request.voice.referencePath || request.voice.referenceSha256 || request.voice.consent) {
    throw new Error("Model-default narration cannot include reference-voice data.");
  }
}

export function prepareNarrationText(text: string, _energy: NarrationEnergy, pacing: NarrationBeatRequest["pacing"] = "natural"): string {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Narration text cannot be empty.");
  const punctuated = /[.!?…]$/.test(normalized) ? normalized : `${normalized}.`;
  return pacing === "compact_pause" ? punctuated.replace(/[.;:]\s+/g, ", ") : punctuated;
}

export function narrationCacheKey(input: {
  provider: NarrationProviderKind;
  providerVersion: string;
  model: string;
  modelRevision?: string;
  device: NarrationProvenance["device"];
  seed: number;
  beatId: string;
  preparedText: string;
  voice: NarrationVoice;
}): string {
  const payload = {
    schemaVersion: "1",
    processVersion: "gideon-narration-v1",
    ...input,
    voice: {
      mode: input.voice.mode,
      referenceSha256: input.voice.referenceSha256,
      consentSubjectId: input.voice.consent?.subjectId,
      consentGrantedAt: input.voice.consent?.grantedAt
    }
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
