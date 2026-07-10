import path from "node:path";
import { fictionalAvatarPresenterCatalog } from "../shared/renderTemplates";
import type { AvatarModelReceipt, FictionalAvatarPresenterId } from "../shared/types";

export type AvatarWorkerProvider = "disabled" | "sadtalker" | "musetalk";

export interface AvatarWorkerConfig {
  provider: AvatarWorkerProvider;
  modelVersion?: string;
  modelLicense?: string;
  approvedForCommercialUse: boolean;
}

export interface AvatarWorkerRequest {
  avatarId: FictionalAvatarPresenterId;
  audioPath: string;
  outputPath: string;
  durationMs: number;
  disclosure: "AI-generated brand presenter";
}

export interface AvatarWorkerResult {
  outputPath: string;
  receipt: AvatarModelReceipt;
}

export interface AvatarWorker {
  render(input: AvatarWorkerRequest): Promise<AvatarWorkerResult>;
}

export function loadAvatarWorkerConfig(env: NodeJS.ProcessEnv = process.env): AvatarWorkerConfig {
  const provider = env.GIDEON_AVATAR_WORKER_PROVIDER?.trim().toLowerCase();
  return {
    provider: provider === "sadtalker" || provider === "musetalk" ? provider : "disabled",
    modelVersion: cleanOptional(env.GIDEON_AVATAR_MODEL_VERSION),
    modelLicense: cleanOptional(env.GIDEON_AVATAR_MODEL_LICENSE),
    approvedForCommercialUse: env.GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED === "true"
  };
}

export function validateAvatarWorkerRequest(input: AvatarWorkerRequest, config: AvatarWorkerConfig): void {
  if (config.provider === "disabled") {
    throw new Error("Avatar worker is disabled until an approved model is configured.");
  }
  if (!config.approvedForCommercialUse || !config.modelVersion || !config.modelLicense) {
    throw new Error("Avatar worker model approval, version, and license are required.");
  }
  const avatar = fictionalAvatarPresenterCatalog.find((candidate) => candidate.id === input.avatarId);
  if (!avatar || !avatar.commercialApproved || avatar.provenance !== "gideon_fictional_catalog") {
    throw new Error("Avatar worker accepts only approved fictional catalog avatars.");
  }
  if (input.disclosure !== "AI-generated brand presenter") {
    throw new Error("Avatar worker disclosure is required.");
  }
  if (!path.isAbsolute(input.audioPath) || !path.isAbsolute(input.outputPath)) {
    throw new Error("Avatar worker requires private local artifact paths.");
  }
  if (input.durationMs < 500 || input.durationMs > 60_000) {
    throw new Error("Avatar worker duration is outside the supported short-form range.");
  }
}

export function createAvatarWorker(config = loadAvatarWorkerConfig()): AvatarWorker {
  return {
    async render(input): Promise<AvatarWorkerResult> {
      validateAvatarWorkerRequest(input, config);
      throw new Error(`${config.provider} avatar worker is approved but not installed in this Gideon runtime.`);
    }
  };
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
