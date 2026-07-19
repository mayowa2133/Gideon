import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAvatarWorker,
  loadAvatarWorkerConfig,
  parseAvatarWorkerResult,
  validateAvatarPerformanceMetadata,
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
    }, config)).toThrow("without an authorized private source image");
  });

  it("accepts an authorized private self-likeness source and rejects expired or voice-reference consent", () => {
    const config = loadAvatarWorkerConfig({
      GIDEON_AVATAR_WORKER_PROVIDER: "sadtalker",
      GIDEON_AVATAR_MODEL_VERSION: "sadtalker-pinned",
      GIDEON_AVATAR_MODEL_LICENSE: "Apache-2.0-reviewed",
      GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true"
    });
    const customRequest = {
      ...request,
      sourceImagePath: "/private/project/founder.png",
      consent: {
        assetType: "real_likeness" as const,
        status: "granted" as const,
        sourceArtifactId: "avatar-source-1",
        consentVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
        consentPolicyVersion: "self-avatar-v1" as const,
        subjectRelationship: "self" as const
      }
    };
    expect(() => validateAvatarWorkerRequest(customRequest, config)).not.toThrow();
    expect(() => validateAvatarWorkerRequest({
      ...customRequest,
      consent: { ...customRequest.consent, expiresAt: new Date(Date.now() - 1_000).toISOString() }
    }, config)).toThrow("active verified likeness consent");
    expect(() => validateAvatarWorkerRequest({
      ...customRequest,
      consent: { ...customRequest.consent, assetType: "reference_voice" as const }
    }, config)).toThrow("active verified likeness consent");
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

  it("validates optional multi-layout avatar performance metadata", () => {
    expect(() => validateAvatarPerformanceMetadata({
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 12_000,
      cropSafeRegion: { x: 0.15, y: 0.08, width: 0.7, height: 0.84 },
      backgroundType: "green_screen",
      status: "completed"
    }, 12_000)).not.toThrow();
    expect(() => validateAvatarPerformanceMetadata({
      width: 320,
      height: 320,
      fps: 12,
      durationMs: 3_000,
      cropSafeRegion: { x: 0, y: 0, width: 2, height: 1 },
      backgroundType: "transparent",
      status: "completed"
    }, 12_000)).toThrow("dimensions");
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
    const customRequest = {
      ...request,
      sourceImagePath: "/private/project/founder.png",
      consent: {
        assetType: "real_likeness" as const,
        status: "granted" as const,
        sourceArtifactId: "avatar-source-1",
        consentVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
        consentPolicyVersion: "self-avatar-v1" as const,
        subjectRelationship: "self" as const
      }
    };
    const customReceipt = { ...receipt, avatarProvenance: "user_authorized_likeness" as const };
    expect(parseAvatarWorkerResult(
      JSON.stringify({ outputPath: request.outputPath, receipt: customReceipt }),
      customRequest,
      config
    )).toMatchObject({ receipt: customReceipt });
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
