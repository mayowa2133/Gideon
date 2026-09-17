import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { PlannedSoundCue } from "../shared/creatorStorySoundDesign";
import { mixSoundDesign } from "./soundDesignMix";

const run = promisify(execFile);
const ffmpeg = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((candidate) => existsSync(candidate)) ?? "ffmpeg";
const libraryDir = path.resolve("assets", "sfx");
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

const cue = (kind: PlannedSoundCue["kind"], frame: number, sceneId = "scene"): PlannedSoundCue =>
  ({ id: `sfx-${sceneId}-${kind}`, kind, sceneId, frame, startMs: Math.round((frame / 30) * 1000), gainDb: -6, reason: "test" });

async function peakDb(file: string, from: number, to: number): Promise<number> {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-ss", from.toFixed(3), "-to", to.toFixed(3), "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  return match ? Number(match[1]) : -91;
}

describe("sound design mix", () => {
  it("writes a film-length 48k stereo track with each cue at its frame, and a receipt that names the bytes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sound-design-"));
    dirs.push(dir);
    const outputPath = path.join(dir, "public", "sound-design.wav");
    const cues = [cue("card", 30, "a"), cue("sting", 75, "b")];
    const receipt = await mixSoundDesign({ cues, durationInFrames: 120, fps: 30, outputPath, libraryDir });

    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "csv=p=0", outputPath]);
    expect(stdout).toContain("48000,2");
    expect(Math.abs(Number(stdout.trim().split("\n").at(-1)) - 4)).toBeLessThan(0.02);

    // Silence until the first cue, a hit at each cue, silence between.
    expect(await peakDb(outputPath, 0.0, 0.9)).toBeLessThan(-80);
    expect(await peakDb(outputPath, 1.0, 1.3)).toBeGreaterThan(-20);
    expect(await peakDb(outputPath, 1.7, 2.4)).toBeLessThan(-80);
    expect(await peakDb(outputPath, 2.5, 3.2)).toBeGreaterThan(-20);

    expect(receipt.output.sha256).toBe(createHash("sha256").update(await fs.readFile(outputPath)).digest("hex"));
    expect(receipt.cues.map(({ kind, asset }) => [kind, asset.id])).toEqual([["card", "card_slide"], ["sting", "sting_bell"]]);
    expect(receipt.library.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.tuning).toBe("untuned");
    expect(receipt.durationInFrames).toBe(120);
  }, 30_000);

  it("produces a silent track of the right length when the plan is empty", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sound-design-"));
    dirs.push(dir);
    const outputPath = path.join(dir, "sound-design.wav");
    const receipt = await mixSoundDesign({ cues: [], durationInFrames: 45, fps: 30, outputPath, libraryDir });
    expect(receipt.cues).toEqual([]);
    expect(await peakDb(outputPath, 0, 1.5)).toBeLessThan(-80);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outputPath]);
    expect(Math.abs(Number(stdout.trim()) - 1.5)).toBeLessThan(0.02);
  }, 30_000);

  it("fails rather than writes a track when the library is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sound-design-"));
    dirs.push(dir);
    const outputPath = path.join(dir, "sound-design.wav");
    await expect(mixSoundDesign({ cues: [cue("card", 0)], durationInFrames: 30, fps: 30, outputPath, libraryDir: path.join(dir, "nowhere") })).rejects.toThrow("manifest is missing");
    expect(existsSync(outputPath)).toBe(false);
  });
});
