import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChatterboxNarrationProvider, type ChatterboxBridgeRunner } from "./chatterboxNarrationProvider";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe("Chatterbox narration provider", () => {
  it("uses a bounded runner and reuses the content cache without model inference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-chatterbox-"));
    roots.push(root);
    let calls = 0;
    const bridgeRunner: ChatterboxBridgeRunner = async (input) => {
      calls += 1;
      const outputPath = path.join(input.request.outputRoot, `${input.request.beats[0]!.id}.wav`);
      await writePcmWav(outputPath, 24_000, 2_400);
      return { ok: true, model: "chatterbox-turbo", modelRevision: "a".repeat(40), device: "cpu", watermark: "perth", outputs: [{ id: input.request.beats[0]!.id, outputPath, durationMs: 100 }] };
    };
    const provider = new ChatterboxNarrationProvider({
      pythonPath: process.execPath,
      bridgePath: __filename,
      modelCacheRoot: path.join(root, "models"),
      device: "cpu",
      bridgeRunner
    });
    const request = {
      outputDir: path.join(root, "output"),
      beats: [{ id: "hook", approvedText: "Meet Solomon", startMs: 0, endMs: 2_000, energy: "medium" as const }],
      language: "en" as const,
      voice: { mode: "model_default" as const },
      seed: 7
    };
    const first = await provider.synthesize(request);
    const second = await provider.synthesize(request);
    expect(calls).toBe(1);
    expect(first.beats[0]?.cacheHit).toBe(false);
    expect(second.beats[0]?.cacheHit).toBe(true);
    expect(second.provenance.watermark).toBe("perth");
  });
});

async function writePcmWav(filePath: string, sampleRate: number, samples: number): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  await fs.writeFile(filePath, buffer);
}
