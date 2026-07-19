import { describe, expect, it } from "vitest";
import {
  buildProductEvidenceAssets,
  compileCreativeBlueprint,
  projectBlueprintOntoEditDecisionList,
  referenceCreatorVideoTemplateV1,
  validateCreativeBlueprint
} from "./creativeBlueprint";
import type { DetectedMoment, FrameEvidence, ProductProfile, ScriptDraft } from "./types";
import { buildEditDecisionList, buildVisualBeatsForTemplate } from "./renderTemplates";

const profile: ProductProfile = {
  productName: "NexusReach",
  targetCustomer: "sales teams",
  productDescription: "Evidence-backed outreach drafts",
  preferredTone: "educational",
  toneGuidance: "Clear and direct",
  platforms: ["tiktok"],
  walkthroughNotes: "Show the lead workflow",
  brandPresenterEnabled: true,
  avatarPresenterId: "orbit",
  creatorPacePreset: "energetic"
};

const moments: DetectedMoment[] = [
  {
    id: "research",
    label: "Research dashboard",
    startMs: 0,
    endMs: 5_000,
    evidence: "The dashboard displays verified research.",
    sourceEvidenceIds: ["evidence-research"],
    confidence: 0.94,
    enabled: true,
    proofScore: 0.9,
    focus: { x: 0.58, y: 0.42, scale: 1.3 }
  },
  {
    id: "draft",
    label: "Generated personalized draft",
    startMs: 5_000,
    endMs: 11_000,
    evidence: "The generated draft uses the research.",
    sourceEvidenceIds: ["evidence-draft"],
    confidence: 0.92,
    enabled: true,
    proofScore: 0.95
  }
];

const frames: FrameEvidence[] = [{
  id: "frame-research",
  momentId: "research",
  timestampMs: 2_000,
  imagePath: "/private/research.png",
  ocrText: "Research dashboard",
  proofScore: 0.95,
  createdAt: "2026-07-18T00:00:00.000Z"
}];

function script(overrides: Partial<ScriptDraft> = {}): ScriptDraft {
  const voiceoverText = Array.from({ length: 122 }, (_, index) => `word${index + 1}`).join(" ");
  return {
    id: "script-1",
    conceptId: "concept-1",
    hook: "This turns verified research into a personalized draft.",
    voiceoverText,
    captions: [
      { startMs: 0, endMs: 2_200, text: "Verified research", words: [{ startMs: 0, endMs: 800, text: "Verified" }] },
      { startMs: 2_200, endMs: 4_400, text: "Personalized draft" }
    ],
    cta: "Try the workflow",
    visualBeats: [],
    evidenceClaims: [
      { text: "Shows verified research", sourceEvidenceIds: ["evidence-research"], momentIds: ["research"] },
      { text: "Creates a personalized draft", sourceEvidenceIds: ["evidence-draft"], momentIds: ["draft"] }
    ],
    approved: true,
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides
  };
}

describe("creator video CreativeBlueprint", () => {
  it("encodes the measured reference grammar without making reference-fast the default", () => {
    expect(referenceCreatorVideoTemplateV1.defaultPacePreset).toBe("energetic");
    expect(referenceCreatorVideoTemplateV1.paceRangesWpm).toEqual({
      readable: { min: 145, max: 160 },
      energetic: { min: 160, max: 175 },
      reference_fast: { min: 200, max: 235 }
    });
    expect(referenceCreatorVideoTemplateV1.ctaDurationMs).toBe(4_500);
    expect(referenceCreatorVideoTemplateV1.hookDeadlineMs).toBe(3_000);
    expect(referenceCreatorVideoTemplateV1.allowedShotTypes).toHaveLength(10);
    expect(referenceCreatorVideoTemplateV1.captionFamilies).toEqual(["kinetic_bold", "editorial_serif_italic"]);
  });

  it("derives factual screenshot, interaction, mockup, and hero assets with lineage", () => {
    const assets = buildProductEvidenceAssets({ moments, frameEvidence: frames, claims: script().evidenceClaims, recordingPath: "/private/source.mp4" });
    expect(assets.map((asset) => asset.kind)).toEqual(expect.arrayContaining(["browser_mockup", "interaction_clip", "product_hero"]));
    expect(assets.find((asset) => asset.id === "asset-research-primary")).toMatchObject({
      sourceEvidenceIds: expect.arrayContaining(["evidence-research", "frame-research"]),
      imagePath: "/private/research.png",
      factualUseAllowed: true,
      maskingStatus: "needs_review"
    });
  });

  it("compiles a deterministic, contiguous, multi-shot scene plan with a 4.5 second CTA", () => {
    const first = compileCreativeBlueprint({ profile, script: script(), moments, frameEvidence: frames, recordingPath: "/private/source.mp4" });
    const second = compileCreativeBlueprint({ profile, script: script(), moments, frameEvidence: frames, recordingPath: "/private/source.mp4" });
    expect(first.blueprint).toEqual(second.blueprint);
    expect(first.blueprint.renderPolicy.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(new Set(first.blueprint.scenes.map((scene) => scene.shotType)).size).toBeGreaterThanOrEqual(5);
    expect(first.blueprint.scenes.some((scene) => !scene.presenter.visible)).toBe(true);
    expect(first.blueprint.scenes.some((scene) => scene.presenter.layout === "fullscreen" || scene.presenter.layout === "close_up")).toBe(true);
    expect(first.blueprint.scenes.some((scene) => scene.presenter.layout === "lower_third")).toBe(true);
    expect(first.blueprint.scenes.some((scene) => scene.presenter.layout.startsWith("split_"))).toBe(true);
    const cta = first.blueprint.scenes.at(-1)!;
    expect(cta.shotType).toBe("cta_end_card");
    expect(cta.endMs - cta.startMs).toBe(4_500);
    expect(first.blueprint.scenes.every((scene, index) => index === 0 || scene.startMs === first.blueprint.scenes[index - 1]!.endMs)).toBe(true);
    expect(validateCreativeBlueprint(first.blueprint).filter((issue) => issue.severity === "blocking")).toEqual([]);
  });

  it("flags ungrounded claims instead of inventing factual cards", () => {
    const result = compileCreativeBlueprint({
      profile,
      script: script({ evidenceClaims: [{ text: "Saves ninety percent", sourceEvidenceIds: ["missing-proof"], momentIds: [] }] }),
      moments,
      frameEvidence: frames
    });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unsupported_claim", severity: "blocking" }));
  });

  it("supports avatar-disabled product-heavy plans", () => {
    const result = compileCreativeBlueprint({ profile: { ...profile, brandPresenterEnabled: false }, script: script(), moments, frameEvidence: frames });
    expect(result.blueprint.scenes.every((scene) => !scene.presenter.visible)).toBe(true);
    expect(result.blueprint.scenes.some((scene) => scene.shotType === "kinetic_typography")).toBe(true);
  });

  it("preserves manually overridden scene choices across recompilation", () => {
    const initial = compileCreativeBlueprint({ profile, script: script(), moments, frameEvidence: frames }).blueprint;
    const changed = {
      ...initial,
      productAssets: initial.productAssets.map((asset, index) => index === 0 ? {
        ...asset,
        approvalStatus: "approved" as const,
        maskingStatus: "masked" as const,
        imagePath: "/private/materialized-proof.png"
      } : asset),
      scenes: initial.scenes.map((scene, index) => index === 2 ? {
        ...scene,
        shotType: "comparison_card" as const,
        manuallyOverridden: true,
        typography: scene.typography.map((cue) => ({ ...cue, text: "Manual comparison", manuallyOverridden: true }))
      } : scene)
    };
    const recompiled = compileCreativeBlueprint({ profile, script: script(), moments, frameEvidence: frames, previousBlueprint: changed }).blueprint;
    expect(recompiled.scenes[2]).toMatchObject({ shotType: "comparison_card", manuallyOverridden: true });
    expect(recompiled.scenes[2]?.typography[0]?.text).toBe("Manual comparison");
    expect(recompiled.productAssets[0]).toMatchObject({ approvalStatus: "approved", maskingStatus: "masked", imagePath: "/private/materialized-proof.png" });
  });

  it("projects the scene plan onto the legacy renderer without losing its 4.5 second CTA", () => {
    const draft = script();
    const blueprint = compileCreativeBlueprint({ profile, script: draft, moments, frameEvidence: frames }).blueprint;
    const visualBeats = buildVisualBeatsForTemplate({ moments, durationMs: 30_000, templateKey: "brand_presenter" });
    const edl = buildEditDecisionList({
      profile,
      templateKey: "brand_presenter",
      durationMs: 30_000,
      captions: draft.captions,
      visualBeats,
      hook: draft.hook,
      cta: draft.cta,
      moments
    });
    const projected = projectBlueprintOntoEditDecisionList(edl, blueprint);
    expect(projected.durationMs).toBe(blueprint.targetDurationMs);
    expect(projected.sourceSegments).toHaveLength(blueprint.scenes.length);
    expect(projected.sourceSegments.at(-1)?.timelineEndMs).toBe(blueprint.targetDurationMs);
    expect(projected.overlays.find((overlay) => overlay.kind === "cta")).toMatchObject({
      startMs: blueprint.targetDurationMs - 4_500,
      endMs: blueprint.targetDurationMs
    });
    expect(projected.creativeBlueprint?.scenes.every((scene) => scene.captions.every((caption) => caption.endMs > scene.startMs && caption.startMs < scene.endMs))).toBe(true);
  });

  it("reports short, long, and asset-insufficient approved inputs", () => {
    const short = compileCreativeBlueprint({
      profile,
      script: script({ voiceoverText: Array.from({ length: 30 }, (_, index) => `short${index}`).join(" ") }),
      moments,
      frameEvidence: frames
    });
    expect(short.issues.map(({ code }) => code)).toContain("script_too_short");
    const long = compileCreativeBlueprint({
      profile,
      script: script({ voiceoverText: Array.from({ length: 320 }, (_, index) => `long${index}`).join(" ") }),
      moments,
      frameEvidence: frames
    });
    expect(long.issues.map(({ code }) => code)).toContain("script_too_long");
    const insufficient = compileCreativeBlueprint({ profile, script: script({ evidenceClaims: [] }), moments: [], frameEvidence: [] });
    expect(insufficient.issues).toContainEqual(expect.objectContaining({ code: "missing_product_asset", severity: "blocking" }));
  });

  it("honours product-heavy and presenter-heavy template shot vocabularies", () => {
    const productAllowed = ["product_hero", "product_fullscreen", "product_mockup", "kinetic_typography", "cta_end_card"] as const;
    const productPlan = compileCreativeBlueprint({
      profile,
      script: script(),
      moments,
      frameEvidence: frames,
      template: { ...referenceCreatorVideoTemplateV1, id: "product-heavy", allowedShotTypes: [...productAllowed] }
    }).blueprint;
    expect(productPlan.scenes.every((scene) => productAllowed.includes(scene.shotType as typeof productAllowed[number]))).toBe(true);
    expect(productPlan.scenes.slice(0, -1).every((scene) => !scene.presenter.visible)).toBe(true);

    const presenterAllowed = ["presenter_fullscreen", "presenter_lower_third", "presenter_with_card", "kinetic_typography", "cta_end_card"] as const;
    const presenterPlan = compileCreativeBlueprint({
      profile,
      script: script(),
      moments,
      frameEvidence: frames,
      template: { ...referenceCreatorVideoTemplateV1, id: "presenter-heavy", allowedShotTypes: [...presenterAllowed] }
    }).blueprint;
    expect(presenterPlan.scenes.every((scene) => presenterAllowed.includes(scene.shotType as typeof presenterAllowed[number]))).toBe(true);
    expect(presenterPlan.scenes.filter((scene) => scene.presenter.visible).length).toBeGreaterThan(presenterPlan.scenes.length / 2);
  });

  it("avoids three consecutive product-asset repeats and reports declared layout collisions", () => {
    const blueprint = compileCreativeBlueprint({ profile, script: script(), moments, frameEvidence: frames }).blueprint;
    const productScenes = blueprint.scenes.filter((scene) => scene.productAssetIds.length > 0);
    expect(productScenes.some((scene, index) => index >= 2 &&
      scene.productAssetIds.join("|") === productScenes[index - 1]?.productAssetIds.join("|") &&
      scene.productAssetIds.join("|") === productScenes[index - 2]?.productAssetIds.join("|")
    )).toBe(false);
    const collision = blueprint.scenes.find((scene) => scene.presenter.visible)!;
    collision.presenter.layout = "lower_third";
    collision.typography[0]!.position = "bottom";
    expect(validateCreativeBlueprint(blueprint)).toContainEqual(expect.objectContaining({ code: "caption_collision", sceneId: collision.id }));
  });

  it("requires approval before compiling", () => {
    expect(() => compileCreativeBlueprint({ profile, script: script({ approved: false }), moments })).toThrow("approved script");
  });
});
