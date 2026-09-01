// Private, local-only Meet Solomon style pilot. No provider downloads, reference
// voice cloning, posting, or application mutations. Evidence is supplied locally.
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
const { meetEvidenceSchema } = require("../dist/main/shared/meetSolomon.js");
const run = promisify(execFile);
const hash = data => createHash("sha256").update(data).digest("hex");
const normal = text => text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
const args = process.argv.slice(2);
const valueFlags = new Set(["--out", "--story", "--evidence", "--capture-dir", "--seconds"]);
const booleanFlags = new Set(["--prepare-only", "--stills-only"]);
for (let i = 0; i < args.length; i++) {
  const argument = args[i];
  if (booleanFlags.has(argument)) continue;
  if (!valueFlags.has(argument)) throw new Error(`Unknown argument: ${argument}. Use --story and --out to select a film.`);
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${argument}.`);
  i++;
}
const flag = (name, fallback) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const out = path.resolve(flag("out", path.join(root, "tmp/meet-solomon-style")));
const write = async (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const duration = async file => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 30000 })).stdout.trim());
const ffmpeg = async argv => {
  try { return await run("ffmpeg", ["-y", "-loglevel", "error", ...argv], { timeout: 180000, maxBuffer: 2_000_000 }); }
  catch { throw new Error("Local audio processing failed; verify FFmpeg and the input audio."); }
};

// Original, quiet editorial accents, synthesized locally. There is no borrowed
// reference music. Smooth attack/release avoids clicks at either end of a tone.
async function makeSoundDesign(scenes, seconds, target) {
  const rate = 48000, samples = new Float64Array(Math.ceil(seconds * rate));
  const events = scenes.flatMap(s => {
    if (s.layout === "checklist") return s.phrases.map((p, i) => ({ at: p.from / 30, hz: 440 + i * 110, length: .085, gain: .032, endHz: 440 + i * 110 }));
    if (s.layout === "role-reveal") return [{ at: s.from / 30, hz: 349, endHz: 523, length: .18, gain: .035 }];
    if (s.layout === "intern-reveal") return [{ at: s.from / 30, hz: 392, endHz: 587, length: .18, gain: .035 }];
    if (s.layout === "cta") return [{ at: s.from / 30, hz: 440, endHz: 660, length: .2, gain: .027 }];
    if (["legal-reveal", "partners-reveal"].includes(s.layout)) return [{ at: s.from / 30, hz: s.layout === "legal-reveal" ? 330 : 495, endHz: 660, length: .18, gain: .035 }];
    if (s.layout === "constellation") return [3, 10].map((offset, i) => ({ at: (s.from + s.actionFrame + offset) / 30, hz: 440 + i * 220, endHz: 440 + i * 220, length: .08, gain: .024 }));
    if (!["meet", "stale", "fresh"].includes(s.layout)) return [];
    return [{ at: s.from / 30, hz: s.layout === "stale" ? 150 : 520, endHz: s.layout === "stale" ? 70 : 780, length: .22, gain: .045 }];
  });
  for (const event of events) {
    for (let i = 0; i < event.length * rate; i++) {
      const t = i / rate, p = t / event.length, offset = Math.round(event.at * rate) + i;
      if (offset >= samples.length) break;
      const envelope = Math.sin(Math.PI * p) ** 2 * Math.exp(-p * 3);
      samples[offset] += Math.sin(2 * Math.PI * (event.hz * t + (event.endHz - event.hz) * t * t / (2 * event.length))) * event.gain * envelope;
    }
  }
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
  await fs.writeFile(target, bytes, { mode: 0o600 });
  return events;
}

async function main() {
  if (await fs.stat(path.join(out, "preservation-receipt.json")).catch(() => null)) throw new Error("This is a preserved video archive. Render revisions into a different output directory.");
  await fs.mkdir(out, { recursive: true, mode: 0o700 });
  await fs.chmod(out, 0o700);
  const rawStory = JSON.parse(await fs.readFile(path.resolve(flag("story", path.join(root, "fixtures/meet-solomon/too-late.json"))), "utf8"));
  const v2 = rawStory.version === "meet-solomon-v2";
  const nontech = rawStory.version === "meet-solomon-nontech-v1";
  const internships = rawStory.version === "meet-solomon-internships-v1";
  const benefitRealInternships = ["meet-solomon-real-internships-v2", "meet-solomon-real-internships-v3"].includes(rawStory.version);
  const realInternships = rawStory.version === "meet-solomon-real-internships-v1";
  const anyRealInternships = realInternships || benefitRealInternships;
  const categoriesV2 = rawStory.version === "meet-solomon-categories-v2";
  const categories = categoriesV2 || rawStory.version === "meet-solomon-categories-v1";
  const { meetStorySchema, meetFilmSchema, assertMeetStoryEvidence, auditMeetFilm } = require(anyRealInternships ? "../dist/main/shared/meetSolomonRealInternships.js" : categoriesV2 ? "../dist/main/shared/meetSolomonCategoriesV2.js" : categories ? "../dist/main/shared/meetSolomonCategories.js" : internships ? "../dist/main/shared/meetSolomonInternships.js" : nontech ? "../dist/main/shared/meetSolomonNontech.js" : v2 ? "../dist/main/shared/meetSolomonV2.js" : "../dist/main/shared/meetSolomon.js");
  const story = meetStorySchema.parse(rawStory);
  let previous;
  try { previous = JSON.parse(await fs.readFile(path.join(out, "film.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Existing film metadata cannot be verified. Choose a new output directory."); }
  if (previous && (previous.version !== story.version || previous.id !== story.id)) throw new Error("Do not overwrite a different film or version. Choose a new output directory.");
  const evidenceFile = path.resolve(flag("evidence", path.join(out, "evidence.json")));
  const evidence = JSON.parse(await fs.readFile(evidenceFile, "utf8")).map(e => meetEvidenceSchema.parse(e));
  const sourceDir = path.resolve(flag("capture-dir", path.join(path.dirname(evidenceFile), "capture")));
  const publicDir = path.join(out, "public"), voiceDir = path.join(out, "voice");
  await fs.mkdir(publicDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(voiceDir, { recursive: true, mode: 0o700 });
  for (const e of evidence) {
    const bytes = await fs.readFile(path.join(sourceDir, e.file));
    if (hash(bytes) !== e.sha256) throw new Error(`Evidence hash mismatch: ${e.id}`);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== e.sourceWidth || bytes.readUInt32BE(20) !== e.sourceHeight) throw new Error(`Evidence is not the declared PNG: ${e.id}`);
    await fs.writeFile(path.join(publicDir, e.file), bytes, { mode: 0o600 });
  }
  const readability = assertMeetStoryEvidence(story, evidence);
  if (anyRealInternships) {
    const { assertVerification } = require("../dist/main/shared/meetSolomonRealInternships.js");
    const page = await fs.readFile(path.join(out, story.listing.verificationFile));
    assertVerification(story.listing, page.toString("utf8"), hash(page));
  }
  let interaction;
  if (categoriesV2) {
    const { assertInteraction } = require("../dist/main/shared/meetSolomonCategoriesV2.js");
    interaction = assertInteraction(story.category, evidence, JSON.parse(await fs.readFile(path.join(out, "interaction-capture.json"), "utf8")));
  }
  const proofDir = path.join(out, "proof-review");
  await fs.mkdir(proofDir, { recursive: true, mode: 0o700 });
  const ocr = [];
  for (const e of evidence.filter(e => e.kind === "proof")) {
    const c = e.crop, cropFile = path.join(proofDir, `${e.id}.png`);
    await ffmpeg(["-i", path.join(publicDir, e.file), "-vf", `crop=${c.width}:${c.height}:${c.x}:${c.y},scale=iw*4:ih*4`, "-frames:v", "1", cropFile]);
    const read = await run("tesseract", [cropFile, "stdout", "--psm", "6"], { timeout: 30000 });
    const matched = normal(read.stdout).includes(normal(e.text));
    if (!matched) throw new Error(`OCR does not confirm the claimed source region: ${e.id}`);
    ocr.push({ id: e.id, sourceSha256: e.sha256, matched });
  }
  if (categoriesV2) {
    const { CATEGORY_DATA } = require("../dist/main/shared/meetSolomonCategoriesV2.js"), e = evidence.find(e => e.id === "open-after"), c = e.crop;
    const panel = path.join(proofDir, "open-after.png");
    await ffmpeg(["-i", path.join(publicDir, e.file), "-vf", `crop=${c.width}:${c.height}:${c.x}:${c.y},scale=iw*3:ih*3`, "-frames:v", "1", panel]);
    const read = await run("tesseract", [panel, "stdout", "--psm", "6"], { timeout: 30000 });
    const expected = CATEGORY_DATA[story.category];
    for (const quote of [expected.role, expected.company, expected.detail]) if (!normal(read.stdout).includes(normal(quote)))
      throw new Error("Selected interaction panel does not confirm its category-specific role, company and detail.");
    ocr.push({ id: "open-after", sourceSha256: e.sha256, matched: true, establishingOnly: true });
  }
  const text = story.scenes.map(s => s.vo).join(" ");
  const scriptHash = hash(text), source = path.join(voiceDir, "source.wav");
  const provider = new ChatterboxNarrationProvider({ allowDownload: false, device: "mps" });
  // The provider's content-addressed cache includes the exact script, voice,
  // model revision, and seed. No filename-only reuse of another script's voice.
  // Chatterbox can degrade into nonsense near the end of one long generation.
  // Bound passages to six shots, keeping each sentence and its own cadence intact.
  const passages = [];
  const passageSize = benefitRealInternships ? 3 : 6;
  for (let i = 0; i < story.scenes.length; i += passageSize) passages.push({ id: `passage-${passages.length + 1}`, approvedText: story.scenes.slice(i, i + passageSize).map(s => s.vo).join(" "), startMs: i * 3000, endMs: (i + passageSize) * 3000, energy: benefitRealInternships ? "medium" : "high" });
  const narration = await provider.synthesize({ outputDir: voiceDir, beats: passages, language: "en", voice: { mode: "model_default" }, seed: benefitRealInternships ? 51731 : 83026 });
  const trims = narration.beats.map((_, i) => `[${i}:a]silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.16,areverse${i < narration.beats.length - 1 ? `,apad=pad_dur=${benefitRealInternships ? "0.14" : "0.25"}` : ""}[a${i}]`);
  await ffmpeg([...narration.beats.flatMap(b => ["-i", b.outputPath]), "-filter_complex", `${trims.join(";")};${narration.beats.map((_, i) => `[a${i}]`).join("")}concat=n=${narration.beats.length}:v=0:a=1[out]`, "-map", "[out]", "-ar", "48000", "-ac", "2", source]);
  await write(path.join(voiceDir, "provenance.json"), narration);
  const clean = path.join(voiceDir, "clean.wav");
  await ffmpeg(["-i", source, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse", "-ar", "48000", "-ac", "2", clean]);
  const cleanSeconds = await duration(clean);
  const seconds = benefitRealInternships ? Math.ceil((cleanSeconds + 1.1) * 30) / 30 : Number(flag("seconds", "38.5"));
  if (!Number.isFinite(seconds) || seconds < (anyRealInternships || categoriesV2 ? 30 : 35) || seconds > (anyRealInternships ? 40 : categoriesV2 ? 33 : 45)) throw new Error(anyRealInternships ? "Real internship duration must be 30–40 seconds." : categoriesV2 ? "Category V2 duration must be 30–33 seconds." : "Meet pilot duration must be 35–45 seconds.");
  const tempo = benefitRealInternships ? 1 : cleanSeconds / (seconds - .45);
  if (tempo < .8 || tempo > 1.3) throw new Error(`Voice needs excessive retiming (${tempo.toFixed(2)}). Revise the script or voice; do not force it.`);
  const spoken = path.join(publicDir, "narration.wav");
  await ffmpeg(["-i", clean, "-af", `${benefitRealInternships ? "" : `atempo=${tempo},`}apad,atrim=duration=${seconds},afade=t=out:st=${seconds - .15}:d=0.15`, "-ar", "48000", "-ac", "2", spoken]);
  const audioHash = hash(await fs.readFile(spoken));
  const alignmentFile = path.join(out, "caption-alignment.json");
  let aligned;
  try { const cached = JSON.parse(await fs.readFile(alignmentFile, "utf8")); if (cached.audioHash === audioHash && cached.scriptHash === scriptHash) aligned = cached; } catch { /* First render. */ }
  if (!aligned) {
    process.stdout.write("Aligning the continuous narration…\n");
    aligned = { ...await alignClip(spoken, text, seconds), audioHash, scriptHash };
    await write(alignmentFile, aligned);
  }
  if (aligned.source !== "aligned" || aligned.coverage < .9) throw new Error("Narration alignment is below 90%; review the voice before rendering.");
  let index = 0;
  const starts = story.scenes.map(s => { const start = index; index += s.vo.split(/\s+/).length; return start; });
  const cutFrames = starts.map((word, i) => i === 0 ? 0 : Math.round(aligned.words[word].from * 30));
  const scenes = story.scenes.map((scene, i) => {
    const from = cutFrames[i], to = cutFrames[i + 1] ?? Math.round(seconds * 30);
    const words = scene.vo.split(/\s+/), normalized = words.map(normal);
    let phraseCursor = 0;
    const phrases = (scene.captionPhrases ?? []).map(p => {
      const tokens = p.text.split(/\s+/).map(normal);
      let start = -1;
      for (let n = phraseCursor; n <= words.length - tokens.length; n++) if (tokens.every((token, k) => token === normalized[n + k])) { start = n; break; }
      if (start < 0) throw new Error(`Caption not spoken in ${scene.id}: ${p.text}`);
      phraseCursor = start + tokens.length;
      return { ...p, from: Math.max(from, Math.round(aligned.words[starts[i] + start].from * 30)), to: Math.min(to, Math.round(aligned.words[starts[i] + phraseCursor - 1].to * 30)) };
    });
    for (let p = 0; p < phrases.length; p++) phrases[p].to = phrases[p + 1]?.from ?? to;
    let actionFrame = 0;
    if ((anyRealInternships || v2 || nontech || internships || categories) && scene.actionCue) {
      const tokens = scene.actionCue.split(/\s+/).map(normal);
      const at = normalized.findIndex((_, n) => tokens.every((token, k) => token === normalized[n + k]));
      if (at < 0) throw new Error(`Action cue not spoken in ${scene.id}.`);
      actionFrame = Math.max(0, Math.round(aligned.words[starts[i] + at].from * 30) - from);
    }
    return { ...scene, from, to, phrases, ...(anyRealInternships || v2 || nontech || internships || categories ? { actionFrame } : {}) };
  });
  const sounds = await makeSoundDesign(scenes, seconds, path.join(publicDir, "sound-design.wav"));
  const film = meetFilmSchema.parse({ version: story.version, ...(anyRealInternships ? { category: story.category, listing: story.listing } : {}), ...(internships ? { sampleData: true } : {}), ...(categories ? { category: story.category, sampleData: true, captureMode: story.captureMode, ...(categoriesV2 ? { interaction } : {}) } : {}), id: story.id, title: story.title, fps: 30, durationInFrames: Math.round(seconds * 30), narrationSrc: "narration.wav", soundDesignSrc: "sound-design.wav", evidence, scenes, alignment: { source: aligned.source, coverage: aligned.coverage }, reviewOnly: true });
  const report = { ...auditMeetFilm(film), scriptHash, audioHash, tempo, readability, ocr, sounds, humanApprovalRequired: true, captureLimitation: anyRealInternships ? "Actual Solomon product captures from an existing local development session using real fetched employer records. Employer application pages checked on the stated date; availability can change. No application, outreach, hiring outcome, public access URL or customer account is implied. Inaccurate imported fields are excluded from the edited proof; original captures are retained." : categories ? "Offline component demo: unmodified Solomon tracker UI with explicit category-specific sample hooks. No authenticated account, backend, live vacancy, real application, eligibility or hiring outcome is demonstrated. CTA has no URL or delivery automation. Source component hashes and fixture provenance are retained." : internships ? "Private internship pilot using the original August 11 product demo. Marketing Intern / Northstar Labs is sample data, not a verified vacancy. Recorded Interviewing status is not a customer outcome. No authenticated current capture was available. The CTA is informational: no URL, application submission, or delivery automation." : nontech ? "Private #5 pilot using dated archived company-search evidence. Titles and employers are paired in the same captured cards. No current vacancy, hiring distribution, eligibility, absence of coding requirements, or background search is claimed. Conceptual graphics are labelled illustrations." : v2 ? "Dated archived product evidence. Startup is an explicitly labelled before/after filter edit, not continuous playback or an observed job arrival. Its transient empty state remains in the retained source recording. Different posting ages belong to different jobs. No posting age was edited." : "Local preview could not load account data. Timestamp contrast uses disclosed archived captures; automatic discovery is supported by newly captured product explanation text, not an observed background run. No posting age was edited." };
  await write(path.join(out, "film.json"), film);
  await write(path.join(out, "quality.json"), report);
  const beatSheet = scenes.map(s => `## ${s.id} · ${(s.from / 30).toFixed(2)}–${(s.to / 30).toFixed(2)}s\n\nSCENE: ${s.vo}\n\nNEW INFORMATION: ${s.newInformation}\n\nVISUAL METAPHOR: ${s.visualMetaphor}\n\nSOLOMON ACTION: ${s.presenter}, ${s.expression}, ${s.gesture}; no mouth.\n\nEVIDENCE: ${s.evidence.join(", ") || "Conceptual / no product claim"}\n\nTRANSITION: ${s.transition}\n`).join("\n");
  await fs.writeFile(path.join(out, "BEAT-SHEET.md"), `# ${story.title}\n\nPrivate style study; final human review required.\n\n${beatSheet}`);
  process.stdout.write(`Prepared ${scenes.length} shots / ${seconds}s / ${(report.presenterShare * 100).toFixed(1)}% presenter / ${Math.round(aligned.coverage * 100)}% aligned.\n`);
  if (args.includes("--prepare-only")) return;
  const serveUrl = await bundle({ entryPoint: path.join(root, anyRealInternships ? "src/remotion/meetSolomonRealInternships/index.tsx" : categoriesV2 ? "src/remotion/meetSolomonCategoriesV2/index.tsx" : categories ? "src/remotion/meetSolomonCategories/index.tsx" : internships ? "src/remotion/meetSolomonInternships/index.tsx" : nontech ? "src/remotion/meetSolomonNontech/index.tsx" : v2 ? "src/remotion/meetSolomonV2/index.tsx" : "src/remotion/meetSolomon/index.tsx"), publicDir, outDir: path.join(out, "bundle") });
  const inputProps = { film };
  const composition = await selectComposition({ serveUrl, id: anyRealInternships ? "MeetSolomonRealInternships" : categoriesV2 ? "MeetSolomonCategoriesV2" : categories ? "MeetSolomonCategories" : internships ? "MeetSolomonInternships" : nontech ? "MeetSolomonNontech" : v2 ? "MeetSolomonV2" : "MeetSolomon", inputProps, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  const stillDir = path.join(out, "stills");
  await fs.mkdir(stillDir, { recursive: true, mode: 0o700 });
  for (const [i, s] of scenes.entries()) {
    const frame = Math.min(s.to - 1, s.from + Math.max(12, Math.round((s.to - s.from) * .65)));
    await renderStill({ composition, serveUrl, inputProps, frame, output: path.join(stillDir, `${String(i).padStart(2, "0")}-${s.id}.png`), imageFormat: "png", scale: .5, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  }
  if (args.includes("--stills-only")) return;
  const raw = path.join(out, "raw.mp4");
  let last = -1;
  await renderMedia({ composition, serveUrl, inputProps, outputLocation: raw, codec: "h264", audioCodec: "aac", crf: 17, pixelFormat: "yuv420p", imageFormat: "png", colorSpace: "bt709", concurrency: 1, chromeMode: "headless-shell", timeoutInMilliseconds: 180000,
    onProgress: ({ progress }) => { const n = Math.floor(progress * 10); if (n !== last) { last = n; process.stdout.write(`Render ${n * 10}%\n`); } } });
  const master = path.join(out, `${story.id}.mp4`);
  const scan = await run("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.8:LRA=9:print_format=json", "-vn", "-f", "null", "-"], { timeout: 180000, maxBuffer: 2_000_000 });
  const measured = JSON.parse(scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "null");
  if (!measured) throw new Error("Audio mastering measurement failed.");
  const normalize = `loudnorm=I=-14:TP=-1.8:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await ffmpeg(["-i", raw, "-af", normalize, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master]);
  const decoded = await measureDecodedMedia(master);
  await write(path.join(out, "decoded-quality.json"), decoded);
  if (decoded.metadata.width !== 1080 || decoded.metadata.height !== 1920 || decoded.metadata.frameCount !== film.durationInFrames || decoded.metadata.pixelFormat !== "yuv420p" || decoded.metadata.colorSpace !== "bt709") throw new Error("Encoded master failed format verification.");
  if (Math.abs(decoded.loudness.integratedLufs + 14) > 1.5 || decoded.loudness.truePeakDbtp > -1 || decoded.audioActivity.clickCount > 0) throw new Error("Encoded master failed audio verification.");
  await write(path.join(out, "render-receipt.json"), { scriptHash, filmHash: hash(JSON.stringify(film)), masterSha256: hash(await fs.readFile(master)), durationSeconds: await duration(master), reviewOnly: true });
  await fs.chmod(master, 0o600);
  process.stdout.write(`Private review video: ${master}\n`);
}

await main();
