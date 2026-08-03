import { spawn } from "node:child_process";

const WIDTH = 180;
const HEIGHT = 320;
const FPS = 5;

export async function measureV9Motion(target) {
  const decoded = await decodeGrayFrames(target);
  const frameBytes = WIDTH * HEIGHT;
  const frames = [];
  for (let offset = 0; offset + frameBytes <= decoded.length; offset += frameBytes) {
    frames.push(decoded.subarray(offset, offset + frameBytes));
  }
  const samples = [];
  for (let index = 1; index < frames.length; index += 1) {
    samples.push({
      timeSeconds: index / FPS,
      full: regionDifference(frames[index - 1], frames[index], 0, 0, WIDTH, HEIGHT),
      center: regionDifference(frames[index - 1], frames[index], 36, 32, 108, 208),
      lower: regionDifference(frames[index - 1], frames[index], 18, 176, 144, 128)
    });
  }
  const full = samples.map(({ full: value }) => value);
  const cutThreshold = 12;
  const lowMotionThreshold = 1;
  const continuous = full.filter((value) => value < cutThreshold);
  const firstTen = samples.filter(({ timeSeconds }) => timeSeconds <= 10).map(({ full: value }) => value);
  const lowMotion = samples.map((sample) => ({ ...sample, low: sample.full < lowMotionThreshold }));
  const lowWindows = contiguousLowWindows(lowMotion, 1 / FPS);
  const peaks = samples.filter(({ full: value }) => value >= cutThreshold).map(({ timeSeconds, full: value }) => ({ timeSeconds, value }));
  return {
    method: {
      decoder: `FFmpeg grayscale decode at ${WIDTH}x${HEIGHT} and ${FPS} fps`,
      difference: "Mean absolute per-pixel luma difference between adjacent decoded samples",
      centerRegion: { x: .2, y: .1, width: .6, height: .65 },
      lowerRegion: { x: .1, y: .55, width: .8, height: .4 },
      cutThreshold,
      lowMotionThreshold
    },
    sampleCount: samples.length,
    averageFrameChange: average(full),
    medianFrameChange: median(full),
    continuousMovementExcludingCuts: average(continuous),
    centerRegionMovement: average(samples.map(({ center }) => center)),
    lowerRegionMovement: average(samples.map(({ lower }) => lower)),
    firstTenSeconds: { average: average(firstTen), median: median(firstTen) },
    nearStaticFrameRatio: lowMotion.filter(({ low }) => low).length / Math.max(1, lowMotion.length),
    nearStaticFramePercent: lowMotion.filter(({ low }) => low).length / Math.max(1, lowMotion.length) * 100,
    longestLowMotionSeconds: Math.max(0, ...lowWindows.map(({ startSeconds, endSeconds }) => endSeconds - startSeconds)),
    lowMotionWindows: lowWindows,
    majorTransitionPeaks: peaks,
    majorTransitionPeakCount: peaks.length
  };
}

function regionDifference(previous, current, x, y, width, height) {
  let sum = 0;
  let count = 0;
  for (let row = y; row < y + height; row += 1) {
    const start = row * WIDTH + x;
    for (let column = 0; column < width; column += 1) {
      sum += Math.abs(previous[start + column] - current[start + column]);
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function contiguousLowWindows(samples, cadenceSeconds) {
  const windows = [];
  let start;
  for (const sample of samples) {
    if (sample.low && start === undefined) start = sample.timeSeconds;
    if (!sample.low && start !== undefined) {
      windows.push({ startSeconds: start, endSeconds: sample.timeSeconds });
      start = undefined;
    }
  }
  if (start !== undefined) windows.push({ startSeconds: start, endSeconds: (samples.at(-1)?.timeSeconds ?? start) + cadenceSeconds });
  return windows;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function decodeGrayFrames(target) {
  return await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", target, "-vf", `fps=${FPS},scale=${WIDTH}:${HEIGHT}:flags=bilinear,format=gray`, "-f", "rawvideo", "pipe:1"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => stderr = `${stderr}${chunk}`.slice(-20_000));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`FFmpeg motion decode failed (${code}): ${stderr}`)));
  });
}
