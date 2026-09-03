// Local-only product-led Meet Solomon film. Captures are copied by hash into
// the output so a later render cannot silently swap in a different job feed.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { alignClip } from "./lib/creator-story-alignment.mjs";
import { measureDecodedMedia } from "./lib/creator-story-decoded-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { ChatterboxNarrationProvider } = require("../dist/main/main/chatterboxNarrationProvider.js");
const { opportunityStorySchema, opportunityFilmSchema } = require("../dist/main/shared/meetSolomonOpportunityScroll.js");
const run = promisify(execFile);
const sha256 = data => createHash("sha256").update(data).digest("hex");
const args = process.argv.slice(2);
const value = name => { const at = args.indexOf(`--${name}`); if (at < 0 || !args[at + 1]) throw new Error(`Missing --${name}.`); return args[at + 1]; };
const out = path.resolve(value("out"));
const storyPath = path.resolve(value("story"));
const write = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const duration = async file => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout.trim());
const ffmpeg = async argv => run("ffmpeg", ["-y", "-loglevel", "error", ...argv], { timeout: 240000, maxBuffer: 2_000_000 });

async function main() {
  if (await fs.stat(path.join(out, "preservation-receipt.json")).catch(() => null)) throw new Error("This is a preserved archive. Render to a new directory.");
  await fs.mkdir(out, { recursive: true, mode: 0o700 });
  const publicDir = path.join(out, "public"), voiceDir = path.join(out, "voice"), captureDir = path.join(out, "capture");
  await Promise.all([publicDir, voiceDir, captureDir].map(dir => fs.mkdir(dir, { recursive: true, mode: 0o700 })));
  const story = opportunityStorySchema.parse(JSON.parse(await fs.readFile(storyPath, "utf8")));
  const sources = [];
  const sourceReview = [];
  for (const source of story.sources) {
    const sourcePath = path.resolve(root, source.sourcePath), bytes = await fs.readFile(sourcePath);
    if (sha256(bytes) !== source.sha256) throw new Error(`Capture hash mismatch: ${source.id}`);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== source.sourceWidth || bytes.readUInt32BE(20) !== source.sourceHeight) throw new Error(`Capture dimensions mismatch: ${source.id}`);
    await Promise.all([fs.writeFile(path.join(publicDir, source.file), bytes, { mode: 0o600 }), fs.writeFile(path.join(captureDir, source.file), bytes, { mode: 0o600 })]);
    const ocr = (await run("tesseract", [sourcePath, "stdout", "--psm", "6"], { timeout: 30000 })).stdout;
    if (!/Solomon/i.test(ocr) || !/jobs/i.test(ocr)) throw new Error(`OCR does not confirm a Solomon jobs capture: ${source.id}`);
    sourceReview.push({ id: source.id, sha256: source.sha256, capturedAt: source.capturedAt, cardCount: source.cards.length, ocrConfirmed: true, ocrExcerpt: ocr.replace(/\s+/g, " ").trim().slice(0, 500) });
    const { sourcePath: _sourcePath, ...published } = source;
    sources.push(published);
  }

  const script = story.scenes.map(scene => scene.vo).join(" "), scriptHash = sha256(script);
  const provider = new ChatterboxNarrationProvider({ allowDownload: false, device: "mps" });
  const passages = [];
  for (let index = 0; index < story.scenes.length; index += 2) passages.push({ id: `passage-${passages.length + 1}`, approvedText: story.scenes.slice(index, index + 2).map(scene => scene.vo).join(" "), startMs: index * 3000, endMs: (index + 2) * 3000, energy: "medium" });
  const narration = await provider.synthesize({ outputDir: voiceDir, beats: passages, language: "en", voice: { mode: "model_default" }, seed: 63017 });
  await write(path.join(voiceDir, "provenance.json"), narration);
  const joined = path.join(voiceDir, "joined.wav");
  const trims = narration.beats.map((_, index) => `[${index}:a]silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.14,areverse${index < narration.beats.length - 1 ? ",apad=pad_dur=0.12" : ""}[a${index}]`);
  await ffmpeg([...narration.beats.flatMap(beat => ["-i", beat.outputPath]), "-filter_complex", `${trims.join(";")};${narration.beats.map((_, index) => `[a${index}]`).join("")}concat=n=${narration.beats.length}:v=0:a=1[out]`, "-map", "[out]", "-ar", "48000", "-ac", "2", joined]);
  const joinedSeconds = await duration(joined);
  const preliminary = path.join(voiceDir, "preliminary.wav");
  await ffmpeg(["-i", joined, "-af", "afade=t=out:st=" + Math.max(.1, joinedSeconds - .12) + ":d=0.12", "-ar", "48000", "-ac", "2", preliminary]);
  const aligned = await alignClip(preliminary, script, joinedSeconds, { model: "small.en" });
  if (aligned.source !== "aligned" || aligned.coverage < .9) throw new Error(`Narration alignment below 90% (${aligned.coverage}).`);
  const sceneWordStarts = [];
  let cursor = 0;
  for (const scene of story.scenes) { sceneWordStarts.push(cursor); cursor += scene.vo.split(/\s+/).length; }
  const cutFrames = sceneWordStarts.map((word, index) => index === 0 ? 0 : Math.round(aligned.words[word].from * 30));
  const ctaStart = cutFrames.at(-1);
  const seconds = Math.ceil(Math.max(joinedSeconds + .7, ctaStart / 30 + 4.4) * 30) / 30;
  const narrationFile = path.join(publicDir, "narration.wav");
  await ffmpeg(["-i", preliminary, "-af", `apad,atrim=duration=${seconds}`, "-ar", "48000", "-ac", "2", narrationFile]);
  const audioHash = sha256(await fs.readFile(narrationFile));
  const scenes = story.scenes.map((scene, index) => ({ ...scene, from: cutFrames[index], to: cutFrames[index + 1] ?? Math.round(seconds * 30) }));
  const film = opportunityFilmSchema.parse({ ...story, sources, scenes, fps: 30, durationInFrames: Math.round(seconds * 30), narrationSrc: "narration.wav", alignment: { source: aligned.source, coverage: aligned.coverage }, reviewOnly: true });
  const alignmentReport = { ...aligned, audioHash, scriptHash };
  await write(path.join(out, "caption-alignment.json"), alignmentReport);
  await write(path.join(out, "film.json"), film);
  await write(path.join(out, "source-review.json"), sourceReview);
  await fs.writeFile(path.join(out, "TRANSCRIPT.txt"), script + "\n");
  await write(path.join(out, "quality.json"), {
    durationSeconds: seconds, sceneCount: scenes.length, sourceCount: sources.length, visibleCardCount: sources.reduce((sum, source) => sum + source.cards.length, 0),
    alignment: film.alignment, ctaSeconds: (scenes.at(-1).to - scenes.at(-1).from) / 30, unsupportedExclusiveClaim: false,
    captureLimitation: "Actual Solomon job-feed captures dated 2026-08-31 are arranged as a disclosed editorial scroll. Cards reflect fetched records visible on that date; listings can change and must be confirmed with the employer. The film does not claim exclusive inventory, application submission, hiring outcomes, a public URL, or autonomous posting.",
    humanApprovalRequired: true, reviewOnly: true,
  });

  const serveUrl = await bundle({ entryPoint: path.join(root, "src/remotion/meetSolomonOpportunityScroll/index.tsx"), publicDir, outDir: path.join(out, "bundle") });
  const inputProps = { film };
  const composition = await selectComposition({ serveUrl, id: "MeetSolomonOpportunityScroll", inputProps, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  const stillDir = path.join(out, "stills");
  await fs.mkdir(stillDir, { recursive: true, mode: 0o700 });
  for (const [index, scene] of scenes.entries()) await renderStill({ composition, serveUrl, inputProps, frame: Math.min(scene.to - 1, scene.from + Math.max(10, Math.round((scene.to - scene.from) * .62))), output: path.join(stillDir, `${String(index).padStart(2, "0")}-${scene.id}.png`), imageFormat: "png", scale: .5, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  const raw = path.join(out, "raw.mp4"), master = path.join(out, `${story.id}.mp4`);
  let last = -1;
  await renderMedia({ composition, serveUrl, inputProps, outputLocation: raw, codec: "h264", audioCodec: "aac", crf: 17, pixelFormat: "yuv420p", imageFormat: "png", colorSpace: "bt709", concurrency: 1, chromeMode: "headless-shell", timeoutInMilliseconds: 240000,
    onProgress: ({ progress }) => { const value = Math.floor(progress * 10); if (value !== last) { last = value; process.stdout.write(`Render ${value * 10}%\n`); } } });
  const scan = await run("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.8:LRA=9:print_format=json", "-vn", "-f", "null", "-"], { timeout: 180000, maxBuffer: 2_000_000 });
  const measured = JSON.parse(scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "null");
  if (!measured) throw new Error("Audio mastering measurement failed.");
  const normalize = `loudnorm=I=-14:TP=-1.8:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await ffmpeg(["-i", raw, "-af", normalize, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master]);
  const decoded = await measureDecodedMedia(master);
  await write(path.join(out, "decoded-quality.json"), decoded);
  if (decoded.metadata.width !== 1080 || decoded.metadata.height !== 1920 || decoded.metadata.frameCount !== film.durationInFrames || decoded.metadata.pixelFormat !== "yuv420p" || decoded.metadata.colorSpace !== "bt709") throw new Error("Encoded master failed format verification.");
  if (Math.abs(decoded.loudness.integratedLufs + 14) > 1.5 || decoded.loudness.truePeakDbtp > -1 || decoded.audioActivity.clickCount > 0) throw new Error("Encoded master failed audio verification.");
  await write(path.join(out, "render-receipt.json"), { scriptHash, audioHash, filmHash: sha256(JSON.stringify(film)), masterSha256: sha256(await fs.readFile(master)), durationSeconds: await duration(master), reviewOnly: true });
  await fs.chmod(master, 0o600);
  process.stdout.write(`Private review video: ${master}\n`);
}

await main();
