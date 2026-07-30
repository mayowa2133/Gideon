import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EditorialCaptionCue, EditorialShot } from "../shared/creatorEditorial";
import type { EditorialV2CaptionCue, EditorialV2Shot } from "../shared/creatorEditorialV2";
import type { EditorialV3CaptionCue, EditorialV3Shot } from "../shared/creatorEditorialV3";
import type { EditorialV4CaptionCue, EditorialV4Shot } from "../shared/creatorEditorialV4";
import type { BrandKit } from "../shared/types";
import {
  creatorEditorialV2EncodingProfiles,
  creatorEditorialV3EncodingProfiles,
  creatorEditorialV4EncodingProfiles,
  renderCreatorEditorialCaptionOverlay,
  renderCreatorEditorialShot,
  renderCreatorEditorialV2CaptionOverlay,
  renderCreatorEditorialV2Shot,
  renderCreatorEditorialV3CaptionOverlay,
  renderCreatorEditorialV3Shot,
  renderCreatorEditorialV4CaptionOverlay,
  renderCreatorEditorialV4Shot
} from "./creatorEditorialRenderer";

const ffmpeg = process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
const ffprobe = process.env.GIDEON_FFPROBE_PATH?.trim() || "/opt/homebrew/bin/ffprobe";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const brandKit: BrandKit = {
  productName: "Fixture",
  primaryColor: "#101A33",
  secondaryColor: "#F4F1E8",
  accentColor: "#39D3C4",
  backgroundColor: "#071526",
  captionStyle: "kinetic_bold",
  ctaStyle: "learn_more",
  tagline: "Verified fixture evidence."
};

describe("creator editorial renderer integration", () => {
  it("renders an evidence/presenter split, kinetic captions, and a decodable audio/video mux", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-editorial-renderer-"));
    temporaryDirectories.push(root);
    const productPath = path.join(root, "product.mp4");
    const presenterPath = path.join(root, "presenter.mp4");
    const shotPath = path.join(root, "shot.mp4");
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=30:d=2",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", productPath
    ]);
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x00ff00:s=540x960:r=30:d=2",
      "-vf", "drawbox=x=170:y=240:w=200:h=600:color=0x101A33:t=fill", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", presenterPath
    ]);
    const caption: EditorialCaptionCue = {
      id: "fixture-caption",
      startMs: 0,
      endMs: 800,
      words: ["Verified", "product", "result"],
      emphasizedWords: ["Verified"],
      timingProvenance: "provider_exact",
      safeRegion: { x: 0.50, y: 0.08, width: 0.42, height: 0.24 },
      role: "display_editorial"
    };
    const shot: EditorialShot = {
      id: "fixture-shot",
      family: "presenter_product_split",
      startMs: 0,
      endMs: 2_000,
      narrationBeatIds: ["fixture-beat"],
      productEvidenceIds: ["fixture-evidence"],
      sourceCaptureHashes: ["a".repeat(64)],
      sourceIntervalMs: { startMs: 0, endMs: 2_000 },
      crop: { x: 0.5, y: 0.5, scale: 1.25 },
      presenter: { visible: true, placement: "left", scale: 0.4, gesture: "point_right" },
      camera: { from: { x: 0.5, y: 0.5, scale: 1.05 }, to: { x: 0.55, y: 0.48, scale: 1.25 }, easing: "cubic_in_out", pointerPolicy: "geometry_fallback", maxScaleDelta: 0.42 },
      captions: [caption],
      transitionIn: { kind: "card_slide", durationMs: 240 },
      transitionOut: { kind: "cut", durationMs: 0 },
      callout: "spotlight",
      musicIntensity: 0.5,
      soundEffects: ["card_entry"],
      expectedVisualChange: "major",
      claimIds: ["fixture-claim"],
      cacheIdentity: "b".repeat(64),
      fallback: "static_evidence_crop"
    };
    await renderCreatorEditorialShot({
      shot,
      shotIndex: 0,
      sources: [{ evidenceAssetId: "fixture-evidence", sourcePath: productPath, fallbackStartMs: 0 }],
      presenterPath,
      brandKit,
      outputPath: shotPath,
      ffmpegPath: ffmpeg
    });
    const overlay = await renderCreatorEditorialCaptionOverlay({
      captions: [caption],
      durationMs: 2_000,
      outputDir: path.join(root, "captions"),
      brandKit,
      disclosure: "AI-generated fixture presenter"
    });
    const overlayFrame = overlay.framePattern.replace("%06d", "000000");
    expect((await fs.stat(overlayFrame)).size).toBeGreaterThan(1_000);
    const muxedPath = path.join(root, "muxed.mp4");
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", shotPath,
      "-framerate", "10", "-start_number", "0", "-i", overlay.framePattern,
      "-f", "lavfi", "-t", "2", "-i", "sine=frequency=220:sample_rate=48000",
      "-filter_complex", "[1:v]fps=30,format=rgba[c];[0:v][c]overlay=0:0:shortest=1[v]",
      "-map", "[v]", "-map", "2:a:0", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "2", muxedPath
    ]);
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", muxedPath, "-f", "null", "-"]);
    const probe = await capture(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", muxedPath]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
    expect(parsed.streams.find(({ codec_type }) => codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
    expect(parsed.streams.find(({ codec_type }) => codec_type === "audio")?.codec_name).toBe("aac");
  }, 60_000);

  it("renders v2 context-to-detail evidence, animated caption hierarchy, and production encoding profiles", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-editorial-v2-renderer-"));
    temporaryDirectories.push(root);
    const productPath = path.join(root, "authentic-product.mp4");
    const presenterPath = path.join(root, "axiom.mp4");
    const shotPath = path.join(root, "v2-shot.mp4");
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=2.2",
      "-vf", "drawbox=x=460:y=700:w=180:h=120:color=0x39D3C4:t=5",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", productPath
    ]);
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=0x00ff00:s=540x960:r=30:d=2.2",
      "-vf", "drawbox=x=160:y=190:w=220:h=670:color=0x101A33:t=fill",
      "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", presenterPath
    ]);
    const caption: EditorialV2CaptionCue = {
      id: "v2-caption",
      startMs: 0,
      endMs: 620,
      words: ["Verified", "next", "move"],
      emphasizedWords: ["Verified"],
      timingProvenance: "provider_exact",
      safeRegion: { x: 0.5, y: 0.08, width: 0.42, height: 0.22 },
      role: "keyword_emphasis",
      animation: { kind: "word_punch", settleMs: 160 },
      positionPolicy: "evidence_aware"
    };
    const shot: EditorialV2Shot = {
      id: "v2-fixture-shot",
      family: "presenter_product_split",
      startMs: 0,
      endMs: 2_200,
      narrationBeatIds: ["v2-beat"],
      productEvidenceIds: ["fixture-evidence"],
      sourceCaptureHashes: ["a".repeat(64)],
      sourceIntervalMs: { startMs: 0, endMs: 2_200 },
      crop: { x: 0.54, y: 0.46, scale: 1.55 },
      presenter: {
        visible: true,
        placement: "left",
        scale: 0.46,
        gesture: "point_right",
        framing: "chest_up",
        pose: "point_right",
        motion: {
          idleSwayAmplitudePx: 14,
          idleSwayPeriodMs: 3_800,
          headAmplitudePx: 7,
          lateralShiftPx: 12,
          punchIn: 0.025,
          gestureStartMs: 260,
          gestureDurationMs: 720,
          easing: "cubic_in_out"
        }
      },
      camera: {
        from: { x: 0.51, y: 0.49, scale: 1.27 },
        to: { x: 0.54, y: 0.46, scale: 1.55 },
        easing: "cubic_in_out",
        pointerPolicy: "contain_pointer",
        maxScaleDelta: 0.42
      },
      captions: [caption],
      transitionIn: { kind: "cut", durationMs: 0 },
      transitionOut: { kind: "cut", durationMs: 0 },
      callout: "spotlight",
      musicIntensity: 0.6,
      soundEffects: ["click"],
      expectedVisualChange: "major",
      claimIds: ["fixture-claim"],
      cacheIdentity: "b".repeat(64),
      fallback: "static_evidence_crop",
      backgroundMode: "teal_split",
      evidenceTreatment: {
        stage: "context_to_detail",
        dimIrrelevantUi: true,
        spotlight: true,
        resultHoldMs: 450,
        authenticPixelsPreserved: true,
        syntheticPointerAdded: false
      },
      compositionSignature: "fixture-v2"
    };
    await renderCreatorEditorialV2Shot({
      shot,
      shotIndex: 0,
      sources: [{ evidenceAssetId: "fixture-evidence", sourcePath: productPath, fallbackStartMs: 0 }],
      presenterPath,
      brandKit,
      outputPath: shotPath,
      ffmpegPath: ffmpeg
    });
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", shotPath, "-f", "null", "-"]);
    const overlay = await renderCreatorEditorialV2CaptionOverlay({
      captions: [caption],
      durationMs: 2_200,
      outputDir: path.join(root, "v2-captions"),
      brandKit,
      disclosure: "AI-generated fixture presenter"
    });
    expect((await fs.stat(overlay.framePattern.replace("%06d", "000000"))).size).toBeGreaterThan(1_000);
    expect(creatorEditorialV2EncodingProfiles.master).toMatchObject({
      width: 1080,
      height: 1920,
      crf: 17,
      preset: "slow",
      audioSampleRate: 48_000
    });
    const probe = await capture(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", shotPath]);
    const parsed = JSON.parse(probe.stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
    expect(parsed.streams.find(({ codec_type }) => codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });

    const v3Caption: EditorialV3CaptionCue = {
      ...caption,
      id: "v3-caption",
      visualStyle: "accent_underline",
      placementKey: "top_left",
      plate: "none",
      contrast: "light_text"
    };
    const v3Shot: EditorialV3Shot = {
      ...shot,
      id: "v3-fixture-shot",
      captions: [v3Caption],
      presenter: {
        ...shot.presenter,
        performance: {
          id: "pointing_right",
          sourceStartMs: 100,
          sourceEndMs: 1_500,
          silhouetteClass: "right_extension",
          intensity: "medium",
          gesturePeakOffsetMs: 700,
          holdFinalPose: true,
          mirrored: false
        },
        gestureCooldownMs: 900
      },
      evidenceTreatment: {
        ...shot.evidenceTreatment,
        contextMs: 420,
        actionMs: 620,
        targetOccupancyRatio: 0.54,
        adaptiveBackground: "dark_contrast",
        borderWidthPx: 3,
        evidenceSharp: true,
        cursorLayerCount: 0
      },
      motionEvents: [
        {
          id: "v3-primary",
          kind: "presenter_performance",
          startMs: 100,
          endMs: 1_400,
          role: "primary",
          easing: "ease_out",
          semanticPurpose: "Exercise an actual presenter interval."
        },
        {
          id: "v3-support",
          kind: "product_entry",
          startMs: 80,
          endMs: 540,
          role: "supporting",
          easing: "ease_out",
          semanticPurpose: "Exercise product entry motion."
        }
      ],
      compositionFamily: "asymmetric_split",
      compositionSignature: "fixture-v3",
      cacheIdentity: "c".repeat(64)
    };
    const v3ShotPath = path.join(root, "v3-shot.mp4");
    await renderCreatorEditorialV3Shot({
      shot: v3Shot,
      shotIndex: 0,
      sources: [{ evidenceAssetId: "fixture-evidence", sourcePath: productPath, fallbackStartMs: 0 }],
      presenterPath,
      brandKit,
      outputPath: v3ShotPath,
      ffmpegPath: ffmpeg
    });
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", v3ShotPath, "-f", "null", "-"]);
    const v3Overlay = await renderCreatorEditorialV3CaptionOverlay({
      captions: [v3Caption],
      durationMs: 2_200,
      outputDir: path.join(root, "v3-captions"),
      brandKit,
      disclosure: "AI-generated fixture presenter"
    });
    expect((await fs.stat(v3Overlay.framePattern.replace("%06d", "000000"))).size).toBeGreaterThan(1_000);
    expect(creatorEditorialV3EncodingProfiles.master.crf).toBe(16);

    const v4Caption: EditorialV4CaptionCue = {
      ...v3Caption,
      id: "v4-caption",
      words: ["Verified", "result"],
      phraseGrouped: true,
      editorialIntent: "narration_phrase"
    };
    const v4Shot: EditorialV4Shot = {
      ...v3Shot,
      id: "v4-fixture-shot",
      captions: [v4Caption],
      presenter: {
        ...v3Shot.presenter,
        performance: {
          id: "pointing_right",
          sourceStartMs: 100,
          sourceEndMs: 1_500,
          gesturePeakSourceMs: 800,
          entranceMs: 180,
          gestureMs: 520,
          holdMs: 420,
          cooldownMs: 450,
          handPosition: "right_extended",
          shoulderPosition: "right_lead",
          bodyLean: "center",
          direction: "right",
          silhouetteClass: "right_extension",
          energy: "medium",
          suitableFraming: ["chest_up"],
          safeFaceRegion: { x: 0.27, y: 0.04, width: 0.46, height: 0.24 },
          safeHandRegion: { x: 0.02, y: 0.25, width: 0.96, height: 0.42 },
          safeCaptionRegions: ["top_left", "lower_left"],
          safeProductRegions: ["right"],
          loopRisk: "low",
          visualQualityScore: 0.86,
          gesturePeakOffsetMs: 700,
          holdFinalPose: true,
          mirrored: false,
          inventorySourceStartMs: 100,
          inventorySourceEndMs: 1_500,
          alignedWord: "Verified",
          alignedWordStartMs: 700,
          timelineGesturePeakMs: 700,
          gesturePeakDeltaMs: 0,
          anticipationStartMs: 520,
          holdEndMs: 1_120,
          cooldownEndMs: 1_570,
          preRollHoldMs: 0
        }
      },
      evidenceTreatment: {
        ...v3Shot.evidenceTreatment,
        actionRegion: { x: 0.29, y: 0.31, width: 0.42, height: 0.30 },
        resultRegion: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 },
        criticalRegion: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 },
        focusSequence: "context_action_result",
        actionOccupancyRatio: 0.58,
        resultOccupancyRatio: 0.62,
        postFocusDrift: { x: 0.01, y: -0.008, scale: 0.045 }
      },
      choreography: {
        anticipationMs: 180,
        gestureMs: 520,
        holdMs: 420,
        cooldownMs: 450,
        narrationAligned: true
      },
      cacheIdentity: "d".repeat(64)
    };
    const v4ShotPath = path.join(root, "v4-shot.mp4");
    await renderCreatorEditorialV4Shot({
      shot: v4Shot,
      shotIndex: 0,
      sources: [{
        evidenceAssetId: "fixture-evidence",
        workflowId: "fixture-workflow",
        sourcePath: productPath,
        sourceSha256: "a".repeat(64),
        fallbackStartMs: 0,
        sourceWidth: 1080,
        sourceHeight: 1920,
        sourceDurationMs: 2_200,
        framingManifestPath: path.join(root, "fixture-framing.json"),
        framingManifestSha256: "c".repeat(64),
        verifiedSourceInterval: { startMs: 0, endMs: 2_200 },
        focusKeyframes: [
          {
            id: "fixture-action",
            kind: "action",
            startMs: 200,
            endMs: 900,
            region: { x: 0.29, y: 0.31, width: 0.42, height: 0.30 },
            provenance: "recorded_action_target"
          },
          {
            id: "fixture-result",
            kind: "result",
            startMs: 900,
            endMs: 2_200,
            region: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 },
            provenance: "reviewed_capture_geometry"
          }
        ],
        telemetryProvenance: {
          action: "recorded_action_target",
          result: "reviewed_capture_geometry",
          cursor: "action_target_center"
        }
      }],
      presenterPath,
      brandKit,
      outputPath: v4ShotPath,
      ffmpegPath: ffmpeg
    });
    await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", v4ShotPath, "-f", "null", "-"]);
    const v4Overlay = await renderCreatorEditorialV4CaptionOverlay({
      captions: [v4Caption],
      durationMs: 2_200,
      outputDir: path.join(root, "v4-captions"),
      brandKit,
      disclosure: "AI-generated fixture presenter"
    });
    expect((await fs.stat(v4Overlay.framePattern.replace("%06d", "000000"))).size).toBeGreaterThan(1_000);
    expect(creatorEditorialV4EncodingProfiles.master.crf).toBe(16);
  }, 60_000);
});

function run(executable: string, args: string[]): Promise<void> {
  return capture(executable, args).then(({ code, stderr }) => {
    if (code !== 0) throw new Error(`${path.basename(executable)} failed: ${stderr}`);
  });
}

function capture(executable: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}
