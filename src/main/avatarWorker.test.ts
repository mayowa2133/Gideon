import { describe, expect, it } from "vitest";
import { createAvatarWorker, loadAvatarWorkerConfig, validateAvatarWorkerRequest } from "./avatarWorker";

const request = {
  avatarId: "orbit" as const,
  audioPath: "/private/project/voice.wav",
  outputPath: "/private/project/avatar.mp4",
  durationMs: 12_000,
  disclosure: "AI-generated brand presenter" as const
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
});
