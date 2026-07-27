import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { scheduleMaskedPresenterGestures, type MaskedPresenterBeat } from "./maskedPresenter";
import { assertMaskedPresenterPerformanceManifest, renderMaskedPresenterPerformance } from "./maskedPresenterRenderer";

const beats: MaskedPresenterBeat[] = [
  { id: "hook", startMs: 0, endMs: 1_500, text: "A clearer workflow.", intent: "hook", energy: "high", presenter: "required", productPriority: 0.1, captionPlacement: "top", cameraEmphasis: "context" }
];

describe("masked presenter renderer", () => {
  it("renders a deterministic transparent frame sequence without an external model", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-masked-presenter-"));
    try {
      const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 1_500, seed: 42 });
      const first = await renderMaskedPresenterPerformance({
        outputDir: path.join(root, "first"),
        durationMs: 1_500,
        fps: 30,
        width: 180,
        height: 320,
        seed: 42,
        schedule,
        encodeGreenScreenVideo: false
      });
      const second = await renderMaskedPresenterPerformance({
        outputDir: path.join(root, "second"),
        durationMs: 1_500,
        fps: 30,
        width: 180,
        height: 320,
        seed: 42,
        schedule,
        encodeGreenScreenVideo: false
      });
      expect(first.manifest.frameCount).toBe(45);
      expect(first.manifest.frameSequenceChecksum).toBe(second.manifest.frameSequenceChecksum);
      expect(first.manifest.mouthVisible).toBe(false);
      expect(first.manifest.lipSyncAttempted).toBe(false);
      expect(first.manifest.motionQuality.status).toBe("passed");
      expect(() => assertMaskedPresenterPerformanceManifest(first.manifest)).not.toThrow();
      expect(() => assertMaskedPresenterPerformanceManifest({ ...first.manifest, mouthVisible: true })).toThrow(/invalid or unsafe/);
      const firstFrame = await fs.readFile(path.join(first.framesDirectory, "000000.png"));
      const lastFrame = await fs.readFile(path.join(first.framesDirectory, "000044.png"));
      expect(firstFrame.length).toBeGreaterThan(1_000);
      expect(createHash("sha256").update(firstFrame).digest("hex")).not.toBe(createHash("sha256").update(lastFrame).digest("hex"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("encodes valid 30 and 60 fps compatibility performances", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-masked-presenter-video-"));
    try {
      for (const fps of [30, 60] as const) {
        const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 1_500, seed: 84 });
        const result = await renderMaskedPresenterPerformance({
          outputDir: path.join(root, String(fps)),
          durationMs: 1_500,
          fps,
          width: 180,
          height: 320,
          seed: 84,
          schedule,
          encodeGreenScreenVideo: true
        });
        expect(result.greenScreenVideoPath).toBeTruthy();
        const probe = await run("/opt/homebrew/bin/ffprobe", [
          "-v", "error", "-show_entries", "stream=width,height,avg_frame_rate:format=duration", "-of", "json", result.greenScreenVideoPath!
        ]);
        const metadata = JSON.parse(probe) as { streams: Array<{ width: number; height: number; avg_frame_rate: string }>; format: { duration: string } };
        expect(metadata.streams[0]).toMatchObject({ width: 180, height: 320, avg_frame_rate: `${fps}/1` });
        expect(Number(metadata.format.duration)).toBeCloseTo(1.5, 1);
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
}
