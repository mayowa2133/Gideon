// Renders three private-review Meet Solomon people-campaign V2 films from fresh,
// source-linked product captures. Nothing here publishes or applies on the user's
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
const { peopleCampaignV2StorySchema, peopleCampaignV2FilmSchema } = require("../dist/main/shared/meetSolomonPeopleCampaignV2.js");
const run = promisify(execFile);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  if (!args[at + 1]) throw new Error(`Missing --${name}.`);
  return args[at + 1];
};
const baseOut = path.resolve(value("out", "renders/meet-solomon/people-campaigns-v2"));
const requestedAngle = value("angle", "all");
const write = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
const duration = async (file) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout.trim());
const ffmpeg = async (argv) => run("ffmpeg", ["-y", "-loglevel", "error", ...argv], { timeout: 240000, maxBuffer: 2_000_000 });

const capturedAt = "2026-09-03T01:08:00.000Z";
const disclosure = "PUBLIC PROFILE EXAMPLE · NO AFFILIATION OR ENDORSEMENT";
const captureRoot = "tmp/film-people-campaign-v2/shared/capture";
const evidence = {
  dylan: { subject: "Dylan Uchtman", role: "Manager, Recruiting", company: "Figma", purpose: "recruiter", productStatus: "verified", publicUrl: "https://www.linkedin.com/in/dylanuc", source: "public-profile", checkedAt: "2026-09-03T01:03:31.073Z", sourceSummary: "Current-company check passed; recruiting title matches the target company." },
  aastha: { subject: "Aastha Bhartia", role: "Engineering Manager", company: "Figma", purpose: "manager", productStatus: "verified", publicUrl: "https://www.linkedin.com/in/aasthabhartia", source: "public-profile", checkedAt: "2026-09-03T01:03:32.862Z", sourceSummary: "Current-company check passed; engineering-manager context matches the role." },
  darren: { subject: "Darren T.", role: "Software Engineer", company: "Figma", purpose: "peer", productStatus: "verified", publicUrl: "https://www.linkedin.com/in/dtsung", source: "public-profile", checkedAt: "2026-09-03T01:04:49.497Z", sourceSummary: "Current-company check passed; software-engineer context matches the role." },
  shawn: { subject: "Shawn Killian", role: "Frontend Engineer", company: "Figma search result", purpose: "comparison-contact", productStatus: "verification-skipped", publicUrl: "https://www.linkedin.com/in/shawn-killian", source: "public-profile", checkedAt: "2026-09-03T01:08:00.000Z", sourceSummary: "The title mentions Figma as a tool, while current-company verification was skipped." },
  amy: { subject: "Amy Stiegel", role: "Software Recruiting and Early Talent", company: "Samsara", purpose: "stale-contact", productStatus: "contradicted", publicUrl: "https://www.linkedin.com/posts/amy-stiegel_samsara-activity-7446981723281756160-pxJt", source: "public-profile", checkedAt: "2026-09-03T01:07:30.000Z", sourceSummary: "A recent public post says she joined Samsara; Solomon still displayed Shopify as verified." },
};
const jobEvidence = { role: "Software Engineer Intern (Winter 2027)", company: "Figma", location: "San Francisco or New York", employerUrl: "https://job-boards.greenhouse.io/figma/jobs/6131089004?gh_jid=6131089004", checkedAt: "2026-09-03T01:02:00.000Z", applicationControlObserved: true };
const source = (asset, file, proofs) => ({ asset, path: `${captureRoot}/${file}`, evidenceKind: "actual-product", proofs });
const campaigns = {
  "job-to-people": {
    id: "meet-solomon-one-real-job-three-real-people-v2", title: "One real job, three real people",
    publicEvidence: [evidence.dylan, evidence.aastha, evidence.darren], jobEvidence,
    sources: [
      source("figma-job", "figma-job-command-center.png", [{ id: "live-role", expectedText: "Software Engineer Intern (Winter 2027) figma", crop: { x: 94, y: 126, width: 560, height: 84 } }]),
      source("figma-job-people", "figma-job-people.png", [
        { id: "job-recruiter", expectedText: "People at figma Recruiters Dylan Uchtman Manager, Recruiting", crop: { x: 94, y: 330, width: 520, height: 220 } },
        { id: "job-manager", expectedText: "Hiring Managers Aastha Bhartia Engineering Manager", crop: { x: 94, y: 748, width: 520, height: 150 } },
      ]),
      source("figma-peer", "figma-peer.png", [{ id: "job-peer", expectedText: "Darren T. Software Engineer PEER CURRENT COMPANY VERIFIED DIRECT MATCH", crop: { x: 94, y: 472, width: 422, height: 420 } }]),
    ],
    scenes: [
      { id: "hook", headline: "ONE LIVE JOB. THREE HUMAN PATHS.", vo: "One live internship can lead to three different conversations.", captionPhrases: ["ONE LIVE INTERNSHIP", "THREE DIFFERENT CONVERSATIONS"] },
      { id: "role", headline: "START WITH THE ACTUAL ROLE.", vo: "Solomon has Figma's winter software engineering internship, still open when checked today.", captionPhrases: ["START WITH THE ACTUAL ROLE", "CHECKED TODAY"], proofIds: ["live-role"] },
      { id: "map", headline: "MATCH EACH PERSON TO A PURPOSE.", vo: "A recruiter can explain process, a manager can explain the team, and a peer can explain the work.", captionPhrases: ["RECRUITER: PROCESS", "MANAGER: TEAM", "PEER: THE WORK"] },
      { id: "proof-a", headline: "SOLOMON LINKS PEOPLE TO THE JOB.", vo: "For this role, Solomon surfaced recruiter Dylan Uchtman and engineering manager Aastha Bhartia.", captionPhrases: ["LINKED TO THIS FIGMA ROLE", "RECRUITER + ENGINEERING MANAGER"], proofIds: ["job-recruiter", "job-manager"] },
      { id: "proof-b", headline: "THEN CHECK THE PEER PATH.", vo: "It also surfaced Darren, a verified Figma software engineer, as a possible peer conversation.", captionPhrases: ["A POSSIBLE PEER CONVERSATION", "VERIFY BEFORE OUTREACH"], proofIds: ["job-peer"] },
      { id: "takeaway", headline: "ONE ROLE BECOMES A HUMAN MAP.", vo: "You decide who fits your question. Solomon keeps the role, the people, and the evidence together.", captionPhrases: ["YOU DECIDE WHO FITS"] },
      { id: "cta", headline: "TURN ONE ROLE INTO A HUMAN MAP.", vo: "Want one role turned into a human map? Join Solomon.", captionPhrases: ["JOIN SOLOMON"] },
    ],
  },
  "wrong-contact": {
    id: "meet-solomon-wrong-contact-test-v2", title: "The wrong-contact test",
    publicEvidence: [evidence.shawn, evidence.darren],
    sources: [source("figma-contact-comparison", "figma-peer.png", [
      { id: "weak-result", expectedText: "Shawn Killian Frontend Engineer Verification skipped", crop: { x: 514, y: 48, width: 412, height: 426 } },
      { id: "stronger-result", expectedText: "Darren T. Software Engineer Current company verified Direct Match", crop: { x: 94, y: 474, width: 422, height: 418 } },
    ])],
    scenes: [
      { id: "hook", headline: "A MATCHED NAME CAN STILL BE WRONG.", vo: "A familiar title is not enough reason to message someone.", captionPhrases: ["A TITLE ISN'T ENOUGH", "CHECK THE EVIDENCE"] },
      { id: "role", headline: "LOOK FOR THE MISSING SIGNAL.", vo: "Solomon separates title match, company trust, email safety, and warm-path evidence.", captionPhrases: ["TITLE MATCH", "COMPANY TRUST", "EMAIL SAFETY", "WARM PATH"] },
      { id: "map", headline: "RUN THE CONTACT CHECK.", vo: "If the company check was skipped, treat that result as a lead to inspect, not a conclusion.", captionPhrases: ["SKIPPED VERIFICATION?", "INSPECT BEFORE OUTREACH"] },
      { id: "proof-a", headline: "THIS RESULT NEEDS ANOTHER CHECK.", vo: "This candidate mentions Figma in the title, but Solomon says current-company verification was skipped.", captionPhrases: ["FIGMA APPEARS IN THE TITLE", "COMPANY VERIFICATION: SKIPPED"], proofIds: ["weak-result"] },
      { id: "proof-b", headline: "COMPARE IT WITH STRONGER PROOF.", vo: "A different result shows a software-engineer title, direct match, and a passed current-company check.", captionPhrases: ["SOFTWARE ENGINEER", "DIRECT MATCH", "CURRENT COMPANY VERIFIED"], proofIds: ["stronger-result"] },
      { id: "takeaway", headline: "A RESULT IS A STARTING POINT.", vo: "Solomon shows the signals. You use them to rule out weak contacts before your name reaches the message.", captionPhrases: ["RULE OUT WEAK CONTACTS"] },
      { id: "cta", headline: "CHOOSE WITH EVIDENCE.", vo: "Want evidence before you choose who to contact? Join Solomon.", captionPhrases: ["JOIN SOLOMON"] },
    ],
  },
  "changed-jobs": {
    id: "meet-solomon-contact-changed-jobs-v2", title: "They changed jobs before you messaged",
    publicEvidence: [evidence.amy],
    sources: [source("stale-shopify-card", "shopify-stale-contact.png", [{ id: "stale-product-badge", expectedText: "Amy Stiegel Talent Acquisition, Engineering @ Shopify CURRENT COMPANY VERIFIED", crop: { x: 94, y: 668, width: 422, height: 216 } }])],
    scenes: [
      { id: "hook", headline: "THE PROFILE CHANGED. THE BADGE DIDN’T.", vo: "A contact can change companies before your saved data catches up.", captionPhrases: ["THE PROFILE CHANGED", "THE BADGE DIDN'T"] },
      { id: "role", headline: "HERE’S THE REAL CONTRADICTION.", vo: "Solomon displayed Amy Stiegel at Shopify and marked the current company verified.", captionPhrases: ["SOLOMON SAID SHOPIFY", "CURRENT COMPANY VERIFIED"], proofIds: ["stale-product-badge"] },
      { id: "map", headline: "A FRESH SOURCE SAYS SAMSARA.", vo: "A recent public post says she joined Samsara to lead software recruiting and early talent.", captionPhrases: ["RECENT PUBLIC POST", "NOW AT SAMSARA"] },
      { id: "proof-a", headline: "ONE BADGE SHOULD NEVER END THE CHECK.", vo: "The saved card and the fresh public source disagree. That conflict must stay visible.", captionPhrases: ["SAVED CARD: SHOPIFY", "FRESH SOURCE: SAMSARA"] },
      { id: "proof-b", headline: "RECHECK BEFORE YOU REACH OUT.", vo: "Open the named source, check the date, and confirm the company before writing the message.", captionPhrases: ["OPEN THE SOURCE", "CHECK THE DATE", "CONFIRM THE COMPANY"] },
      { id: "takeaway", headline: "TRUST NEEDS VISIBLE EVIDENCE.", vo: "Solomon can organize the search, but you should inspect the source whenever employment data matters.", captionPhrases: ["INSPECT THE SOURCE"] },
      { id: "cta", headline: "KEEP THE RECEIPTS VISIBLE.", vo: "Want sources you can inspect before outreach? Join Solomon.", captionPhrases: ["JOIN SOLOMON"] },
    ],
  },
};

async function buildStory(angle, config) {
  const sources = [];
  const proofChecks = [];
  for (const sourceSpec of config.sources) {
    const sourcePath = path.resolve(root, sourceSpec.path);
    const bytes = await fs.readFile(sourcePath);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== 1440 || bytes.readUInt32BE(20) !== 900) throw new Error(`Capture must be a 1440x900 PNG: ${sourceSpec.asset}`);
    const ocr = (await run("tesseract", [sourcePath, "stdout", "--psm", "11"], { timeout: 120000, maxBuffer: 2_000_000 })).stdout;
    const actualTokens = new Set(ocr.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    for (const proof of sourceSpec.proofs) {
      const expectedTokens = (proof.expectedText.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2);
      const matched = expectedTokens.filter((token) => actualTokens.has(token));
      const coverage = matched.length / Math.max(1, expectedTokens.length);
      proofChecks.push({ source: sourceSpec.asset, proof: proof.id, expectedText: proof.expectedText, coverage, matched, ocrSha256: sha256(ocr.trim()) });
      if (coverage < .64) throw new Error(`OCR could not verify ${proof.id} in ${sourceSpec.asset} (${coverage.toFixed(2)}).`);
    }
    sources.push({ id: sourceSpec.asset, file: `${angle}-${sourceSpec.asset}.png`, sourcePath: path.relative(root, sourcePath), sha256: sha256(bytes), capturedAt, sourceWidth: 1440, sourceHeight: 900, evidenceKind: sourceSpec.evidenceKind, proofs: sourceSpec.proofs });
  }
  const story = peopleCampaignV2StorySchema.parse({ version: "meet-solomon-people-campaign-v2", angle, id: config.id, title: config.title, capturedLabel: `CAPTURED ${capturedAt.slice(0, 10)}`, capturedAt, evidenceDisclosure: disclosure, publicEvidence: config.publicEvidence, jobEvidence: config.jobEvidence, sources, scenes: config.scenes });
  const verification = { ok: true, captureMode: "real-product-live-data", viewport: { width: 1440, height: 900 }, capturedAt, sourceCount: sources.length, sourceHashes: sources.map(({ id, sha256: digest }) => ({ id, sha256: digest })), proofCount: sources.reduce((sum, item) => sum + item.proofs.length, 0), proofChecks, externalMessagesSent: 0, applicationsSubmitted: 0 };
  return { story, verification, captureDir: path.resolve(root, captureRoot) };
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
    const passages = story.scenes.map((scene, index) => ({ id: `scene-${scene.id}`, approvedText: scene.vo, startMs: index * 3000, endMs: (index + 1) * 3000, energy: index === 0 || scene.id === "cta" ? "high" : "medium" }));
    const angleSeed = 94721 + Object.keys(campaigns).indexOf(story.angle) * 103;
    const narration = await provider.synthesize({ outputDir: voiceDir, beats: passages, language: "en", voice: { mode: "model_default" }, seed: angleSeed });
    await write(path.join(voiceDir, "provenance.json"), narration);
    const joined = path.join(voiceDir, "joined.wav");
    const trims = narration.beats.map((_, index) => `[${index}:a]silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.035,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.11,areverse${index < narration.beats.length - 1 ? ",apad=pad_dur=0.09" : ""}[a${index}]`);
    await ffmpeg([...narration.beats.flatMap((beat) => ["-i", beat.outputPath]), "-filter_complex", `${trims.join(";")};${narration.beats.map((_, index) => `[a${index}]`).join("")}concat=n=${narration.beats.length}:v=0:a=1[out]`, "-map", "[out]", "-ar", "48000", "-ac", "2", joined]);
    const joinedSeconds = await duration(joined);
    await ffmpeg(["-i", joined, "-af", `afade=t=out:st=${Math.max(0.1, joinedSeconds - 0.12)}:d=0.12`, "-ar", "48000", "-ac", "2", preliminary]);
  } else {
    process.stdout.write(`${story.angle}: reusing aligned narration\n`);
  }
  const joinedSeconds = await duration(preliminary);
  const aligned = await alignClip(preliminary, script, joinedSeconds, { model: "small.en" });
  if (aligned.source !== "aligned" || aligned.coverage < 0.92) throw new Error(`Narration alignment below 92% (${aligned.coverage}).`);
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
  const film = peopleCampaignV2FilmSchema.parse({ ...story, sources: publishedSources, scenes, fps: 30, durationInFrames: Math.round(seconds * 30), narrationSrc: "narration.wav", alignment: { source: aligned.source, coverage: aligned.coverage }, reviewOnly: true });
  await write(path.join(out, "film.json"), film);
  await write(path.join(out, "story.json"), story);
  await write(path.join(out, "public-evidence.json"), story.publicEvidence);
  if (story.jobEvidence) await write(path.join(out, "job-evidence.json"), story.jobEvidence);
  await write(path.join(out, "caption-alignment.json"), { ...aligned, audioHash, scriptHash });
  await fs.writeFile(path.join(out, "TRANSCRIPT.txt"), `${script}\n`, { mode: 0o600 });
  return { film, script, scriptHash, audioHash, publicDir, seconds };
}

async function renderFilm(story, synthesis, out, serveUrl) {
  const { film, scriptHash, audioHash, seconds } = synthesis;
  const inputProps = { film };
  const composition = await selectComposition({ serveUrl, id: "MeetSolomonPeopleCampaignV2", inputProps, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  const stillDir = path.join(out, "stills");
  await fs.mkdir(stillDir, { recursive: true, mode: 0o700 });
  for (const [index, scene] of film.scenes.entries()) {
    const reviewFrame = Math.min(scene.to - 1, scene.from + Math.max(10, Math.round((scene.to - scene.from) * 0.58)));
    await renderStill({ composition, serveUrl, inputProps, frame: reviewFrame, output: path.join(stillDir, `${String(index).padStart(2, "0")}-${scene.id}.png`), imageFormat: "png", scale: 0.5, chromeMode: "headless-shell", timeoutInMilliseconds: 120000 });
  }
  const stillFiles = film.scenes.map((scene, index) => path.join(stillDir, `${String(index).padStart(2, "0")}-${scene.id}.png`));
  const sheetInputs = stillFiles.flatMap((file) => ["-i", file]);
  const sheetScales = stillFiles.map((_, index) => `[${index}:v]scale=270:480[s${index}]`).join(";");
  const sheetLayout = stillFiles.map((_, index) => `${(index % 4) * 270}_${Math.floor(index / 4) * 480}`).join("|");
  await ffmpeg([...sheetInputs, "-filter_complex", `${sheetScales};${stillFiles.map((_, index) => `[s${index}]`).join("")}xstack=inputs=${stillFiles.length}:layout=${sheetLayout}:fill=0xf7f3ea[sheet]`, "-map", "[sheet]", "-frames:v", "1", path.join(out, "contact-sheet.png")]);
  const raw = path.join(out, "raw.mp4");
  const master = path.join(out, `${story.id}.mp4`);
  let last = -1;
  await renderMedia({ composition, serveUrl, inputProps, outputLocation: raw, codec: "h264", audioCodec: "aac", crf: 17, pixelFormat: "yuv420p", imageFormat: "png", colorSpace: "bt709", concurrency: 1, chromeMode: "headless-shell", timeoutInMilliseconds: 240000, onProgress: ({ progress }) => { const current = Math.floor(progress * 10); if (current !== last) { last = current; process.stdout.write(`${story.angle}: render ${current * 10}%\n`); } } });
  const scan = await run("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.8:LRA=9:print_format=json", "-vn", "-f", "null", "-"], { timeout: 180000, maxBuffer: 2_000_000 });
  const measured = JSON.parse(scan.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "null");
  if (!measured) throw new Error("Audio mastering measurement failed.");
  const normalize = `loudnorm=I=-14:TP=-1.8:LRA=9:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await ffmpeg(["-i", raw, "-af", normalize, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", master]);
  const ctaScene = film.scenes.at(-1);
  const ctaReviewDir = path.join(out, "cta-review");
  await fs.mkdir(ctaReviewDir, { recursive: true, mode: 0o700 });
  const ctaTimes = [
    Math.min(seconds - .5, ctaScene.from / film.fps + .85),
    Math.max(ctaScene.from / film.fps + .85, seconds - .55),
  ];
  const ctaChecks = [];
  for (const [index, at] of ctaTimes.entries()) {
    const image = path.join(ctaReviewDir, `${index === 0 ? "first" : "last"}.png`);
    await ffmpeg(["-ss", at.toFixed(3), "-i", master, "-frames:v", "1", image]);
    const ocr = (await run("tesseract", [image, "stdout", "--psm", "6"], { timeout: 120000, maxBuffer: 1_000_000 })).stdout;
    const normalized = ocr.toUpperCase().replace(/[^A-Z]+/g, " ");
    const joinSolomonVisible = normalized.includes("JOIN SOLOMON");
    ctaChecks.push({ position: index === 0 ? "first" : "last", atSeconds: at, joinSolomonVisible, ocrSha256: sha256(ocr.trim()) });
    if (!joinSolomonVisible) throw new Error(`CTA OCR failed at ${at.toFixed(2)} seconds.`);
  }
  await write(path.join(out, "cta-verification.json"), { minimumHoldSeconds: 4.25, actualHoldSeconds: (ctaScene.to - ctaScene.from) / film.fps, checks: ctaChecks });
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
    motionDevice: { "job-to-people": "role-to-human-map", "wrong-contact": "evidence-scanner", "changed-jobs": "source-conflict-timeline" }[film.angle],
    mascotScenes: ["hook", "takeaway", "cta"],
    productClaimsGrounded: true,
    realContacts: true,
    publicEvidence: film.publicEvidence,
    evidenceDisclosure: film.evidenceDisclosure,
    humanApprovalRequired: true,
    reviewOnly: true,
  });
  const masterSha256 = sha256(await fs.readFile(master));
  await write(path.join(out, "render-receipt.json"), { scriptHash, audioHash, filmHash: sha256(JSON.stringify(film)), masterSha256, durationSeconds: await duration(master), reviewOnly: true });
  await write(path.join(out, "preservation-receipt.json"), { archiveVersion: "meet-solomon-people-campaign-v2.2", angle: film.angle, master: path.basename(master), masterSha256, createdAt: new Date().toISOString(), immutableAfterSuccess: true });
  await fs.rm(raw, { force: true });
  await fs.chmod(master, 0o600);
  return master;
}

async function main() {
  const evidenceAgeHours = (Date.now() - Date.parse(capturedAt)) / 3_600_000;
  if (evidenceAgeHours < 0 || evidenceAgeHours > 72) throw new Error(`V2 evidence is ${evidenceAgeHours.toFixed(1)} hours old; refresh the Solomon and public-source checks before rendering.`);
  const requested = requestedAngle === "all" ? Object.keys(campaigns) : requestedAngle.split(",").map((angle) => angle.trim()).filter(Boolean);
  const selected = requested.map((angle) => [angle, campaigns[angle]]);
  if (selected.some(([, config]) => !config)) throw new Error(`Unknown campaign angle: ${requested.find((angle) => !campaigns[angle])}`);
  await fs.mkdir(baseOut, { recursive: true, mode: 0o700 });
  const built = [];
  for (const [angle, config] of selected) {
    const out = path.join(baseOut, angle, "v2.2");
    if (await fs.stat(path.join(out, "preservation-receipt.json")).catch(() => null)) throw new Error(`${out} is a preserved archive.`);
    await fs.mkdir(out, { recursive: true, mode: 0o700 });
    const prepared = await buildStory(angle, config);
    await write(path.join(out, "capture-verification.json"), prepared.verification);
    await write(path.join(out, "evidence-lineage.json"), { capturedAt: prepared.story.capturedAt, disclosure: prepared.story.evidenceDisclosure, sources: prepared.story.sources, publicEvidence: prepared.story.publicEvidence, jobEvidence: prepared.story.jobEvidence ?? null });
    built.push({ angle, config, out, ...prepared });
  }
  const provider = new ChatterboxNarrationProvider({ allowDownload: false, device: "mps" });
  const masters = [];
  for (const item of built) {
    process.stdout.write(`${item.angle}: synthesizing narration\n`);
    const synthesis = await synthesizeFilm(item.story, provider, item.out);
    // Each film has its own public directory, so bundle after the captures and
    // narration exist. This avoids one film reading another film's pixels.
    const filmServeUrl = await bundle({ entryPoint: path.join(root, "src/remotion/meetSolomonPeopleCampaignV2/index.tsx"), publicDir: synthesis.publicDir, outDir: path.join(item.out, "bundle") });
    masters.push(await renderFilm(item.story, synthesis, item.out, filmServeUrl));
  }
  process.stdout.write(`Private review masters:\n${masters.join("\n")}\n`);
}

await main();
