import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export type VisemeMouth = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X";

export interface VisemeCue {
  startMs: number;
  endMs: number;
  mouth: VisemeMouth;
}

export interface BlinkCue {
  startMs: number;
  endMs: number;
}

export interface VisemeManifest {
  schemaVersion: "1";
  engine: "energy_fallback";
  engineVersion: "energy-viseme-v1";
  audioDurationMs: number;
  sourceAudioSha256: string;
  cues: VisemeCue[];
  blinks: BlinkCue[];
}

interface ParsedPcmWav {
  sampleRate: number;
  channels: number;
  samples: Int16Array;
  durationMs: number;
}

const MAX_WAV_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_MS = 60_000;
const WINDOW_MS = 80;

export async function extractEnergyVisemes(audioPath: string): Promise<VisemeManifest> {
  const bytes = await fs.readFile(audioPath);
  if (bytes.byteLength > MAX_WAV_BYTES) {
    throw new Error("Avatar narration WAV exceeds the local viseme size limit.");
  }
  const parsed = parsePcmWav(bytes);
  if (parsed.durationMs < 500 || parsed.durationMs > MAX_DURATION_MS + 100) {
    throw new Error("Avatar narration WAV duration is outside the supported range.");
  }
  const sourceAudioSha256 = createHash("sha256").update(bytes).digest("hex");
  const energies = windowEnergies(parsed);
  const cues = energyCues(energies, parsed.durationMs);
  const blinks = deterministicBlinks(parsed.durationMs, sourceAudioSha256);
  return validateVisemeManifest({
    schemaVersion: "1",
    engine: "energy_fallback",
    engineVersion: "energy-viseme-v1",
    audioDurationMs: parsed.durationMs,
    sourceAudioSha256,
    cues,
    blinks
  });
}

export async function readPcmWavDurationMs(audioPath: string): Promise<number> {
  const bytes = await fs.readFile(audioPath);
  if (bytes.byteLength > MAX_WAV_BYTES) throw new Error("Avatar narration WAV exceeds the local viseme size limit.");
  return parsePcmWav(bytes).durationMs;
}

export function validateVisemeManifest(input: VisemeManifest): VisemeManifest {
  if (
    input.schemaVersion !== "1" ||
    input.engine !== "energy_fallback" ||
    input.engineVersion !== "energy-viseme-v1" ||
    !/^[a-f0-9]{64}$/.test(input.sourceAudioSha256) ||
    !Number.isFinite(input.audioDurationMs) ||
    input.audioDurationMs < 500 ||
    input.audioDurationMs > MAX_DURATION_MS + 100
  ) {
    throw new Error("Viseme manifest metadata is invalid.");
  }
  const allowed = new Set<VisemeMouth>(["A", "B", "C", "D", "E", "F", "G", "H", "X"]);
  let cursor = 0;
  for (const cue of input.cues) {
    if (
      !allowed.has(cue.mouth) ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs !== cursor ||
      cue.endMs <= cue.startMs ||
      cue.endMs > input.audioDurationMs
    ) {
      throw new Error("Viseme cue ordering, coverage, or mouth state is invalid.");
    }
    cursor = cue.endMs;
  }
  if (input.cues.length === 0 || Math.abs(cursor - input.audioDurationMs) > 1) {
    throw new Error("Viseme cues must cover the complete narration duration.");
  }
  let previousBlinkEnd = -1;
  for (const blink of input.blinks) {
    if (
      !Number.isFinite(blink.startMs) ||
      !Number.isFinite(blink.endMs) ||
      blink.startMs < previousBlinkEnd ||
      blink.endMs <= blink.startMs ||
      blink.endMs > input.audioDurationMs ||
      blink.endMs - blink.startMs > 250
    ) {
      throw new Error("Blink cue timing is invalid.");
    }
    previousBlinkEnd = blink.endMs;
  }
  return input;
}

function parsePcmWav(bytes: Buffer): ParsedPcmWav {
  if (bytes.byteLength < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Avatar narration must be a RIFF/WAVE file.");
  }
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.byteLength) {
      throw new Error("Avatar narration WAV contains a truncated chunk.");
    }
    if (id === "fmt " && size >= 16) {
      audioFormat = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bitsPerSample = bytes.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = end + (size % 2);
  }
  if (audioFormat !== 1 || (channels !== 1 && channels !== 2) || sampleRate < 8_000 || sampleRate > 96_000 || bitsPerSample !== 16 || dataOffset < 0 || dataSize < 2) {
    throw new Error("Local viseme extraction requires mono or stereo 16-bit PCM WAV audio.");
  }
  const sampleCount = Math.floor(dataSize / 2);
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = bytes.readInt16LE(dataOffset + index * 2);
  }
  const frameCount = Math.floor(sampleCount / channels);
  return {
    sampleRate,
    channels,
    samples,
    durationMs: Math.round((frameCount / sampleRate) * 1_000)
  };
}

function windowEnergies(input: ParsedPcmWav): number[] {
  const framesPerWindow = Math.max(1, Math.round(input.sampleRate * WINDOW_MS / 1_000));
  const frameCount = Math.floor(input.samples.length / input.channels);
  const result: number[] = [];
  for (let frameStart = 0; frameStart < frameCount; frameStart += framesPerWindow) {
    const frameEnd = Math.min(frameCount, frameStart + framesPerWindow);
    let squared = 0;
    let count = 0;
    for (let frame = frameStart; frame < frameEnd; frame += 1) {
      let mono = 0;
      for (let channel = 0; channel < input.channels; channel += 1) {
        mono += input.samples[frame * input.channels + channel] ?? 0;
      }
      mono /= input.channels * 32_768;
      squared += mono * mono;
      count += 1;
    }
    result.push(count > 0 ? Math.sqrt(squared / count) : 0);
  }
  return result;
}

function energyCues(energies: number[], durationMs: number): VisemeCue[] {
  const sorted = [...energies].sort((a, b) => a - b);
  const p20 = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0.05;
  const silence = Math.max(0.006, p20 * 2.2);
  const span = Math.max(0.015, p90 - silence);
  const raw: VisemeCue[] = energies.map((energy, index) => {
    const startMs = index * WINDOW_MS;
    const endMs = Math.min(durationMs, (index + 1) * WINDOW_MS);
    const normalized = (energy - silence) / span;
    let mouth: VisemeMouth;
    if (energy <= silence) mouth = "X";
    else if (normalized < 0.22) mouth = index % 2 === 0 ? "A" : "B";
    else if (normalized < 0.52) mouth = index % 3 === 0 ? "C" : "B";
    else if (normalized < 0.82) mouth = index % 4 === 0 ? "E" : "C";
    else mouth = index % 3 === 0 ? "F" : "D";
    return { startMs, endMs, mouth };
  }).filter((cue) => cue.endMs > cue.startMs);
  const merged: VisemeCue[] = [];
  for (const cue of raw) {
    const prior = merged[merged.length - 1];
    if (prior?.mouth === cue.mouth) prior.endMs = cue.endMs;
    else merged.push({ ...cue });
  }
  if (merged.length === 0) return [{ startMs: 0, endMs: durationMs, mouth: "X" }];
  merged[0]!.startMs = 0;
  merged[merged.length - 1]!.endMs = durationMs;
  return merged;
}

function deterministicBlinks(durationMs: number, seed: string): BlinkCue[] {
  if (durationMs < 1_800) return [];
  let state = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  const random = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const result: BlinkCue[] = [];
  let cursor = Math.min(durationMs - 140, 1_500 + Math.round(random() * 900));
  while (cursor + 120 < durationMs) {
    const blinkDuration = 100 + Math.round(random() * 40);
    result.push({ startMs: cursor, endMs: Math.min(durationMs, cursor + blinkDuration) });
    cursor += 2_800 + Math.round(random() * 2_400);
  }
  return result;
}
