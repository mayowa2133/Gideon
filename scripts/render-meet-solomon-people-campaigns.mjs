// Renders five private-review Meet Solomon people-campaign films from planned,
// verified product captures. Nothing here publishes or applies on the user's
// behalf; the output remains a local review artifact.
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
const { peopleCampaignStorySchema, peopleCampaignFilmSchema } = require("../dist/main/shared/meetSolomonPeopleCampaign.js");
const run = promisify(execFile);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  if (!args[at + 1]) throw new Error(`Missing --${name}.`);
  return args[at + 1];
};
const baseOut = path.resolve(value("out", "renders/meet-solomon/people-campaigns"));
const requestedAngle = value("angle", "all");
const write = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
const duration = async (file) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout.trim());
const ffmpeg = async (argv) => run("ffmpeg", ["-y", "-loglevel", "error", ...argv], { timeout: 240000, maxBuffer: 2_000_000 });

const checkedAt = "2026-09-02T05:20:00.000Z";
const campaigns = {
  "right-person": {
    id: "meet-solomon-right-person-behind-role-v1", title: "The right person behind the role", captureDir: "tmp/film-people-campaign/right-person",
    contactEvidence: [{ name: "Ashton Addington", title: "Senior Tech Recruiter", company: "Shopify", publicUrl: "https://www.linkedin.com/in/ashton-addington", source: "public-profile", currentCompanyVerified: true, checkedAt }],
    sources: [{ asset: "people_search", proofs: ["peopleSearchHeading", "peoplePurpose"] }, { asset: "people_saved", proofs: ["savedContactIdentity"] }],
    scenes: [
      { id: "hook", headline: "YOUR APPLICATION CAN’T INTRODUCE ITSELF.", vo: "Your application cannot introduce itself to the team." },
      { id: "metaphor", headline: "FIND THE HUMAN PATH.", vo: "A role is a posting. A relevant conversation can add context." },
      { id: "proof-one", headline: "START WITH THE COMPANY.", vo: "Solomon lets you search by company for recruiters, managers, and peers.", proofIds: ["peopleSearchHeading", "peoplePurpose"] },
      { id: "proof-two", headline: "A REAL PROFESSIONAL, IN CONTEXT.", vo: "Here, Solomon surfaced Ashton Addington, a current Shopify senior tech recruiter, from public professional data.", proofIds: ["savedContactIdentity"] },
      { id: "payoff", headline: "THE ROLE GETS A HUMAN FACE.", vo: "You verify the person and choose the message. Solomon keeps the path clear." },
      { id: "cta", headline: "FIND THE PERSON BEHIND THE ROLE.", vo: "Want to find the right person behind the role? Join Solomon." },
    ],
  },
  "who-to-meet": {
    id: "meet-solomon-who-to-meet-v1", title: "Recruiter, manager, or peer", captureDir: "tmp/film-people-campaign/who-to-meet",
    contactEvidence: [{ name: "Charles Ng", title: "Engineering Managers", company: "Shopify", publicUrl: "https://www.linkedin.com/in/charlescng", source: "public-profile", currentCompanyVerified: true, checkedAt }],
    sources: [{ asset: "people_search", proofs: ["peoplePurpose", "peopleSearchHeading"] }, { asset: "people_saved", proofs: ["savedContactIdentity"] }],
    scenes: [
      { id: "hook", headline: "RECRUITER, MANAGER, OR PEER?", vo: "The right person depends on what you need to learn." },
      { id: "metaphor", headline: "MATCH THE PERSON TO THE QUESTION.", vo: "A recruiter, manager, and peer can offer different context." },
      { id: "proof-one", headline: "CHOOSE THE CONTACT TYPE.", vo: "Solomon frames the search around recruiters, managers, and peers at the company.", proofIds: ["peoplePurpose", "peopleSearchHeading"] },
      { id: "proof-two", headline: "SEE WHO THE SEARCH SURFACES.", vo: "For the manager path, Solomon surfaced Charles Ng at Shopify from public professional data.", proofIds: ["savedContactIdentity"] },
      { id: "payoff", headline: "MAKE THE CONVERSATION RELEVANT.", vo: "You verify who fits the question. Solomon helps you organize the next move." },
      { id: "cta", headline: "CHOOSE WHO TO REACH.", vo: "Want help choosing who to reach? Join Solomon." },
    ],
  },
  "one-company": {
    id: "meet-solomon-one-company-many-doors-v1", title: "One company, many doors", captureDir: "tmp/film-people-campaign/one-company",
    contactEvidence: [{ name: "Tobi Lütke", title: "Founder & CEO of Shopify", company: "Shopify", publicUrl: "https://www.shopify.com/investors/press-releases/automatic-securities-disposition-plans-adopted-by-shopify-chief-executive-officer", source: "company-site", currentCompanyVerified: true, checkedAt }],
    sources: [{ asset: "people_search", proofs: ["peopleSearchHeading"] }, { asset: "people_saved", proofs: ["savedContactIdentity"] }],
    scenes: [
      { id: "hook", headline: "ONE DREAM COMPANY. MORE THAN ONE DOOR.", vo: "Your dream company has more than one person worth understanding." },
      { id: "metaphor", headline: "DON’T BET ON ONE DOOR.", vo: "Different people can give you different context about the company." },
      { id: "proof-one", headline: "SEARCH THE COMPANY, NOT ONE NAME.", vo: "Solomon starts the people search from the company itself.", proofIds: ["peopleSearchHeading"] },
      { id: "proof-two", headline: "MAP THE PEOPLE AROUND IT.", vo: "This public company result surfaced Shopify founder and chief executive Tobi Lütke.", proofIds: ["savedContactIdentity"] },
      { id: "payoff", headline: "BUILD MORE THAN ONE PATH IN.", vo: "You decide who is appropriate to contact. Solomon keeps the options organized." },
      { id: "cta", headline: "OPEN MORE PATHS.", vo: "Want more paths into one company? Join Solomon." },
    ],
  },
  "first-message": {
    id: "meet-solomon-right-first-message-v1", title: "The right first message", captureDir: "tmp/film-people-campaign/first-message",
    contactEvidence: [{ name: "Justin Kim", title: "Recruiter", company: "Shopify", publicUrl: "https://www.linkedin.com/in/justin-kim-03907213b", source: "public-profile", currentCompanyVerified: true, checkedAt }],
    sources: [{ asset: "people_saved", proofs: ["savedContactIdentity"] }, { asset: "outreach_blank", proofs: ["outreachPersonSelect"] }, { asset: "outreach_queue", proofs: ["queueResponseRate"] }],
    scenes: [
      { id: "hook", headline: "FOUND THE RIGHT PERSON. NOW WHAT?", vo: "Finding a relevant person is only half the move." },
      { id: "metaphor", headline: "BUILD A MESSAGE WORTH ANSWERING.", vo: "The first message needs context, relevance, and one clear ask." },
      { id: "proof-one", headline: "USE A REAL PROFESSIONAL CONTEXT.", vo: "Solomon surfaced Shopify recruiter Justin Kim from current public professional data.", proofIds: ["savedContactIdentity"] },
      { id: "proof-two", headline: "YOU CHOOSE BEFORE ANY DRAFT.", vo: "Solomon starts with the person selector and keeps response progress visible.", proofIds: ["outreachPersonSelect", "queueResponseRate"] },
      { id: "payoff", headline: "YOU OWN THE SEND.", vo: "You review every word and every send. Solomon helps you prepare the conversation." },
      { id: "cta", headline: "START THE RIGHT CONVERSATION.", vo: "Want help starting the right conversation? Join Solomon." },
    ],
  },
  "keep-warm": {
    id: "meet-solomon-keep-right-connection-warm-v1", title: "Keep the right connection warm", captureDir: "tmp/film-people-campaign/keep-warm",
    contactEvidence: [{ name: "Avinash Pallerlamudi", title: "Senior Data Engineer", company: "Shopify", publicUrl: "https://www.linkedin.com/in/avinashstp", source: "public-profile", currentCompanyVerified: true, checkedAt }],
    sources: [{ asset: "people_saved", proofs: ["savedContactIdentity"] }, { asset: "outreach_cadence", proofs: ["cadenceAttention", "cadenceStale"] }, { asset: "outreach_queue", proofs: ["queueResponseRate"] }],
    scenes: [
      { id: "hook", headline: "THE RIGHT CONTACT CAN STILL GO COLD.", vo: "A relevant professional connection can disappear into your tabs." },
      { id: "metaphor", headline: "KEEP THE MOMENTUM WARM.", vo: "A thoughtful follow-up can keep a useful conversation alive." },
      { id: "proof-one", headline: "KEEP THE PERSON IN CONTEXT.", vo: "Here, Solomon surfaced current Shopify senior data engineer Avinash Pallerlamudi from public professional data.", proofIds: ["savedContactIdentity"] },
      { id: "proof-two", headline: "SEE WHAT NEEDS ATTENTION.", vo: "Solomon flags stale drafts and keeps response progress in view.", proofIds: ["cadenceAttention", "cadenceStale", "queueResponseRate"] },
      { id: "payoff", headline: "FOLLOW UP WITH INTENTION.", vo: "You decide when and what to send. Solomon keeps the relationship from becoming invisible." },
      { id: "cta", headline: "KEEP THE CONNECTION WARM.", vo: "Want to keep the right connection warm? Join Solomon." },
    ],
  },
};

async function buildStory(angle, config) {
  const captureDir = path.resolve(root, config.captureDir);
  const verify = await run("node", ["scripts/plan-creator-capture.mjs", "verify", "--out", config.captureDir, "--inventory", `${config.captureDir}/inventory.json`], { cwd: root, timeout: 120000, maxBuffer: 2_000_000 });
  const verification = JSON.parse(verify.stdout);
  if (!verification.ok) throw new Error(`${angle} capture plan did not verify.`);
  const inventory = JSON.parse(await fs.readFile(path.join(captureDir, "inventory.json"), "utf8"));
  const captureRun = JSON.parse(await fs.readFile(path.join(captureDir, "capture-run.json"), "utf8"));
  const capturedAt = captureRun.capturedAt;
  const sources = [];
  for (const sourceSpec of config.sources) {
    const screen = inventory.screens.find((candidate) => candidate.asset === sourceSpec.asset);
    if (!screen) throw new Error(`Missing ${sourceSpec.asset} in ${config.captureDir}.`);
    const sourcePath = path.resolve(root, screen.still);
    const bytes = await fs.readFile(sourcePath);
    const proofs = sourceSpec.proofs.map((proofId) => {
      const element = screen.elements.find((candidate) => candidate.id === proofId && candidate.provenance === "approved");
      if (!element) throw new Error(`Missing approved proof ${proofId} in ${sourceSpec.asset}.`);
      return { id: proofId.replaceAll("_", "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), expectedText: element.sourceText ?? element.text, crop: { x: element.x, y: element.y, width: element.width, height: element.height } };
    });
    sources.push({ id: sourceSpec.asset.replaceAll("_", "-"), file: `${angle}-${sourceSpec.asset.replaceAll("_", "-")}.png`, sourcePath: path.relative(root, sourcePath), sha256: sha256(bytes), capturedAt, sourceWidth: screen.width, sourceHeight: screen.height, proofs });
  }
  const proofIdMap = new Map();
  for (const sourceSpec of config.sources) for (const proofId of sourceSpec.proofs) proofIdMap.set(proofId, proofId.replaceAll("_", "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
  const scenes = config.scenes.map((scene) => ({ ...scene, proofIds: (scene.proofIds ?? []).map((id) => proofIdMap.get(id)) }));
  const story = peopleCampaignStorySchema.parse({ version: "meet-solomon-people-campaign-v1", angle, id: config.id, title: config.title, capturedLabel: `CAPTURED ${capturedAt.slice(0, 10)}`, realContacts: true, contactEvidence: config.contactEvidence, sources, scenes });
  return { story, verification, captureDir };
}

async function synthesizeFilm(story, provider, out) {
  const publicDir = path.join(out, "public");
  const voiceDir = path.join(out, "voice");
  const captureDir = path.join(out, "capture");
  const evidenceDir = path.join(out, "evidence");
  await Promise.all([publicDir, voiceDir, captureDir, evidenceDir].map((dir) => fs.mkdir(dir, { recursive: true, mode: 0o700 })));
  const publishedSources = [];
  const sourceReview = [];
  for (const source of story.sources) {
    const sourcePath = path.resolve(root, source.sourcePath);
    const bytes = await fs.readFile(sourcePath);
    if (sha256(bytes) !== source.sha256) throw new Error(`Capture hash mismatch: ${source.id}`);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== source.sourceWidth || bytes.readUInt32BE(20) !== source.sourceHeight) throw new Error(`Capture dimensions mismatch: ${source.id}`);
    await Promise.all([fs.writeFile(path.join(publicDir, source.file), bytes, { mode: 0o600 }), fs.writeFile(path.join(captureDir, source.file), bytes, { mode: 0o600 })]);
    const { sourcePath: _sourcePath, ...published } = source;
    publishedSources.push(published);
    sourceReview.push({ id: source.id, sha256: source.sha256, capturedAt: source.capturedAt, proofCount: source.proofs.length, proofs: source.proofs.map(({ id, expectedText, crop }) => ({ id, expectedText, crop })) });
  }
  await write(path.join(out, "source-review.json"), sourceReview);

  const script = story.scenes.map((scene) => scene.vo).join(" ");
  const scriptHash = sha256(script);
  const preliminary = path.join(voiceDir, "preliminary.wav");
  const previousScript = await fs.readFile(path.join(out, "TRANSCRIPT.txt"), "utf8").catch(() => "");
  const canReuseVoice = previousScript === `${script}\n` && await fs.stat(preliminary).then((stat) => stat.size > 1000).catch(() => false);
  if (!canReuseVoice) {
    const passages = [];
    for (let index = 0; index < story.scenes.length; index += 2) passages.push({ id: `passage-${passages.length + 1}`, approvedText: story.scenes.slice(index, index + 2).map((scene) => scene.vo).join(" "), startMs: index * 3000, endMs: (index + 2) * 3000, energy: index === 0 ? "high" : "medium" });
    const angleSeed = 94721 + Object.keys(campaigns).indexOf(story.angle) * 103;
    const narration = await provider.synthesize({ outputDir: voiceDir, beats: passages, language: "en", voice: { mode: "model_default" }, seed: angleSeed });
    await write(path.join(voiceDir, "provenance.json"), narration);
    const joined = path.join(voiceDir, "joined.wav");
    const trims = narration.beats.map((_, index) => `[${index}:a]silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.14,areverse${index < narration.beats.length - 1 ? ",apad=pad_dur=0.13" : ""}[a${index}]`);
    await ffmpeg([...narration.beats.flatMap((beat) => ["-i", beat.outputPath]), "-filter_complex", `${trims.join(";")};${narration.beats.map((_, index) => `[a${index}]`).join("")}concat=n=${narration.beats.length}:v=0:a=1[out]`, "-map", "[out]", "-ar", "48000", "-ac", "2", joined]);
    const joinedSeconds = await duration(joined);
    await ffmpeg(["-i", joined, "-af", `afade=t=out:st=${Math.max(0.1, joinedSeconds - 0.12)}:d=0.12`, "-ar", "48000", "-ac", "2", preliminary]);
  } else {
    process.stdout.write(`${story.angle}: reusing aligned narration\n`);
  }
  const joinedSeconds = await duration(preliminary);
  const aligned = await alignClip(preliminary, script, joinedSeconds, { model: "small.en" });
  if (aligned.source !== "aligned" || aligned.coverage < 0.9) throw new Error(`Narration alignment below 90% (${aligned.coverage}).`);
  const sceneWordStarts = [];
  let cursor = 0;
  for (const scene of story.scenes) { sceneWordStarts.push(cursor); cursor += scene.vo.split(/\s+/).length; }
  const cutFrames = sceneWordStarts.map((word, index) => index === 0 ? 0 : Math.round(aligned.words[word].from * 30));
  const ctaStart = cutFrames.at(-1);
  const seconds = Math.ceil(Math.max(joinedSeconds + 0.7, ctaStart / 30 + 4.5) * 30) / 30;
  const narrationFile = path.join(publicDir, "narration.wav");
  await ffmpeg(["-i", preliminary, "-af", `apad,atrim=duration=${seconds}`, "-ar", "48000", "-ac", "2", narrationFile]);
  const audioHash = sha256(await fs.readFile(narrationFile));
  const scenes = story.scenes.map((scene, index) => ({ ...scene, from: cutFrames[index], to: cutFrames[index + 1] ?? Math.round(seconds * 30) }));
  const film = peopleCampaignFilmSchema.parse({ ...story, sources: publishedSources, scenes, fps: 30, durationInFrames: Math.round(seconds * 30), narrationSrc: "narration.wav", alignment: { source: aligned.source, coverage: aligned.coverage }, reviewOnly: true });
  await write(path.join(out, "film.json"), film);
  await write(path.join(out, "story.json"), story);
  await write(path.join(out, "contact-evidence.json"), story.contactEvidence);
  await write(path.join(out, "caption-alignment.json"), { ...aligned, audioHash, scriptHash });
  await fs.writeFile(path.join(out, "TRANSCRIPT.txt"), `${script}\n`, { mode: 0o600 });
  return { film, script, scriptHash, audioHash, publicDir, seconds };
}

async function renderFilm(story, synthesis, out, serveUrl) {
  const { film, scriptHash, audioHash, seconds } = synthesis;
  const inputProps = { film };
  const composition = await selectComposition({ serveUrl, id: "MeetSolomonPeopleCampaign", inputProps, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  const stillDir = path.join(out, "stills");
  await fs.mkdir(stillDir, { recursive: true, mode: 0o700 });
  for (const [index, scene] of film.scenes.entries()) {
    const reviewFrame = Math.min(scene.to - 1, scene.from + Math.max(10, Math.round((scene.to - scene.from) * 0.58)));
    await renderStill({ composition, serveUrl, inputProps, frame: reviewFrame, output: path.join(stillDir, `${String(index).padStart(2, "0")}-${scene.id}.png`), imageFormat: "png", scale: 0.5, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  }
  const raw = path.join(out, "raw.mp4");
  const master = path.join(out, `${story.id}.mp4`);
  let last = -1;
  await renderMedia({ composition, serveUrl, inputProps, outputLocation: raw, codec: "h264", audioCodec: "aac", crf: 17, pixelFormat: "yuv420p", imageFormat: "png", colorSpace: "bt709", concurrency: 1, chromeMode: "headless-shell", timeoutInMilliseconds: 240000, onProgress: ({ progress }) => { const current = Math.floor(progress * 10); if (current !== last) { last = current; process.stdout.write(`${story.angle}: render ${current * 10}%\n`); } } });
  const scan = await run("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.8:LRA=9:print_format=json", "-vn", "-f", "null", "-"], { timeout: 180000, maxBuffer: 2_000_000 });
  const measured = JSON.parse(scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "null");
  if (!measured) throw new Error("Audio mastering measurement failed.");
  const normalize = `loudnorm=I=-14:TP=-1.8:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await ffmpeg(["-i", raw, "-af", normalize, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master]);
  const decoded = await measureDecodedMedia(master);
  await write(path.join(out, "decoded-quality.json"), decoded);
  if (decoded.metadata.width !== 1080 || decoded.metadata.height !== 1920 || decoded.metadata.frameCount !== film.durationInFrames || decoded.metadata.pixelFormat !== "yuv420p" || decoded.metadata.colorSpace !== "bt709") throw new Error("Encoded master failed format verification.");
  if (Math.abs(decoded.loudness.integratedLufs + 14) > 1.5 || decoded.loudness.truePeakDbtp > -1 || decoded.audioActivity.clickCount > 0) throw new Error("Encoded master failed audio verification.");
  await write(path.join(out, "quality.json"), {
    durationSeconds: seconds,
    sceneCount: film.scenes.length,
    proofCount: film.sources.reduce((sum, source) => sum + source.proofs.length, 0),
    alignment: film.alignment,
    ctaSeconds: (film.scenes.at(-1).to - film.scenes.at(-1).from) / film.fps,
    motionDevice: { "right-person": "bridge", "who-to-meet": "role-orbit", "one-company": "three-doors", "first-message": "message-builder", "keep-warm": "relationship-pulse" }[film.angle],
    mascotScenes: ["hook", "payoff", "cta"],
    productClaimsGrounded: true,
    realContacts: true,
    contactEvidence: film.contactEvidence,
    humanApprovalRequired: true,
    reviewOnly: true,
  });
  await write(path.join(out, "render-receipt.json"), { scriptHash, audioHash, filmHash: sha256(JSON.stringify(film)), masterSha256: sha256(await fs.readFile(master)), durationSeconds: await duration(master), reviewOnly: true });
  await fs.chmod(master, 0o600);
  return master;
}

async function main() {
  const requested = requestedAngle === "all" ? Object.keys(campaigns) : requestedAngle.split(",").map((angle) => angle.trim()).filter(Boolean);
  const selected = requested.map((angle) => [angle, campaigns[angle]]);
  if (selected.some(([, config]) => !config)) throw new Error(`Unknown campaign angle: ${requested.find((angle) => !campaigns[angle])}`);
  await fs.mkdir(baseOut, { recursive: true, mode: 0o700 });
  const built = [];
  for (const [angle, config] of selected) {
    const out = path.join(baseOut, angle, "v1");
    if (await fs.stat(path.join(out, "preservation-receipt.json")).catch(() => null)) throw new Error(`${out} is a preserved archive.`);
    await fs.mkdir(out, { recursive: true, mode: 0o700 });
    const prepared = await buildStory(angle, config);
    await write(path.join(out, "capture-verification.json"), prepared.verification);
    await Promise.all([
      fs.copyFile(path.join(prepared.captureDir, "capture-run.json"), path.join(out, "evidence-capture-run.json")),
      fs.copyFile(path.join(prepared.captureDir, "inventory.json"), path.join(out, "evidence-inventory.json")),
      fs.copyFile(path.join(prepared.captureDir, "requirements.json"), path.join(out, "evidence-requirements.json")),
    ]);
    built.push({ angle, config, out, ...prepared });
  }
  const provider = new ChatterboxNarrationProvider({ allowDownload: false, device: "mps" });
  const masters = [];
  for (const item of built) {
    process.stdout.write(`${item.angle}: synthesizing narration\n`);
    const synthesis = await synthesizeFilm(item.story, provider, item.out);
    // Each film has its own public directory, so bundle after the captures and
    // narration exist. This avoids one film reading another film's pixels.
    const filmServeUrl = await bundle({ entryPoint: path.join(root, "src/remotion/meetSolomonPeopleCampaign/index.tsx"), publicDir: synthesis.publicDir, outDir: path.join(item.out, "bundle") });
    masters.push(await renderFilm(item.story, synthesis, item.out, filmServeUrl));
  }
  process.stdout.write(`Private review masters:\n${masters.join("\n")}\n`);
}

await main();
