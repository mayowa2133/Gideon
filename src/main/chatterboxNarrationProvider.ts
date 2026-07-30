import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertNarrationRequest,
  narrationCacheKey,
  prepareNarrationText,
  type ChatterboxModelId,
  type NarrationBeatResult,
  type NarrationDevice,
  type NarrationProvider,
  type NarrationRequest,
  type NarrationResult
} from "./narration";
import type { CaptureNarrationProvider } from "./capturePresentationRenderer";
import type { SpeechProvider } from "./jobExecutor";

export interface ChatterboxBridgeResponse {
  ok: true;
  model: string;
  modelRevision: string;
  device: NarrationDevice;
  watermark: "perth";
  outputs: Array<{ id: string; outputPath: string; durationMs: number; sha256?: string; generationSeconds?: number }>;
}

export type ChatterboxBridgeRunner = (input: {
  pythonPath: string;
  bridgePath: string;
  env: Record<string, string>;
  request: {
    outputRoot: string;
    beats: Array<{ id: string; text: string; energy: string; seed: number }>;
    [key: string]: unknown;
  };
}) => Promise<ChatterboxBridgeResponse>;

export function createChatterboxCaptureNarrationProvider(provider = new ChatterboxNarrationProvider()): CaptureNarrationProvider {
  return {
    async synthesize(input) {
      const requested = path.resolve(input.outputPath);
      const result = await provider.synthesize({
        outputDir: path.join(path.dirname(requested), ".chatterbox"),
        beats: [{ id: "capture", approvedText: input.text, startMs: 0, endMs: 120_000, energy: "medium" }],
        language: "en",
        voice: { mode: "model_default" },
        seed: 71623
      });
      await fs.copyFile(result.beats[0]!.outputPath, requested);
      return { outputPath: requested };
    }
  };
}

export function createChatterboxSpeechProvider(provider = new ChatterboxNarrationProvider()): SpeechProvider {
  return {
    providerKind: "chatterbox_local",
    modelName: "chatterbox-turbo",
    isConfigured: () => existsSync(path.resolve("tmp", "chatterbox-runtime", ".venv", "bin", "python")),
    async synthesizeSpeech(input) {
      const requested = path.resolve(input.outputPath);
      const result = await provider.synthesize({
        outputDir: path.join(path.dirname(requested), ".chatterbox"),
        beats: [{ id: "creator", approvedText: input.text, startMs: 0, endMs: 10 * 60_000, energy: "medium" }],
        language: "en",
        voice: { mode: "model_default" },
        seed: 71623
      });
      await fs.copyFile(result.beats[0]!.outputPath, requested);
      return {
        outputPath: requested,
        provider: result.provider,
        model: result.provenance.model,
        modelRevision: result.provenance.modelRevision,
        device: result.provenance.device === "macos" ? "macos" : result.provenance.device,
        voiceMode: result.provenance.voiceMode,
        referenceSha256: result.provenance.referenceSha256,
        consentSubjectId: result.provenance.consentSubjectId,
        watermark: result.provenance.watermark
      };
    }
  };
}

export class ChatterboxNarrationProvider implements NarrationProvider {
  readonly kind = "chatterbox_local" as const;
  readonly providerVersion = "chatterbox-tts@0.1.7/gideon-bridge-v1";
  private readonly pythonPath: string;
  private readonly bridgePath: string;
  private readonly model: ChatterboxModelId;
  private readonly device: NarrationDevice;
  private readonly modelCacheRoot: string;
  private readonly allowDownload: boolean;
  private readonly bridgeRunner: ChatterboxBridgeRunner;

  constructor(input: {
    pythonPath?: string;
    bridgePath?: string;
    model?: ChatterboxModelId;
    device?: NarrationDevice;
    modelCacheRoot?: string;
    allowDownload?: boolean;
    bridgeRunner?: ChatterboxBridgeRunner;
  } = {}) {
    const root = process.cwd();
    this.pythonPath = path.resolve(input.pythonPath ?? path.join(root, "tmp", "chatterbox-runtime", ".venv", "bin", "python"));
    this.bridgePath = path.resolve(input.bridgePath ?? path.join(root, "scripts", "chatterbox_inference.py"));
    this.model = input.model ?? "chatterbox-turbo";
    this.device = input.device ?? "mps";
    this.modelCacheRoot = path.resolve(input.modelCacheRoot ?? path.join(root, "tmp", "chatterbox-runtime", "model-cache"));
    this.allowDownload = input.allowDownload ?? false;
    this.bridgeRunner = input.bridgeRunner ?? runBridge;
  }

  async isAvailable(): Promise<boolean> {
    return existsSync(this.pythonPath) && existsSync(this.bridgePath);
  }

  async synthesize(request: NarrationRequest): Promise<NarrationResult> {
    assertNarrationRequest(request);
    if (!await this.isAvailable()) throw new Error("The isolated Chatterbox runtime is not installed.");
    const outputDir = path.resolve(request.outputDir);
    const generatedDir = path.join(outputDir, "generated");
    const cacheDir = path.join(outputDir, "cache");
    await Promise.all([
      fs.mkdir(generatedDir, { recursive: true, mode: 0o700 }),
      fs.mkdir(cacheDir, { recursive: true, mode: 0o700 })
    ]);
    const prepared = request.beats.map((beat) => ({ ...beat, preparedText: prepareNarrationText(beat.approvedText, beat.energy, beat.pacing) }));
    const missing = [];
    const cacheKeys = new Map<string, string>();
    const cacheHits = new Map<string, boolean>();
    const cachedRevision = discoverSnapshotRevision(this.modelCacheRoot, this.model);
    for (let index = 0; index < prepared.length; index += 1) {
      const beat = prepared[index]!;
      const key = narrationCacheKey({
        provider: this.kind,
        providerVersion: this.providerVersion,
        model: this.model,
        modelRevision: cachedRevision,
        device: this.device,
        seed: request.seed + index,
        beatId: beat.id,
        preparedText: beat.preparedText,
        voice: request.voice
      });
      cacheKeys.set(beat.id, key);
      const valid = await validCacheEntry(cacheDir, key);
      cacheHits.set(beat.id, valid);
      if (!valid) missing.push(beat);
    }
    let bridge: ChatterboxBridgeResponse | undefined;
    if (missing.length > 0) {
      bridge = await this.bridgeRunner({
        pythonPath: this.pythonPath,
        bridgePath: this.bridgePath,
        env: { HF_HOME: this.modelCacheRoot },
        request: {
          model: this.model,
          device: this.device,
          seed: request.seed,
          outputRoot: generatedDir,
          allowDownload: this.allowDownload,
          referencePath: request.voice.referencePath,
          referenceSha256: request.voice.referenceSha256,
          referenceConsent: request.voice.mode === "approved_reference",
          beats: missing.map((beat) => ({
            id: beat.id,
            text: beat.preparedText,
            energy: beat.energy,
            seed: request.seed + prepared.findIndex((candidate) => candidate.id === beat.id)
          }))
        }
      });
      const generatedDirRealPath = await fs.realpath(generatedDir);
      for (const output of bridge.outputs) {
        const key = cacheKeys.get(output.id);
        const outputRealPath = await fs.realpath(output.outputPath);
        if (!key || path.dirname(outputRealPath) !== generatedDirRealPath) {
          throw new Error("Chatterbox returned an unexpected output.");
        }
        const targetPath = path.join(cacheDir, `${key}.wav`);
        const temporaryPath = `${targetPath}.${process.pid}.tmp`;
        await fs.copyFile(outputRealPath, temporaryPath);
        const audio = await probeWav(temporaryPath);
        const outputSha256 = await hashFile(temporaryPath);
        await fs.rename(temporaryPath, targetPath);
        await atomicJson(path.join(cacheDir, `${key}.json`), {
          schemaVersion: "1",
          cacheKey: key,
          outputSha256,
          durationMs: audio.durationMs,
          sampleRate: audio.sampleRate,
          channels: audio.channels,
          generationSeconds: output.generationSeconds,
          providerVersion: this.providerVersion,
          model: this.model,
          modelRevision: bridge.modelRevision,
          device: this.device
        });
      }
    }
    const beats: NarrationBeatResult[] = [];
    for (const beat of prepared) {
      const key = cacheKeys.get(beat.id)!;
      const cachedPath = path.join(cacheDir, `${key}.wav`);
      const audio = await probeWav(cachedPath);
      const cacheManifest = JSON.parse(await fs.readFile(path.join(cacheDir, `${key}.json`), "utf8")) as { outputSha256: string; generationSeconds?: number };
      beats.push({
        id: beat.id,
        outputPath: cachedPath,
        approvedText: beat.approvedText,
        preparedText: beat.preparedText,
        startMs: beat.startMs,
        endMs: beat.endMs,
        sourceDurationMs: audio.durationMs,
        tempo: 1,
        cacheKey: key,
        cacheHit: cacheHits.get(beat.id) === true,
        preparedTextSha256: createHash("sha256").update(beat.preparedText).digest("hex"),
        outputSha256: cacheManifest.outputSha256,
        sampleRate: audio.sampleRate,
        channels: audio.channels,
        generationSeconds: cacheManifest.generationSeconds
      });
    }
    return {
      provider: this.kind,
      beats,
      provenance: {
        schemaVersion: "1",
        provider: this.kind,
        providerVersion: this.providerVersion,
        model: this.model,
        modelRevision: bridge?.modelRevision ?? discoverSnapshotRevision(this.modelCacheRoot, this.model),
        device: this.device,
        seed: request.seed,
        voiceMode: request.voice.mode,
        referenceSha256: request.voice.referenceSha256,
        consentSubjectId: request.voice.consent?.subjectId,
        generatedAt: new Date().toISOString(),
        watermark: "perth"
      }
    };
  }
}

async function runBridge(input: Parameters<ChatterboxBridgeRunner>[0]): Promise<ChatterboxBridgeResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.pythonPath, [input.bridgePath], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...input.env, TOKENIZERS_PARALLELISM: "false", PYTORCH_ENABLE_MPS_FALLBACK: "1" }
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 20 * 60_000);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(`Local Chatterbox inference failed (${code ?? "signal"}): ${stderr.trim()}`));
      try {
        const jsonLine = stdout.trim().split(/\r?\n/).reverse().find((line) => line.trim().startsWith("{"));
        const parsed = JSON.parse(jsonLine ?? "") as ChatterboxBridgeResponse;
        if (!parsed.ok || !Array.isArray(parsed.outputs)) throw new Error("Invalid bridge response.");
        resolve(parsed);
      } catch {
        reject(new Error("Local Chatterbox inference returned invalid JSON."));
      }
    });
    child.stdin.end(JSON.stringify(input.request));
  });
}

async function probeWav(filePath: string): Promise<{ durationMs: number; sampleRate: number; channels: number }> {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(44);
    await handle.read(header, 0, 44, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") throw new Error("Chatterbox cache entry is not WAV audio.");
    const channels = header.readUInt16LE(22);
    const sampleRate = header.readUInt32LE(24);
    const bits = header.readUInt16LE(34);
    const dataBytes = header.readUInt32LE(40);
    return { durationMs: Math.round(dataBytes / (sampleRate * channels * (bits / 8)) * 1_000), sampleRate, channels };
  } finally {
    await handle.close();
  }
}

async function validCacheEntry(cacheDir: string, key: string): Promise<boolean> {
  try {
    const audioPath = path.join(cacheDir, `${key}.wav`);
    const manifest = JSON.parse(await fs.readFile(path.join(cacheDir, `${key}.json`), "utf8")) as { schemaVersion?: string; cacheKey?: string; outputSha256?: string };
    if (manifest.schemaVersion !== "1" || manifest.cacheKey !== key || !/^[a-f0-9]{64}$/.test(manifest.outputSha256 ?? "")) return false;
    await probeWav(audioPath);
    return await hashFile(audioPath) === manifest.outputSha256;
  } catch {
    return false;
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath).on("data", (chunk) => hash.update(chunk)).once("error", reject).once("end", () => resolve(hash.digest("hex")));
  });
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

function discoverSnapshotRevision(cacheRoot: string, model: ChatterboxModelId): string | undefined {
  const repo = model === "chatterbox-turbo" ? "models--ResembleAI--chatterbox-turbo" : "models--ResembleAI--chatterbox";
  try {
    return require("node:fs").readFileSync(path.join(cacheRoot, "hub", repo, "refs", "main"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
