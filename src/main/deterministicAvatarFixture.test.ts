import { describe, expect, it } from "vitest";
import { createDeterministicAvatarFixture } from "./deterministicAvatarFixture";

describe("deterministic avatar fixture", () => {
  it("builds a test-only portrait performance contract without claiming avatar quality", async () => {
    let invocation: { command: string; args: string[] } | undefined;
    const result = await createDeterministicAvatarFixture({
      outputPath: "/tmp/gideon-avatar-fixture/avatar.mp4",
      durationMs: 44_000,
      sourceImagePath: "/private/orbit.png",
      ffmpegPath: "/private/ffmpeg",
      runProcess: async (command, args) => { invocation = { command, args }; }
    });
    expect(invocation?.command).toBe("/private/ffmpeg");
    expect(invocation?.args).toContain("color=c=0x00FF00:s=1080x1920:r=30:d=44.000");
    expect(result.receipt).toMatchObject({ provider: "deterministic_fixture", modelLicense: "test-fixture-only" });
    expect(result.performance).toMatchObject({ width: 1080, height: 1920, fps: 30, backgroundType: "green_screen" });
    expect(result.qualityReport).toEqual({ requiresHumanReview: true, evaluator: "not_run" });
  });

  it("rejects unsafe paths and unsupported durations", async () => {
    await expect(createDeterministicAvatarFixture({ outputPath: "avatar.mp4", durationMs: 5_000, runProcess: async () => undefined })).rejects.toThrow("absolute path");
    await expect(createDeterministicAvatarFixture({ outputPath: "/tmp/avatar.mp4", durationMs: 61_000, runProcess: async () => undefined })).rejects.toThrow("duration");
  });
});
