import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAvatarWorker,
  loadAvatarWorkerConfig,
  parseAvatarWorkerResult,
  validateAvatarWorkerRequest
} from "./avatarWorker";

const request = {
  avatarId: "orbit" as const,
  audioPath: "/private/project/voice.wav",
  outputPath: "/private/project/avatar.mp4",
  durationMs: 12_000,
  disclosure: "AI-generated brand presenter" as const,
  consent: { assetType: "fictional_catalog" as const, status: "not_required" as const }
};

describe("avatar worker boundary", () => {
  it("stays disabled unless an explicit approved model is configured", () => {
    const config = loadAvatarWorkerConfig({});
    expect(() => validateAvatarWorkerRequest(request, config)).toThrow("disabled");
  });

  it("accepts only approved fictional avatars and private paths", () => {
    const config = loadAvatarWorkerConfig({
      GIDEON_AVATAR_WORKER_PROVIDER: "musetalk",
      GIDEON_AVATAR_MODEL_VERSION: "musetalk-1.5-pinned",
      GIDEON_AVATAR_MODEL_LICENSE: "reviewed-license",
      GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true"
    });
    expect(() => validateAvatarWorkerRequest(request, config)).not.toThrow();
    expect(() => validateAvatarWorkerRequest({ ...request, avatarId: "logo_head" }, config)).toThrow("fictional catalog");
    expect(() => validateAvatarWorkerRequest({ ...request, audioPath: "https://example.com/voice.wav" }, config)).toThrow("private local");
    expect(() => validateAvatarWorkerRequest({
      ...request,
      consent: { assetType: "reference_voice", status: "granted", consentVerifiedAt: "2026-07-10T00:00:00.000Z" }
    }, config)).toThrow("blocks likeness");
  });

  it("does not silently execute an uninstalled provider", async () => {
    const worker = createAvatarWorker(loadAvatarWorkerConfig({
      GIDEON_AVATAR_WORKER_PROVIDER: "sadtalker",
      GIDEON_AVATAR_MODEL_VERSION: "sadtalker-pinned",
      GIDEON_AVATAR_MODEL_LICENSE: "Apache-2.0-reviewed",
      GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true"
    }));
    await expect(worker.render(request)).rejects.toThrow("not installed");
  });

  it("accepts only a matching isolated-worker receipt", async () => {
    const config = loadAvatarWorkerConfig({
      GIDEON_AVATAR_WORKER_PROVIDER: "musetalk",
      GIDEON_AVATAR_MODEL_VERSION: "musetalk-1.5-pinned",
      GIDEON_AVATAR_MODEL_LICENSE: "reviewed-license",
      GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true"
    });
    const receipt = {
      provider: "musetalk" as const,
      modelVersion: "musetalk-1.5-pinned",
      modelLicense: "reviewed-license",
      avatarId: "orbit" as const,
      avatarProvenance: "gideon_fictional_catalog" as const,
      disclosure: "AI-generated brand presenter" as const,
      generatedAt: "2026-07-10T00:00:00.000Z"
    };
    expect(parseAvatarWorkerResult(JSON.stringify({ outputPath: request.outputPath, receipt }), request, config)).toMatchObject({ receipt });
    expect(() => parseAvatarWorkerResult(JSON.stringify({ outputPath: "/tmp/other.mp4", receipt }), request, config)).toThrow("output path");
    expect(() => parseAvatarWorkerResult(JSON.stringify({ outputPath: request.outputPath, receipt: { ...receipt, modelVersion: "unknown" } }), request, config)).toThrow("does not match");
  });

  it("writes a sealed request file and removes it after an isolated process response", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-worker-"));
    const outputPath = path.join(directory, "avatar.mp4");
    const config = loadAvatarWorkerConfig({
      GIDEON_AVATAR_WORKER_PROVIDER: "sadtalker",
      GIDEON_AVATAR_MODEL_VERSION: "sadtalker-pinned",
      GIDEON_AVATAR_MODEL_LICENSE: "Apache-2.0-reviewed",
      GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true",
      GIDEON_AVATAR_WORKER_COMMAND: "/opt/gideon/avatar-worker"
    });
    const worker = createAvatarWorker(config, async (_command, args) => {
      const requestPath = args[1]!;
      await expect(fs.access(requestPath)).resolves.toBeUndefined();
      return {
        stdout: JSON.stringify({
          outputPath,
          receipt: {
            provider: "sadtalker",
            modelVersion: "sadtalker-pinned",
            modelLicense: "Apache-2.0-reviewed",
            avatarId: "orbit",
            avatarProvenance: "gideon_fictional_catalog",
            disclosure: "AI-generated brand presenter",
            generatedAt: "2026-07-10T00:00:00.000Z"
          }
        }),
        stderr: ""
      };
    });
    const result = await worker.render({ ...request, outputPath });

    expect(result.outputPath).toBe(outputPath);
    await expect(fs.access(`${outputPath}.request.json`)).rejects.toThrow();
  });
});
