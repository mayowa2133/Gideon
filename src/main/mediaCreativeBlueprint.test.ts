import { describe, expect, it } from "vitest";
import { compileCreativeBlueprint, projectBlueprintOntoEditDecisionList } from "../shared/creativeBlueprint";
import { buildEditDecisionList, buildVisualBeatsForTemplate } from "../shared/renderTemplates";
import type { DetectedMoment, ProductProfile, ScriptDraft } from "../shared/types";
import { buildGeneratedPresenterFilters, captionBackdropRect, parseRenderedAudioQa, validateRenderManifest } from "./media";

const profile: ProductProfile = {
  productName: "Gideon Fixture",
  targetCustomer: "product teams",
  productDescription: "Turns product evidence into creator videos",
  preferredTone: "educational",
  toneGuidance: "Use grounded claims",
  platforms: ["tiktok"],
  walkthroughNotes: "Show proof",
  brandPresenterEnabled: true,
  avatarPresenterId: "orbit",
  creatorPacePreset: "energetic"
};

const moments: DetectedMoment[] = [{
  id: "proof",
  label: "Product dashboard",
  startMs: 0,
  endMs: 12_000,
  evidence: "Dashboard result is visible",
  sourceEvidenceIds: ["evidence-proof"],
  confidence: 0.95,
  enabled: true
}];

function approvedScript(): ScriptDraft {
  const voiceoverText = Array.from({ length: 118 }, (_, index) => `proof${index}`).join(" ");
  return {
    id: "script-fixture",
    conceptId: "concept-fixture",
    templateKey: "brand_presenter",
    hook: "Watch the product prove the result.",
    voiceoverText,
    captions: Array.from({ length: 10 }, (_, index) => ({
      startMs: index * 4_000,
      endMs: (index + 1) * 4_000,
      text: `Product proof ${index + 1}`
    })),
    cta: "Try it with your product",
    visualBeats: [],
    evidenceClaims: [{ text: "The result is visible", sourceEvidenceIds: ["evidence-proof"], momentIds: ["proof"] }],
    approved: true,
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
}

function projectedEdl() {
  const script = approvedScript();
  const blueprint = compileCreativeBlueprint({ profile, script, moments, recordingPath: "/private/source.mp4" }).blueprint;
  blueprint.scenes = blueprint.scenes.map((scene) => ({
    ...scene,
    presenter: { ...scene.presenter, backgroundTreatment: "green_screen" as const }
  }));
  const beats = buildVisualBeatsForTemplate({ moments, durationMs: 40_000, templateKey: "brand_presenter" });
  return projectBlueprintOntoEditDecisionList(buildEditDecisionList({
    profile,
    templateKey: "brand_presenter",
    durationMs: 40_000,
    captions: script.captions,
    visualBeats: beats,
    hook: script.hook,
    cta: script.cta,
    moments
  }), blueprint);
}

describe("scene-aware CreativeBlueprint rendering", () => {
  it("compiles independent presenter branches for full, lower-third, split, hidden, and CTA scenes", () => {
    const edl = projectedEdl();
    const result = buildGeneratedPresenterFilters(edl, 2, edl.durationMs / 1_000, { backgroundType: "green_screen" });
    const filter = result.filters.join(";");
    expect(filter).toContain("chromakey=0x00FF00");
    expect(filter).toContain("scale=1080:1920");
    expect(filter).toContain("scale=430:765");
    expect(filter).toMatch(/scale=520:925/);
    expect(filter).toContain("enable='between(t,");
    expect(result.outputLabel).toMatch(/^base_presenter_/);
    expect(edl.creativeBlueprint?.scenes.some((scene) => !scene.presenter.visible)).toBe(true);
  });

  it("does not fall back to the global presenter for a blueprint-local hidden scene", () => {
    const edl = projectedEdl();
    edl.creativeBlueprint = {
      ...edl.creativeBlueprint!,
      scenes: [{ ...edl.creativeBlueprint!.scenes[0]!, presenter: { ...edl.creativeBlueprint!.scenes[0]!.presenter, visible: false } }]
    };
    const result = buildGeneratedPresenterFilters(edl, 2, edl.durationMs / 1_000, { backgroundType: "green_screen" }, "base_decorated");
    expect(result).toEqual({ filters: [], outputLabel: "base_decorated" });
  });

  it("keeps the caption contrast backing inside the vertical canvas", () => {
    expect(captionBackdropRect({ x: 120, y: 1550, width: 840 }, 58, 2)).toEqual({
      x: 98,
      y: 1492,
      width: 884,
      height: 136
    });
  });

  it("validates the projected scene timeline and rejects a mismatched blueprint duration", () => {
    const edl = projectedEdl();
    expect(() => validateRenderManifest(edl)).not.toThrow();
    expect(() => validateRenderManifest({
      ...edl,
      creativeBlueprint: { ...edl.creativeBlueprint!, targetDurationMs: edl.durationMs - 1_000 }
    })).toThrow("duration does not match");
  });

  it("parses loudness and maximum silence into a stable post-render audio report", () => {
    const report = parseRenderedAudioQa(`
      silence_end: 4.20 | silence_duration: 0.42
      Integrated loudness:
        I: -14.2 LUFS
      Loudness range:
        LRA: 2.8 LU
      silence_end: 8.10 | silence_duration: 0.91
    `);
    expect(report).toEqual({
      integratedLufs: -14.2,
      loudnessRangeLu: 2.8,
      maxContinuousSilenceMs: 910,
      targetLufs: -14,
      withinTarget: true
    });
  });
});
