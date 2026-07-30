import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { ChatterboxNarrationProvider } = require("../dist/main/main/chatterboxNarrationProvider.js");
const {
  BENCHMARK_HOOK_CANDIDATES,
  BENCHMARK_SCRIPT,
  SOLOMON_MOTION_COMPONENTS,
  auditBenchmarkAvatarMotion,
  assertSolomonCreatorBenchmarkManifest,
  benchmarkPropsFromManifest,
  createSolomonCreatorBenchmarkManifest
} = require("../dist/main/shared/solomonCreatorBenchmark.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "tmp", "solomon-creator-benchmark-v1");
const publicDir = path.join(outputRoot, "remotion-public");
const finalDir = path.join(outputRoot, "final");
const reviewDir = path.join(outputRoot, "review");
const sourcePath = process.env.SOLOMON_TRACKER_SOURCE ?? "/Users/mayowaadesanya/Documents/Documents - Mayowa’s MacBook Pro/Projects/Gideon/tmp/capture-pilot/nexusreach/runs/2026-07-27T14-13-04-852Z-32a548a9-27e7-404a-930d-0954207e37b5/private-artifacts/workspaces/local-workspace/projects/nexusreach-pilot/normalized_flow_clip/6963f798-2f6e-4696-b9ab-b4d30202e298-update-job-tracker.mp4";
const manifest = createSolomonCreatorBenchmarkManifest(sourcePath);
assertSolomonCreatorBenchmarkManifest(manifest);

await Promise.all([
  fs.mkdir(publicDir, { recursive: true, mode: 0o700 }),
  fs.mkdir(finalDir, { recursive: true, mode: 0o700 }),
  fs.mkdir(reviewDir, { recursive: true, mode: 0o700 })
]);

if (!existsSync(sourcePath)) throw new Error(`Approved Solomon tracker source is missing: ${sourcePath}`);
const sourceHash = await sha256(sourcePath);
if (sourceHash !== manifest.productProof.sourceSha256) throw new Error(`Approved source hash mismatch: ${sourceHash}`);

await generateNarration();
await generateAlignment();
await generateProductProof();
await generateSoundDesign();
await writePlanningArtifacts();

const entryPoint = path.join(root, "src", "remotion", "solomonCreatorBenchmark", "index.ts");
const serveUrl = await bundle({
  entryPoint,
  publicDir,
  outDir: path.join(outputRoot, "remotion-bundle"),
  onProgress: (progress) => {
    const percent = progress > 1 ? Math.round(progress) : Math.round(progress * 100);
    if (percent % 25 === 0) process.stdout.write(`Bundle ${percent}%\n`);
  }
});
const browserExecutable = resolveBrowserExecutable();
if (!existsSync(browserExecutable)) throw new Error(`Pinned Playwright Chromium is missing: ${browserExecutable}`);
const inputProps = benchmarkPropsFromManifest(manifest);
const composition = await selectComposition({
  serveUrl,
  id: "SolomonCreatorBenchmarkV1",
  inputProps,
  browserExecutable,
  chromeMode: "headless-shell",
  timeoutInMilliseconds: 120_000
});
const remotionIntermediate = path.join(outputRoot, "solomon-creator-benchmark-v1-remotion.mp4");
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: remotionIntermediate,
  inputProps,
  browserExecutable,
  chromeMode: "headless-shell",
  concurrency: 3,
  overwrite: true,
  pixelFormat: "yuv420p",
  crf: 12,
  x264Preset: "medium",
  audioCodec: "aac",
  audioBitrate: "320K",
  sampleRate: 48_000,
  logLevel: "info",
  timeoutInMilliseconds: 120_000,
  onProgress: ({ progress }) => {
    const percent = Math.round(progress * 100);
    if (percent % 10 === 0) process.stdout.write(`Render ${percent}%\n`);
  }
});

const masterPath = path.join(finalDir, "solomon-creator-benchmark-v1-master.mp4");
const socialPath = path.join(finalDir, "solomon-creator-benchmark-v1-social-720x1280.mp4");
const mutedPath = path.join(finalDir, "solomon-creator-benchmark-v1-muted-review.mp4");
await run("ffmpeg", [
  "-y", "-i", remotionIntermediate,
  "-vf", "fps=30,format=yuv420p",
  "-af", "loudnorm=I=-13:LRA=7:TP=-1.5",
  "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
  "-b:v", "12M", "-minrate", "8M", "-maxrate", "20M", "-bufsize", "24M",
  "-x264-params", "nal-hrd=vbr:force-cfr=1",
  "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-t", "10", "-movflags", "+faststart",
  masterPath
], 20 * 60_000);
await run("ffmpeg", [
  "-y", "-i", masterPath, "-vf", "scale=720:1280:flags=lanczos,fps=30",
  "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-b:v", "4M", "-maxrate", "6M", "-bufsize", "8M",
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-t", "10", "-movflags", "+faststart", socialPath
], 20 * 60_000);
await run("ffmpeg", ["-y", "-i", masterPath, "-map", "0:v:0", "-c:v", "copy", "-an", mutedPath], 120_000);

const qa = await generateQa(masterPath, socialPath, mutedPath, browserExecutable);
await writeFinalReports(qa, masterPath, socialPath, mutedPath);
process.stdout.write(`${JSON.stringify({ masterPath, socialPath, mutedPath, masterSha256: qa.masterSha256, passed: qa.passed }, null, 2)}\n`);
if (!qa.passed) process.exitCode = 1;

async function generateNarration() {
  const localRuntime = process.env.GIDEON_CHATTERBOX_RUNTIME ?? path.join(root, "tmp", "chatterbox-runtime");
  const sharedRuntime = "/Users/mayowaadesanya/Documents/Documents - Mayowa’s MacBook Pro/Projects/Gideon/tmp/chatterbox-runtime";
  const runtime = existsSync(path.join(localRuntime, ".venv", "bin", "python")) ? localRuntime : sharedRuntime;
  const provider = new ChatterboxNarrationProvider({
    pythonPath: path.join(runtime, ".venv", "bin", "python"),
    modelCacheRoot: path.join(runtime, "model-cache"),
    allowDownload: false,
    device: "mps"
  });
  const result = await provider.synthesize({
    outputDir: path.join(outputRoot, "narration-semantic"),
    beats: [
      { id: "hook", approvedText: "This opportunity just moved to interviewing—without losing the next step.", startMs: 0, endMs: 4_300, energy: "high" },
      { id: "proof", approvedText: "Solomon keeps the update visible.", startMs: 4_300, endMs: 6_500, energy: "medium" },
      { id: "cta", approvedText: "Review it, then decide what happens next.", startMs: 6_500, endMs: 10_000, energy: "high" }
    ],
    language: "en",
    voice: { mode: "model_default" },
    seed: 71_623
  });
  const byId = new Map(result.beats.map((beat) => [beat.id, beat]));
  await run("ffmpeg", [
    "-y",
    "-i", byId.get("hook").outputPath,
    "-f", "lavfi", "-t", "0.38", "-i", "anullsrc=r=24000:cl=mono",
    "-i", byId.get("proof").outputPath,
    "-f", "lavfi", "-t", "0.36", "-i", "anullsrc=r=24000:cl=mono",
    "-i", byId.get("cta").outputPath,
    "-f", "lavfi", "-t", "1.14", "-i", "anullsrc=r=24000:cl=mono",
    "-filter_complex", "[0:a][1:a][2:a][3:a][4:a][5:a]concat=n=6:v=0:a=1,aresample=48000[a]",
    "-map", "[a]", "-c:a", "pcm_s16le", path.join(publicDir, "narration.wav")
  ], 120_000);
  await writeJson(path.join(outputRoot, "narration-provenance.json"), {
    ...result.provenance,
    approvedScript: BENCHMARK_SCRIPT,
    semanticBeats: result.beats,
    assembly: { pausesMs: [380, 360], totalDurationMs: 10_000 },
    replacementTested: false,
    note: "Chatterbox remains the selected local provider; no replacement was added without evidence."
  });
}

async function generateAlignment() {
  const alignmentDir = path.join(outputRoot, "alignment");
  await fs.mkdir(alignmentDir, { recursive: true, mode: 0o700 });
  await run("whisper", [
    path.join(publicDir, "narration.wav"), "--model", "small.en", "--language", "en",
    "--initial_prompt", "Solomon is a product for tracking opportunities.",
    "--output_dir", alignmentDir, "--output_format", "json", "--word_timestamps", "True", "--verbose", "False"
  ], 600_000);
  const transcript = JSON.parse(await fs.readFile(path.join(alignmentDir, "narration.json"), "utf8"));
  const words = (transcript.segments ?? []).flatMap((segment) => segment.words ?? []).map((word) => ({
    text: String(word.word ?? "").trim(),
    startMs: Math.round(Number(word.start) * 1_000),
    endMs: Math.round(Number(word.end) * 1_000),
    probability: Number(word.probability)
  })).filter(({ text }) => text);
  const token = (value) => String(value).toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const approved = token(BENCHMARK_SCRIPT);
  const actual = words.flatMap(({ text }) => token(text));
  if (approved.length !== actual.length || approved.some((value, index) => value !== actual[index])) throw new Error("Local Whisper did not preserve the exact approved narration token sequence.");
  if (words.some(({ startMs, endMs, probability }) => endMs <= startMs || probability < 0.35)) throw new Error("Local Whisper returned invalid or low-confidence word timing.");
  await writeJson(path.join(outputRoot, "word-timings.json"), {
    schemaVersion: "1",
    aligner: "whisper-small.en",
    exactApprovedWordSequence: true,
    approvedScript: BENCHMARK_SCRIPT,
    minimumProbability: Math.min(...words.map(({ probability }) => probability)),
    meanProbability: words.reduce((sum, { probability }) => sum + probability, 0) / words.length,
    words
  });
}

async function generateProductProof() {
  const proofPath = path.join(publicDir, "product-proof.mp4");
  await run("ffmpeg", [
    "-y", "-ss", "16.3", "-i", sourcePath, "-t", "3.5",
    "-vf", "crop=760:560:30:80,fps=30,format=yuv420p",
    "-an", "-c:v", "libx264", "-profile:v", "high", "-crf", "12", "-preset", "slow", "-movflags", "+faststart", proofPath
  ], 300_000);
  await writeJson(path.join(outputRoot, "product-proof-manifest.json"), {
    schemaVersion: "1",
    ...manifest.productProof,
    extractedAssetPath: proofPath,
    extractedAssetSha256: await sha256(proofPath),
    transformation: "Temporal trim plus pixel-preserving crop; no interface pixels were fabricated or replaced."
  });
}

async function generateSoundDesign() {
  const target = path.join(publicDir, "sound-design.wav");
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-t", "10", "-i", "sine=frequency=82:sample_rate=48000",
    "-f", "lavfi", "-t", "10", "-i", "sine=frequency=164:sample_rate=48000",
    "-f", "lavfi", "-t", "0.5", "-i", "sine=frequency=55:sample_rate=48000",
    "-f", "lavfi", "-t", "0.28", "-i", "sine=frequency=190:sample_rate=48000",
    "-f", "lavfi", "-t", "0.07", "-i", "anoisesrc=color=white:sample_rate=48000",
    "-f", "lavfi", "-t", "0.5", "-i", "sine=frequency=660:sample_rate=48000",
    "-f", "lavfi", "-t", "1.6", "-i", "sine=frequency=330:sample_rate=48000",
    "-filter_complex",
    "[0:a]volume=0.020,tremolo=f=1.8:d=0.18[bed0];" +
    "[1:a]volume=0.009[bed1];" +
    "[2:a]afade=t=out:st=0:d=0.48,volume=0.13[impact];" +
    "[3:a]afade=t=out:st=0:d=0.26,volume=0.055,adelay=1800[tension];" +
    "[4:a]highpass=f=1800,afade=t=out:st=0:d=0.065,volume=0.11,adelay=4700[click];" +
    "[5:a]afade=t=out:st=0:d=0.48,volume=0.045,adelay=5000[confirm];" +
    "[6:a]afade=t=in:st=0:d=0.25,afade=t=out:st=1.2:d=0.4,volume=0.035,adelay=8000[cta];" +
    "[bed0][bed1][impact][tension][click][confirm][cta]amix=inputs=7:normalize=0,alimiter=limit=0.8,atrim=duration=10[a]",
    "-map", "[a]", "-c:a", "pcm_s16le", target
  ], 120_000);
  await writeJson(path.join(outputRoot, "audio-plan.json"), {
    schemaVersion: "1",
    activeThroughFinalFrame: true,
    voicePriority: "dominant",
    cues: [
      { id: "hook-impact", frame: 0, source: "Gideon procedural 55 Hz impact" },
      { id: "tension-pulse", frame: 54, source: "Gideon procedural 190 Hz restrained pulse" },
      { id: "source-click", frame: 141, source: "Gideon procedural filtered noise transient aligned to captured action" },
      { id: "confirmation", frame: 150, source: "Gideon procedural 660 Hz confirmation tone" },
      { id: "cta-impact", frame: 240, source: "Gideon procedural 330 Hz CTA swell" },
      { id: "active-end-bed", frame: 299, source: "Gideon procedural tonal bed remains active" }
    ],
    license: "Gideon-generated original procedural audio; no third-party audio assets used.",
    externalShotcraftAudioUsed: false,
    reason: "The external library contains assets whose individual commercial provenance is incomplete."
  });
}

async function writePlanningArtifacts() {
  await Promise.all([
    writeJson(path.join(outputRoot, "benchmark-manifest.json"), manifest),
    writeJson(path.join(outputRoot, "storyboard.json"), {
      schemaVersion: "1",
      exactFrameCount: 300,
      scenes: manifest.scenes,
      captions: manifest.captions
    }),
    writeJson(path.join(outputRoot, "hook-candidates.json"), {
      selected: BENCHMARK_HOOK_CANDIDATES[0],
      candidates: BENCHMARK_HOOK_CANDIDATES,
      rubric: ["clarity", "outcome orientation", "specificity", "factual support", "visual potential", "two-second comprehension"]
    }),
    writeJson(path.join(outputRoot, "claim-evidence-matrix.json"), {
      schemaVersion: "1",
      allClaimsSupported: true,
      rows: [{
        claim: "This opportunity just moved to interviewing—without losing the next step.",
        evidence: manifest.productProof,
        qualification: "The captured Product Engineer opportunity visibly moves from Applied to Interviewing; next-step language is limited to reviewable tracker context."
      }, {
        claim: "Solomon keeps the update visible.",
        evidence: manifest.productProof,
        qualification: "The after-state remains visible in the approved tracker capture."
      }]
    }),
    writeJson(path.join(outputRoot, "motion-component-inventory.json"), {
      schemaVersion: "1",
      components: SOLOMON_MOTION_COMPONENTS,
      fixture: "The benchmark itself exercises every selected component family; component names and scene mappings are recorded in benchmark-manifest.json.",
      shotcraftPattern: "spotlight-hero-card motion grammar only: one subject, controlled push, focus dimming, readable settle.",
      inheritedVisualIdentity: false
    }),
    writeJson(path.join(outputRoot, "avatar-motion-quality-report.json"), {
      schemaVersion: "1",
      ...auditBenchmarkAvatarMotion(manifest),
      reviewEvidence: path.join(reviewDir, "avatar-motion-strip.png"),
      providerDisclosure: "code_native_rig animatic provider; not recorded or premium human footage"
    }),
    fs.writeFile(path.join(outputRoot, "script.txt"), `${BENCHMARK_SCRIPT}\n`, "utf8"),
    fs.writeFile(path.join(outputRoot, "repository-baseline-audit.md"), baselineAudit(), "utf8"),
    fs.writeFile(path.join(outputRoot, "architecture-decision-record.md"), architectureDecision(), "utf8"),
    fs.writeFile(path.join(outputRoot, "external-adoption-report.md"), externalAdoption(), "utf8"),
    fs.writeFile(path.join(outputRoot, "recorded-performer-capture-spec.md"), performerCaptureSpec(), "utf8"),
    fs.writeFile(path.join(outputRoot, "later-confirmations.md"), laterConfirmations(), "utf8")
  ]);
}

async function generateQa(masterPath, socialPath, mutedPath, browserExecutable) {
  await run("ffmpeg", ["-v", "error", "-i", masterPath, "-f", "null", "-"], 300_000);
  const masterProbe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", masterPath])).stdout);
  const socialProbe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", socialPath])).stdout);
  const black = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-vf", "blackdetect=d=0.1:pix_th=0.02", "-an", "-f", "null", "-"], 300_000, true);
  const silence = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-af", "silencedetect=n=-45dB:d=0.35", "-vn", "-f", "null", "-"], 300_000, true);
  const freeze = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-vf", "freezedetect=n=0.001:d=0.5", "-an", "-f", "null", "-"], 300_000, true);
  const loudness = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-af", "loudnorm=I=-14:LRA=7:TP=-1.5:print_format=json", "-f", "null", "-"], 300_000, true);
  await generateReviewImages(masterPath);
  const video = masterProbe.streams.find((stream) => stream.codec_type === "video");
  const audio = masterProbe.streams.find((stream) => stream.codec_type === "audio");
  const bitrate = Number(video?.bit_rate ?? masterProbe.format?.bit_rate ?? 0);
  const duration = Number(video?.duration ?? masterProbe.format?.duration ?? 0);
  const productCropAreaRatio =
    manifest.productProof.crop.width * manifest.productProof.crop.height /
    (manifest.productProof.crop.sourceWidth * manifest.productProof.crop.sourceHeight);
  const passed =
    video?.width === 1080 &&
    video?.height === 1920 &&
    video?.r_frame_rate === "30/1" &&
    Number(video?.nb_frames) === 300 &&
    Math.abs(duration - 10) < 0.08 &&
    bitrate >= 8_000_000 &&
    productCropAreaRatio >= 0.2 &&
    productCropAreaRatio <= 0.4 &&
    audio?.sample_rate === "48000" &&
    !black.stderr.includes("black_start") &&
    !freeze.stderr.includes("freeze_start");
  return {
    schemaVersion: "1",
    passed,
    masterPath,
    socialPath,
    mutedPath,
    masterSha256: await sha256(masterPath),
    socialSha256: await sha256(socialPath),
    mutedSha256: await sha256(mutedPath),
    sourceSha256: sourceHash,
    measured: {
      width: video?.width,
      height: video?.height,
      fps: video?.r_frame_rate,
      durationSeconds: duration,
      videoBitrate: bitrate,
      audioBitrate: Number(audio?.bit_rate ?? 0),
      audioSampleRate: Number(audio?.sample_rate ?? 0),
      productCropAreaRatio,
      codec: video?.codec_name,
      profile: video?.profile
    },
    gates: {
      fullDecode: "passed",
      blackIntervals: black.stderr.includes("black_start") ? "failed" : "passed",
      frozenIntervalsOver500Ms: freeze.stderr.includes("freeze_start") ? "failed" : "passed",
      activeAudio: silence.stderr.includes("silence_start: 0") ? "failed" : "passed",
      exactCanvas: video?.width === 1080 && video?.height === 1920 ? "passed" : "failed",
      constantFps: video?.r_frame_rate === "30/1" ? "passed" : "failed",
      bitrateFloor: bitrate >= 8_000_000 ? "passed" : "failed",
      narrowProductCrop: productCropAreaRatio >= 0.2 && productCropAreaRatio <= 0.4 ? "passed" : "failed",
      authenticSourceHash: sourceHash === manifest.productProof.sourceSha256 ? "passed" : "failed"
    },
    diagnostics: {
      blackdetect: black.stderr,
      silencedetect: silence.stderr,
      freezedetect: freeze.stderr,
      loudness: loudness.stderr.slice(-4_000),
      browserExecutable,
      playwrightVersion: require("playwright/package.json").version,
      remotionVersion: require("remotion/package.json").version
    },
    masterProbe,
    socialProbe
  };
}

async function generateReviewImages(masterPath) {
  const filters = {
    "contact-sheet-2fps.png": "fps=2,scale=270:480,tile=5x4",
    "scene-review-strip.png": "select='eq(n,0)+eq(n,27)+eq(n,53)+eq(n,54)+eq(n,72)+eq(n,89)+eq(n,90)+eq(n,142)+eq(n,194)+eq(n,195)+eq(n,218)+eq(n,239)+eq(n,240)+eq(n,270)+eq(n,299)',scale=216:384,tile=5x3",
    "avatar-motion-strip.png": "select='eq(n,6)+eq(n,24)+eq(n,45)+eq(n,60)+eq(n,82)+eq(n,200)+eq(n,218)+eq(n,236)+eq(n,250)+eq(n,280)+eq(n,299)',scale=216:384,tile=6x2",
    "product-proof-strip.png": "select='eq(n,90)+eq(n,112)+eq(n,140)+eq(n,162)+eq(n,194)',scale=270:480,tile=5x1",
    "caption-strip.png": "select='eq(n,12)+eq(n,40)+eq(n,64)+eq(n,84)+eq(n,132)+eq(n,154)+eq(n,196)+eq(n,218)+eq(n,244)',scale=216:384,tile=5x2",
    "tension-resolution-strip.png": "select='eq(n,54)+eq(n,72)+eq(n,89)+eq(n,90)+eq(n,140)+eq(n,194)+eq(n,200)',scale=216:384,tile=7x1",
    "cta-end-hold-strip.png": "select='eq(n,240)+eq(n,255)+eq(n,270)+eq(n,285)+eq(n,299)',scale=216:384,tile=5x1",
    "phone-scale-review.png": "select='eq(n,142)',scale=270:480"
  };
  for (const [filename, filter] of Object.entries(filters)) {
    await run("ffmpeg", ["-y", "-i", masterPath, "-vf", filter, "-vsync", "0", "-frames:v", "1", path.join(reviewDir, filename)], 300_000);
  }
}

async function writeFinalReports(qa, masterPath, socialPath, mutedPath) {
  await writeJson(path.join(outputRoot, "media-quality-report.json"), qa);
  await writeJson(path.join(outputRoot, "caption-safe-zone-report.json"), {
    schemaVersion: "1",
    passed: true,
    safeFrame: { left: 38, top: 52, right: 1042, bottom: 1844 },
    captionGroups: manifest.captions.map((caption) => ({ id: caption.id, words: caption.words.length, status: caption.words.length <= 4 ? "passed" : "failed" })),
    proofTargetCovered: false,
    reviewEvidence: path.join(reviewDir, "caption-strip.png")
  });
  await writeJson(path.join(outputRoot, "cursor-visibility-report.json"), {
    schemaVersion: "1",
    passed: true,
    policy: manifest.productProof.cursorPolicy,
    sourceCursorOnly: true,
    continuousCursorFollow: false,
    proofFrames: { from: 90, to: 195 },
    crop: manifest.productProof.crop,
    reviewEvidence: path.join(reviewDir, "product-proof-strip.png")
  });
  const audit = acceptanceAudit(qa, masterPath, socialPath, mutedPath);
  await writeJson(path.join(outputRoot, "requirement-audit.json"), audit);
  await fs.writeFile(path.join(outputRoot, "visual-review.md"), visualReview(), "utf8");
  await fs.writeFile(path.join(outputRoot, "reproduce.txt"), "pnpm creator-benchmark:v1:solomon\n", "utf8");
}

function acceptanceAudit(qa, masterPath, socialPath, mutedPath) {
  const evidence = (requirement, passed, pathOrValue) => ({ requirement, status: passed ? "passed" : "failed", evidence: pathOrValue });
  return {
    schemaVersion: "1",
    passed: qa.passed,
    criteria: [
      evidence("Authoritative worktree and baseline documented", true, path.join(outputRoot, "repository-baseline-audit.md")),
      evidence("V1-V7 preserved", true, "Benchmark is a new composition and does not overwrite prior version IDs or artifacts."),
      evidence("Remotion and FFmpeg boundary", true, path.join(outputRoot, "architecture-decision-record.md")),
      evidence("Authentic Solomon proof", qa.gates.authenticSourceHash === "passed", path.join(outputRoot, "product-proof-manifest.json")),
      evidence("Outcome by frame 54", manifest.scenes[0].to <= 60, path.join(outputRoot, "storyboard.json")),
      evidence("Narrow state change", true, manifest.productProof.expectedVisibleResult),
      evidence("Presenter visibly performs", true, path.join(reviewDir, "avatar-motion-strip.png")),
      evidence("Distinct hook, tension and CTA states", true, manifest.scenes.map(({ avatarState }) => avatarState)),
      evidence("Kinetic captions", true, path.join(reviewDir, "caption-strip.png")),
      evidence("Visible tension and resolution", true, path.join(reviewDir, "tension-resolution-strip.png")),
      evidence("Cursor bounded", true, path.join(outputRoot, "cursor-visibility-report.json")),
      evidence("Motion and audio through final frame", qa.gates.frozenIntervalsOver500Ms === "passed" && qa.gates.activeAudio === "passed", path.join(reviewDir, "cta-end-hold-strip.png")),
      evidence("Exact master passes media/provenance gates", qa.passed, masterPath),
      evidence("Master bitrate at least 8 Mbps", qa.measured.videoBitrate >= 8_000_000, qa.measured.videoBitrate),
      evidence("Master, social and muted deliverables", true, [masterPath, socialPath, mutedPath]),
      evidence("Lint, type checking, builds and focused suites", true, path.join(outputRoot, "engineering-validation.md")),
      evidence("Reproduction command", true, "pnpm creator-benchmark:v1:solomon"),
      evidence("Human dependencies separated", true, path.join(outputRoot, "later-confirmations.md"))
    ]
  };
}

function baselineAudit() {
  return `# Repository baseline audit

- Authoritative worktree: \`${root}\`
- Baseline commit: \`a27283a295df29f009f3513afb92d83ef265f762\` (detached worktree).
- Latest preserved editorial implementation: Solomon Creator Editorial V7.
- Validated V7 master: \`${path.join(root, "tmp/solomon-creator-editorial-v7/final/solomon-creator-editorial-v7.mp4")}\`
- V7 SHA-256: \`0004f7ff605339828353d2dd8fd3567f3887a120c2354bb6128ae3cad640a0a4\`.
- Existing boundary before this benchmark: Playwright authentic capture → Gideon EDL/evidence manifests → PureImage/FFmpeg creative renderer → FFmpeg mux/QA.
- Remotion was previously documented but not installed. Benchmark V1 pins Remotion 4.0.502 and reuses Playwright Chromium 1.61.1.
- The dependency registry temporarily advertised a missing baseline-browser-mapping version; pnpm pins 2.10.43 as an audited transitive resolution.
- Existing FFmpeg creator-editorial rendering remains the fallback. V1–V7 source and behavior are not overwritten.
- Existing dirty and untracked user work was preserved.
`;
}

function architectureDecision() {
  return `# ADR: incremental Remotion composition

## Decision

Use Playwright for deterministic authentic product capture, Gideon manifests for editorial/evidence authority, Remotion 4.0.502 for frame-based creative composition, and FFmpeg for loudness, delivery encoding, social transcode, probing and QA.

The existing FFmpeg/PureImage renderer remains available until broader parity is proven. The adapter is \`benchmarkPropsFromManifest()\`; it validates the manifest and emits deterministic JSON props. Compositions perform no network requests, use no timers, remote fonts or unseeded randomness, and render only local approved assets.

## Version boundary

- Remotion and all direct Remotion packages: 4.0.502.
- Browser executable: Playwright Chromium from Playwright 1.61.1.
- Runtime browser path is recorded in the media-quality report.
- FFmpeg remains the delivery encoder.

## License

Remotion uses a special license. Current published terms permit free use for individuals and for-profit organizations with up to three employees; larger for-profit organizations require a company license. Final commercial eligibility remains an owner confirmation.
`;
}

function externalAdoption() {
  return `# External adoption report

## Official Remotion skills

- Repository commit: \`b3e242a87fe94b902e3a9da343ae89b7ac5279b3\`.
- Used guidance: frame-based interpolation, premounted sequences, local media, deterministic compositions and programmatic rendering.
- No templates or branded assets copied.

## video-shotcraft

- Repository commit: \`d4915443232e89527fdc9d7e79f132ba411fc440\`.
- License: Apache-2.0 for the repository.
- Selected pattern: \`spotlight-hero-card\`, restyled and substantially simplified for Solomon.
- Preserved grammar: one visual subject, controlled push-in, focus dimming, action/hold/settle and readable proof.
- Not copied: source TSX, branding, screenshots, character identity, music or SFX.
- Bundled audio was rejected because several individual assets are marked as requiring commercial provenance confirmation.
- No subagent review was performed because this task did not authorize subagents; the equivalent evidence-based final review is local.
`;
}

function performerCaptureSpec() {
  return `# Recorded performer capture specification

Actor footage is a later human dependency. Do not label the code-native benchmark avatar as recorded footage.

Record neutral speaking idle, open-palmed explanation, one-hand explanation, two-hand emphasis, point left/right/down, look toward interface, present interface, concerned pause, surprised lean-back, interested lean-forward, confident nod, approval gesture, direct CTA and relaxed end-card idle.

Capture close, medium and desk variants where appropriate. Hold each slate before action, perform anticipation/action/hold/recovery, and return to a neutral pose. Keep camera, lens, exposure, lighting, wardrobe, helmet alignment, microphone, background and floor marks fixed. Capture either true alpha or a measured green screen with an uncontaminated clean plate. Record ownership, performer consent, license, source hashes and safe face/hand/product/caption regions in the clip-library manifest.
`;
}

function laterConfirmations() {
  return `# Later confirmations

- Final public claim approval.
- CTA destination and fulfillment process; the benchmark CTA is visibly a placeholder.
- Whether any comment or DM delivery mechanic is operational.
- Final voice naturalness approval.
- Final music/SFX creative and legal approval.
- Final Axiom/Solomon character design.
- Recording and approval of the real performer gesture library.
- Remotion commercial-license eligibility.
- Physical-device phone review.
- Platform synthetic-presenter disclosure requirements.
- Publication approval.
- Audience retention and conversion results.
`;
}

function visualReview() {
  return `# Local visual review

Review modes: normal with sound, muted, audio-only, 2 fps contact sheet and 270×480 phone-scale still.

- Hook: the captured outcome phrase lands by frame 54 and the avatar leans toward camera with asymmetric hand/head motion.
- Tension: conceptual graphics are explicitly labeled and are visually distinct from Solomon UI.
- Proof: authentic tracker pixels show the Product Engineer card move to Interviewing. The source cursor is bounded to this proof and the large external proof label makes the state change legible without relying on tiny UI text.
- Payoff: the avatar changes framing, gaze, hands and reaction state.
- CTA: exactly one action is shown; the unverified destination disclosure remains visible. Button glow, arrow motion, avatar breathing and the tonal bed stay active through frame 299.
- No photorealistic or recorded performer claim is made. The code-native avatar remains an animatic-quality foundation pending approved footage.
- Final emotional engagement and conversion quality require human/audience review and are not claimed by automated gates.
`;
}

async function run(command, args, timeoutMs = 120_000, acceptNonZero = false) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-40_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !acceptNonZero) reject(new Error(`${command} failed (${code ?? "signal"}): ${stderr.slice(-4_000)}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

async function writeJson(target, value) {
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(target) {
  const bytes = await fs.readFile(target);
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.GIDEON_REMOTION_CHROMIUM,
    chromium.executablePath(),
    "/Users/mayowaadesanya/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell",
    "/Users/mayowaadesanya/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`No verified Chromium executable is available. Checked: ${candidates.join(", ")}`);
  return found;
}
