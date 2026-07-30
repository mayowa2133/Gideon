import { describe, expect, it } from "vitest";
import {
  assertCreatorEditorialV3Edl,
  compareV3Shots,
  compileCreatorEditorialV3,
  editorialV3ChangedSceneIds,
  evaluateCreatorEditorialV3,
  projectCreatorEditorialV3OntoEditDecisionList,
  type CompileCreatorEditorialV3Input
} from "./creatorEditorialV3";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset } from "./types";

const hash = (value: string): string => value.repeat(64);

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

const assets = [evidence("jobs", "a"), evidence("tracker", "b"), evidence("contacts", "c"), evidence("outreach", "d")];

function blueprint(): CreativeBlueprint {
  return {
    schemaVersion: "1",
    id: "creator-editorial-v3-fixture",
    templateId: "creator-product-explainer",
    templateVersion: 1,
    targetDurationMs: 35_000,
    pacePreset: "energetic",
    estimatedWordsPerMinute: 205,
    hook: "Keep the evidence for every decision in view.",
    cta: "See how Solomon keeps every opportunity and next step in one view.",
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
    renderPolicy: { canvas: { width: 1080, height: 1920, fps: 30 }, targetLufs: -14, loudnessToleranceLu: 1, ctaDurationMs: 3_000 },
    qualityPolicy: {
      requireEvidenceBackedClaims: true,
      requireCaptionSafeArea: true,
      requireAudioAlignment: true,
      requireCta: true,
      requireAvatarDisclosure: true,
      maxVisualChangesPerTenSeconds: 8,
      minProductTextScale: 1.3
    },
    compiledAt: "2026-07-27T00:00:00.000Z"
  };
}

function input(): CompileCreatorEditorialV3Input {
  const rows = [
    ["The hardest part of a job search is remembering why each opportunity matters.", "hook", [], []],
    ["Solomon keeps that evidence beside your next decision.", "reveal", [], []],
    ["Start with roles that match what you want.", "evidence", ["claim-jobs"], ["jobs"]],
    ["Move opportunities into a tracker as priorities change.", "evidence", ["claim-tracker"], ["tracker"]],
    ["Review saved contacts with details beside each person.", "evidence", ["claim-contacts"], ["contacts"]],
    ["Inspect an outreach draft before anything moves forward.", "evidence", ["claim-outreach"], ["outreach"]],
    ["Spend less time rebuilding the story behind each opportunity.", "benefit", [], []],
    ["Find roles, track opportunities, understand contacts, and review outreach.", "recap", ["claim-jobs"], ["jobs"]],
    ["See how Solomon keeps every opportunity and next step in one view.", "cta", [], []]
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
      emphasizedWords: index === 1 ? ["Solomon", "evidence"] : index === 8 ? ["Solomon", "one view"] : []
    })),
    telemetry: assets.map((asset, index) => ({
      evidenceAssetId: asset.id,
      sourceSha256: hash(String(index + 1)),
      cursorSamples: [{ timestampMs: 1_500, x: 0.51 + index * 0.02, y: 0.46, confidence: 0.95 }],
      actionRegion: { x: 0.29, y: 0.31, width: 0.42, height: 0.30 },
      resultRegion: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 }
    })),
    presenterAssetHash: hash("e"),
    seed: 71_625,
    targetDurationMs: 35_000,
    cta: { mode: "non_transactional", text: "See how Solomon keeps every opportunity and next step in one view." }
  };
}

describe("creator_editorial_v3", () => {
  it("compiles deterministically as an independently selectable version", () => {
    const first = compileCreatorEditorialV3(input());
    expect(compileCreatorEditorialV3(input())).toEqual(first);
    expect(first.templateId).toBe("creator_editorial_v3");
    expect(first.schemaVersion).toBe("3");
    expect(first.shots).toHaveLength(16);
    expect(() => assertCreatorEditorialV3Edl(first)).not.toThrow();
  });

  it("schedules six actual source performances with no adjacent repetition", () => {
    const edl = compileCreatorEditorialV3(input());
    const visible = edl.shots.filter(({ presenter }) => presenter.visible);
    const performances = visible.map(({ presenter }) => presenter.performance!);
    expect(new Set(performances.map(({ id }) => id)).size).toBeGreaterThanOrEqual(6);
    expect(performances.every(({ sourceStartMs, sourceEndMs }) => sourceEndMs > sourceStartMs)).toBe(true);
    expect(performances.slice(1).every((performance, index) => performance.id !== performances[index]!.id)).toBe(true);
    expect(new Set(performances.map(({ silhouetteClass }) => silhouetteClass)).size).toBeGreaterThanOrEqual(6);
  });

  it("provides a primary internal event and no more than two supporting events", () => {
    const edl = compileCreatorEditorialV3(input());
    expect(edl.shots.filter(({ family }) => family !== "branded_outro").every(({ motionEvents }) =>
      motionEvents.some(({ role }) => role === "primary")
      && motionEvents.filter(({ role }) => role === "supporting").length <= 2
    )).toBe(true);
    expect(edl.shots.flatMap(({ motionEvents }) => motionEvents).every(({ endMs, startMs }) => endMs > startMs)).toBe(true);
  });

  it("creates four opening modes and varied caption placement/style", () => {
    const edl = compileCreatorEditorialV3(input());
    const report = evaluateCreatorEditorialV3(edl);
    expect(report.passed).toBe(true);
    expect(report.openingCompositionModes).toBeGreaterThanOrEqual(4);
    expect(report.captionTopCenterRatio).toBeLessThan(0.5);
    expect(new Set(edl.shots.flatMap(({ captions }) => captions.map(({ visualStyle }) => visualStyle)))).toEqual(
      new Set(["clean_floating", "accent_underline", "editorial_takeover"])
    );
  });

  it("preserves authentic evidence and zero cursor layers", () => {
    const productShots = compileCreatorEditorialV3(input()).shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0);
    expect(productShots.every(({ evidenceTreatment }) =>
      evidenceTreatment.authenticPixelsPreserved
      && evidenceTreatment.evidenceSharp
      && evidenceTreatment.cursorLayerCount === 0
      && evidenceTreatment.targetOccupancyRatio >= 0.54
    )).toBe(true);
  });

  it("requires multiple composition dimensions for a meaningful reset", () => {
    const shot = compileCreatorEditorialV3(input()).shots[0]!;
    expect(compareV3Shots(shot, { ...shot, id: "same" }).meaningful).toBe(false);
    const changed = {
      ...shot,
      id: "changed",
      compositionFamily: "product_macro" as const,
      backgroundMode: "cream_product" as const,
      presenter: { ...shot.presenter, performance: undefined }
    };
    expect(compareV3Shots(shot, changed).changedDimensions).toEqual(
      expect.arrayContaining(["composition_family", "background", "presenter_silhouette"])
    );
    expect(compareV3Shots(shot, changed).meaningful).toBe(true);
  });

  it("scopes changed-scene invalidation to the shot and transition neighbors", () => {
    const first = compileCreatorEditorialV3(input());
    const changedInput = input();
    changedInput.cta = { mode: "learn_more", text: "Learn more about Solomon." };
    const second = compileCreatorEditorialV3(changedInput);
    const changed = editorialV3ChangedSceneIds(first, second);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(first.shots.length);
  });

  it("projects onto Gideon EDL without changing v1/v2 selection", () => {
    const editorial = compileCreatorEditorialV3(input());
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
    const projected = projectCreatorEditorialV3OntoEditDecisionList(base, editorial);
    expect(projected.templateKey).toBe("creator_editorial_v3");
    expect(projected.templateVersion).toBe(3);
  });
});
