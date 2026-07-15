import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { assembleNormalizedCaptures, normalizeBrowserCapture, validateCaptureVisualQuality } from "./captureMedia";

const execFileAsync = promisify(execFile);
const ffmpegExecutable = process.env.GIDEON_FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

describe("capture media normalization validation", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("rejects an invalid plan hash before invoking FFmpeg", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-media-"));
    tempDirs.push(dir);
    const inputPath = path.join(dir, "capture.webm");
    await fs.writeFile(inputPath, "not video");
    await expect(
      normalizeBrowserCapture({
        rawCapturePath: inputPath,
        outputPath: path.join(dir, "output.mp4"),
        executionReceiptId: "receipt-1",
        compiledPlanHash: "invalid"
      })
    ).rejects.toThrow("Compiled plan hash is invalid");
  });

  it("rejects a raw capture whose checksum does not match its artifact record", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-media-"));
    tempDirs.push(dir);
    const inputPath = path.join(dir, "capture.webm");
    await fs.writeFile(inputPath, "not video");
    await expect(
      normalizeBrowserCapture({
        rawCapturePath: inputPath,
        outputPath: path.join(dir, "output.mp4"),
        executionReceiptId: "receipt-1",
        compiledPlanHash: "a".repeat(64),
        expectedInputSha256: "b".repeat(64)
      })
    ).rejects.toThrow("checksum does not match");
  });

  it("returns a safe processor error without exposing raw stderr", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-media-"));
    tempDirs.push(dir);
    const inputPath = path.join(dir, "capture.webm");
    await fs.writeFile(inputPath, "not video");
    await expect(
      normalizeBrowserCapture({
        rawCapturePath: inputPath,
        outputPath: path.join(dir, "output.mp4"),
        executionReceiptId: "receipt-1",
        compiledPlanHash: "a".repeat(64),
        ffmpegPath: "/definitely/missing/ffmpeg"
      })
    ).rejects.toThrow("Capture media processor could not be started");
  });

  it("rejects assembly when a normalized clip checksum is not its artifact checksum", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-media-"));
    tempDirs.push(dir);
    const inputPath = path.join(dir, "clip.mp4");
    await fs.writeFile(inputPath, "not a video");
    await expect(
      assembleNormalizedCaptures({
        captureRunId: "capture-1",
        clips: [{ path: inputPath, executionId: "execution-1", artifactId: "artifact-1", sha256: "a".repeat(64), durationMs: 1000 }],
        outputPath: path.join(dir, "assembled.mp4")
      })
    ).rejects.toThrow("checksum does not match");
  });

  it.skipIf(!fsSync.existsSync(ffmpegExecutable))("rejects recordings that are mostly blank frames", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-media-"));
    tempDirs.push(dir);
    const videoPath = path.join(dir, "black.mp4");
    const ffmpegPath = ffmpegExecutable;
    await execFileAsync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", videoPath]);
    await expect(validateCaptureVisualQuality({ videoPath, durationMs: 1000, ffmpegPath })).rejects.toThrow("mostly blank frames");
  });
});
