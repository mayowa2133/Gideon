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
import { alignClip } from "./lib/creator-story-alignment.mjs";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildFilmScenes } = require("../dist/main/shared/creatorStoryFilm.js");
const { SPEECH_RATE_BAND, MIN_SCENE_FRAMES } = require("../dist/main/shared/creatorStoryQuality.js");
const { RESTING_TRIM } = require("../dist/main/shared/angleBlueprint.js");

const FPS = 30;
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const inDir = path.resolve(flag("in", path.join(root, "tmp", "creator-story")));
const outDir = path.resolve(flag("out", path.join(inDir, "render")));
// The sound design the V22 capture produced. Nothing else is borrowed from it.
const referenceDir = path.join(root, "tmp", "solomon-creator-story-v22-performance", "remotion-public");
// This film's own public directory, assembled per render.
//
// It used to be V22's, which meant the product screens a generated film drew
// were whatever `still-<asset>-<trim>.png` happened to be sitting there. Capture
// writes `capture/<asset>.png` and the renderer reads that other name, so the
// join was a person copying files between two directories -- and the moment the
// hand is skipped the film compiles against a fresh capture and renders the
// previous one. Every crop correct, every pixel from another recording, and no
// gate anywhere in the chain able to tell.
const publicDir = path.join(outDir, "public");

const blueprint = JSON.parse(await fs.readFile(path.join(inDir, "blueprint.json"), "utf8"));
const script = JSON.parse(await fs.readFile(path.join(inDir, "script.json"), "utf8"));
await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
const clips = path.join(outDir, "clips");
await fs.mkdir(clips, { recursive: true, mode: 0o700 });
await fs.mkdir(publicDir, { recursive: true, mode: 0o700 });

// Publish the screens this blueprint's crops were resolved against, under the
// names the renderer asks for. The inventory is the source: it is what the crops
// were measured on, so it is the only thing that knows which image each screen
// is. A crop whose screen is not in it stops the render here rather than
// rendering a missing image as a white card.
const inventoryPath = flag("inventory", JSON.parse(await fs.readFile(path.join(inDir, "brief.json"), "utf8")).inventoryPath);
const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const stillFor = new Map(inventory.screens.map((screen) => [screen.asset, screen.still]));
// One entry per still the renderer will ask for, and a crop that plays a
// sequence wins the slot.
//
// Keyed by asset and trim, both the proof band and the establishing wide of the
// same screen are `outreach_draft-0`, so the last one seen took the slot -- and
// the proof band comes later, carries no motion, and the sequence was silently
// never published. The film asked for `still-outreach_draft-3` and got nothing.
const wanted = new Map();
for (const scene of blueprint.scenes) {
  for (const crop of scene.productCrops ?? []) {
    const key = `${crop.assetId}-${crop.trim}`;
    if (!wanted.has(key) || (crop.motion && !wanted.get(key).motion)) wanted.set(key, crop);
  }
}
for (const [name, crop] of wanted) {
  const captured = stillFor.get(crop.assetId);
  // An inventory built from a capture run names its own image. The shipped
  // fixture inventory was built from the reference film's clips and does not, so
  // that path still resolves against the frames V22 extracted -- and only that
  // path, which is the point: a film that captured its own screens can never
  // silently fall back to another film's.
  // A before/after pair draws the screen at rest, which is a different
  // photograph from the settled one and has to be resolved as such -- resolving
  // it to the settled still would put the same picture on both sides of the
  // arrow and call it a change.
  const filmedScreen = inventory.screens.find((screen) => screen.asset === crop.assetId)?.motion;
  const source = crop.trim === RESTING_TRIM && filmedScreen?.resting
    ? path.resolve(root, filmedScreen.resting)
    : captured ? path.resolve(root, captured) : path.join(referenceDir, `still-${name}.png`);
  if (!existsSync(source)) throw new Error(`Blueprint draws ${crop.assetId} at trim ${crop.trim}, and neither ${path.relative(root, inventoryPath)} nor the reference stills have that screen.`);
  await fs.copyFile(source, path.join(publicDir, `still-${name}.png`));

  // A crop that plays a sequence needs every frame of it, under the trims the
  // renderer will ask for: `crop.trim + i * step`.
  const filmed = filmedScreen;
  if (crop.motion && filmed) {
    for (const [index, frame] of filmed.stills.entries()) {
      await fs.copyFile(path.resolve(root, frame), path.join(publicDir, `still-${crop.assetId}-${crop.trim + index * crop.motion.step}.png`));
    }
    process.stdout.write(`published ${filmed.stills.length} motion frame(s) for ${crop.assetId}\n`);
  }
}
process.stdout.write(`published ${wanted.size} product still(s) from ${path.relative(root, inventoryPath)}\n`);
const soundDesign = path.join(referenceDir, "sound-design.wav");
if (existsSync(soundDesign)) await fs.copyFile(soundDesign, path.join(publicDir, "sound-design.wav"));

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
// Captions from the same lines the voice is reading, grouped for reading and
// timed from where the words are actually spoken.
//
// The timings used to be a model of speech -- each group's share of the clip in
// proportion to its characters -- and a model drifts in the direction that
// shows. `alignClip` transcribes the clip with word timestamps and maps them
// onto the script's own words, so the group under the voice is the group being
// said. The words on screen are still the script's; whisper supplies when, never
// what.
// Caption groups are budgeted in characters as well as words, because the band
// they sit in is measured in pixels and three words are not a fixed width.
// "GROWTH MARKETING MANAGER." wrapped to three lines at 80px, and three lines
// from a top of 116 at a line height of .94 reach 342 -- past the 326 where the
// product rect starts. It rendered as a caption sitting on the evidence card.
//
// 18 characters is the budget and 0.855em is where it comes from: the widest
// per-character advance measured on this face in a rendered frame ("GROWTH" at
// 80px spans 410px). At that advance an 18-character group is 1231px against a
// 960px line, so it can reach two lines and never three.
const GROUP = 3, GROUP_CHARS = 18;
const CAPTION_SIZE = 80, CAPTION_LINE = 960, WIDEST_ADVANCE_EM = 0.855;
const alignment = [];
const captions = [];
for (const gap of gaps) {
  const scene = scenes.find((entry) => entry.id === gap.id);
  // A `big_number` scene sets its own line in type, so captioning it as well
  // puts the same words on screen twice at two sizes. The band caught the tail
  // of the phrase -- a reveal reading "1 WEEK AGO" under a caption reading
  // "AGO." -- which is worse than redundant, because the fragment reads as a
  // different, unfinished sentence.
  if (scene?.contentPattern === "big_number") continue;
  const line = script.find((beat) => beat.id === gap.id).vo;
  const words = line.split(/\s+/).filter(Boolean);
  const from = scene.from + HEAD, span = Math.round(gap.seconds * FPS);

  // Break at punctuation first, then at three words or eighteen characters,
  // whichever comes first. Fixed grouping put "MARKETING INTERNSHIPS. ALMOST" on
  // screen -- a group straddling a sentence boundary reads as a sentence that is
  // not one -- and unbounded width put a third line over the product card.
  const groups = [];
  const width = (indices) => indices.reduce((sum, index) => sum + words[index].length, 0) + Math.max(0, indices.length - 1);
  let current = [];
  for (const [index, word] of words.entries()) {
    if (current.length && (current.length >= GROUP || width([...current, index]) > GROUP_CHARS)) { groups.push(current); current = []; }
    current.push(index);
    if (/[.,;:!?]$/.test(word)) { groups.push(current); current = []; }
  }
  if (current.length) groups.push(current);
  // A single word longer than the budget cannot be split, so the budget cannot
  // promise two lines on its own. Say so here rather than discover it in a
  // frame: this is the one case the grouping does not cover.
  for (const indices of groups) {
    const lines = Math.ceil((width(indices) * WIDEST_ADVANCE_EM * CAPTION_SIZE) / CAPTION_LINE);
    if (lines > 2) throw new Error(`Caption group "${indices.map((index) => words[index]).join(" ")}" in ${gap.id} needs ${lines} lines; the caption band holds two.`);
  }

  const timed = await alignClip(gap.wav, line, gap.seconds);
  alignment.push({ id: gap.id, source: timed.source, coverage: Number(timed.coverage.toFixed(2)), reason: timed.reason });
  // Group boundaries are absolute film frames, like the caption's own window.
  //
  // They were clip-relative, which is a second frame space for one fact and the
  // renderer only knows about the first: `CaptionLayer` resolves a group against
  // the film's timeline, so every caption after the hook began past its own last
  // group, matched nothing, and fell through to `at(-1)`. Each line rendered as
  // its final two or three words, frozen for the whole scene. The hook alone
  // looked right, because its window starts at frame 4 and overlaps the relative
  // range by accident.
  //
  // V22's `buildWordGroups` has always emitted absolute frames. This is the
  // producer agreeing with the other producer rather than the consumer being
  // taught a second convention.
  const wordGroups = groups.map((indices) => ({
    text: indices.map((index) => words[index]).join(" ").toUpperCase(),
    from: from + Math.round(timed.words[indices[0]].from * FPS),
    to: from + Math.round(timed.words[indices.at(-1)].to * FPS)
  }));
  // The last phrase holds to the end of its own window.
  //
  // Alignment ends a group on the frame its last word stops sounding, which left
  // the caption box live and empty for the rest of the beat: measured across the
  // film, 142 frames -- 4.7 seconds -- sat inside a caption window after its
  // last word, and only 68% of the film carried a line at all. The window is
  // already the bound this film chose for the phrase, and holding to it keeps
  // the group inside the containment check below rather than reaching past it.
  if (wordGroups.length) wordGroups.at(-1).to = from + span;
  captions.push({ id: gap.id, from, to: from + span, wordGroups });
}
// Every group has to sit inside the window that draws it.
//
// This is the check that was missing when word groups were emitted in a second
// frame space: the renderer resolves a group against the film's timeline, so a
// group outside its caption's window can never be selected and the line silently
// renders as whatever the fallback picks. Cheap to state, and it fails here
// rather than twelve minutes into a render.
for (const caption of captions) {
  for (const group of caption.wordGroups) {
    if (group.from < caption.from || group.to > caption.to) {
      throw new Error(`Caption ${caption.id}: word group "${group.text}" spans ${group.from}-${group.to}, outside its window ${caption.from}-${caption.to}.`);
    }
  }
}
// Said out loud, because a caption track that was quietly estimated looks
// exactly like one that was aligned.
const estimated = alignment.filter(({ source }) => source === "estimated");
process.stdout.write(`captions: ${alignment.length - estimated.length}/${alignment.length} force-aligned\n`);
for (const beat of estimated) process.stdout.write(`  estimated ${beat.id}: ${beat.reason ?? "unknown"}\n`);

const durationInFrames = scenes.at(-1).to;
process.stdout.write(`${scenes.length} scenes, ${durationInFrames} frames (${(durationInFrames / FPS).toFixed(2)}s), ${captions.length} captions\n`);

const inputProps = {
  scenes, captions,
  narrationSrc: "generated-narration.wav",
  soundDesignSrc: existsSync(path.join(publicDir, "sound-design.wav")) ? "sound-design.wav" : undefined,
  disclosure: { fromFrame: 45, durationInFrames: Math.max(1, durationInFrames - 196) }
};
await fs.writeFile(path.join(outDir, "input-props.json"), `${JSON.stringify(inputProps, null, 2)}\n`);
// The alignment receipt travels with the render, so "the captions are aligned"
// is a claim somebody can check afterwards rather than a line in a log.
await fs.writeFile(path.join(outDir, "caption-alignment.json"), `${JSON.stringify({ beats: alignment }, null, 2)}\n`);

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
