// Mixes a planned cue list into one sound-design track and writes the receipt
// that says what went into it.
//
// The track is a stereo 48 kHz WAV the length of the film, silent except
// where a cue lands, so Remotion can lay it under the narration without
// either knowing about the other. One ffmpeg input per cue, paths as argv,
// nothing interpolated into the filter string -- the same shape as the
// desktop mix in media.ts, kept separate because this one is offline and
// answers to a frame count rather than a render manifest.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PlannedSoundCue } from "../shared/creatorStorySoundDesign";
import { loadSfxLibrary, resolveSfxCues } from "./sfxLibrary";

export interface SoundDesignReceipt {
  schemaVersion: "1";
  fps: number;
  durationInFrames: number;
  sampleRate: 48000;
  library: { hash: string };
  output: { file: string; sha256: string };
  cues: Array<PlannedSoundCue & { asset: { id: string; sha256: string } }>;
  // Said plainly so a reader does not take a written receipt for a listened
  // one: the levels came from a table, not from anybody's ears.
  tuning: "untuned";
}

export async function mixSoundDesign(input: {
  cues: PlannedSoundCue[];
  durationInFrames: number;
  fps: number;
  outputPath: string;
  libraryDir?: string;
}): Promise<SoundDesignReceipt> {
  const library = await loadSfxLibrary(input.libraryDir);
  const resolved = resolveSfxCues(input.cues.map(({ id, kind, startMs, gainDb }) => ({ id, kind, startMs, gainDb })), library);
  const durationSec = input.durationInFrames / input.fps;
  const duration = durationSec.toFixed(3);

  const filters = resolved.map((cue, index) => {
    const delayMs = Math.max(0, Math.round(cue.startMs));
    return `[${index + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${(cue.gainDb + cue.gainTrimDb).toFixed(2)}dB,adelay=${delayMs}|${delayMs},apad,atrim=0:${duration},asetpts=N/SR/TB[c${index}]`;
  });
  // normalize=0: amix's default divides every input by the input count, which
  // would make a film with twelve cues twelve times quieter than one with one.
  const mix = resolved.length
    ? `${filters.join(";")};[0:a]${resolved.map((_, index) => `[c${index}]`).join("")}amix=inputs=${resolved.length + 1}:normalize=0:duration=first[a]`
    : "[0:a]anull[a]";

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await run(ffmpegPath(), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-t", duration, "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    ...resolved.flatMap((cue) => ["-i", cue.filePath]),
    "-filter_complex", mix,
    "-map", "[a]", "-t", duration, "-c:a", "pcm_s16le", input.outputPath
  ]);

  const sha256 = createHash("sha256").update(await fs.readFile(input.outputPath)).digest("hex");
  return {
    schemaVersion: "1",
    fps: input.fps,
    durationInFrames: input.durationInFrames,
    sampleRate: 48000,
    library: { hash: library.hash },
    output: { file: path.basename(input.outputPath), sha256 },
    cues: input.cues.map((cue, index) => ({ ...cue, asset: resolved[index]!.asset })),
    tuning: "untuned"
  };
}

function ffmpegPath(): string {
  if (process.env.GIDEON_FFMPEG_PATH) return process.env.GIDEON_FFMPEG_PATH;
  const candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", path.join(os.homedir(), ".local", "bin", "ffmpeg")];
  return candidates.find((candidate) => existsSync(candidate)) ?? "ffmpeg";
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`ffmpeg failed while mixing sound design: ${String(stderr).split("\n").filter(Boolean).at(-1) ?? error.message}`));
      else resolve();
    });
  });
}
