import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AvatarModelReceipt,
  AvatarPerformanceMetadata,
  AvatarQualityReport,
  FictionalAvatarPresenterId
} from "../shared/types";

export interface DeterministicAvatarFixtureResult {
  outputPath: string;
  receipt: AvatarModelReceipt;
  performance: AvatarPerformanceMetadata;
  qualityReport: AvatarQualityReport;
}

export type DeterministicAvatarProcessRunner = (command: string, args: string[]) => Promise<void>;

export async function createDeterministicAvatarFixture(input: {
  outputPath: string;
  durationMs: number;
  avatarId?: Exclude<FictionalAvatarPresenterId, "logo_head">;
  sourceImagePath?: string;
  ffmpegPath?: string;
  runProcess?: DeterministicAvatarProcessRunner;
}): Promise<DeterministicAvatarFixtureResult> {
  if (!path.isAbsolute(input.outputPath)) {
    throw new Error("Deterministic avatar fixture output must use an absolute path.");
  }
  if (input.durationMs < 1_000 || input.durationMs > 60_000) {
    throw new Error("Deterministic avatar fixture duration must be between one and sixty seconds.");
  }
  const avatarId = input.avatarId ?? "orbit";
  const sourceImagePath = input.sourceImagePath ?? path.resolve(process.cwd(), "assets", "avatar-catalog", `${avatarId}.png`);
  if (!path.isAbsolute(sourceImagePath)) {
    throw new Error("Deterministic avatar fixture source must use an absolute path.");
  }
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  const durationSec = (input.durationMs / 1_000).toFixed(3);
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x00FF00:s=1080x1920:r=30:d=${durationSec}`,
    "-loop", "1", "-i", sourceImagePath,
    "-filter_complex",
    `[1:v]scale=720:720:force_original_aspect_ratio=decrease,format=rgba[avatar];` +
      `[0:v][avatar]overlay=x=(W-w)/2:y=H-h-180+10*sin(2*PI*t/2.4):shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-t", durationSec, "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", input.outputPath
  ];
  await (input.runProcess ?? runProcess)(input.ffmpegPath ?? resolveFfmpeg(), args);
  return {
    outputPath: input.outputPath,
    receipt: {
      provider: "deterministic_fixture",
      modelVersion: "synthetic-layout-fixture-v1",
      modelLicense: "test-fixture-only",
      avatarId,
      avatarProvenance: "gideon_fictional_catalog",
      disclosure: "AI-generated brand presenter",
      generatedAt: new Date(0).toISOString()
    },
    performance: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: input.durationMs,
      cropSafeRegion: { x: 0.16, y: 0.08, width: 0.68, height: 0.84 },
      backgroundType: "green_screen",
      status: "completed"
    },
    qualityReport: {
      requiresHumanReview: true,
      evaluator: "not_run"
    }
  };
}

function resolveFfmpeg(): string {
  return process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Deterministic avatar fixture failed with code ${code ?? "unknown"}: ${stderr.slice(-500)}`));
    });
  });
}
