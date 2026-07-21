import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractEnergyVisemes, readPcmWavDurationMs, validateVisemeManifest } from "./visemeCues";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("local energy viseme extraction", () => {
  it("covers silence and speech for the exact WAV duration deterministically", async () => {
    const directory = await tempDirectory();
    const audioPath = path.join(directory, "narration.wav");
    await fs.writeFile(audioPath, pcmWav(24_000, 3_200, (frame) => {
      const timeMs = frame / 24_000 * 1_000;
      return timeMs < 640 || timeMs >= 2_640 ? 0 : Math.sin(frame / 9) * (timeMs < 1_600 ? 5_000 : 18_000);
    }));

    const first = await extractEnergyVisemes(audioPath);
    const second = await extractEnergyVisemes(audioPath);
    expect(first).toEqual(second);
    expect(first.audioDurationMs).toBe(3_200);
    expect(await readPcmWavDurationMs(audioPath)).toBe(3_200);
    expect(first.cues[0]).toMatchObject({ startMs: 0, mouth: "X" });
    expect(first.cues.at(-1)?.endMs).toBe(3_200);
    expect(first.cues.some((cue) => cue.mouth !== "X")).toBe(true);
    expect(first.blinks.length).toBeGreaterThan(0);
  });

  it("rejects malformed audio and cue gaps", async () => {
    const directory = await tempDirectory();
    const audioPath = path.join(directory, "bad.wav");
    await fs.writeFile(audioPath, Buffer.from("not wave audio"));
    await expect(extractEnergyVisemes(audioPath)).rejects.toThrow("RIFF/WAVE");
    expect(() => validateVisemeManifest({
      schemaVersion: "1",
      engine: "energy_fallback",
      engineVersion: "energy-viseme-v1",
      audioDurationMs: 1_000,
      sourceAudioSha256: "a".repeat(64),
      cues: [{ startMs: 100, endMs: 1_000, mouth: "X" }],
      blinks: []
    })).toThrow("ordering");
  });

  it("enforces the 60-second bound and rejects truncated WAV chunks", async () => {
    const directory = await tempDirectory();
    const longPath = path.join(directory, "too-long.wav");
    await fs.writeFile(longPath, pcmWav(8_000, 60_200, () => 0));
    await expect(extractEnergyVisemes(longPath)).rejects.toThrow("duration");

    const truncatedPath = path.join(directory, "truncated.wav");
    const truncated = pcmWav(8_000, 1_000, () => 0).subarray(0, 200);
    await fs.writeFile(truncatedPath, truncated);
    await expect(extractEnergyVisemes(truncatedPath)).rejects.toThrow("truncated chunk");
  });
});

async function tempDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-viseme-cues-"));
  temporaryDirectories.push(directory);
  return directory;
}

function pcmWav(sampleRate: number, durationMs: number, sample: (frame: number) => number): Buffer {
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
    buffer.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(sample(frame)))), 44 + frame * 2);
  }
  return buffer;
}
