// Renders a generated blueprint into a finished film.
//
// The first entry point that builds its own audio rather than borrowing another
// film's. Narration is spoken per beat, the realized clip lengths become the
// scene boundaries, and the captions are cut from the same lines -- so the
// picture, the cut and the words all come from one script and cannot drift.
//
// Speech is macOS `say`. It is not the shipping voice: Chatterbox is, and this
// takes the local path so a film can be watched without a Python runtime. Swap
// the narrate() call when the Chatterbox provider is wired to this path.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildFilmScenes } = require("../dist/main/shared/creatorStoryFilm.js");
const { SPEECH_RATE_BAND, MIN_SCENE_FRAMES } = require("../dist/main/shared/creatorStoryQuality.js");

const FPS = 30;
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const inDir = path.resolve(flag("in", path.join(root, "tmp", "creator-story")));
const outDir = path.resolve(flag("out", path.join(inDir, "render")));
// The stills and sound design the V22 capture produced. A generated film reuses
// the captured product screens; it does not re-record the product.
const publicDir = path.join(root, "tmp", "solomon-creator-story-v22-performance", "remotion-public");

const blueprint = JSON.parse(await fs.readFile(path.join(inDir, "blueprint.json"), "utf8"));
const script = JSON.parse(await fs.readFile(path.join(inDir, "script.json"), "utf8"));
await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
const clips = path.join(outDir, "clips");
await fs.mkdir(clips, { recursive: true, mode: 0o700 });

const ffprobeDuration = async (file) => {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
};

// One clip per spoken beat, at the reference speech rate. Speaking each beat
// separately rather than the whole script at once is what makes the boundaries
// real: the scene is as long as its line takes, not as long as a word count
// guessed it would.
const target = Math.round((SPEECH_RATE_BAND[0] + SPEECH_RATE_BAND[1]) / 2);
const words = (text) => text.split(/\s+/).filter(Boolean).length;
const totalWords = script.reduce((sum, beat) => sum + words(beat.vo), 0);

// `say -r` is a nominal rate, not a delivered one, and every clip arrives with
// silence on both ends. Asking for 181 wpm gave 137 and a 53-second film out of
// a 38.5-second cut -- so the clips are trimmed, the delivered rate is measured,
// and the ask is corrected once against it.
async function narrate(rate) {
  const spoken = new Map();
  for (const beat of script) {
    if (!beat.vo.trim()) continue;
    const aiff = path.join(clips, `${beat.id}.aiff`);
    const wav = path.join(clips, `${beat.id}.wav`);
    await run("say", ["-r", String(rate), "-o", aiff, beat.vo]);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "48000", "-ac", "2",
      "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse", wav]);
    spoken.set(beat.id, { wav, seconds: await ffprobeDuration(wav) });
  }
  return spoken;
}

let spoken = await narrate(target);
const deliveredWpm = () => totalWords / ([...spoken.values()].reduce((sum, clip) => sum + clip.seconds, 0) / 60);
process.stdout.write(`narrated ${spoken.size} beats: asked ${target} wpm, got ${Math.round(deliveredWpm())}\n`);
if (deliveredWpm() < SPEECH_RATE_BAND[0] || deliveredWpm() > SPEECH_RATE_BAND[1]) {
  const corrected = Math.round(target * (target / deliveredWpm()));
  spoken = await narrate(corrected);
  process.stdout.write(`corrected to -r ${corrected}: ${Math.round(deliveredWpm())} wpm\n`);
}

// Boundaries from realized speech. A spoken beat holds its line plus a beat of
// air either side; a silent beat keeps the length the compiler gave it, since
// nothing was said to measure.
const HEAD = 4, TAIL = 6;
let atMs = 0;
const realized = [], gaps = [];
for (const beat of script) {
  const authored = blueprint.scenes.find((scene) => scene.id === beat.id);
  const clip = spoken.get(beat.id);
  const frames = clip
    ? Math.max(MIN_SCENE_FRAMES, Math.round(clip.seconds * FPS) + HEAD + TAIL)
    : Math.round((authored.endMs - authored.startMs) / 1000 * FPS);
  const endMs = atMs + Math.round((frames / FPS) * 1000);
  if (clip) gaps.push({ id: beat.id, startMs: atMs + Math.round((HEAD / FPS) * 1000), wav: clip.wav, seconds: clip.seconds });
  realized.push({ id: beat.id, startMs: atMs, endMs });
  atMs = endMs;
}

// Assemble narration by laying each clip at its own start over one silent bed,
// rather than concatenating with padding. Concatenation accumulates rounding;
// placing against absolute offsets keeps every line where the cut expects it.
const totalSeconds = atMs / 1000;
const bed = path.join(outDir, "silence.wav");
await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", String(totalSeconds), bed]);
const narration = path.join(publicDir, "generated-narration.wav");
await run("ffmpeg", ["-y", "-loglevel", "error",
  ...[bed, ...gaps.map(({ wav }) => wav)].flatMap((file) => ["-i", file]),
  "-filter_complex",
  `${gaps.map((gap, index) => `[${index + 1}:a]adelay=${Math.round(gap.startMs)}|${Math.round(gap.startMs)}[d${index}]`).join(";")}${gaps.length ? ";" : ""}[0:a]${gaps.map((_, index) => `[d${index}]`).join("")}amix=inputs=${gaps.length + 1}:normalize=0[out]`,
  "-map", "[out]", "-ar", "48000", "-ac", "2", narration]);

const scenes = buildFilmScenes(blueprint, realized);
// Captions from the same lines the voice is reading, in groups of three words
// spread across the clip. Not word-accurate -- that needs forced alignment --
// but every word on screen is a word that is said, which is the property that
// matters and the one V22 kept breaking.
const GROUP = 3;
const captions = gaps.map((gap) => {
  const scene = scenes.find((entry) => entry.id === gap.id);
  const words = script.find((beat) => beat.id === gap.id).vo.split(/\s+/).filter(Boolean);
  const from = scene.from + HEAD, span = Math.round(gap.seconds * FPS);

  // Break at punctuation first, then at three words. Fixed grouping put
  // "MARKETING INTERNSHIPS. ALMOST" on screen -- a group straddling a sentence
  // boundary reads as a sentence that is not one.
  const groups = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    if (/[.,;:!?]$/.test(word) || current.length >= GROUP) { groups.push(current); current = []; }
  }
  if (current.length) groups.push(current);

  // Time each group by how long it takes to say, not by how many there are.
  // An even split drifts against the voice as soon as the groups differ in
  // length, which is every line -- "a channel." and "Product Engineer at" are
  // not the same duration and were being given the same slice.
  const weight = (group) => group.join(" ").replace(/[^A-Za-z0-9]/g, "").length + 1;
  const total = groups.reduce((sum, group) => sum + weight(group), 0);
  let spent = 0;
  return {
    id: gap.id, from, to: from + span,
    wordGroups: groups.map((group) => {
      const start = Math.round((span * spent) / total);
      spent += weight(group);
      return { text: group.join(" ").toUpperCase(), from: start, to: Math.round((span * spent) / total) };
    })
  };
});

const durationInFrames = scenes.at(-1).to;
process.stdout.write(`${scenes.length} scenes, ${durationInFrames} frames (${(durationInFrames / FPS).toFixed(2)}s), ${captions.length} captions\n`);

const inputProps = {
  scenes, captions,
  narrationSrc: "generated-narration.wav",
  soundDesignSrc: existsSync(path.join(publicDir, "sound-design.wav")) ? "sound-design.wav" : undefined,
  disclosure: { fromFrame: 45, durationInFrames: Math.max(1, durationInFrames - 196) }
};
await fs.writeFile(path.join(outDir, "input-props.json"), `${JSON.stringify(inputProps, null, 2)}\n`);

process.stdout.write("bundling…\n");
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "remotion", "creatorStory", "index.ts"), publicDir, outDir: path.join(outDir, "bundle") });
const composition = await selectComposition({ serveUrl, id: "CreatorStoryFilm", inputProps, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
const raw = path.join(outDir, "raw.mp4");
process.stdout.write("rendering…\n");
// Concurrency 1 and the long timeout are V22's settings, kept for its reasons:
// parallel tabs each re-request the variable fonts and time out the delayRender
// that gates them, and the same run at higher concurrency produced different
// shot counts on repeat renders.
await renderMedia({
  composition: { ...composition, durationInFrames }, serveUrl, codec: "h264",
  outputLocation: raw, inputProps, concurrency: 1, overwrite: true,
  pixelFormat: "yuv420p", crf: 13, x264Preset: "medium",
  audioCodec: "aac", audioBitrate: "320K", sampleRate: 48000,
  chromeMode: "headless-shell", timeoutInMilliseconds: 180000,
  onProgress: ({ progress }) => { const value = Math.round(progress * 100); if (value % 10 === 0) process.stdout.write(`render ${value}%\n`); }
});

// Master to the same loudness target the reference films sit at, so the four-way
// comparison is measuring the film and not the mixdown.
const master = path.join(outDir, `${blueprint.id}.mp4`);
await run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw,
  "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", master]);
process.stdout.write(`\n${master}\n`);
