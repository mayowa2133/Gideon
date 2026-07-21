import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createDefaultProfile, createMoments, generateConcepts, generateScripts } from "../shared/contentEngine";
import { createAvatarWorker, loadAvatarWorkerConfig } from "./avatarWorker";
import { probeRecording, renderDraft } from "./media";
import { extractEnergyVisemes, readPcmWavDurationMs } from "./visemeCues";

const execFileAsync = promisify(execFile);
const ffmpeg = process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
const ffprobe = process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe";
const say = "/usr/bin/say";

async function main(): Promise<void> {
  const root = path.resolve(process.cwd(), "tmp", "viseme2d-canary");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(root, "frames"), { recursive: true });

  const sourcePath = path.join(root, "product-fixture.mp4");
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
    "-t", "16", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath
  ]);
  const recording = await probeRecording(sourcePath);
  const profile = {
    ...createDefaultProfile(),
    productName: "Gideon Local Avatar",
    targetCustomer: "product teams creating private demo videos",
    productDescription: "Creates short product walkthrough videos with a private local animated presenter.",
    preferredTone: "direct" as const,
    walkthroughNotes: "Show the product fixture while the local presenter explains the private workflow.",
    defaultTemplateKey: "brand_presenter" as const,
    brandPresenterEnabled: true,
    avatarPresenterId: "orbit" as const,
    avatarPresenterMode: "local_animated" as const
  };
  let sequence = 0;
  const id = (prefix: string): string => `canary-${prefix}-${++sequence}`;
  const moments = createMoments(profile, recording, () => id("moment"));
  const concepts = generateConcepts(profile, moments, () => id("concept"));
  const [generatedScript] = generateScripts(profile, concepts, moments, () => id("script"), () => "2026-07-20T00:00:00.000Z");
  if (!generatedScript) throw new Error("Canary could not create a fixture script.");
  const narrationText = "This local presenter runs privately on your Mac. The mouth follows this narration, then returns to rest, with no API, no GPU, and no per video fee.";
  const script = { ...generatedScript, voiceover: narrationText, approved: true };

  const aiffPath = path.join(root, "narration.aiff");
  const wavPath = path.join(root, "narration.wav");
  await run(say, ["-v", "Samantha", "-r", "185", "-o", aiffPath, narrationText]);
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", aiffPath,
    "-af", "adelay=600,apad=pad_dur=0.8", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", wavPath
  ]);
  const durationMs = await readPcmWavDurationMs(wavPath);
  const cueManifest = await extractEnergyVisemes(wavPath);
  const activeCue = cueManifest.cues.find((cue) => cue.mouth !== "X");
  const blink = cueManifest.blinks[0];
  if (!activeCue || !blink) throw new Error("Canary narration did not produce active speech and blink cues.");
  const sampleTimes = {
    rest: 0.2,
    speech: (activeCue.startMs + activeCue.endMs) / 2_000,
    blink: (blink.startMs + blink.endMs) / 2_000
  };

  const worker = createAvatarWorker(loadAvatarWorkerConfig({
    GIDEON_FFMPEG_PATH: ffmpeg,
    GIDEON_FFPROBE_PATH: ffprobe
  }));
  const results: Record<string, unknown> = {};
  for (const avatarId of ["orbit", "nova"] as const) {
    const outputPath = path.join(root, `${avatarId}.mp4`);
    const result = await worker.render({
      avatarId,
      audioPath: wavPath,
      outputPath,
      durationMs,
      disclosure: "AI-generated brand presenter",
      consent: { assetType: "fictional_catalog", status: "not_required" }
    });
    const probe = await probeJson(outputPath);
    await fs.writeFile(path.join(root, `${avatarId}-ffprobe.json`), `${JSON.stringify(probe, null, 2)}\n`);
    for (const [state, seconds] of Object.entries(sampleTimes)) {
      await extractFrame(outputPath, seconds, path.join(root, "frames", `${avatarId}-${state}.png`));
    }
    results[avatarId] = { receipt: result.receipt, performance: result.performance, probe };
  }

  const finalProfile = { ...profile, avatarPresenterId: "orbit" as const };
  process.env.GIDEON_DISABLE_SAY = "1";
  const finalRender = await renderDraft({
    projectId: "viseme2d-canary",
    projectDir: root,
    profile: finalProfile,
    recording,
    script,
    moment: moments[0],
    title: "Private local presenter",
    voiceoverPath: wavPath,
    avatarPresenter: {
      path: path.join(root, "orbit.mp4"),
      provider: "viseme2d",
      backgroundType: "green_screen",
      cropSafeRegion: { x: 0.08, y: 0.02, width: 0.84, height: 0.98 }
    },
    skipPostRenderQa: true
  });
  delete process.env.GIDEON_DISABLE_SAY;
  const finalProbe = await probeJson(finalRender.outputPath);
  await fs.writeFile(path.join(root, "final-ffprobe.json"), `${JSON.stringify(finalProbe, null, 2)}\n`);
  await extractFrame(finalRender.outputPath, sampleTimes.speech, path.join(root, "frames", "final-speech.png"));
  await extractFrame(finalRender.outputPath, Math.min(durationMs / 1_000 - 0.4, 4), path.join(root, "frames", "final-layout.png"));

  const report = {
    generatedAt: new Date().toISOString(),
    outputRoot: "tmp/viseme2d-canary",
    narration: { durationMs, cueEngine: cueManifest.engine, cueCount: cueManifest.cues.length, blinkCount: cueManifest.blinks.length },
    sampleTimes,
    avatars: results,
    finalRender: { validation: finalRender.validation, probe: finalProbe }
  };
  await fs.writeFile(path.join(root, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, outputRoot: report.outputRoot, durationMs, sampleTimes }, null, 2)}\n`);
}

async function run(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
}

async function probeJson(filePath: string): Promise<unknown> {
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error", "-show_entries", "stream=index,codec_type,codec_name,width,height,r_frame_rate,duration:format=duration,size",
    "-of", "json", filePath
  ]);
  return JSON.parse(stdout);
}

async function extractFrame(inputPath: string, seconds: number, outputPath: string): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", seconds.toFixed(3), "-i", inputPath,
    "-frames:v", "1", "-update", "1", outputPath
  ]);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
