import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fictionalAvatarPresenterCatalog } from "../shared/renderTemplates";
import type { AvatarModelReceipt, FictionalAvatarPresenterId } from "../shared/types";

export type AvatarWorkerProvider = "disabled" | "sadtalker" | "musetalk";

export interface AvatarWorkerConfig {
  provider: AvatarWorkerProvider;
  modelVersion?: string;
  modelLicense?: string;
  approvedForCommercialUse: boolean;
  commandPath?: string;
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

export type AvatarProcessRunner = (commandPath: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export function loadAvatarWorkerConfig(env: NodeJS.ProcessEnv = process.env): AvatarWorkerConfig {
  const provider = env.GIDEON_AVATAR_WORKER_PROVIDER?.trim().toLowerCase();
  return {
    provider: provider === "sadtalker" || provider === "musetalk" ? provider : "disabled",
    modelVersion: cleanOptional(env.GIDEON_AVATAR_MODEL_VERSION),
    modelLicense: cleanOptional(env.GIDEON_AVATAR_MODEL_LICENSE),
    approvedForCommercialUse: env.GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED === "true",
    commandPath: cleanAbsolutePath(env.GIDEON_AVATAR_WORKER_COMMAND)
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

export function createAvatarWorker(
  config = loadAvatarWorkerConfig(),
  runProcess: AvatarProcessRunner = runAvatarProcess
): AvatarWorker {
  return {
    async render(input): Promise<AvatarWorkerResult> {
      validateAvatarWorkerRequest(input, config);
      if (!config.commandPath) {
        throw new Error(`${config.provider} avatar worker is approved but not installed in this Gideon runtime.`);
      }
      const requestPath = `${input.outputPath}.request.json`;
      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      await fs.writeFile(requestPath, JSON.stringify({ ...input, provider: config.provider }), "utf8");
      try {
        const result = await runProcess(config.commandPath, ["--request", requestPath]);
        const parsed = parseAvatarWorkerResult(result.stdout, input, config);
        return parsed;
      } finally {
        await fs.rm(requestPath, { force: true });
      }
    }
  };
}

export function parseAvatarWorkerResult(
  output: string,
  input: AvatarWorkerRequest,
  config: AvatarWorkerConfig
): AvatarWorkerResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    throw new Error("Avatar worker returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Avatar worker returned an invalid result.");
  }
  const result = parsed as Partial<AvatarWorkerResult>;
  if (result.outputPath !== input.outputPath || !result.receipt) {
    throw new Error("Avatar worker output path or receipt is invalid.");
  }
  const receipt = result.receipt;
  if (
    receipt.provider !== config.provider ||
    receipt.modelVersion !== config.modelVersion ||
    receipt.modelLicense !== config.modelLicense ||
    receipt.avatarId !== input.avatarId ||
    receipt.disclosure !== input.disclosure ||
    receipt.avatarProvenance !== "gideon_fictional_catalog"
  ) {
    throw new Error("Avatar worker receipt does not match the approved request.");
  }
  return { outputPath: input.outputPath, receipt };
}

function runAvatarProcess(commandPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Avatar worker exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanAbsolutePath(value: string | undefined): string | undefined {
  const trimmed = cleanOptional(value);
  return trimmed && path.isAbsolute(trimmed) ? trimmed : undefined;
}
