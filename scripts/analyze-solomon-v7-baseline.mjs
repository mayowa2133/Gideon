import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "tmp", "solomon-creator-story-v7-robot", "baseline");
const v6Root = path.join(root, "tmp", "solomon-creator-story-v6-robot");
const videos = {
  v6: path.join(v6Root, "final", "solomon-creator-story-v6-robot-master-NOT-FOR-PUBLICATION.mp4"),
  referenceA: "/Users/mayowaadesanya/Downloads/20cabc243fa4477ba6a6b18d608680df.mov",
  referenceB: "/Users/mayowaadesanya/Downloads/08575a746dd848448506f6ca9070f732.mov",
  referenceC: "/Users/mayowaadesanya/Downloads/f785b5de067a45ccbab8f0627a3fae3f.mov"
};

await fs.mkdir(output, { recursive: true, mode: 0o700 });
for (const [id, target] of Object.entries(videos)) if (!existsSync(target)) throw new Error(`Baseline source ${id} is missing: ${target}`);

const measurements = {};
for (const [id, target] of Object.entries(videos)) measurements[id] = await measure(target);
const v6Retention = JSON.parse(await fs.readFile(path.join(v6Root, "retention-audit.json"), "utf8"));
const previousComparison = JSON.parse(await fs.readFile(path.join(v6Root, "reference-comparison-metrics.json"), "utf8"));
measurements.v6.productOccupancy = v6Retention.productOccupancy;
measurements.v6.words = v6Retention.words;
measurements.v6.wordsPerMinute = v6Retention.wordsPerMinute;
measurements.v6.firstTenSecondMotion = previousComparison.videos.story_v6_robot;

await writeJson("v6-measurements.json", {
  schemaVersion: "1",
  sourcePath: videos.v6,
  sourceSha256: await sha256(videos.v6),
  measuredAt: new Date().toISOString(),
  ...measurements.v6,
  publicCopyFinding: "The V6 CTA and brand sting market Gideon; V7 must market Solomon only.",
  authority: "Direct measurements of the final 36-second V6 master plus its exact manifest audit."
});
await writeJson("reference-fingerprint.json", {
  schemaVersion: "1",
  method: "Direct ffprobe metadata, full-duration scene-cut and freeze scans, EBU R128 loudness, and the existing repeatable first-ten-second luma motion measurement.",
  references: Object.fromEntries(["referenceA", "referenceB", "referenceC"].map((id) => [id, { path: videos[id], ...measurements[id], firstTenSecondMotion: previousComparison.videos[{ referenceA: "reference_a", referenceB: "reference_b", referenceC: "reference_c" }[id]] }]))
});
await fs.writeFile(path.join(output, "findings-reconciliation.md"), `# V6 and reference finding reconciliation

## Authoritative measurements

- The final V6 master is ${measurements.v6.durationSeconds.toFixed(2)} seconds with ${v6Retention.words} approved narration words, or ${v6Retention.wordsPerMinute.toFixed(2)} WPM.
- Final-master loudness measures ${measurements.v6.loudness.integratedLufs} LUFS with ${measurements.v6.loudness.loudnessRange} LU LRA and ${measurements.v6.loudness.truePeakDbtp} dBTP.
- V6 product occupancy is ${(v6Retention.productOccupancy * 100).toFixed(2)}% from the contiguous frame manifest.
- The final V6 master has ${measurements.v6.freezeIntervals.length} detected freeze intervals of at least 0.60 seconds.
- Its first-ten-second trimmed luma motion reaches ${previousComparison.videos.story_v6_robot.relativeToReferenceMean.wholeTrimmedPercent}% of the three-reference whole-frame mean, ${previousComparison.videos.story_v6_robot.relativeToReferenceMean.centerTrimmedPercent}% in the center, and ${previousComparison.videos.story_v6_robot.relativeToReferenceMean.lowerTrimmedPercent}% in the lower region.

## Reconciliation

Earlier narrative reviews that described roughly 198 WPM or about -14.5 LUFS were either estimates, measurements of an earlier render, or used a different sampling method. The exact approved token count divided by the final 36.00-second runtime is authoritative for editorial density; the direct EBU R128 scan of the final encoded master is authoritative for loudness. Claims of long static holds are not supported by the final encoded V6 freeze scan, but the very low trimmed center/lower motion confirms the underlying critique: the robot's continuous micro-performance is much less active than the references even when frames are not literally frozen.

## V7 decisions

- Keep the 36-second reference-class runtime and raise approved narration density to 210–230 WPM.
- Prove both hook atoms—status changed and relevant person surfaced—within the opening 2.2 seconds.
- Use Solomon as the only public-facing brand. Gideon remains internal render provenance.
- Replace category-card workflow summaries with readable, isolated, authentic Solomon proof moments and presenter resets.
- Preserve truthful platform-save CTA wording because no Solomon URL, handle, comment-delivery system, or publishing automation is verified in the repository.
`, "utf8");
process.stdout.write(`${JSON.stringify({ output, videos: Object.keys(videos) }, null, 2)}\n`);

async function measure(target) {
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", target])).stdout);
  const video = probe.streams.find(({ codec_type }) => codec_type === "video");
  const audio = probe.streams.find(({ codec_type }) => codec_type === "audio");
  const loud = await run("ffmpeg", ["-hide_banner", "-i", target, "-af", "loudnorm=I=-14:LRA=3:TP=-1:print_format=json", "-vn", "-f", "null", "-"], true);
  const freeze = await run("ffmpeg", ["-hide_banner", "-i", target, "-vf", "freezedetect=n=0.001:d=0.6", "-an", "-f", "null", "-"], true);
  const cuts = await run("ffmpeg", ["-hide_banner", "-i", target, "-vf", "select='gt(scene,0.22)',showinfo", "-an", "-f", "null", "-"], true);
  const loudJson = [...loud.stderr.matchAll(/\{[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/g)].at(-1)?.[0];
  const parsedLoud = loudJson ? JSON.parse(loudJson) : {};
  const freezeStarts = [...freeze.stderr.matchAll(/freeze_start:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const freezeEnds = [...freeze.stderr.matchAll(/freeze_end:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  const cutTimes = [...cuts.stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
  return {
    sha256: await sha256(target), durationSeconds: Number(video?.duration ?? probe.format.duration), width: video?.width, height: video?.height,
    frameRate: video?.avg_frame_rate, frameCount: Number(video?.nb_frames ?? 0), audioSampleRate: Number(audio?.sample_rate ?? 0),
    sceneCuts: cutTimes, meanShotDurationSeconds: cutTimes.length ? Number((Number(probe.format.duration) / (cutTimes.length + 1)).toFixed(3)) : Number(probe.format.duration),
    freezeIntervals: freezeStarts.map((start, index) => ({ start, end: freezeEnds[index] ?? null })),
    loudness: { integratedLufs: Number(parsedLoud.input_i), loudnessRange: Number(parsedLoud.input_lra), truePeakDbtp: Number(parsedLoud.input_tp) }
  };
}
async function run(command, args, acceptNonZero = false) { return await new Promise((resolve, reject) => { const child=spawn(command,args,{cwd:root,shell:false,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.setEncoding("utf8").on("data",c=>stdout+=c);child.stderr.setEncoding("utf8").on("data",c=>stderr=`${stderr}${c}`.slice(-200000));child.once("error",reject);child.once("close",code=>code!==0&&!acceptNonZero?reject(new Error(`${command} failed: ${stderr.slice(-3000)}`)):resolve({stdout,stderr})); }); }
async function writeJson(name, value) { await fs.writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function sha256(target) { return createHash("sha256").update(await fs.readFile(target)).digest("hex"); }
