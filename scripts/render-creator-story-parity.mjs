// Renders the parity blueprint through the generic creator-story renderer and
// measures it against the film V22 produces.
//
// Deliberately narrow. It reuses the V22 run's public assets -- the 54 extracted
// stills, the assembled narration, the sound design -- and the realized caption
// timings from its story manifest, so the only variable is the renderer. If the
// output differs, it differs because the templates differ, not because the audio
// was reassembled or a still was re-extracted at a different frame.
//
// It is not the production entry point. That comes with the CLI, and it will
// build its own assets from a blueprint rather than borrowing another film's.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { measureDecodedMedia } from "./lib/creator-story-decoded-quality.mjs";
import { measureV22Palette } from "./lib/creator-story-v22-palette.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildFilmScenes } = require("../dist/main/shared/creatorStoryFilm.js");

const reference = path.join(root, "tmp", "solomon-creator-story-v22-performance");
const output = path.join(root, "tmp", "creator-story-parity");
const publicDir = path.join(reference, "remotion-public");
for (const dir of [output]) await fs.mkdir(dir, { recursive: true, mode: 0o700 });

for (const required of [publicDir, path.join(publicDir, "narration.wav"), path.join(reference, "story-manifest.json")]) {
  if (!existsSync(required)) throw new Error(`Parity render needs the V22 run's artifacts. Missing: ${required}`);
}

const blueprint = JSON.parse(await fs.readFile(path.join(root, "fixtures", "creator-story", "solomon-v22.blueprint.json"), "utf8"));
const realized = JSON.parse(await fs.readFile(path.join(reference, "story-manifest.json"), "utf8"));

// Per-scene realized boundaries, not a single film length. Scaling authored
// durations proportionally drifted by up to 110 frames against these, which put
// scenes on the wrong backdrops -- the first parity render's most visible defect.
const realizedTimings = realized.scenes.map(({ id, from, to }) => ({ id, startMs: Math.round(from / 30 * 1000), endMs: Math.round(to / 30 * 1000) }));
const scenes = buildFilmScenes(blueprint, realizedTimings);
const captions = realized.captions.map(({ id, from, to, highlight, wordGroups }) => ({ id, from, to, highlight, wordGroups }));

const durationInFrames = scenes.at(-1).to;
process.stdout.write(`blueprint -> ${scenes.length} scenes, ${durationInFrames} frames, ${captions.length} captions\n`);

const inputProps = {
  scenes, captions,
  narrationSrc: "narration.wav",
  soundDesignSrc: existsSync(path.join(publicDir, "sound-design.wav")) ? "sound-design.wav" : undefined,
  disclosure: { fromFrame: 45, durationInFrames: Math.max(1, durationInFrames - 196) }
};
await fs.writeFile(path.join(output, "input-props.json"), `${JSON.stringify(inputProps, null, 2)}\n`);

process.stdout.write("bundling…\n");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "remotion", "creatorStory", "index.ts"), publicDir, outDir: path.join(output, "bundle") });
const composition = await selectComposition({ serveUrl, id: "CreatorStoryFilm", inputProps });
const raw = path.join(output, "creator-story-parity.mp4");
process.stdout.write(`rendering ${composition.durationInFrames} frames…\n`);
await renderMedia({
  composition: { ...composition, durationInFrames },
  serveUrl, codec: "h264", outputLocation: raw, inputProps,
  concurrency: 4, chromiumOptions: { gl: "angle" },
  onProgress: ({ progress }) => process.stdout.write(`\rrender ${Math.round(progress * 100)}%`)
});
process.stdout.write("\n");

// Mastered with the same settings as the reference film so the comparison is of
// pictures, not encoders -- including the loudness normalisation. The first
// parity run skipped it and reported -23.7 LUFS against -14.3, which measured
// the harness rather than the renderer.
const master = path.join(output, "creator-story-parity-master.mp4");
await run("ffmpeg", ["-y", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "256k", master], 900_000);

const decoded = await measureDecodedMedia(master);
const palette = await measureV22Palette(master);
const report = {
  scenes: scenes.length,
  frames: durationInFrames,
  durationSeconds: decoded.metadata.durationSeconds,
  shots: decoded.shots.count,
  meanShotSeconds: decoded.shots.meanSeconds,
  loudnessIntegratedLufs: decoded.loudness.integratedLufs,
  colouredPixelFraction: palette.colouredPixelFraction,
  dominantFamily: palette.dominantFamily,
  dominantFamilyShare: palette.dominantFamilyShare
};
await fs.writeFile(path.join(output, "parity-report.json"), `${JSON.stringify(report, null, 2)}\n`);

// The reference numbers this is being judged against, measured on the V22 master
// earlier today. Printed side by side rather than asserted: the first parity
// render is a diagnosis, and a hard threshold here would hide which axis moved.
const target = { shots: 18, durationSeconds: 38.5, loudnessIntegratedLufs: -14.3, colouredPixelFraction: .206, dominantFamilyShare: .874 };
process.stdout.write("\nmetric                    parity      V22 reference\n");
for (const [key, expected] of Object.entries(target)) {
  const actual = report[key];
  const format = (value) => typeof value === "number" ? value.toFixed(key.includes("Fraction") || key.includes("Share") ? 3 : 2) : String(value);
  process.stdout.write(`  ${key.padEnd(24)}${format(actual).padStart(8)}${format(expected).padStart(14)}\n`);
}
process.stdout.write(`\nmaster: ${path.relative(root, master)}\n`);

function run(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-40_000); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr.slice(-3000)}`)); });
  });
}
