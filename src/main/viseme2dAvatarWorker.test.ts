import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { loadAvatarWorkerConfig } from "./avatarWorker";
import { buildRenderSegments, checkViseme2dAssetPacks, createViseme2dAvatarWorker } from "./viseme2dAvatarWorker";
import { extractEnergyVisemes } from "./visemeCues";

const run = promisify(execFile);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("viseme2d avatar worker", () => {
  it("validates both approved sprite packs", async () => {
    await expect(checkViseme2dAssetPacks()).resolves.toMatchObject({ orbitPackAvailable: true, novaPackAvailable: true });
  });

  it("renders a validated local MP4 without an API, network, Docker, or GPU", async () => {
    const directory = await tempDirectory();
    const audioPath = path.join(directory, "voice.wav");
    const outputPath = path.join(directory, "nested", "orbit.mp4");
    await fs.writeFile(audioPath, pcmWav(24_000, 2_400));
    const worker = createViseme2dAvatarWorker(loadAvatarWorkerConfig({}));
    const result = await worker.render({
      avatarId: "orbit",
      audioPath,
      outputPath,
      durationMs: 2_400,
      disclosure: "AI-generated brand presenter",
      consent: { assetType: "fictional_catalog", status: "not_required" }
    });

    expect(result.receipt).toMatchObject({ provider: "viseme2d", cueEngine: "energy_fallback", avatarId: "orbit" });
    expect(result.performance).toMatchObject({ width: 720, height: 720, fps: 30, durationMs: 2_400 });
    expect((await fs.stat(outputPath)).size).toBeGreaterThan(4_096);
    expect((await fs.readdir(path.dirname(outputPath))).filter((entry) => entry.startsWith(".viseme2d-"))).toEqual([]);
    const cues = await extractEnergyVisemes(audioPath);
    const speech = cues.cues.find((cue) => cue.mouth !== "X")!;
    const blink = cues.blinks[0]!;
    const frames = await Promise.all([
      extractFrame(outputPath, 0.2, path.join(directory, "rest.png")),
      extractFrame(outputPath, (speech.startMs + speech.endMs) / 2_000, path.join(directory, "speech.png")),
      extractFrame(outputPath, (blink.startMs + blink.endMs) / 2_000, path.join(directory, "blink.png"))
    ]);
    expect(frames[0].equals(frames[1])).toBe(false);
    expect(frames[1].equals(frames[2])).toBe(false);
  }, 30_000);

  it("keeps custom portraits static in free local mode", async () => {
    const worker = createViseme2dAvatarWorker(loadAvatarWorkerConfig({}));
    await expect(worker.render({
      avatarId: "nova",
      audioPath: "/private/voice.wav",
      sourceImagePath: "/private/self.png",
      outputPath: "/private/avatar.mp4",
      durationMs: 2_000,
      disclosure: "AI-generated brand presenter",
      consent: {
        assetType: "real_likeness",
        status: "granted",
        sourceArtifactId: "self-1",
        consentVerifiedAt: new Date().toISOString(),
        consentPolicyVersion: "self-avatar-v1",
        subjectRelationship: "self"
      }
    })).rejects.toThrow("custom portraits remain static");
  });

  it("uses blink frames while retaining complete render coverage", () => {
    const segments = buildRenderSegments({
      audioDurationMs: 1_000,
      cues: [{ startMs: 0, endMs: 500, mouth: "X" }, { startMs: 500, endMs: 1_000, mouth: "A" }],
      blinks: [{ startMs: 200, endMs: 320 }]
    }, { mouthFrames: { A: "A.png", B: "B.png", C: "C.png", D: "D.png", E: "E.png", F: "F.png", G: "G.png", H: "G.png", X: "X.png" }, blinkFrame: "blink.png" }, "/pack");
    expect(segments[0]?.startMs).toBe(0);
    expect(segments.at(-1)?.endMs).toBe(1_000);
    expect(segments.some((segment) => segment.framePath.endsWith("blink.png"))).toBe(true);
  });
});

async function tempDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-viseme-worker-"));
  temporaryDirectories.push(directory);
  return directory;
}

function pcmWav(sampleRate: number, durationMs: number): Buffer {
  const frames = Math.round(sampleRate * durationMs / 1_000);
  const dataBytes = frames * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const timeMs = frame / sampleRate * 1_000;
    const value = timeMs < 400 || timeMs > 2_050 ? 0 : Math.sin(frame / 8) * (6_000 + (frame % 900));
    buffer.writeInt16LE(Math.round(value), 44 + frame * 2);
  }
  return buffer;
}

async function extractFrame(inputPath: string, seconds: number, outputPath: string): Promise<Buffer> {
  await run("/opt/homebrew/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", seconds.toFixed(3), "-i", inputPath,
    "-frames:v", "1", "-update", "1", outputPath
  ]);
  return fs.readFile(outputPath);
}
