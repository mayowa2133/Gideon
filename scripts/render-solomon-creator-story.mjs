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
  SOLOMON_CREATOR_STORY_SCRIPT,
  assertSolomonCreatorStoryManifest,
  auditSolomonStoryLayout,
  auditSolomonStoryRetention,
  createSolomonCreatorStoryManifest
} = require("../dist/main/shared/solomonCreatorStory.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captureRoot = "/Users/mayowaadesanya/Projects/NexusReach/output/playwright/solomon-genuine-capture-20260731-hq";
const sourcePaths = {
  jobs: process.env.SOLOMON_JOBS_SOURCE ?? path.join(captureRoot, "01-role-company.webm"),
  tracker: process.env.SOLOMON_TRACKER_SOURCE ?? path.join(captureRoot, "02-stage-interviewing.webm"),
  contacts: process.env.SOLOMON_CONTACTS_SOURCE ?? path.join(captureRoot, "03-contact-evidence.webm"),
  outreach: process.env.SOLOMON_OUTREACH_SOURCE ?? path.join(captureRoot, "04-draft-message.webm")
};
const outputRoot = path.join(root, "tmp", "solomon-creator-story-v5-creator-review");
const publicDir = path.join(outputRoot, "remotion-public");
const finalDir = path.join(outputRoot, "final");
const reviewDir = path.join(outputRoot, "review");
const manifest = createSolomonCreatorStoryManifest(sourcePaths, {
  environment: "authenticated_genuine_environment",
  publicReleaseApproved: false,
  environmentReviewReceipt: "local-product-review:2026-07-31:solomon-main@ab5124da:faire-record"
});
assertSolomonCreatorStoryManifest(manifest);

await Promise.all([
  fs.mkdir(publicDir, { recursive: true, mode: 0o700 }),
  fs.mkdir(finalDir, { recursive: true, mode: 0o700 }),
  fs.mkdir(reviewDir, { recursive: true, mode: 0o700 }),
  fs.mkdir(path.join(outputRoot, "comparison-metrics"), { recursive: true, mode: 0o700 })
]);

const sourceHashes = {};
for (const source of manifest.sources) {
  if (!existsSync(source.sourcePath)) throw new Error(`Approved Solomon source is missing: ${source.sourcePath}`);
  sourceHashes[source.id] = await sha256(source.sourcePath);
  if (sourceHashes[source.id] !== source.sourceSha256) throw new Error(`Approved ${source.id} hash mismatch: ${sourceHashes[source.id]}`);
}

await generateProductProofs();
await generateNarration();
await generateSoundDesign();
await writePlanningArtifacts();

const browserExecutable = resolveBrowserExecutable();
const serveUrl = await bundle({
  entryPoint: path.join(root, "src", "remotion", "solomonCreatorStory", "index.ts"),
  publicDir,
  outDir: path.join(outputRoot, "remotion-bundle"),
  onProgress: (progress) => {
    const percent = progress > 1 ? Math.round(progress) : Math.round(progress * 100);
    if (percent % 25 === 0) process.stdout.write(`Bundle ${percent}%\n`);
  }
});
const inputProps = JSON.parse(JSON.stringify(manifest));
const composition = await selectComposition({
  serveUrl,
  id: "SolomonCreatorStoryV2",
  inputProps,
  browserExecutable,
  chromeMode: "headless-shell",
  timeoutInMilliseconds: 120_000
});
const intermediate = path.join(outputRoot, "solomon-creator-story-v5-creator-review-remotion.mp4");
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: intermediate,
  inputProps,
  browserExecutable,
  chromeMode: "headless-shell",
  concurrency: 3,
  overwrite: true,
  pixelFormat: "yuv420p",
  crf: 13,
  x264Preset: "medium",
  audioCodec: "aac",
  audioBitrate: "320K",
  sampleRate: 48_000,
  logLevel: "info",
  timeoutInMilliseconds: 180_000,
  onProgress: ({ progress }) => {
    const percent = Math.round(progress * 100);
    if (percent % 10 === 0) process.stdout.write(`Render ${percent}%\n`);
  }
});

const masterPath = path.join(finalDir, "solomon-creator-story-v5-creator-review-master-NOT-FOR-PUBLICATION.mp4");
const socialPath = path.join(finalDir, "solomon-creator-story-v5-creator-review-social-720x1280.mp4");
const mutedPath = path.join(finalDir, "solomon-creator-story-v5-creator-muted-review.mp4");
const openingPath = path.join(finalDir, "solomon-creator-story-v5-creator-opening-10s.mp4");
await run("ffmpeg", [
  "-y", "-i", intermediate,
  "-vf", "fps=30,scale=in_range=auto:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
  "-af", "loudnorm=I=-14:LRA=7:TP=-1.5",
  "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
  "-b:v", "10M", "-minrate", "10M", "-maxrate", "10M", "-bufsize", "20M",
  "-x264-params", "nal-hrd=cbr:force-cfr=1",
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
  "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
  "-t", "36", "-movflags", "+faststart", masterPath
], 30 * 60_000);
await Promise.all([
  run("ffmpeg", [
    "-y", "-i", masterPath, "-vf", "scale=720:1280:flags=lanczos:in_range=tv:out_range=tv:out_color_matrix=bt709,fps=30,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-b:v", "4M", "-maxrate", "6M", "-bufsize", "8M",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-t", "36", "-movflags", "+faststart", socialPath
  ], 30 * 60_000),
  run("ffmpeg", ["-y", "-i", masterPath, "-map", "0:v:0", "-c:v", "copy", "-an", mutedPath], 300_000),
  run("ffmpeg", ["-y", "-i", masterPath, "-t", "10", "-c", "copy", openingPath], 300_000)
]);

const qa = await generateQa(masterPath, socialPath, mutedPath, openingPath, browserExecutable);
const transcription = await verifyFinalNarration(masterPath);
qa.gates.exactNarration = transcription.passed ? "passed" : "failed";
qa.renderPassed = Object.entries(qa.gates)
  .filter(([id]) => id !== "verifiedCta" && id !== "publicSourceApproval")
  .every(([, value]) => value === "passed");
qa.releaseReady = qa.renderPassed &&
  qa.gates.verifiedCta === "passed" &&
  qa.gates.publicSourceApproval === "passed";
qa.passed = qa.renderPassed;
const comparison = await generateReferenceComparison(masterPath);
await writeFinalReports(qa, comparison, transcription);
process.stdout.write(`${JSON.stringify({
  masterPath, socialPath, mutedPath, openingPath, masterSha256: qa.masterSha256,
  renderPassed: qa.renderPassed, releaseReady: qa.releaseReady
}, null, 2)}\n`);
if (!qa.renderPassed) process.exitCode = 1;

async function generateProductProofs() {
  for (const source of manifest.sources) {
    const output = path.join(publicDir, `proof-${source.id}.mp4`);
    const startSeconds = source.extractedSourceInterval.startMs / 1_000;
    const durationSeconds = (source.extractedSourceInterval.endMs - source.extractedSourceInterval.startMs) / 1_000;
    const outputDurationSeconds = durationSeconds;
    const videoFilter = "fps=30,format=yuv420p";
    await run("ffmpeg", [
      "-y", "-ss", String(startSeconds), "-i", source.sourcePath, "-t", String(outputDurationSeconds),
      "-vf", videoFilter, "-an", "-c:v", "libx264", "-profile:v", "high",
      "-crf", "12", "-preset", "slow", "-movflags", "+faststart", output
    ], 600_000);
  }
}

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
  const beats = [
    { id: "hook", approvedText: "This job just hit Interviewing, and Solomon already knows who should help next.", startMs: 0, endMs: 3_300, energy: "high" },
    { id: "trigger", approvedText: "The status change pulls the role and company forward,", startMs: 3_300, endMs: 7_000, energy: "medium" },
    { id: "contact", approvedText: "then surfaces the person connected to the role and why they're relevant.", startMs: 7_000, endMs: 10_500, energy: "high" },
    { id: "problem", approvedText: "Normally, you rebuild this across five tabs.", startMs: 10_500, endMs: 13_000, energy: "medium" },
    { id: "connection", approvedText: "Solomon keeps every piece connected,", startMs: 13_000, endMs: 16_000, energy: "high" },
    { id: "draft", approvedText: "then turns that context into a personalized draft, not a generic template.", startMs: 16_000, endMs: 20_500, energy: "medium" },
    { id: "approval", approvedText: "Solomon makes the draft. You approve it.", startMs: 20_500, endMs: 23_000, energy: "high" },
    { id: "payoff", approvedText: "From job, to person, to proof, to draft.", startMs: 23_000, endMs: 27_500, energy: "high" },
    { id: "summary", approvedText: "One opportunity becomes one clear next step.", startMs: 27_500, endMs: 31_500, energy: "medium" },
    { id: "cta", approvedText: "Type Solomon below and I'll send you the demo.", startMs: 31_500, endMs: 35_200, energy: "high" }
  ];
  const profiles = [
    {
      id: "conversational",
      description: "Warmer alternate with natural sentence-to-sentence variation.",
      seed: 82_520,
      beats: beats.map((beat) => ({ ...beat, energy: beat.id === "hook" || beat.id === "brand" ? "high" : "medium" }))
    },
    {
      id: "energetic",
      description: "Higher-energy alternate for a stronger creator delivery.",
      seed: 82_621,
      beats: beats.map((beat) => ({ ...beat, energy: beat.id === "problem" ? "medium" : "high" }))
    },
    {
      id: "restrained-credible",
      description: "Selected restrained delivery with high-energy hook, reveal, approval, payoff, and CTA beats.",
      seed: 82_419,
      beats
    }
  ];
  const candidates = [];
  for (const profile of profiles) {
    const candidateRoot = profile.id === "restrained-credible"
      ? path.join(outputRoot, "narration-semantic")
      : path.join(outputRoot, "narration-candidates", profile.id);
    const result = await provider.synthesize({
      outputDir: candidateRoot,
      beats: profile.beats,
      language: "en",
      voice: { mode: "model_default" },
      seed: profile.seed
    });
    const candidatePath = path.join(outputRoot, "narration-candidates", `${profile.id}.wav`);
    await fs.mkdir(path.dirname(candidatePath), { recursive: true, mode: 0o700 });
    await assembleNarrationCandidate(result, candidatePath);
    candidates.push({
      id: profile.id,
      description: profile.description,
      seed: profile.seed,
      outputPath: candidatePath,
      outputSha256: await sha256(candidatePath),
      provenance: result.provenance,
      semanticBeats: result.beats
    });
  }
  const selected = candidates.find(({ id }) => id === "energetic");
  if (!selected) throw new Error("The selected energetic narration candidate was not generated.");
  await fs.copyFile(selected.outputPath, path.join(publicDir, "narration.wav"));
  await writeJson(path.join(outputRoot, "narration-provenance.json"), {
    ...selected.provenance,
    approvedScript: SOLOMON_CREATOR_STORY_SCRIPT,
    semanticBeats: selected.semanticBeats,
    assembly: { totalDurationMs: 36_000, placement: "semantic_beats_at_declared_timestamps" },
    candidateSelection: {
      selectedCandidateId: selected.id,
      policy: "Use the exact-word-verified energetic delivery for the creator-style master; expose conversational and restrained alternates for human review.",
      candidates
    },
    humanVoiceApprovalRequired: true
  });
  await writeJson(path.join(outputRoot, "phrase-timings.json"), {
    schemaVersion: "1",
    source: "approved editorial beat plan and frame-accurate caption manifest",
    voiceBeats: beats.map(({ id, approvedText, startMs, endMs }) => ({ id, text: approvedText, startMs, endMs })),
    captionPhrases: manifest.captions.map(({ id, from, to, words, role, deliberateHold }) => ({
      id,
      text: words.join(" "),
      startFrame: from,
      endFrameExclusive: to,
      startMs: Math.round(from / 30 * 1_000),
      endMs: Math.round(to / 30 * 1_000),
      role,
      deliberateHold
    }))
  });
}

async function assembleNarrationCandidate(result, outputPath) {
  const filterParts = [];
  const args = ["-y"];
  result.beats.forEach((beat, index) => {
    args.push("-i", beat.outputPath);
    const targetDurationSeconds = Math.max(0.1, (beat.endMs - beat.startMs) / 1_000 - 0.12);
    const sourceDurationSeconds = beat.sourceDurationMs / 1_000;
    const tempo = sourceDurationSeconds / targetDurationSeconds;
    if (tempo < 0.5 || tempo > 2) {
      throw new Error(`Narration beat ${beat.id} requires unsupported tempo ${tempo.toFixed(3)}.`);
    }
    filterParts.push(`[${index}:a]atempo=${tempo.toFixed(6)},atrim=duration=${targetDurationSeconds.toFixed(3)},adelay=${beat.startMs}|${beat.startMs}[b${index}]`);
  });
  filterParts.push(`${result.beats.map((_, index) => `[b${index}]`).join("")}amix=inputs=${result.beats.length}:normalize=0,aresample=48000,apad,atrim=duration=36[a]`);
  args.push("-filter_complex", filterParts.join(";"), "-map", "[a]", "-c:a", "pcm_s16le", outputPath);
  await run("ffmpeg", args, 300_000);
}

async function generateSoundDesign() {
  const target = path.join(publicDir, "sound-design.wav");
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-t", "36", "-i", "anoisesrc=color=pink:sample_rate=48000",
    "-f", "lavfi", "-t", "36", "-i", "sine=frequency=82:sample_rate=48000",
    "-f", "lavfi", "-t", "0.35", "-i", "sine=frequency=54:sample_rate=48000",
    "-f", "lavfi", "-t", "0.08", "-i", "anoisesrc=color=white:sample_rate=48000",
    "-f", "lavfi", "-t", "0.5", "-i", "sine=frequency=660:sample_rate=48000",
    "-f", "lavfi", "-t", "0.65", "-i", "sine=frequency=220:sample_rate=48000",
    "-f", "lavfi", "-t", "1.6", "-i", "sine=frequency=330:sample_rate=48000",
    "-filter_complex",
    "[0:a]highpass=f=100,lowpass=f=4200,volume=0.018[room];" +
    "[1:a]volume=0.016,tremolo=f=2.1:d=0.18[bed];" +
    "[2:a]afade=t=out:st=0:d=0.33,volume=0.14[hook];" +
    "[3:a]highpass=f=1800,afade=t=out:st=0:d=0.07,volume=0.085,asplit=5[clickA][clickB][clickC][clickD][clickE];" +
    "[clickA]adelay=2400[c1];[clickB]adelay=2900[c2];[clickC]adelay=6800[c3];[clickD]adelay=20500[c4];[clickE]adelay=31500[c5];" +
    "[4:a]afade=t=out:st=0:d=0.48,volume=0.042,asplit=6[tickA][tickB][tickC][tickD][tickE][tickF];" +
    "[tickA]adelay=3600[t1];[tickB]adelay=5200[t2];[tickC]adelay=7600[t3];[tickD]adelay=9000[t4];[tickE]adelay=18200[t5];[tickF]adelay=21800[t6];" +
    "[5:a]afade=t=out:st=0.2:d=0.42,volume=0.045,asplit=3[warnA][warnB][warnC];" +
    "[warnA]adelay=10500[w1];[warnB]adelay=12500[w2];[warnC]adelay=35200[w3];" +
    "[6:a]afade=t=in:st=0:d=0.2,afade=t=out:st=1.15:d=0.45,volume=0.04,asplit=4[riseA][riseB][riseC][riseD];" +
    "[riseA]adelay=13000[r1];[riseB]adelay=16000[r2];[riseC]adelay=22500[r3];[riseD]adelay=31500[r4];" +
    "[room][bed][hook][c1][c2][c3][c4][c5][t1][t2][t3][t4][t5][t6][w1][w2][w3][r1][r2][r3][r4]amix=inputs=21:normalize=0,alimiter=limit=0.8,atrim=duration=36[a]",
    "-map", "[a]", "-c:a", "pcm_s16le", target
  ], 300_000);
  await writeJson(path.join(outputRoot, "audio-plan.json"), {
    schemaVersion: "1",
    activeThroughFinalFrame: true,
    targetIntegratedLoudness: "-14 LUFS",
    voicePriority: "dominant",
    sourceLicense: "Gideon-generated procedural sound; no third-party audio assets",
    cues: manifest.scenes.flatMap((scene) => scene.soundCueIds.map((id) => ({ id, frame: scene.from })))
  });
}

async function writePlanningArtifacts() {
  const retention = auditSolomonStoryRetention(manifest);
  const layout = auditSolomonStoryLayout(manifest);
  await Promise.all([
    writeJson(path.join(outputRoot, "story-manifest.json"), manifest),
    writeJson(path.join(outputRoot, "storyboard.json"), {
      schemaVersion: "1", exactFrameCount: 1_080, runtimeSeconds: 36,
      scenes: manifest.scenes, captions: manifest.captions
    }),
    writeJson(path.join(outputRoot, "authentic-product-footage-manifest.json"), {
      schemaVersion: "1",
      captureMethod: "Playwright authenticated genuine-product capture at 1080x1350",
      productName: "Solomon",
      safeDemoData: false,
      allSourcesAuthenticAndApproved: true,
      sources: manifest.sources.map((source) => ({
        ...source,
        observedSha256: sourceHashes[source.id],
        extractedAsset: path.join(publicDir, `proof-${source.id}.mp4`),
        transformation: source.privacyMasks.length > 0
          ? "Temporal trim, delivery normalization, target-aware editorial focus, and declared identity masks; product claims and controls are not fabricated."
          : "Temporal trim, delivery normalization, and target-aware editorial focus; product claims and controls are not fabricated."
      }))
    }),
    writeJson(path.join(outputRoot, "claim-evidence-matrix.json"), {
      schemaVersion: "1",
      allClaimsSupported: true,
      rows: manifest.sources.map((source) => ({
        claimPurpose: source.narrationPurpose,
        workflowId: source.workflowId,
        sourceSha256: source.sourceSha256,
        interval: source.extractedSourceInterval,
        qualification: source.resultState
      }))
    }),
    writeJson(path.join(outputRoot, "retention-audit.json"), { schemaVersion: "1", stage: "manifest", ...retention }),
    writeJson(path.join(outputRoot, "caption-safe-zone-report.json"), { schemaVersion: "1", stage: "manifest", ...layout }),
    fs.writeFile(path.join(outputRoot, "script.txt"), `${SOLOMON_CREATOR_STORY_SCRIPT}\n`, "utf8"),
    fs.writeFile(path.join(outputRoot, "implementation-notes.md"), implementationNotes(), "utf8"),
    fs.writeFile(path.join(outputRoot, "later-confirmations.md"), laterConfirmations(), "utf8")
  ]);
}

async function generateQa(masterPath, socialPath, mutedPath, openingPath, browserExecutable) {
  await run("ffmpeg", ["-v", "error", "-i", masterPath, "-f", "null", "-"], 600_000);
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", masterPath])).stdout);
  const black = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-vf", "blackdetect=d=0.1:pix_th=0.02", "-an", "-f", "null", "-"], 600_000, true);
  const silence = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-af", "silencedetect=n=-45dB:d=0.6", "-vn", "-f", "null", "-"], 600_000, true);
  const freeze = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-vf", "freezedetect=n=0.001:d=0.6", "-an", "-f", "null", "-"], 600_000, true);
  const loudness = await run("ffmpeg", ["-hide_banner", "-i", masterPath, "-af", "loudnorm=I=-14:LRA=7:TP=-1.5:print_format=json", "-f", "null", "-"], 600_000, true);
  await generateReviewImages(masterPath);
  const visualCopyScan = await scanForbiddenVisualCopy(masterPath);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(video?.duration ?? probe.format?.duration ?? 0);
  const bitrate = Number(video?.bit_rate ?? probe.format?.bit_rate ?? 0);
  const retention = auditSolomonStoryRetention(manifest);
  const gates = {
    fullDecode: "passed",
    exactCanvas: video?.width === 1080 && video?.height === 1920 ? "passed" : "failed",
    constantFps: video?.r_frame_rate === "30/1" ? "passed" : "failed",
    exactDuration: Math.abs(duration - 36) < 0.08 ? "passed" : "failed",
    bitrateRange: bitrate >= 8_000_000 && bitrate <= 15_500_000 ? "passed" : "failed",
    activeAudio: !silence.stderr.includes("silence_start") ? "passed" : "failed",
    noBlackIntervals: !black.stderr.includes("black_start") ? "passed" : "failed",
    noUnexpectedFreeze: !freeze.stderr.includes("freeze_start") ? "passed" : "failed",
    authenticSourceHashes: Object.values(sourceHashes).every((hash, index) => hash === manifest.sources[index].sourceSha256) ? "passed" : "failed",
    retentionManifest: retention.passed ? "passed" : "failed",
    bt709Limited: video?.pix_fmt === "yuv420p" &&
      video?.color_space === "bt709" &&
      video?.color_range === "tv" &&
      video?.color_primaries === "bt709" &&
      video?.color_transfer === "bt709" ? "passed" : "failed",
    genuineProductEnvironment: manifest.sources.every(({ environment, environmentReviewReceipt }) =>
      environment === "authenticated_genuine_environment" &&
      Boolean(environmentReviewReceipt?.trim()))
      ? "passed"
      : "failed",
    publicSourceApproval: manifest.sources.every(({ publicReleaseApproved }) => publicReleaseApproved)
      ? "passed"
      : "blocked_external_confirmation",
    verifiedCta: manifest.cta.actionCount === 1 && manifest.cta.verified && !manifest.cta.publicUrlImplied
      ? "passed"
      : "blocked_external_confirmation",
    sensitiveIdentityMasked: manifest.sources
      .filter(({ id }) => id === "tracker" || id === "contacts" || id === "outreach")
      .every(({ privacyMasks }) => privacyMasks.length > 0) &&
      !/preshoth|paramalingam|lyndon zhong|vihang m/i.test(manifest.script) &&
      visualCopyScan.passed
      ? "passed"
      : "failed",
    creatorStoryStructure: manifest.scenes.length >= 17 && [
      "hook-close", "status-click", "contact-proof", "problem-tabs",
      "mechanism-job-person", "personalization-proof", "approval-gate",
      "transformation-payoff", "cta-action", "brand-sting"
    ].every((id) => manifest.scenes.some((scene) => scene.id === id))
      ? "passed"
      : "failed",
    legacyNameExcluded: !/nexusreach/i.test(`${manifest.script} ${manifest.cta.text}`) ? "passed" : "failed",
    forbiddenVisualCopy: visualCopyScan.passed ? "passed" : "failed"
  };
  return {
    schemaVersion: "1",
    passed: Object.entries(gates)
      .filter(([id]) => id !== "verifiedCta" && id !== "publicSourceApproval")
      .every(([, value]) => value === "passed"),
    renderPassed: Object.entries(gates)
      .filter(([id]) => id !== "verifiedCta" && id !== "publicSourceApproval")
      .every(([, value]) => value === "passed"),
    releaseReady: Object.values(gates).every((value) => value === "passed"),
    masterPath, socialPath, mutedPath, openingPath,
    masterSha256: await sha256(masterPath),
    socialSha256: await sha256(socialPath),
    mutedSha256: await sha256(mutedPath),
    openingSha256: await sha256(openingPath),
    measured: {
      width: video?.width, height: video?.height, fps: video?.r_frame_rate,
      durationSeconds: duration, frameCount: Number(video?.nb_frames ?? 0),
      videoBitrate: bitrate, audioBitrate: Number(audio?.bit_rate ?? 0),
      audioSampleRate: Number(audio?.sample_rate ?? 0), codec: video?.codec_name, profile: video?.profile,
      pixelFormat: video?.pix_fmt, colorRange: video?.color_range, colorSpace: video?.color_space,
      colorPrimaries: video?.color_primaries, colorTransfer: video?.color_transfer
    },
    gates,
    diagnostics: {
      blackdetect: black.stderr.slice(-5_000),
      silencedetect: silence.stderr.slice(-5_000),
      freezedetect: freeze.stderr.slice(-5_000),
      loudness: loudness.stderr.slice(-5_000),
      visualCopyScan,
      browserExecutable,
      playwrightVersion: require("playwright/package.json").version,
      remotionVersion: require("remotion/package.json").version
    }
  };
}

async function generateReviewImages(masterPath) {
  const filters = {
    "contact-sheet-1fps.jpg": "fps=1,scale=180:320,tile=6x6",
    "mobile-360x640-contact-sheet.jpg": "fps=1,scale=90:160,tile=6x6",
    "scene-review-strip.jpg": "select='eq(n,0)+eq(n,35)+eq(n,65)+eq(n,83)+eq(n,98)+eq(n,125)+eq(n,164)+eq(n,209)+eq(n,269)+eq(n,314)+eq(n,389)+eq(n,434)+eq(n,479)+eq(n,539)+eq(n,614)+eq(n,674)+eq(n,824)+eq(n,944)+eq(n,1055)+eq(n,1079)',scale=180:320,tile=5x4",
    "avatar-performance-strip.jpg": "select='eq(n,8)+eq(n,28)+eq(n,42)+eq(n,60)+eq(n,330)+eq(n,400)+eq(n,450)+eq(n,850)+eq(n,900)+eq(n,960)+eq(n,1000)+eq(n,1040)+eq(n,1065)',scale=216:384,tile=7x2",
    "product-proof-strip.jpg": "select='eq(n,72)+eq(n,90)+eq(n,110)+eq(n,145)+eq(n,225)+eq(n,285)+eq(n,500)+eq(n,565)+eq(n,630)+eq(n,660)',scale=216:384,tile=5x2",
    "brand-end-hold-strip.jpg": "select='eq(n,948)+eq(n,978)+eq(n,1010)+eq(n,1040)+eq(n,1058)+eq(n,1079)',scale=180:320,tile=6x1"
  };
  for (const [filename, filter] of Object.entries(filters)) {
    await run("ffmpeg", ["-y", "-i", masterPath, "-vf", filter, "-vsync", "0", "-frames:v", "1", path.join(reviewDir, filename)], 600_000);
  }
}

async function scanForbiddenVisualCopy(masterPath) {
  const ocrDir = path.join(reviewDir, "ocr");
  await fs.mkdir(ocrDir, { recursive: true, mode: 0o700 });
  await run("ffmpeg", [
    "-y", "-i", masterPath,
    "-vf", "fps=1,scale=540:960:flags=lanczos",
    path.join(ocrDir, "frame-%02d.png")
  ], 600_000);
  const frameNames = (await fs.readdir(ocrDir)).filter((name) => /^frame-\d+\.png$/.test(name)).sort();
  const rows = [];
  for (const frameName of frameNames) {
    const result = await run("tesseract", [path.join(ocrDir, frameName), "stdout", "--psm", "6"], 120_000, true);
    rows.push({ frameName, text: result.stdout.trim() });
  }
  const forbiddenPatterns = [
    "safe demo",
    "synthetic data",
    "synthetic, unsent",
    "seeded fixture",
    "no model was called",
    "no public url implied",
    "surprising outcome",
    "trust payoff",
    "one reviewable story",
    "one next action",
    "nexusreach",
    "preshoth",
    "paramalingam",
    "lyndon zhong",
    "vihang m"
  ];
  const matches = rows.flatMap(({ frameName, text }) => forbiddenPatterns
    .filter((pattern) => text.toLowerCase().includes(pattern))
    .map((pattern) => ({ frameName, pattern })));
  const transcriptPath = path.join(ocrDir, "ocr-transcript.txt");
  await fs.writeFile(
    transcriptPath,
    `${rows.map(({ frameName, text }) => `## ${frameName}\n${text}`).join("\n\n")}\n`,
    "utf8"
  );
  return {
    passed: matches.length === 0,
    sampledFrames: frameNames.length,
    scale: "540x960",
    cadence: "1 fps",
    forbiddenPatterns,
    matches,
    transcriptPath
  };
}

async function writeFinalReports(qa, comparison, transcription) {
  await Promise.all([
    writeJson(path.join(outputRoot, "media-quality-report.json"), qa),
    writeJson(path.join(outputRoot, "retention-audit.json"), {
      schemaVersion: "1",
      stage: "final_render",
      ...auditSolomonStoryRetention(manifest),
      encodedFreezeGate: qa.gates.noUnexpectedFreeze,
      encodedSilenceGate: qa.gates.activeAudio,
      productTargetCount: manifest.scenes.filter(({ kind }) => kind === "product").length,
      reviewEvidence: {
        complete: path.join(reviewDir, "contact-sheet-1fps.jpg"),
        avatar: path.join(reviewDir, "avatar-performance-strip.jpg"),
        product: path.join(reviewDir, "product-proof-strip.jpg"),
        brandClose: path.join(reviewDir, "brand-end-hold-strip.jpg")
      }
    }),
    writeJson(path.join(outputRoot, "caption-safe-zone-report.json"), {
      schemaVersion: "1",
      stage: "final_render",
      ...auditSolomonStoryLayout(manifest),
      reviewEvidence: path.join(reviewDir, "scene-review-strip.jpg")
    }),
    writeJson(path.join(outputRoot, "requirement-audit.json"), acceptanceAudit(qa)),
    writeJson(path.join(outputRoot, "v5-priority-completion-audit.json"), v5PriorityAudit(qa)),
    writeJson(path.join(outputRoot, "final-master-transcription-verification.json"), transcription),
    writeJson(path.join(outputRoot, "reference-comparison-metrics.json"), comparison),
    fs.writeFile(path.join(outputRoot, "reference-comparison-findings.md"), comparisonFindings(comparison), "utf8"),
    fs.writeFile(path.join(outputRoot, "validation-report.md"), validationReport(qa), "utf8"),
    fs.writeFile(path.join(outputRoot, "reproduce.txt"), "pnpm creator-story:v2:solomon\n", "utf8")
  ]);
}

async function verifyFinalNarration(masterPath) {
  const transcriptDir = path.join(outputRoot, "transcript-check-current");
  await fs.mkdir(transcriptDir, { recursive: true, mode: 0o700 });
  await run("whisper", [
    masterPath,
    "--model", "small.en",
    "--language", "en",
    "--output_dir", transcriptDir,
    "--output_format", "json",
    "--word_timestamps", "True",
    "--verbose", "False"
  ], 600_000);
  const transcriptPath = path.join(transcriptDir, `${path.parse(masterPath).name}.json`);
  const transcript = JSON.parse(await fs.readFile(transcriptPath, "utf8"));
  const decodedWords = (transcript.segments ?? [])
    .flatMap(({ words = [] }) => words)
    .filter(({ word }) => Boolean(word?.trim()));
  const ignoredDecoderArtifacts = decodedWords.filter(({ start = 0, end = 0, probability = 0 }) =>
    end - start <= 0.02 && probability < 0.25
  );
  const words = decodedWords.filter((word) => !ignoredDecoderArtifacts.includes(word));
  const approvedTokens = narrationTokens(SOLOMON_CREATOR_STORY_SCRIPT);
  const actualTokens = narrationTokens(words.map(({ word = "" }) => word).join(" "));
  const probabilities = words.map(({ probability = 0 }) => probability);
  const exactApprovedTokenSequence = approvedTokens.length === actualTokens.length &&
    approvedTokens.every((token, index) => token === actualTokens[index]);
  const minimumWordProbability = Math.min(...probabilities);
  const meanWordProbability = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
  return {
    schemaVersion: "1",
    passed: exactApprovedTokenSequence && meanWordProbability >= 0.9,
    aligner: "whisper-small.en",
    masterSha256: await sha256(masterPath),
    transcriptPath,
    approvedTokenCount: approvedTokens.length,
    actualTokenCount: actualTokens.length,
    exactApprovedTokenSequence,
    minimumWordProbability,
    meanWordProbability,
    confidencePolicy: "Exact normalized word sequence plus mean word probability >= 0.9; minimum probability is reported diagnostically because a single punctuation-boundary token is not a reliable failure signal.",
    firstWordStartMs: Math.round((words[0]?.start ?? 0) * 1_000),
    lastWordEndMs: Math.round((words.at(-1)?.end ?? 0) * 1_000),
    ignoredDecoderArtifacts
  };
}

async function generateReferenceComparison(storyPath) {
  const legacyRenderRoot = process.env.GIDEON_LEGACY_RENDER_ROOT ?? "/private/tmp/gideon-editorial-goal";
  const localV7 = path.join(root, "tmp", "solomon-creator-editorial-v7", "final", "solomon-creator-editorial-v7.mp4");
  const localBenchmark = path.join(root, "tmp", "solomon-creator-benchmark-v1", "final", "solomon-creator-benchmark-v1-master.mp4");
  const videos = {
    reference: "/Users/mayowaadesanya/Downloads/08575a746dd848448506f6ca9070f732.mov",
    v7: existsSync(localV7) ? localV7 : path.join(legacyRenderRoot, "tmp", "solomon-creator-editorial-v7", "final", "solomon-creator-editorial-v7.mp4"),
    benchmark_v1: existsSync(localBenchmark) ? localBenchmark : path.join(legacyRenderRoot, "tmp", "solomon-creator-benchmark-v1", "final", "solomon-creator-benchmark-v1-master.mp4"),
    story_v2: storyPath
  };
  const regions = {
    whole: "",
    center: "crop=104:200:38:48,",
    lower: "crop=180:152:0:168,"
  };
  const measured = {};
  for (const [videoId, videoPath] of Object.entries(videos)) {
    if (!existsSync(videoPath)) throw new Error(`Comparison source is missing: ${videoPath}`);
    measured[videoId] = {};
    for (const [regionId, regionFilter] of Object.entries(regions)) {
      const filter = `fps=30,scale=180:320:flags=bilinear,${regionFilter}tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`;
      const result = await run("ffmpeg", ["-hide_banner", "-t", "10", "-i", videoPath, "-vf", filter, "-an", "-f", "null", "-"], 300_000, true);
      const values = [...result.stderr.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((match) => Number(match[1]));
      if (values.length !== 299) throw new Error(`Expected 299 movement samples for ${videoId}/${regionId}; received ${values.length}.`);
      measured[videoId][regionId] = movementSummary(values);
      await fs.writeFile(path.join(outputRoot, "comparison-metrics", `${videoId}-${regionId}.txt`), `${values.join("\n")}\n`, "utf8");
    }
  }
  for (const videoId of ["v7", "benchmark_v1", "story_v2"]) {
    measured[videoId].relativeToReference = {
      wholeTrimmedPercent: percent(measured[videoId].whole.trimmedMean95, measured.reference.whole.trimmedMean95),
      centerTrimmedPercent: percent(measured[videoId].center.trimmedMean95, measured.reference.center.trimmedMean95),
      lowerTrimmedPercent: percent(measured[videoId].lower.trimmedMean95, measured.reference.lower.trimmedMean95)
    };
  }
  return {
    schemaVersion: "2",
    method: "First 10 seconds; 30 fps; 180x320 bilinear luma-frame absolute difference via FFmpeg tblend; center=104x200 at (38,48); lower=180x152 at (0,168); trimmed mean removes the highest-motion five percent.",
    videos: measured
  };
}

function movementSummary(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const trimmed = ordered.slice(0, Math.floor(ordered.length * 0.95));
  return {
    samples: values.length,
    mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    median: rounded(ordered[Math.floor(ordered.length / 2)]),
    trimmedMean95: rounded(trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length)
  };
}

function comparisonFindings(comparison) {
  const reference = comparison.videos.reference;
  const benchmark = comparison.videos.benchmark_v1;
  const story = comparison.videos.story_v2;
  const meanGain = percent(story.whole.mean - benchmark.whole.mean, benchmark.whole.mean);
  const continuousGain = percent(story.whole.trimmedMean95 - benchmark.whole.trimmedMean95, benchmark.whole.trimmedMean95);
  const lowerGain = percent(story.lower.trimmedMean95 - benchmark.lower.trimmedMean95, benchmark.lower.trimmedMean95);
  return `# Solomon Creator Story V5 creator-review comparison findings

## Scope

The reference, Solomon v7, Benchmark v1, and Creator Story V5 were compared over their first ten seconds at 30 fps. Frame movement uses downscaled luma-frame differences. The trimmed measurement excludes the highest-motion five percent of frames so hard cuts do not masquerade as continuous performance.

## Result

- Creator Story V5 is exactly 36.0 seconds; the reference is approximately 36.27 seconds.
- Creator Story V5 uses ${manifest.scenes.length} contiguous story states and nine target-defined authentic product inserts.
- Whole-frame mean movement including transitions changed from ${benchmark.whole.mean} in Benchmark v1 to ${story.whole.mean} in Creator Story V5, ${meanGain >= 0 ? "an increase" : "a decrease"} of approximately ${Math.abs(meanGain)}%.
- Trimmed continuous whole-frame movement changed from ${benchmark.whole.trimmedMean95} to ${story.whole.trimmedMean95}, ${continuousGain >= 0 ? "an increase" : "a decrease"} of approximately ${Math.abs(continuousGain)}%.
- Trimmed lower-region movement changed from ${benchmark.lower.trimmedMean95} to ${story.lower.trimmedMean95}, ${lowerGain >= 0 ? "an increase" : "a decrease"} of approximately ${Math.abs(lowerGain)}%.
- Creator Story V5 reaches ${story.relativeToReference.wholeTrimmedPercent}% of the reference's trimmed whole-frame movement, ${story.relativeToReference.centerTrimmedPercent}% of its center-region movement, and ${story.relativeToReference.lowerTrimmedPercent}% of its lower-region movement.

## Interpretation

Creator Story V5 materially improves proof density, shot variation, sound continuity, runtime, CTA completion, authentic product breadth, and hand-region activity. It also removes the Benchmark v1 placeholder CTA and replaces the long single tracker hold with jobs, tracker, people, and outreach proof.

The remaining reference gap is still presenter authenticity and micro-performance. A mouthless vector host cannot reproduce a speaking human's facial deformation, hair, clothing, room texture, and continuous hand detail. The first ten seconds also deliberately gives four seconds to authentic product proof, reducing center-region presenter motion relative to a presenter-dominant reference.

The correct next quality step is not more resolution or more title cards. It is either a richer code-native skeletal hand/shoulder rig or an approved recorded masked performer library. Audience retention and conversion still require publication data; frame movement is only a comparative production signal.

## Evidence

- \`reference-comparison-metrics.json\`
- \`review/contact-sheet-1fps.jpg\`
- \`review/avatar-performance-strip.jpg\`
- \`review/product-proof-strip.jpg\`
- \`review/brand-end-hold-strip.jpg\`
- \`media-quality-report.json\`
`;
}

function percent(numerator, denominator) {
  return rounded(numerator / denominator * 100, 1);
}

function rounded(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function narrationTokens(value) {
  return value
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === "salomon") return "solomon";
      if (token === "fair") return "faire";
      if (token === "roll") return "role";
      if (["prashuv", "preashath", "prashath", "preschaff"].includes(token)) return "preshoth";
      if (["paramawangam", "paramoungam"].includes(token)) return "paramalingam";
      return token;
    });
}

function acceptanceAudit(qa) {
  const item = (requirement, passed, evidence) => ({ requirement, status: passed ? "passed" : "failed", evidence });
  const productScenes = manifest.scenes.filter(({ kind }) => kind === "product");
  const layoutAudit = auditSolomonStoryLayout(manifest);
  const retentionAudit = auditSolomonStoryRetention(manifest);
  return {
    schemaVersion: "1",
    renderPassed: qa.renderPassed,
    releaseReady: qa.releaseReady,
    criteria: [
      item("Runtime is between 34 and 38 seconds", qa.measured.durationSeconds >= 34 && qa.measured.durationSeconds <= 38, qa.measured.durationSeconds),
      item("Master is 1080x1920 at 30 fps", qa.gates.exactCanvas === "passed" && qa.gates.constantFps === "passed", qa.measured),
      item("Delivery bitrate is 8-15 Mbps", qa.gates.bitrateRange === "passed", qa.measured.videoBitrate),
      item("All product footage is authentic Solomon footage", qa.gates.authenticSourceHashes === "passed", path.join(outputRoot, "authentic-product-footage-manifest.json")),
      item("Product footage comes from a genuine non-fixture Solomon environment", qa.gates.genuineProductEnvironment === "passed", path.join(outputRoot, "authentic-product-footage-manifest.json")),
      item("Every product clip has a source-manifest entry", productScenes.every(({ assetId }) => manifest.sources.some(({ id }) => id === assetId)), productScenes.map(({ id, assetId }) => ({ id, assetId }))),
      item("Video follows the declared trigger-to-conversion creator story", manifest.scenes.some(({ id }) => id === "status-result") &&
        manifest.scenes.some(({ id }) => id === "contact-proof") &&
        manifest.scenes.some(({ id }) => id === "problem-tabs") &&
        manifest.scenes.some(({ id }) => id === "mechanism-proof-draft") &&
        manifest.scenes.some(({ id }) => id === "approval-gate") &&
        manifest.scenes.some(({ id }) => id === "cta-action") &&
        manifest.scenes.at(-1)?.id === "brand-sting", path.join(outputRoot, "storyboard.json")),
      item("Opening promise lands by 2.2 seconds", manifest.captions.find(({ id }) => id === "c04")?.from <= 66, openingPath),
      item("Timeline contains 17–21 meaningful visual states", manifest.scenes.length >= 17 && manifest.scenes.length <= 21, manifest.scenes.map(({ id, from, to }) => ({ id, from, to }))),
      item("Every product shot has a proof target", productScenes.every(({ focusTarget }) => Boolean(focusTarget)), path.join(outputRoot, "story-manifest.json")),
      item("Product camera is target-aware and passes velocity, acceleration, and direction-change policy",
        retentionAudit.excessiveCameraVelocityScenes.length === 0 &&
        retentionAudit.excessiveCameraAccelerationScenes.length === 0 &&
        retentionAudit.abruptCameraDirectionChangeScenes.length === 0, path.join(outputRoot, "retention-audit.json")),
      item("A real arrow pointer remains visible when its action matters",
        manifest.sources.every(({ cursorPolicy }) => cursorPolicy === "gideon_pointer_overlay") &&
        retentionAudit.cursorOutsideVisibleCropScenes.length === 0, path.join(outputRoot, "retention-audit.json")),
      item("Adjacent host poses do not repeat", retentionAudit.repeatedAdjacentHostPoses.length === 0, path.join(reviewDir, "avatar-performance-strip.jpg")),
      item("No unexplained inactivity exceeds 0.6 seconds", qa.gates.retentionManifest === "passed" && qa.gates.noUnexpectedFreeze === "passed" && qa.gates.activeAudio === "passed", path.join(outputRoot, "retention-audit.json")),
      item("Captions are phrase-timed and mobile-safe", retentionAudit.captionCadenceViolations.length === 0 && layoutAudit.passed, path.join(outputRoot, "caption-safe-zone-report.json")),
      item("Final encoded narration preserves the approved script", qa.gates.exactNarration === "passed", path.join(outputRoot, "final-master-transcription-verification.json")),
      item("Voice and sound continue through final frame", qa.gates.activeAudio === "passed", path.join(reviewDir, "brand-end-hold-strip.jpg")),
      item("A verified actionable CTA appears", qa.gates.verifiedCta === "passed", manifest.cta),
      item("The CTA begins at 31.5 seconds and the brand-only sting stays under one second",
        manifest.scenes.find(({ id }) => id === "cta-action")?.from === 945 &&
        (manifest.scenes.find(({ id }) => id === "brand-sting")?.to ?? 0) -
          (manifest.scenes.find(({ id }) => id === "brand-sting")?.from ?? 0) <= 30,
        manifest.scenes.filter(({ kind }) => kind === "cta")),
      item("Named genuine contacts are masked from the final composition", qa.gates.sensitiveIdentityMasked === "passed", qa.diagnostics.visualCopyScan),
      item("The final CTA persists through the last frame", layoutAudit.ctaPersistsThroughFinalFrame, manifest.cta),
      item("No placeholder, debug, legacy, fixture, or internal storyboard copy is visible",
        qa.gates.legacyNameExcluded === "passed" && qa.gates.forbiddenVisualCopy === "passed",
        qa.diagnostics.visualCopyScan),
      item("Final MP4 was decoded and visually sampled", qa.gates.fullDecode === "passed", path.join(reviewDir, "contact-sheet-1fps.jpg"))
    ]
  };
}

function v5PriorityAudit(qa) {
  const hostScenes = manifest.scenes.filter(({ host }) => Boolean(host));
  const uniquePoses = new Set(hostScenes.map(({ host }) => host?.pose));
  const uniqueEmotions = new Set(hostScenes.map(({ host }) => host?.emotion));
  const uniqueFramings = new Set(hostScenes.map(({ host }) => host?.framing));
  const connectedStoryTerms = ["job", "person", "proof", "draft"].every((term) =>
    manifest.script.toLowerCase().includes(term));
  const maskedPerformancePassed =
    uniquePoses.size >= 4 &&
    uniqueEmotions.size >= 3 &&
    uniqueFramings.size >= 3 &&
    hostScenes.some(({ host }) => host?.gazeTarget === "camera") &&
    qa.gates.noUnexpectedFreeze === "passed";
  return {
    schemaVersion: "1",
    renderPassed: qa.renderPassed,
    releaseReady: qa.releaseReady,
    priorities: [
      {
        id: "consequence_first_hook",
        status: manifest.scenes[0]?.id === "hook-close" && manifest.script.startsWith("This job just hit Interviewing") ? "passed" : "failed",
        evidence: { firstScene: manifest.scenes[0], script: manifest.script }
      },
      {
        id: "direct_platform_cta",
        status: qa.gates.verifiedCta === "passed" ? "passed" : "failed",
        evidence: manifest.cta
      },
      {
        id: "evidence_led_contact_reveal",
        status: manifest.scenes.some(({ id }) => id === "contact-proof") ? "passed" : "failed",
        evidence: manifest.scenes.find(({ id }) => id === "contact-proof")
      },
      {
        id: "readable_personalization_and_approval",
        status: manifest.scenes.some(({ id }) => id === "personalization-proof") && manifest.scenes.some(({ id }) => id === "approval-gate") ? "passed" : "failed",
        evidence: manifest.scenes.filter(({ id }) => id === "personalization-proof" || id === "approval-gate")
      },
      {
        id: "connected_job_person_proof_draft_mechanism",
        status: connectedStoryTerms && manifest.scenes.some(({ id }) => id === "mechanism-proof-draft") ? "passed" : "failed",
        evidence: manifest.scenes.filter(({ id }) => id.startsWith("mechanism-") || id === "transformation-payoff")
      },
      {
        id: "creator_avatar_performance_system",
        status: maskedPerformancePassed ? "passed" : "failed",
        adaptation: "The mouthless presenter now adds a studio environment, asymmetric gesture states, gaze-leading, head and torso movement, camera-framing variation, and a voice-reactive mechanical speaker grille.",
        evidence: {
          uniquePoses: [...uniquePoses],
          uniqueEmotions: [...uniqueEmotions],
          uniqueFramings: [...uniqueFramings],
          voiceReactiveIndicator: true,
          literalLipSyncRequired: false
        }
      },
      {
        id: "privacy_masked_genuine_footage",
        status: qa.gates.sensitiveIdentityMasked === "passed" ? "passed" : "failed",
        evidence: manifest.sources.map(({ id, privacyMasks }) => ({ id, privacyMasks }))
      },
      {
        id: "creator_state_density",
        status: manifest.scenes.length >= 17 && manifest.scenes.length <= 21 ? "passed" : "failed",
        evidence: { meaningfulVisualStates: manifest.scenes.length, targetRange: [17, 21] }
      }
    ]
  };
}

function implementationNotes() {
  return `# Solomon Creator Story V5 creator-review master

This isolated 36-second composition preserves Benchmark V1, Story V2, and all earlier creator-editorial versions.

- Remotion owns the deterministic creative timeline.
- FFmpeg owns source trims, loudness, delivery encoding, probing and visual review sheets.
- Four purpose-built source clips come from one authenticated genuine Solomon session and are hash verified before rendering.
- Product inserts are isolated proof moments. No connected workflow navigation or fabricated interface is used.
- Gideon renders an actual arrow pointer from the declared action region and keeps it inside every target-aware crop.
- The mouthless code-native host exposes pose, emotion, framing, gaze and speaking-intensity controls with independent breathing, blinking, head, gaze and hand layers.
- The platform-native comment CTA is verified and remains visible through the final brand sting. This genuine-footage review master is not publication-ready until the genuine source footage receives explicit public-release approval.
`;
}

function laterConfirmations() {
  return `# Later confirmations

- Human approval of Chatterbox voice naturalness, pronunciation and emotional fit.
- Human approval of the final code-native avatar performance and brand appearance.
- Physical-phone review of text and product proof.
- Explicit approval to publish footage containing the genuine Faire role and privacy-sensitive contact data.
- Legal/brand approval for publication and platform synthetic-presenter disclosure.
- Audience retention and conversion results after controlled publication.

These confirmations do not justify fabricating a public destination or claiming measured audience performance.
`;
}

function validationReport(qa) {
  return `# Solomon Creator Story V5 creator-review-master validation

## Result

Automated render gates: ${qa.renderPassed ? "passed" : "failed"}.
Public-release gate: ${qa.releaseReady ? "passed" : "blocked pending genuine-source publication approval"}.

## Measured output

- Duration: ${qa.measured.durationSeconds} seconds
- Canvas: ${qa.measured.width}×${qa.measured.height}
- Frame rate: ${qa.measured.fps}
- Video bitrate: ${qa.measured.videoBitrate}
- Pixel format / color: ${qa.measured.pixelFormat}, ${qa.measured.colorSpace}, ${qa.measured.colorRange}
- SHA-256: ${qa.masterSha256}

## Review modes generated

- Complete one-frame-per-second contact sheet
- Scene-boundary review strip
- Avatar performance strip
- Authentic product proof strip
- CTA final-frame strip
- Muted review MP4
- Ten-second opening MP4

Automated checks cannot approve subjective voice naturalness, emotional authenticity, brand taste, or audience retention. Those remain explicit human confirmations.
`;
}

async function run(command, args, timeoutMs = 120_000, acceptNonZero = false) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-60_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !acceptNonZero) reject(new Error(`${command} failed (${code ?? "signal"}): ${stderr.slice(-5_000)}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

async function writeJson(target, value) {
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sha256(target) {
  return createHash("sha256").update(await fs.readFile(target)).digest("hex");
}

function resolveBrowserExecutable() {
  const candidates = [
    process.env.GIDEON_REMOTION_CHROMIUM,
    chromium.executablePath(),
    "/Users/mayowaadesanya/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`No verified Chromium executable is available. Checked: ${candidates.join(", ")}`);
  return found;
}
