import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createMoments, generateConcepts, generateScripts, splitCaptionSegments } from "../shared/contentEngine";
import { buildEditDecisionList, buildVisualBeatsForTemplate, creatorTemplatePack } from "../shared/renderTemplates";
import type { ProductProfile } from "../shared/types";
import {
  buildAudioMixFilter,
  calloutTextFromInstruction,
  probeRecording,
  renderDraft,
  summarizeRenderFrameQa,
  validateRenderFrameQa,
  validateRenderManifest,
  zoomFilterExpressions
} from "./media";

const run = promisify(execFile);
const ffmpeg = findFfmpegForTest();

const profile: ProductProfile = {
  productName: "LeadPilot",
  targetCustomer: "B2B SaaS founders",
  productDescription: "Finds qualified leads and drafts personalized outreach from one workflow.",
  preferredTone: "direct",
  toneGuidance: "No hype.",
  platforms: ["tiktok", "youtube_shorts"],
  walkthroughNotes: "Show setup, result, and final outreach.",
  soundDesignEnabled: true,
  musicMood: "clean_tech"
};

describe("media pipeline", () => {
  it("derives concise overlay callout text from visual beat instructions", () => {
    expect(calloutTextFromInstruction("Show Core action in the walkthrough with readable framing.")).toBe(
      "Core action in the walkthrough"
    );
  });

  it("rejects render manifests with unsafe timed caption layout", () => {
    const script = draftScript();
    expect(() => validateRenderManifest(script.editDecisionList!)).not.toThrow();

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      captions: [
        {
          startMs: 0,
          endMs: 2_000,
          text: "ThisCaptionSegmentIsIntentionallyTooWideForTheVerticalSafeAreaBecauseItNeverBreaks",
          words: []
        }
      ]
    })).toThrow("Caption text is too long");
  });

  it("validates an export-ready edit decision list for every creator template", () => {
    const recording = {
      filePath: "/tmp/source.mp4",
      fileUrl: "file:///tmp/source.mp4",
      fileName: "source.mp4",
      sizeBytes: 1024,
      durationMs: 24_000,
      width: 1280,
      height: 720,
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      hasAudio: true,
      validatedAt: "2026-06-24T00:00:00.000Z"
    };
    const moments = createMoments(profile, recording, (id) => `template-moment-${id}`);
    const voiceover = "Watch the slow step. Then see the result happen on screen. That matters because the workflow is simpler.";

    creatorTemplatePack.forEach((template) => {
      const visualBeats = buildVisualBeatsForTemplate({
        moments,
        durationMs: 24_000,
        templateKey: template.key
      });
      const manifest = buildEditDecisionList({
        profile: { ...profile, brandPresenterEnabled: template.key === "brand_presenter" },
        templateKey: template.key,
        durationMs: 24_000,
        captions: splitCaptionSegments(voiceover, 24_000),
        visualBeats,
        hook: `Watch ${profile.productName} handle the workflow.`,
        cta: `Try ${profile.productName} on one workflow.`,
        moments
      });

      expect(() => validateRenderManifest(manifest)).not.toThrow();
      expect(manifest.templateId).toBe(`creator-template:${template.key}:v1`);
      expect(manifest.transitions.length).toBeGreaterThanOrEqual(visualBeats.length - 1);
    });
  });

  it("rejects render manifests with unsafe callout layout", () => {
    const script = draftScript();
    const callout = script.editDecisionList!.callouts[0]!;

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      callouts: [
        {
          ...callout,
          text: "ThisCalloutLabelIsIntentionallyTooWideForTheRenderedTwoLineSafeAreaAndMustBeEditedBeforeExport"
        }
      ]
    })).toThrow("Callout text is too long");
  });

  it("rejects render manifests with invalid caption word timing", () => {
    const script = draftScript();
    const caption = script.editDecisionList!.captions[0]!;

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      captions: [
        {
          ...caption,
          words: [
            {
              startMs: caption.startMs - 100,
              endMs: caption.startMs + 100,
              text: "bad"
            }
          ]
        }
      ]
    })).toThrow("invalid timing");
  });

  it("rejects render manifests with caption timing that cannot align to audio", () => {
    const script = draftScript();
    const firstCaption = script.editDecisionList!.captions[0]!;
    const lastCaption = script.editDecisionList!.captions[script.editDecisionList!.captions.length - 1]!;

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      captions: [
        {
          ...firstCaption,
          startMs: 2_200,
          endMs: 4_000,
          words: undefined
        },
        {
          ...lastCaption,
          startMs: 4_000,
          endMs: script.editDecisionList!.durationMs
        }
      ]
    })).toThrow("starts too late");

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      captions: [
        {
          ...firstCaption,
          startMs: 0,
          endMs: 2_000,
          words: undefined
        }
      ]
    })).toThrow("ends too early");

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      captions: [
        {
          ...firstCaption,
          startMs: 0,
          endMs: 1_500,
          words: undefined
        },
        {
          ...lastCaption,
          startMs: 5_200,
          endMs: script.editDecisionList!.durationMs
        }
      ]
    })).toThrow("gap too large");
  });

  it("rejects render manifests with invalid zoom focus", () => {
    const script = draftScript();
    const zoom = script.editDecisionList!.zooms[0]!;

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      zooms: [
        {
          ...zoom,
          focus: { x: 1.4, y: 0.5, scale: 1.2 }
        }
      ]
    })).toThrow("Zoom cue 1 focus is outside the supported render range");
  });

  it("rejects render manifests with unsupported callout arrow directions", () => {
    const script = draftScript();
    const callout = script.editDecisionList!.callouts[0]!;

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      callouts: [
        {
          ...callout,
          arrow: { enabled: true, direction: "diagonal" as never }
        }
      ]
    })).toThrow("Callout 1 arrow direction is unsupported");
  });

  it("rejects render manifests with unsupported transition cues", () => {
    const script = draftScript();

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      transitions: [
        {
          id: "transition-bad",
          kind: "spin" as never,
          startMs: 1_000,
          endMs: 1_200,
          emphasis: "accent"
        }
      ]
    })).toThrow("Transition cue 1 kind is unsupported");
  });

  it("rejects render manifests with invalid cursor emphasis cues", () => {
    const script = draftScript();

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      cursorCues: [
        {
          id: "cursor-bad",
          kind: "click_target",
          startMs: 0,
          endMs: 1_000,
          anchor: { x: 0.45, y: 1.2, scale: 1.1 },
          confidence: 0.8
        }
      ]
    })).toThrow("Cursor cue 1 focus is outside the supported render range");

    expect(() => validateRenderManifest({
      ...script.editDecisionList!,
      cursorCues: [
        {
          id: "cursor-bad-confidence",
          kind: "cursor_candidate",
          startMs: 0,
          endMs: 1_000,
          anchor: { x: 0.45, y: 0.52, scale: 1.1 },
          confidence: 1.4
        }
      ]
    })).toThrow("Cursor cue 1 confidence is outside the supported render range");
  });

  it("builds smooth focus-aware zoom filter expressions", () => {
    const script = draftScript();
    const manifest = {
      ...script.editDecisionList!,
      zooms: [
        {
          startMs: 0,
          endMs: 1_800,
          fromScale: 1,
          toScale: 1.4,
          focus: { x: 0.8, y: 0.2, scale: 1.4 },
          easing: "standard" as const
        }
      ]
    };

    const expressions = zoomFilterExpressions(manifest, 0, 2_000);

    expect(expressions.scale).toContain("clip((t-0.000)/1.800\\,0\\,1)");
    expect(expressions.scale).toContain("0.400");
    expect(expressions.cropX).toContain("0.5+(between(t\\,0.000\\,1.800))*0.300");
    expect(expressions.cropY).toContain("0.5+(between(t\\,0.000\\,1.800))*-0.300");
  });

  it("builds optional music and SFX audio mix filters from the render manifest", () => {
    const script = draftScript();
    const filter = buildAudioMixFilter(script.editDecisionList!, 12);

    expect(script.editDecisionList!.music.enabled).toBe(true);
    expect(script.editDecisionList!.sfx.length).toBeGreaterThan(0);
    expect(filter).toContain("sine=frequency=220");
    expect(filter).toContain("adelay=");
    expect(filter).toContain("amix=inputs=");
  });

  it("rejects render QA samples when every sampled frame is visually empty", () => {
    const frameQa = summarizeRenderFrameQa([
      { averageLuma: 0, minLuma: 0, maxLuma: 0, lumaStandardDeviation: 0 },
      { averageLuma: 1, minLuma: 1, maxLuma: 1, lumaStandardDeviation: 0 },
      { averageLuma: 255, minLuma: 255, maxLuma: 255, lumaStandardDeviation: 0 }
    ]);

    expect(frameQa).toMatchObject({ sampledFrames: 3, informativeFrames: 0 });
    expect(() => validateRenderFrameQa(frameQa)).toThrow("Rendered video appears blank");
  });

  it("accepts render QA samples with at least one informative frame", () => {
    const frameQa = summarizeRenderFrameQa([
      { averageLuma: 8, minLuma: 8, maxLuma: 8, lumaStandardDeviation: 0 },
      { averageLuma: 120, minLuma: 8, maxLuma: 242, lumaStandardDeviation: 48 }
    ]);

    expect(frameQa).toMatchObject({ sampledFrames: 2, informativeFrames: 1 });
    expect(() => validateRenderFrameQa(frameQa)).not.toThrow();
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
    const presenterProfile: ProductProfile = {
      ...profile,
      defaultTemplateKey: "brand_presenter",
      brandPresenterEnabled: true
    };
    let counter = 0;
    const moments = createMoments(presenterProfile, recording, () => `moment-${++counter}`);
    const concepts = generateConcepts(presenterProfile, moments, () => `concept-${++counter}`);
    const [script] = generateScripts(presenterProfile, concepts, moments, () => `script-${++counter}`, () => "2026-06-24T00:00:00.000Z");
    expect(script).toBeDefined();
    expect(script?.templateKey).toBe("brand_presenter");

    process.env.GIDEON_DISABLE_SAY = "1";
    const rendered = await renderDraft({
      projectId: "project-test",
      projectDir: tempDir,
      profile: presenterProfile,
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
    expect(rendered.validation.frameQa).toMatchObject({ sampledFrames: 3 });
    expect(rendered.validation.frameQa?.informativeFrames).toBeGreaterThan(0);
    const overlayFrames = await fs.readdir(path.join(tempDir, "renders", script!.id, "overlay-frames"));
    expect(overlayFrames.filter((fileName) => fileName.endsWith(".png")).length).toBeGreaterThan(1);
    await expect(fs.access(rendered.outputPath)).resolves.toBeUndefined();
  }, 120_000);
});

function draftScript() {
  const recording = {
    filePath: "/tmp/source.mp4",
    fileUrl: "file:///tmp/source.mp4",
    fileName: "source.mp4",
    sizeBytes: 1024,
    durationMs: 18_000,
    width: 1280,
    height: 720,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
    validatedAt: "2026-06-24T00:00:00.000Z"
  };
  let counter = 0;
  const moments = createMoments(profile, recording, () => `qa-moment-${++counter}`);
  const concepts = generateConcepts(profile, moments, () => `qa-concept-${++counter}`);
  const [script] = generateScripts(profile, concepts, moments, () => `qa-script-${++counter}`, () => "2026-06-24T00:00:00.000Z");
  if (!script) {
    throw new Error("Test setup did not generate a script.");
  }
  return script;
}

function findFfmpegForTest(): string | null {
  const candidates = [
    process.env.GIDEON_FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg"
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => candidate === "ffmpeg" || existsSync(candidate)) ?? null;
}
