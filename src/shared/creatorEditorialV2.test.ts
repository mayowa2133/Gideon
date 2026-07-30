import { describe, expect, it } from "vitest";
import {
  assertCreatorEditorialV2Edl,
  buildEditorialV2Captions,
  compareV2Shots,
  compileCreatorEditorialV2,
  creatorEditorialTemplateV2,
  editorialV2ChangedSceneIds,
  evaluateCreatorEditorialV2,
  projectCreatorEditorialV2OntoEditDecisionList,
  type CompileCreatorEditorialV2Input
} from "./creatorEditorialV2";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset } from "./types";

const hash = (character: string): string => character.repeat(64);

function evidence(id: string, character: string): ProductEvidenceAsset {
  return {
    id,
    kind: "interaction_clip",
    label: id,
    sourceMomentIds: [`moment-${id}`],
    sourceEvidenceIds: [`verified-${id}`],
    supportedClaimIds: [`claim-${id}`],
    sourceStartMs: 1_000,
    sourceEndMs: 7_000,
    clipPath: `/private/${id}.mp4`,
    contentHash: hash(character),
    maskingStatus: "masked",
    crop: { x: 0.5, y: 0.45, scale: 1.4 },
    readableRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.78 },
    provenance: "captured_product",
    approvalStatus: "approved",
    factualUseAllowed: true
  };
}

const assets = [
  evidence("jobs", "a"),
  evidence("tracker", "b"),
  evidence("contacts", "c"),
  evidence("outreach", "d")
];

function blueprint(): CreativeBlueprint {
  return {
    schemaVersion: "1",
    id: "creator-editorial-v2-fixture",
    templateId: "creator-product-explainer",
    templateVersion: 1,
    targetDurationMs: 35_000,
    pacePreset: "energetic",
    estimatedWordsPerMinute: 200,
    hook: "Keep the next decision in focus.",
    cta: "See how Solomon can bring your job search into focus.",
    brandKit: {
      productName: "Solomon",
      primaryColor: "#101A33",
      secondaryColor: "#F4F1E8",
      accentColor: "#39D3C4",
      backgroundColor: "#071526",
      captionStyle: "kinetic_bold",
      ctaStyle: "learn_more",
      tagline: "Evidence beside the next decision."
    },
    claimIds: assets.flatMap(({ supportedClaimIds }) => supportedClaimIds),
    productAssets: assets,
    scenes: [],
    renderPolicy: {
      canvas: { width: 1080, height: 1920, fps: 30 },
      targetLufs: -14,
      loudnessToleranceLu: 1,
      ctaDurationMs: 3_000
    },
    qualityPolicy: {
      requireEvidenceBackedClaims: true,
      requireCaptionSafeArea: true,
      requireAudioAlignment: true,
      requireCta: true,
      requireAvatarDisclosure: true,
      maxVisualChangesPerTenSeconds: 7,
      minProductTextScale: 1.3
    },
    compiledAt: "2026-07-27T00:00:00.000Z"
  };
}

function input(): CompileCreatorEditorialV2Input {
  const rows = [
    ["Your search gets harder when each decision lives in another tab.", "hook", [], []],
    ["Solomon keeps the evidence for your next move in one workspace.", "reveal", [], []],
    ["Start with roles that match what you want and narrow the list.", "evidence", ["claim-jobs"], ["jobs"]],
    ["Move opportunities into a tracker as priorities change.", "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with context beside each person.", "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect an outreach draft before anything moves forward.", "evidence", ["claim-outreach"], ["outreach"]],
    ["Spend less time rebuilding the story behind each opportunity.", "benefit", [], []],
    ["Find roles, track opportunities, understand contacts, and review outreach.", "recap", ["claim-jobs"], ["jobs"]],
    ["See how Solomon can bring your job search into focus.", "cta", [], []]
  ] as const;
  const starts = [0, 3_000, 5_600, 9_200, 12_500, 16_000, 20_000, 25_000, 29_000];
  const ends = [3_000, 5_600, 9_200, 12_500, 16_000, 20_000, 25_000, 29_000, 32_000];
  return {
    blueprint: blueprint(),
    narrationBeats: rows.map(([text, purpose, claimIds, evidenceAssetIds], index) => ({
      id: `beat-${index + 1}`,
      text,
      startMs: starts[index]!,
      endMs: ends[index]!,
      purpose,
      claimIds: [...claimIds],
      evidenceAssetIds: [...evidenceAssetIds],
      emphasizedWords: index === 1 ? ["Solomon"] : index === 8 ? ["Solomon", "focus"] : []
    })),
    telemetry: assets.map((asset, index) => ({
      evidenceAssetId: asset.id,
      sourceSha256: hash(String(index + 1)),
      cursorSamples: [{ timestampMs: 1_500, x: 0.51 + index * 0.02, y: 0.46, confidence: 0.95 }],
      actionRegion: { x: 0.25, y: 0.28, width: 0.5, height: 0.34 },
      resultRegion: { x: 0.20, y: 0.24, width: 0.60, height: 0.42 }
    })),
    presenterAssetHash: hash("e"),
    seed: 71_624,
    targetDurationMs: 35_000,
    cta: {
      mode: "non_transactional",
      text: "See how Solomon can bring your job search into focus."
    }
  };
}

describe("creator_editorial_v2", () => {
  it("compiles deterministically without changing the v1 contract", () => {
    const first = compileCreatorEditorialV2(input());
    const second = compileCreatorEditorialV2(input());
    expect(first).toEqual(second);
    expect(first.templateId).toBe("creator_editorial_v2");
    expect(first.shots).toHaveLength(16);
    expect(first.shots.at(-2)).toMatchObject({ family: "presenter_cta", startMs: 29_000 });
    expect(first.shots.at(-1)).toMatchObject({ family: "branded_outro", startMs: 32_000 });
    expect(() => assertCreatorEditorialV2Edl(first)).not.toThrow();
  });

  it("meets presenter, product, meaningful-change, opening, and ending targets", () => {
    const edl = compileCreatorEditorialV2(input());
    const report = evaluateCreatorEditorialV2(edl);
    expect(report.passed).toBe(true);
    expect(report.meaningfulChanges.filter(({ meaningful }) => meaningful)).toHaveLength(15);
    expect(report.sectionModeCounts.opening).toBeGreaterThanOrEqual(3);
    const presenterMs = edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
    const productMs = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
    expect(presenterMs / edl.durationMs).toBeGreaterThanOrEqual(creatorEditorialTemplateV2.presenterVisibilityRatio.min);
    expect(presenterMs / edl.durationMs).toBeLessThanOrEqual(creatorEditorialTemplateV2.presenterVisibilityRatio.max);
    expect(productMs / edl.durationMs).toBeGreaterThanOrEqual(creatorEditorialTemplateV2.productVisibilityRatio.min);
    expect(productMs / edl.durationMs).toBeLessThanOrEqual(creatorEditorialTemplateV2.productVisibilityRatio.max);
  });

  it("creates all three caption roles while preserving exact word order", () => {
    const request = input();
    const captions = buildEditorialV2Captions({
      beats: request.narrationBeats,
      range: { startMs: 0, endMs: 35_000 },
      timingProvenance: "deterministic_estimate"
    });
    expect(new Set(captions.map(({ role }) => role))).toEqual(new Set(["standard_narration", "keyword_emphasis", "full_frame_editorial"]));
    expect(captions.every(({ words }) => words.length >= 1 && words.length <= 3)).toBe(true);
    expect(captions.every(({ animation }) => animation.settleMs >= 120 && animation.settleMs <= 220)).toBe(true);
    expect(captions.flatMap(({ words }) => words).join(" ")).toBe(request.narrationBeats.map(({ text }) => text).join(" "));
  });

  it("records context-to-detail evidence and authentic pointer policy", () => {
    const edl = compileCreatorEditorialV2(input());
    const productShots = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0);
    expect(productShots.every(({ evidenceTreatment }) => evidenceTreatment.authenticPixelsPreserved && !evidenceTreatment.syntheticPointerAdded)).toBe(true);
    expect(productShots.some(({ evidenceTreatment }) => evidenceTreatment.stage === "context_to_detail")).toBe(true);
    expect(productShots.some(({ evidenceTreatment }) => evidenceTreatment.resultHoldMs >= 400 && evidenceTreatment.resultHoldMs <= 700)).toBe(true);
    expect(productShots.every(({ camera }) => camera.easing === "cubic_in_out")).toBe(true);
    expect(productShots.every(({ camera }) => ["contain_pointer", "transition_to_result", "geometry_fallback"].includes(camera.pointerPolicy))).toBe(true);
  });

  it("rejects transactional CTA modes without confirmed availability", () => {
    const request = input();
    request.cta = { mode: "try_now", text: "Try Solomon now.", availabilityConfirmed: false };
    expect(() => compileCreatorEditorialV2(request)).toThrow(/confirmed product availability/i);
  });

  it("uses composition dimensions rather than family alone", () => {
    const edl = compileCreatorEditorialV2(input());
    const first = edl.shots[0]!;
    const visuallyDifferent = { ...first, id: "different", backgroundMode: "cream_editorial" as const };
    const same = { ...first, id: "same" };
    expect(compareV2Shots(first, visuallyDifferent).changedDimensions).toContain("background");
    expect(compareV2Shots(first, same).meaningful).toBe(false);
  });

  it("scopes cache invalidation to changed shots and transition neighbors", () => {
    const first = compileCreatorEditorialV2(input());
    const changedInput = input();
    changedInput.cta = { mode: "learn_more", text: "Learn more about Solomon." };
    const second = compileCreatorEditorialV2(changedInput);
    const changed = editorialV2ChangedSceneIds(first, second);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(first.shots.length);
  });

  it("projects into Gideon EDL v2 with independently selectable template metadata", () => {
    const editorial = compileCreatorEditorialV2(input());
    const base: EditDecisionList = {
      schemaVersion: "2",
      templateId: "creator-template:brand_presenter:v1",
      templateKey: "brand_presenter",
      templateVersion: 1,
      brandKitId: "fixture-brand",
      durationMs: 35_000,
      canvas: { width: 1080, height: 1920, fps: 30 },
      brandKit: blueprint().brandKit,
      sourceSegments: [{ momentId: "fixture", sourceStartMs: 0, sourceEndMs: 5_000, timelineStartMs: 0, timelineEndMs: 35_000, fit: "contain", focus: { x: 0.5, y: 0.5, scale: 1 } }],
      zooms: [],
      transitions: [],
      captions: [],
      overlays: [],
      callouts: [],
      cursorCues: [],
      sfx: [],
      presenter: { enabled: true, style: "fictional_illustrated", avatarId: "orbit", provenance: "gideon_fictional_catalog", disclosure: "AI-generated brand presenter", startMs: 0, endMs: 35_000, position: "lower_left", motion: "caption_sync" },
      music: { enabled: true, mood: "clean_tech", gainDb: -27 },
      qualityGates: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true }
    };
    const projected = projectCreatorEditorialV2OntoEditDecisionList(base, editorial);
    expect(projected.templateKey).toBe("creator_editorial_v2");
    expect(projected.templateVersion).toBe(2);
    expect(projected.overlays.find(({ kind }) => kind === "cta")?.text).toBe(editorial.cta.text);
  });
});
