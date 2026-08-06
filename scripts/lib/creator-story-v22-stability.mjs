import { spawn } from "node:child_process";

// Per-pixel temporal stability of held regions, measured on the encoded master.
//
// READ BEFORE CHANGING THE DECODE SETTINGS.
//
// This library decodes at FULL resolution and FULL frame rate, and that is the
// entire point of it. Its sibling, creator-story-v22-motion.mjs, decodes at
// 180x320 and 5 fps — a 36x spatial and 6x temporal decimation — which is
// exactly why no gate through V20 could see the defect V22 exists to fix. The
// mascot rig and EditorialCamera were both moving content by fractions of a
// pixel on every frame; averaged into 1/36th of the pixels and 1/6th of the
// frames, that churn disappears before the metric is computed. Worse, whatever
// survived registered as motion, so medianFrameChange and nearStaticFramePercent
// were rewarding it.
//
// Do not "optimise" this by adding a scale filter or dropping the frame rate.
// Windows are short (12 frames) and cropped, so a full-res decode of one window
// is roughly 25 MB — cheap enough that there is nothing to optimise.
const DEFAULT_WINDOW_FRAMES = 12;

export async function measureV22HeldStability(target, { width = 1080, height = 1920, windows = [], regions = [], windowFrames = DEFAULT_WINDOW_FRAMES } = {}) {
  const samples = [];
  for (const window of windows) {
    const from = window.fromFrame, to = from + windowFrames - 1;
    const decoded = await decodeGrayRange(target, from, to, width, height);
    const frameBytes = width * height;
    const frames = [];
    for (let offset = 0; offset + frameBytes <= decoded.length; offset += frameBytes) frames.push(decoded.subarray(offset, offset + frameBytes));
    if (frames.length < 2) throw new Error(`V22 stability decode returned ${frames.length} frames for window ${window.id}`);
    samples.push({
      id: window.id,
      fromFrame: from,
      toFrame: to,
      decodedFrames: frames.length,
      // Per-window regions so the mascot box can follow the scene's declared
      // rect; falls back to the shared list for whole-film regions.
      regions: (window.regions ?? regions).map((region) => ({ id: region.id, role: region.role, ...temporalStability(frames, region, width) })),
    });
  }
  return {
    schemaVersion: "1",
    method: `Per-pixel temporal standard deviation over ${windowFrames} consecutive frames decoded from the exact encoded master at full ${width}x${height} resolution and full frame rate. Deliberately not the 180x320/5fps motion path, which averages sub-pixel churn away.`,
    windowFrames,
    samples,
  };
}

// Two numbers per region.
//
// `meanTemporalStdDev` is the diagnostic: how much the region churns overall.
//
// `identicalPairFraction` is what the gate uses, and it is the one that actually
// discriminates. Sub-pixel drift makes EVERY adjacent frame pair differ slightly
// — it never produces an identical pair. Whole-pixel quantization makes most
// pairs bit-identical and concentrates the change into occasional steps. So the
// question "is this drifting or stepping?" is answered by the *count* of
// identical pairs, not by the size of the average difference, and it answers
// cleanly even when the absolute deltas are small.
function temporalStability(frames, region, width) {
  const x0 = Math.max(0, Math.round(region.x)), y0 = Math.max(0, Math.round(region.y));
  const x1 = Math.round(region.x + region.width), y1 = Math.round(region.y + region.height);
  let sum = 0, count = 0, worst = 0, luma = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      let mean = 0;
      for (const frame of frames) mean += frame[row + x];
      mean /= frames.length;
      let variance = 0;
      for (const frame of frames) { const delta = frame[row + x] - mean; variance += delta * delta; }
      const deviation = Math.sqrt(variance / frames.length);
      sum += deviation; count += 1; luma += mean;
      if (deviation > worst) worst = deviation;
    }
  }
  let identicalPairs = 0;
  for (let index = 1; index < frames.length; index += 1) {
    let identical = true;
    for (let y = y0; y < y1 && identical; y += 1) {
      const row = y * width;
      for (let x = x0; x < x1; x += 1) if (frames[index][row + x] !== frames[index - 1][row + x]) { identical = false; break; }
    }
    if (identical) identicalPairs += 1;
  }
  return {
    meanTemporalStdDev: sum / Math.max(1, count),
    worstPixelStdDev: worst,
    meanLuma: luma / Math.max(1, count),
    pixels: count,
    identicalPairFraction: identicalPairs / Math.max(1, frames.length - 1),
  };
}

// What is gated, and what is only reported. Both boundaries were moved by
// measurement, not by preference, so the reasoning is recorded here.
//
// A first cut gated the mascot box and the headline band on "near-still". The
// first V22 measurement rejected that: the `five` scene scored 44.3 on the
// headline band because that scene runs a kinetic headline, and the mascot box
// moves whenever the character gestures. Those are the film working as designed.
// A gate that fails on intentional animation is not a stability gate — the only
// way to satisfy it would be to make the film worse.
//
// A second cut gated the crown of the mascot's head shell, a patch no face,
// mouth, blink, hand, or antenna can reach, so it moves only if the rig transform
// moves. That found a real bug — the gesture lean, scaled by limbCurve, was still
// sliding the whole rig sub-pixel — but it could not survive as a gate either.
// Reading the manifest afterwards showed why: limb spans cover nearly every frame
// of every scene (cta is L[5-71] R[8-82] out of 96), so the mascot is almost never
// in a held state at all. There is no quiet pixel window to measure, and a pixel
// difference cannot distinguish a legitimate whole-pixel step from a sub-pixel
// drift — only the transform string can.
//
// So the rig's whole-pixel invariant is locked by HeldStability.test.tsx, which
// asserts it exactly, in both the held and mid-gesture cases, and is verified to
// reject V20 (24 distinct wrapper transforms across 24 frames, against V22's 1).
// That is a stronger instrument than any threshold here, and it needs no render.
//
// What this file gates is what it can assert soundly end-to-end through the
// encoder: the `control` regions — backdrop patches that no scene draws into.
// If the camera drifts, they drift, because the camera transforms the whole
// frame. Four are supplied and the quietest wins, since which corner is clear
// varies by shot. Everything else is carried as `observed` diagnostics, which is
// how the lean bug surfaced in the first place.

export const V22_STABILITY = { minIdenticalPairFraction: .6, controlChurnCeiling: .25 };

export function evaluateV22HeldStability(report, bands = V22_STABILITY) {
  const checks = [];
  for (const sample of report.samples) {
    const controls = sample.regions.filter(({ role }) => role === "control");
    const rigs = sample.regions.filter(({ role }) => role === "rig");
    if (controls.length === 0) { checks.push({ window: sample.id, region: "control", failure: "control_region_missing", passed: false }); continue; }
    // Quietest control wins: a corner occupied by scene content in one shot is
    // not evidence that the camera moved.
    const control = controls.reduce((best, current) => current.identicalPairFraction > best.identicalPairFraction ? current : best);
    checks.push({ window: sample.id, region: control.id, role: "control", metric: "identicalPairFraction", value: control.identicalPairFraction, limit: bands.minIdenticalPairFraction, passed: control.identicalPairFraction >= bands.minIdenticalPairFraction });
    for (const rig of rigs) {
      checks.push({ window: sample.id, region: rig.id, role: "rig", metric: "identicalPairFraction", value: rig.identicalPairFraction, limit: bands.minIdenticalPairFraction, passed: rig.identicalPairFraction >= bands.minIdenticalPairFraction });
    }
  }
  return { passed: checks.every(({ passed }) => passed), checks };
}

async function decodeGrayRange(target, from, to, width, height) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", target, "-vf", `select='between(n\\,${from}\\,${to})',format=gray`, "-vsync", "0", "-f", "rawvideo", "pipe:1"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20000); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`FFmpeg stability decode failed (${code}): ${stderr}`)));
    void width; void height;
  });
}
