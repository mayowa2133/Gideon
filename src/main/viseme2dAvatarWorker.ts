import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AvatarPerformanceMetadata, FictionalAvatarPresenterId } from "../shared/types";
import type { AvatarWorker, AvatarWorkerConfig, AvatarWorkerRequest } from "./avatarWorker";
import { extractEnergyVisemes, type BlinkCue, type VisemeCue, type VisemeManifest, type VisemeMouth } from "./visemeCues";

interface VisemeAssetPack {
  schemaVersion: 1;
  id: Exclude<FictionalAvatarPresenterId, "logo_head">;
  version: string;
  provenance: "gideon_fictional_catalog";
  commercialApproved: true;
  disclosure: "AI-generated brand presenter";
  canvas: { width: number; height: number };
  cropSafeRegion: AvatarPerformanceMetadata["cropSafeRegion"];
  anchor: { x: number; y: number };
  supportedExpressions: string[];
  backgroundType: "green_screen";
  chromaKey: "0x00FF00";
  mouthFrames: Record<VisemeMouth, string>;
  blinkFrame: string;
  sheet: string;
  sheetSha256: string;
  frameSha256: Record<string, string>;
  licenseFile: string;
}

interface RenderSegment {
  startMs: number;
  endMs: number;
  framePath: string;
}

const GENERATOR_VERSION = "viseme2d-renderer-v1";

export function viseme2dPackVersion(avatarId: "orbit" | "nova"): string {
  return `${avatarId}-viseme-v1`;
}

export async function checkViseme2dAssetPacks(configuredRoot?: string): Promise<{
  orbitPackAvailable: boolean;
  novaPackAvailable: boolean;
  message: string;
}> {
  const results = await Promise.all(["orbit", "nova"].map(async (avatarId) => {
    try {
      const root = await resolvePackRoot(avatarId as "orbit" | "nova", configuredRoot);
      await loadAndValidatePack(root, avatarId as "orbit" | "nova");
      return true;
    } catch {
      return false;
    }
  }));
  const [orbitPackAvailable, novaPackAvailable] = results;
  return {
    orbitPackAvailable: Boolean(orbitPackAvailable),
    novaPackAvailable: Boolean(novaPackAvailable),
    message: orbitPackAvailable && novaPackAvailable
      ? "Orbit and Nova local animation packs are ready."
      : "One or more approved local avatar sprite packs are missing or invalid."
  };
}

export function createViseme2dAvatarWorker(config: AvatarWorkerConfig): AvatarWorker {
  return {
    async render(input) {
      if (input.avatarId === "logo_head" || input.sourceImagePath) {
        throw new Error("Local animated presenters support approved fictional catalog avatars only; custom portraits remain static.");
      }
      const packRoot = await resolvePackRoot(input.avatarId, config.visemeAssetRoot);
      const pack = await loadAndValidatePack(packRoot, input.avatarId);
      const manifest = await extractEnergyVisemes(input.audioPath);
      if (Math.abs(manifest.audioDurationMs - input.durationMs) > 1_500) {
        throw new Error("Avatar narration duration does not match the requested presenter duration.");
      }
      const outputDurationMs = manifest.audioDurationMs;
      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      const temporaryDir = await fs.mkdtemp(path.join(path.dirname(input.outputPath), ".viseme2d-"));
      try {
        const segments = buildRenderSegments(manifest, pack, packRoot);
        const concatPath = path.join(temporaryDir, "frames.concat.txt");
        await fs.writeFile(concatPath, concatManifest(segments), "utf8");
        await renderPresenterVideo({
          concatPath,
          outputPath: input.outputPath,
          durationMs: outputDurationMs,
          ffmpegPath: config.ffmpegPath
        });
        await validatePresenterVideo(input.outputPath, outputDurationMs, config.ffprobePath);
        const packSha256 = await hashPack(packRoot, pack);
        return {
          outputPath: input.outputPath,
          receipt: {
            provider: "viseme2d",
            modelVersion: config.modelVersion ?? GENERATOR_VERSION,
            modelLicense: config.modelLicense ?? "Gideon project-owned fictional sprite assets",
            generatorVersion: GENERATOR_VERSION,
            avatarPackVersion: pack.version,
            avatarPackSha256: packSha256,
            cueEngine: manifest.engine,
            cueEngineVersion: manifest.engineVersion,
            sourceAudioSha256: manifest.sourceAudioSha256,
            avatarId: input.avatarId,
            avatarProvenance: "gideon_fictional_catalog",
            disclosure: input.disclosure,
            generatedAt: new Date().toISOString()
          },
          performance: {
            width: 720,
            height: 720,
            fps: 30,
            durationMs: outputDurationMs,
            cropSafeRegion: pack.cropSafeRegion,
            backgroundType: "green_screen",
            phonemeTimings: manifest.cues.map((cue) => ({ ...cue, phoneme: cue.mouth })),
            expressionTags: [{ startMs: 0, endMs: outputDurationMs, expression: "explanatory" }],
            status: "completed"
          },
          qualityReport: {
            requiresHumanReview: true,
            evaluator: "not_run"
          }
        };
      } catch (error) {
        await fs.rm(input.outputPath, { force: true });
        throw error;
      } finally {
        await fs.rm(temporaryDir, { recursive: true, force: true });
      }
    }
  };
}

export function buildRenderSegments(
  manifest: Pick<VisemeManifest, "audioDurationMs" | "cues" | "blinks">,
  pack: Pick<VisemeAssetPack, "mouthFrames" | "blinkFrame">,
  packRoot: string
): RenderSegment[] {
  const boundaries = new Set<number>([0, manifest.audioDurationMs]);
  manifest.cues.forEach((cue) => { boundaries.add(cue.startMs); boundaries.add(cue.endMs); });
  manifest.blinks.forEach((blink) => { boundaries.add(blink.startMs); boundaries.add(blink.endMs); });
  const sorted = [...boundaries].filter((value) => value >= 0 && value <= manifest.audioDurationMs).sort((a, b) => a - b);
  const result: RenderSegment[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const startMs = sorted[index]!;
    const endMs = sorted[index + 1]!;
    if (endMs <= startMs) continue;
    const blinking = manifest.blinks.some((blink) => startMs >= blink.startMs && startMs < blink.endMs);
    const mouth = manifest.cues.find((cue) => startMs >= cue.startMs && startMs < cue.endMs)?.mouth ?? "X";
    const file = blinking ? pack.blinkFrame : pack.mouthFrames[mouth];
    const framePath = safePackFile(packRoot, file);
    const prior = result[result.length - 1];
    if (prior?.framePath === framePath && prior.endMs === startMs) prior.endMs = endMs;
    else result.push({ startMs, endMs, framePath });
  }
  if (result.length === 0 || result[0]!.startMs !== 0 || result[result.length - 1]!.endMs !== manifest.audioDurationMs) {
    throw new Error("Viseme render segments do not cover the complete narration.");
  }
  return result;
}

async function resolvePackRoot(avatarId: Exclude<FictionalAvatarPresenterId, "logo_head">, configuredRoot?: string): Promise<string> {
  const packName = viseme2dPackVersion(avatarId);
  const candidates = [
    configuredRoot ? path.join(configuredRoot, packName) : undefined,
    path.resolve(process.cwd(), "assets", "avatar-catalog", packName),
    typeof process.resourcesPath === "string" ? path.join(process.resourcesPath, "assets", "avatar-catalog", packName) : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(path.join(candidate, "manifest.json"));
      if (stat.isFile()) return candidate;
    } catch {
      // Continue through trusted local asset locations.
    }
  }
  throw new Error(`Local avatar sprite pack is unavailable for ${avatarId}.`);
}

async function loadAndValidatePack(
  packRoot: string,
  avatarId: Exclude<FictionalAvatarPresenterId, "logo_head">
): Promise<VisemeAssetPack> {
  const parsed = JSON.parse(await fs.readFile(path.join(packRoot, "manifest.json"), "utf8")) as Partial<VisemeAssetPack>;
  if (
    parsed.schemaVersion !== 1 || parsed.id !== avatarId || !parsed.version ||
    parsed.provenance !== "gideon_fictional_catalog" || parsed.commercialApproved !== true ||
    parsed.disclosure !== "AI-generated brand presenter" || parsed.backgroundType !== "green_screen" ||
    parsed.chromaKey !== "0x00FF00" || !parsed.mouthFrames || !parsed.blinkFrame || !parsed.sheet ||
    !parsed.sheetSha256 || !/^[a-f0-9]{64}$/.test(parsed.sheetSha256) || !parsed.frameSha256 ||
    !parsed.canvas || parsed.canvas.width !== 418 || parsed.canvas.height !== 418 || !parsed.cropSafeRegion ||
    !parsed.anchor || parsed.anchor.x < 0 || parsed.anchor.x > 1 || parsed.anchor.y < 0 || parsed.anchor.y > 1 ||
    !parsed.supportedExpressions?.includes("explanatory") || !parsed.licenseFile
  ) {
    throw new Error("Local avatar sprite-pack manifest is invalid or unapproved.");
  }
  const mouths: VisemeMouth[] = ["A", "B", "C", "D", "E", "F", "G", "H", "X"];
  for (const mouth of mouths) {
    const file = parsed.mouthFrames[mouth];
    if (!file) throw new Error(`Local avatar sprite pack is missing mouth ${mouth}.`);
    await assertRegularFile(safePackFile(packRoot, file));
  }
  await assertRegularFile(safePackFile(packRoot, parsed.blinkFrame));
  await assertRegularFile(safePackFile(packRoot, parsed.licenseFile));
  const frameFiles = [...new Set([...Object.values(parsed.mouthFrames), parsed.blinkFrame])];
  for (const file of frameFiles) {
    const expected = parsed.frameSha256[file];
    if (!expected || !/^[a-f0-9]{64}$/.test(expected) || await sha256File(safePackFile(packRoot, file)) !== expected) {
      throw new Error(`Local avatar frame hash does not match its approved manifest: ${file}.`);
    }
  }
  const sheetPath = safePackFile(packRoot, parsed.sheet);
  await assertRegularFile(sheetPath);
  if (await sha256File(sheetPath) !== parsed.sheetSha256) {
    throw new Error("Local avatar sprite sheet hash does not match its approved manifest.");
  }
  const region = parsed.cropSafeRegion;
  if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) {
    throw new Error("Local avatar crop-safe region is invalid.");
  }
  return parsed as VisemeAssetPack;
}

function concatManifest(segments: RenderSegment[]): string {
  const lines: string[] = ["ffconcat version 1.0"];
  for (const segment of segments) {
    lines.push(`file '${escapeConcatPath(segment.framePath)}'`);
    lines.push(`duration ${((segment.endMs - segment.startMs) / 1_000).toFixed(6)}`);
  }
  lines.push(`file '${escapeConcatPath(segments[segments.length - 1]!.framePath)}'`);
  return `${lines.join("\n")}\n`;
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}

async function renderPresenterVideo(input: {
  concatPath: string;
  outputPath: string;
  durationMs: number;
  ffmpegPath?: string;
}): Promise<void> {
  const durationSec = (input.durationMs / 1_000).toFixed(3);
  const filter =
    `[0:v]fps=30,chromakey=0x00FF00:0.16:0.07,scale=690:690:force_original_aspect_ratio=decrease,format=rgba[subject];` +
    `color=c=0x00FF00:s=720x720:r=30:d=${durationSec}[background];` +
    `[background][subject]overlay=x=(W-w)/2+2*sin(2*PI*t/4.8):y=(H-h)/2+4*sin(2*PI*t/3.2):shortest=1,format=yuv420p[v]`;
  await runProcess(input.ffmpegPath ?? resolveFfmpeg(), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", input.concatPath,
    "-filter_complex", filter,
    "-map", "[v]", "-an", "-t", durationSec, "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", input.outputPath
  ]);
}

async function validatePresenterVideo(outputPath: string, durationMs: number, ffprobePath?: string): Promise<void> {
  const stat = await fs.stat(outputPath);
  if (!stat.isFile() || stat.size < 4_096) throw new Error("Local avatar renderer did not produce a usable MP4.");
  const result = await runProcess(ffprobePath ?? resolveFfprobe(), [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration",
    "-of", "json", outputPath
  ], true);
  const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  const probedDurationMs = Math.round(Number(parsed.format?.duration ?? "0") * 1_000);
  if (stream?.width !== 720 || stream.height !== 720 || stream.r_frame_rate !== "30/1" || Math.abs(probedDurationMs - durationMs) > 100) {
    throw new Error("Local avatar MP4 dimensions, frame rate, or duration failed validation.");
  }
}

async function hashPack(packRoot: string, pack: VisemeAssetPack): Promise<string> {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(pack));
  const files = [...new Set([...Object.values(pack.mouthFrames), pack.blinkFrame, pack.sheet, pack.licenseFile])].sort();
  for (const file of files) hash.update(await fs.readFile(safePackFile(packRoot, file)));
  return hash.digest("hex");
}

function safePackFile(packRoot: string, file: string): string {
  if (!file || path.basename(file) !== file || file.includes("..")) throw new Error("Avatar sprite-pack file name is unsafe.");
  const resolved = path.resolve(packRoot, file);
  if (path.dirname(resolved) !== path.resolve(packRoot)) throw new Error("Avatar sprite-pack file escapes its approved directory.");
  return resolved;
}

async function assertRegularFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 128 || stat.size > 20 * 1024 * 1024) throw new Error("Avatar sprite-pack asset is invalid.");
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

function resolveFfmpeg(): string {
  return process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
}

function resolveFfprobe(): string {
  return process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe";
}

function runProcess(command: string, args: string[], captureStdout = false): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout });
      else reject(new Error(`Local avatar media process failed with code ${code ?? "unknown"}: ${stderr.slice(-500)}`));
    });
  });
}
