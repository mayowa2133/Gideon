import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { ChatterboxNarrationProvider } from "./chatterboxNarrationProvider";
import { MacOsSayNarrationProvider } from "./macOsSayNarrationProvider";
import { NarrationProviderChain } from "./narrationProviderChain";
import { renderSolomonNarrationBed, solomonMaskedPresenterPilotBeats } from "./solomonMaskedPresenterPilot";

const DURATION_MS = 43_000;

async function run(): Promise<void> {
  const root = process.cwd();
  const baselineDir = path.resolve(process.env.GIDEON_SOLOMON_BASELINE_DIR ?? path.join(root, "tmp", "solomon-masked-presenter-v1"));
  const outputDir = path.resolve(process.env.GIDEON_SOLOMON_CHATTERBOX_DIR ?? path.join(root, "tmp", "solomon-masked-presenter-chatterbox-v1"));
  const ffmpeg = process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
  const ffprobe = process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe";
  const silentVideo = path.join(baselineDir, "solomon-masked-presenter-silent.mp4");
  const baselineMaster = path.join(baselineDir, "final", "solomon-masked-presenter-v1.mp4");
  const baselineNarration = path.join(baselineDir, "narration", "solomon-narration-bed.wav");
  await Promise.all([assertPrivateFile(silentVideo), assertPrivateFile(baselineMaster), assertPrivateFile(baselineNarration)]);
  await fs.mkdir(path.join(outputDir, "final"), { recursive: true, mode: 0o700 });

  const provider = new NarrationProviderChain(new ChatterboxNarrationProvider(), new MacOsSayNarrationProvider());
  const narration = await renderSolomonNarrationBed({
    outputDir,
    beats: solomonMaskedPresenterPilotBeats(),
    say: "/usr/bin/say",
    ffmpeg,
    ffprobe,
    provider,
    seed: 71623
  });
  const masterPath = path.join(outputDir, "final", "solomon-masked-presenter-chatterbox-v1.mp4");
  const socialPath = path.join(outputDir, "final", "solomon-masked-presenter-chatterbox-v1-social.mp4");
  await command(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", silentVideo, "-i", narration.audioPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-t", (DURATION_MS / 1_000).toFixed(3), "-movflags", "+faststart", masterPath
  ], 300_000);
  await command(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-vf", "scale=720:1280:flags=lanczos", "-r", "30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", socialPath
  ], 300_000);

  const [masterProbe, socialProbe, baselineHash, masterHash] = await Promise.all([
    probe(ffprobe, masterPath),
    probe(ffprobe, socialPath),
    hashFile(baselineMaster),
    hashFile(masterPath)
  ]);
  await Promise.all([
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", masterPath, "-f", "null", "-"], 300_000),
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", socialPath, "-f", "null", "-"], 300_000)
  ]);
  const reviewDir = path.join(outputDir, "review");
  await fs.mkdir(reviewDir, { recursive: true, mode: 0o700 });
  const contactSheetPath = path.join(reviewDir, "contact-sheet.jpg");
  const audioSpectrumPath = path.join(reviewDir, "audio-spectrum.png");
  await Promise.all([
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", masterPath, "-vf", "fps=1/5,scale=270:480,tile=3x3:padding=4:margin=4", "-frames:v", "1", contactSheetPath], 180_000),
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", narration.audioPath, "-lavfi", "showspectrumpic=s=1600x900:legend=1:color=intensity", audioSpectrumPath], 180_000)
  ]);
  const loudness = await capture(ffmpeg, ["-hide_banner", "-nostats", "-i", masterPath, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-vn", "-f", "null", "-"], 180_000);
  const silence = await capture(ffmpeg, ["-hide_banner", "-nostats", "-i", masterPath, "-af", "silencedetect=n=-45dB:d=2.5", "-vn", "-f", "null", "-"], 180_000);
  const loudnessMetrics = parseLastJson(loudness.stderr) as Record<string, string> | undefined;
  const comparisonDir = path.join(outputDir, "comparison");
  await fs.mkdir(comparisonDir, { recursive: true, mode: 0o700 });
  const samanthaWav = path.join(comparisonDir, "a-samantha.wav");
  const chatterboxWav = path.join(comparisonDir, "b-chatterbox.wav");
  const abWav = path.join(comparisonDir, "solomon-samantha-vs-chatterbox-ab.wav");
  await Promise.all([
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", baselineNarration, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", samanthaWav], 180_000),
    command(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", narration.audioPath, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", chatterboxWav], 180_000)
  ]);
  await command(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", samanthaWav,
    "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-i", chatterboxWav, "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
    "-map", "[a]", "-ar", "48000", "-c:a", "pcm_s16le", abWav
  ], 180_000);
  const [samanthaProbe, chatterboxProbe, samanthaLoudness, chatterboxLoudness] = await Promise.all([
    probe(ffprobe, samanthaWav),
    probe(ffprobe, chatterboxWav),
    capture(ffmpeg, ["-hide_banner", "-nostats", "-i", samanthaWav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-"], 180_000),
    capture(ffmpeg, ["-hide_banner", "-nostats", "-i", chatterboxWav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-"], 180_000)
  ]);
  const failedChecks = [
    Math.abs(masterProbe.durationMs - DURATION_MS) <= 100 ? undefined : "master_duration",
    masterProbe.width === 1080 && masterProbe.height === 1920 && masterProbe.videoCodec === "h264" && masterProbe.audioCodec === "aac" ? undefined : "master_format",
    socialProbe.width === 720 && socialProbe.height === 1280 && socialProbe.videoCodec === "h264" && socialProbe.audioCodec === "aac" ? undefined : "social_format",
    narration.result?.provider === "chatterbox_local" ? undefined : "chatterbox_not_used",
    narration.result?.provenance.watermark === "perth" ? undefined : "watermark_not_recorded",
    narration.result?.beats.every((beat) => beat.tempo <= 1.08) ? undefined : "unnatural_tempo",
    [...silence.stderr.matchAll(/silence_duration:\s*([0-9.]+)/g)].every((match) => Number(match[1]) <= 5.2) ? undefined : "unexpected_long_silence",
    Number(loudnessMetrics?.input_tp) <= -1 ? undefined : "unsafe_true_peak"
  ].filter((value): value is string => Boolean(value));
  const report = {
    schemaVersion: "1",
    pilotVersion: "solomon-masked-presenter-chatterbox-v1",
    status: failedChecks.length === 0 ? "automated_checks_passed_manual_publication_review_required" : "failed",
    failedChecks,
    authenticVisualLineage: {
      reusedBaselineSilentVideo: silentVideo,
      baselinePilotReport: path.join(baselineDir, "pilot-report.json"),
      productProvenance: path.join(baselineDir, "product-provenance.json"),
      presenterProvenance: path.join(baselineDir, "presenter-provenance.json"),
      reusedVisualReviewArtifacts: {
        denseTimeline: path.join(baselineDir, "dense-timeline-review.jpg"),
        phoneReview: path.join(baselineDir, "phone-size-muted-review.jpg"),
        productCursorStrip: path.join(baselineDir, "product-action-cursor-strip.jpg"),
        presenterGestureStrip: path.join(baselineDir, "presenter-gesture-strip.jpg"),
        presenterIdleStrip: path.join(baselineDir, "presenter-idle-motion-strip.jpg"),
        cameraMotionStrip: path.join(baselineDir, "camera-motion-strip.jpg")
      }
    },
    comparison: {
      baseline: { provider: "macos_say", path: baselineMaster, sha256: baselineHash },
      candidate: { provider: narration.result?.provider, path: masterPath, sha256: masterHash },
      sameVisualSource: true,
      approvedScriptChanged: false,
      audio: {
        aSamanthaPath: samanthaWav,
        bChatterboxPath: chatterboxWav,
        concatenatedAbPath: abWav,
        labels: [
          { label: "A — macOS Samantha", startMs: 0, endMs: samanthaProbe.durationMs },
          { label: "B — Chatterbox", startMs: samanthaProbe.durationMs + 1_000, endMs: samanthaProbe.durationMs + 1_000 + chatterboxProbe.durationMs }
        ],
        durationTable: {
          samanthaMs: samanthaProbe.durationMs,
          chatterboxMs: chatterboxProbe.durationMs
        },
        loudnessTable: {
          samantha: parseLastJson(samanthaLoudness.stderr),
          chatterbox: parseLastJson(chatterboxLoudness.stderr)
        },
        generationTimeTable: {
          samantha: "not_recorded_for_legacy_baseline",
          chatterboxBeatSeconds: narration.result?.beats.map((beat) => ({ beatId: beat.id, seconds: beat.generationSeconds }))
        }
      }
    },
    narration: narration.result,
    outputs: { masterPath, socialPath, narrationManifestPath: narration.manifestPath, contactSheetPath, audioSpectrumPath },
    media: { master: masterProbe, social: socialProbe },
    audioQa: {
      loudness: loudnessMetrics,
      clippingDetected: !(Number(loudnessMetrics?.input_tp) <= -1),
      silenceDurationsSeconds: [...silence.stderr.matchAll(/silence_duration:\s*([0-9.]+)/g)].map((match) => Number(match[1]))
    },
    manualReviewRequired: ["naturalness", "pronunciation", "pacing", "audio_artifacts", "claim_accuracy", "voice_suitability", "publication_approval"]
  };
  const reportPath = path.join(outputDir, "pilot-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(path.join(outputDir, "manual-review.md"), `# Solomon Chatterbox pilot review

Automated status: **${report.status}**

- Baseline (Samantha): \`${baselineMaster}\`
- Candidate (Chatterbox): \`${masterPath}\`
- Social candidate: \`${socialPath}\`
- A/B audio (A Samantha, one-second gap, B Chatterbox): \`${abWav}\`
- Contact sheet: \`${contactSheetPath}\`
- Audio spectrum: \`${audioSpectrumPath}\`

The comparison uses the same authentic Solomon visual source and unchanged approved script. Review both complete videos with headphones before publication.

- [ ] Naturalness and emotional appropriateness
- [ ] Solomon and product-language pronunciation
- [ ] Beat pacing and caption alignment
- [ ] Clicks, distortion, metallic artifacts, or abrupt cuts
- [ ] Claims and authentic product evidence
- [ ] Model-default voice suitability
- [ ] Final publication approval
`, { mode: 0o600 });
  if (failedChecks.length > 0) throw new Error(`Chatterbox pilot failed: ${failedChecks.join(", ")}.`);
  process.stdout.write(`${JSON.stringify({ ok: true, reportPath, masterPath, socialPath, provider: narration.result?.provider }, null, 2)}\n`);
}

async function assertPrivateFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 1_000) throw new Error(`Required private pilot artifact is unusable: ${filePath}`);
}

async function command(executable: string, args: string[], timeoutMs: number): Promise<void> {
  const result = await execute(executable, args, timeoutMs);
  if (result.code !== 0) throw new Error(`${path.basename(executable)} failed: ${result.stderr.slice(-2_000)}`);
}

async function capture(executable: string, args: string[], timeoutMs: number) {
  return execute(executable, args, timeoutMs);
}

function execute(executable: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
  });
}

async function probe(ffprobe: string, filePath: string): Promise<{ durationMs: number; width?: number; height?: number; videoCodec?: string; audioCodec?: string }> {
  const result = await execute(ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", filePath], 60_000);
  if (result.code !== 0) throw new Error(`FFprobe failed for ${filePath}.`);
  const parsed = JSON.parse(result.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  return { durationMs: Math.round(Number(parsed.format?.duration) * 1_000), width: video?.width, height: video?.height, videoCodec: video?.codec_name, audioCodec: audio?.codec_name };
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath).on("data", (chunk) => hash.update(chunk)).once("error", reject).once("end", () => resolve(hash.digest("hex")));
  });
}

function parseLastJson(value: string): unknown {
  const matches = value.match(/\{[^{}]*\}/gs) ?? [];
  for (const candidate of matches.reverse()) {
    try { return JSON.parse(candidate); } catch { /* continue */ }
  }
  return undefined;
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Solomon Chatterbox pilot failed."}\n`);
  process.exitCode = 1;
});
