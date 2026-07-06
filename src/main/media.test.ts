import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createMoments, generateConcepts, generateScripts } from "../shared/contentEngine";
import type { ProductProfile } from "../shared/types";
import { calloutTextFromInstruction, probeRecording, renderDraft } from "./media";

const run = promisify(execFile);
const ffmpeg = findFfmpegForTest();

const profile: ProductProfile = {
  productName: "LeadPilot",
  targetCustomer: "B2B SaaS founders",
  productDescription: "Finds qualified leads and drafts personalized outreach from one workflow.",
  preferredTone: "direct",
  toneGuidance: "No hype.",
  platforms: ["tiktok", "youtube_shorts"],
  walkthroughNotes: "Show setup, result, and final outreach."
};

describe("media pipeline", () => {
  it("derives concise overlay callout text from visual beat instructions", () => {
    expect(calloutTextFromInstruction("Show Core action in the walkthrough with readable framing.")).toBe(
      "Core action in the walkthrough"
    );
  });

  it.runIf(Boolean(ffmpeg))("probes and renders a vertical H.264/AAC draft from a local recording", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-media-"));
    const sourcePath = path.join(tempDir, "source.mp4");
    await run(ffmpeg!, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=44100",
      "-t",
      "12",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      sourcePath
    ]);

    const recording = await probeRecording(sourcePath);
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    const concepts = generateConcepts(profile, moments, () => `concept-${++counter}`);
    const [script] = generateScripts(profile, concepts, moments, () => `script-${++counter}`, () => "2026-06-24T00:00:00.000Z");
    expect(script).toBeDefined();

    process.env.GIDEON_DISABLE_SAY = "1";
    const rendered = await renderDraft({
      projectId: "project-test",
      projectDir: tempDir,
      profile,
      recording,
      script: script!,
      moment: moments[0],
      title: "Smoke render"
    });
    delete process.env.GIDEON_DISABLE_SAY;

    expect(rendered.validation.width).toBe(1080);
    expect(rendered.validation.height).toBe(1920);
    expect(rendered.validation.videoCodec).toBe("h264");
    expect(rendered.validation.audioCodec).toBe("aac");
    const overlayFrames = await fs.readdir(path.join(tempDir, "renders", script!.id, "overlay-frames"));
    expect(overlayFrames.filter((fileName) => fileName.endsWith(".png")).length).toBeGreaterThan(1);
    await expect(fs.access(rendered.outputPath)).resolves.toBeUndefined();
  }, 120_000);
});

function findFfmpegForTest(): string | null {
  const candidates = [
    process.env.GIDEON_FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg"
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => candidate === "ffmpeg" || existsSync(candidate)) ?? null;
}
