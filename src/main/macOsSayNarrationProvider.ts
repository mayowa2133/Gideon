import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { assertNarrationRequest, narrationCacheKey, prepareNarrationText, type NarrationProvider, type NarrationRequest, type NarrationResult } from "./narration";

export class MacOsSayNarrationProvider implements NarrationProvider {
  readonly kind = "macos_say" as const;
  readonly providerVersion = "macos-say-samantha-v1";
  constructor(private readonly sayPath = "/usr/bin/say", private readonly ffmpegPath = "/opt/homebrew/bin/ffmpeg") {}
  async isAvailable(): Promise<boolean> {
    return fs.access(this.sayPath).then(() => true, () => false);
  }
  async synthesize(request: NarrationRequest): Promise<NarrationResult> {
    assertNarrationRequest(request);
    const outputDir = path.resolve(request.outputDir);
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const beats = [];
    for (const beat of request.beats) {
      const preparedText = prepareNarrationText(beat.approvedText, beat.energy, beat.pacing);
      const key = narrationCacheKey({ provider: this.kind, providerVersion: this.providerVersion, model: "Samantha", device: "macos", seed: request.seed, beatId: beat.id, preparedText, voice: request.voice });
      const aiff = path.join(outputDir, `${key}.aiff`);
      const wav = path.join(outputDir, `${key}.wav`);
      let cacheHit = true;
      try { await fs.access(wav); } catch {
        cacheHit = false;
        await run(this.sayPath, ["-v", "Samantha", "-r", beat.energy === "high" ? "168" : "158", "-o", aiff, preparedText]);
        await run(this.ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-i", aiff, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
        await fs.rm(aiff, { force: true });
      }
      const stat = await fs.stat(wav);
      if (stat.size < 44) throw new Error("macOS say generated unusable audio.");
      const durationMs = await duration(this.ffmpegPath.replace(/ffmpeg$/, "ffprobe"), wav);
      beats.push({
        id: beat.id,
        outputPath: wav,
        approvedText: beat.approvedText,
        preparedText,
        startMs: beat.startMs,
        endMs: beat.endMs,
        sourceDurationMs: durationMs,
        tempo: 1,
        cacheKey: key,
        cacheHit,
        preparedTextSha256: createHash("sha256").update(preparedText).digest("hex"),
        outputSha256: await hashFile(wav),
        sampleRate: 48_000,
        channels: 1
      });
    }
    return { provider: this.kind, beats, provenance: { schemaVersion: "1", provider: this.kind, providerVersion: this.providerVersion, model: "Samantha", device: "macos", seed: request.seed, voiceMode: "model_default", generatedAt: new Date().toISOString(), watermark: "none" } };
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath).on("data", (chunk) => hash.update(chunk)).once("error", reject).once("end", () => resolve(hash.digest("hex")));
  });
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed: ${stderr.trim()}`)));
  });
}

function duration(ffprobe: string, filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 && Number(stdout) > 0 ? resolve(Math.round(Number(stdout) * 1_000)) : reject(new Error("Could not measure narration.")));
  });
}
