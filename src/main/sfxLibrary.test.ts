import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { RenderSfxCue } from "../shared/types";
import { buildAudioMixFilter } from "./media";
import { SFX_KINDS, loadSfxLibrary, resolveSfxCues } from "./sfxLibrary";

const run = promisify(execFile);
const libraryDir = path.resolve("assets", "sfx");
const ffmpeg = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((candidate) => existsSync(candidate)) ?? "ffmpeg";
const temporaryDirs: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

// A writable copy of the shipped library, so a test can break one thing.
async function copyLibrary(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sfx-"));
  temporaryDirs.push(dir);
  for (const name of await fs.readdir(libraryDir)) {
    await fs.copyFile(path.join(libraryDir, name), path.join(dir, name));
  }
  return dir;
}

async function readManifest(dir: string): Promise<{ entries: Array<Record<string, unknown> & { id: string; file: string; kind: string; sha256: string }> } & Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
}

async function writeManifest(dir: string, manifest: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

const cue = (id: string, kind: RenderSfxCue["kind"], startMs: number, gainDb = -20): RenderSfxCue => ({ id, kind, startMs, gainDb });

describe("sfx library", () => {
  it("ships a manifest whose hashes, durations and kinds match the files on disk", async () => {
    const library = await loadSfxLibrary(libraryDir);
    expect(library.entries.length).toBeGreaterThanOrEqual(SFX_KINDS.length);
    for (const entry of library.entries) {
      const bytes = await fs.readFile(entry.filePath);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", entry.filePath]);
      expect(Math.abs(Number(stdout.trim()) * 1000 - entry.durationMs)).toBeLessThanOrEqual(1);
      // Anything that repeats must stay out of the bright band.
      expect(entry.hfRisk).not.toBe("high");
    }
    for (const kind of SFX_KINDS) expect(library.byKind[kind].length).toBeGreaterThan(0);
    expect(library.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a library whose file no longer matches its manifest hash", async () => {
    const dir = await copyLibrary();
    const manifest = await readManifest(dir);
    const target = manifest.entries[0]!;
    const bytes = await fs.readFile(path.join(dir, target.file));
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0x01;
    await fs.writeFile(path.join(dir, target.file), bytes);
    await expect(loadSfxLibrary(dir)).rejects.toThrow(`${target.file} does not match its manifest hash`);
  });

  it("refuses a library that is missing a file, a kind, or its manifest", async () => {
    const missingFile = await copyLibrary();
    const manifest = await readManifest(missingFile);
    await fs.rm(path.join(missingFile, manifest.entries[0]!.file));
    await expect(loadSfxLibrary(missingFile)).rejects.toThrow(`${manifest.entries[0]!.file} is missing`);

    const missingKind = await copyLibrary();
    const trimmed = await readManifest(missingKind);
    trimmed.entries = trimmed.entries.filter((entry) => entry.kind !== "sting");
    await writeManifest(missingKind, trimmed);
    await expect(loadSfxLibrary(missingKind)).rejects.toThrow('no entry for kind "sting"');

    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sfx-empty-"));
    temporaryDirs.push(empty);
    await expect(loadSfxLibrary(empty)).rejects.toThrow("manifest is missing");
  });

  it("refuses a manifest that is not CC0 or names a file outside the library directory", async () => {
    const relicensed = await copyLibrary();
    const manifest = await readManifest(relicensed);
    await writeManifest(relicensed, { ...manifest, license: "CC-BY-4.0" });
    await expect(loadSfxLibrary(relicensed)).rejects.toThrow("is invalid");

    const escaping = await copyLibrary();
    const traversal = await readManifest(escaping);
    traversal.entries[0]!.file = "../outside.ogg";
    await writeManifest(escaping, traversal);
    await expect(loadSfxLibrary(escaping)).rejects.toThrow("is invalid");
  });

  it("alternates between a kind's voices by ordinal, deterministically", async () => {
    const library = await loadSfxLibrary(libraryDir);
    const clicks = library.byKind.click.map(({ id }) => id);
    expect(clicks).toHaveLength(2);
    const cues = [cue("a", "click", 100), cue("b", "pop", 200), cue("c", "click", 300), cue("d", "click", 400)];
    const first = resolveSfxCues(cues, library).map(({ asset }) => asset.id);
    expect(first).toEqual([clicks[0], library.byKind.pop[0]!.id, clicks[1], clicks[0]]);
    expect(resolveSfxCues(cues, library).map(({ asset }) => asset.id)).toEqual(first);
  });

  it("keeps a pinned asset on re-render and refuses one the library no longer has", async () => {
    const library = await loadSfxLibrary(libraryDir);
    const second = library.byKind.click[1]!;
    const [pinned] = resolveSfxCues([{ ...cue("a", "click", 100), asset: { id: second.id, sha256: second.sha256 } }], library);
    expect(pinned!.asset.id).toBe(second.id);
    expect(pinned!.filePath).toBe(second.filePath);
    expect(() => resolveSfxCues([{ ...cue("a", "click", 100), asset: { id: second.id, sha256: "0".repeat(64) } }], library)).toThrow("no longer has");
    expect(() => resolveSfxCues([{ ...cue("a", "click", 100), asset: { id: "gone", sha256: second.sha256 } }], library)).toThrow("no longer has");
    expect(() => resolveSfxCues([cue("z", "kazoo" as RenderSfxCue["kind"], 0)], library)).toThrow('unknown kind "kazoo"');
  });

  it("produces a mix ffmpeg accepts, with the effect landing where the cue says", async () => {
    const library = await loadSfxLibrary(libraryDir);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-sfx-mix-"));
    temporaryDirs.push(dir);
    const cues = resolveSfxCues([cue("late", "sting", 1_500, -6)], library);
    // A whole-film render's manifest with music off and this one cue: the
    // input layout is [0] voice (index 2 is only where the real command puts
    // it), so the mix is asked to read the voice from input 0 and SFX from 1.
    const manifest = { sfx: cues.map(({ id, kind, startMs, gainDb }) => ({ id, kind, startMs, gainDb })), music: { enabled: false, mood: "none", gainDb: -30 } } as Parameters<typeof buildAudioMixFilter>[0];
    const output = path.join(dir, "mix.wav");
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-t", "3", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      ...cues.flatMap(({ filePath }) => ["-i", filePath]),
      "-filter_complex", buildAudioMixFilter(manifest, 3, 0, cues),
      "-map", "[a]", "-c:a", "pcm_s16le", output
    ]);
    const peakDb = async (from: number, to: number): Promise<number> => {
      const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostats", "-ss", from.toFixed(3), "-to", to.toFixed(3), "-i", output, "-af", "volumedetect", "-f", "null", "-"]);
      const match = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
      return match ? Number(match[1]) : -91;
    };
    const before = await peakDb(0.2, 1.4);
    const during = await peakDb(1.5, 2.2);
    expect(during).toBeGreaterThan(before + 20);
  }, 30_000);
});
