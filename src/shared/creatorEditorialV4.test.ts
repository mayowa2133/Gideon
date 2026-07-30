import { describe, expect, it } from "vitest";
import {
  assertCreatorEditorialV4Edl,
  compileCreatorEditorialV4,
  editorialV4ChangedSceneIds,
  evaluateCreatorEditorialV4,
  projectCreatorEditorialV4OntoEditDecisionList,
  type CompileCreatorEditorialV4Input
} from "./creatorEditorialV4";
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
    id: "creator-editorial-v4-fixture",
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
      maxVisualChangesPerTenSeconds: 8,
      minProductTextScale: 1.3
    },
    compiledAt: "2026-07-28T00:00:00.000Z"
  };
}

function input(): CompileCreatorEditorialV4Input {
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
    seed: 71_626,
    targetDurationMs: 35_000,
    cta: { mode: "non_transactional", text: "See how Solomon keeps every opportunity and next step in one view." }
  };
}

describe("creator_editorial_v4", () => {
  it("compiles deterministically and remains independently selectable", () => {
    const first = compileCreatorEditorialV4(input());
    expect(compileCreatorEditorialV4(input())).toEqual(first);
    expect(first.templateId).toBe("creator_editorial_v4");
    expect(first.schemaVersion).toBe("4");
    expect(first.shots).toHaveLength(16);
    expect(() => assertCreatorEditorialV4Edl(first)).not.toThrow();
  });

  it("uses six real silhouettes and aligns gesture peaks to narration", () => {
    const edl = compileCreatorEditorialV4(input());
    const report = evaluateCreatorEditorialV4(edl);
    expect(report.distinctPerformances.length).toBeGreaterThanOrEqual(6);
    expect(report.distinctSilhouettes.length).toBeGreaterThanOrEqual(6);
    expect(report.maximumGestureAlignmentDeltaMs).toBeLessThanOrEqual(150);
    expect(edl.shots.filter(({ presenter }) => presenter.performance).every(({ choreography }) => choreography.narrationAligned)).toBe(true);
  });

  it("groups captions into readable phrases without losing narration words", () => {
    const edl = compileCreatorEditorialV4(input());
    const report = evaluateCreatorEditorialV4(edl);
    const dangling = new Set(["a", "an", "the", "of", "to", "for", "with", "and", "or", "but", "is", "are", "in", "on", "at", "by", "from", "into", "as"]);
    expect(report.phraseCaptionRatio).toBeGreaterThanOrEqual(0.95);
    expect(edl.shots.flatMap(({ captions }) => captions).every(({ words }) => words.length >= 1 && words.length <= 5)).toBe(true);
    expect(edl.shots.flatMap(({ captions }) => captions).every(({ phraseGrouped }) => phraseGrouped)).toBe(true);
    expect(edl.shots.flatMap(({ captions }) => captions)
      .filter(({ words }) => dangling.has(words.at(-1)!.toLowerCase().replace(/[^a-z0-9]/g, "")))
      .map(({ words }) => words.join(" "))).toEqual([]);
  });

  it("keeps authentic evidence, verified focus geometry, and no synthetic cursor", () => {
    const edl = compileCreatorEditorialV4(input());
    const productShots = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0);
    expect(productShots.every(({ evidenceTreatment }) =>
      evidenceTreatment.authenticPixelsPreserved
      && evidenceTreatment.cursorLayerCount === 0
      && evidenceTreatment.criticalRegion
      && evidenceTreatment.actionViewport
      && evidenceTreatment.resultViewport
      && evidenceTreatment.postFocusDrift.scale === 0
    )).toBe(true);
    expect(evaluateCreatorEditorialV4(edl).findings.find(({ code }) => code === "transformed_evidence_containment"))
      .toMatchObject({ status: "pass", measured: 0 });
  });

  it("retimes product shots around the recorded interactive cursor moment", () => {
    const compileInput = input();
    compileInput.telemetry[0] = {
      ...compileInput.telemetry[0]!,
      sourceDurationMs: 11_500,
      actionEvents: [
        {
          stepId: "observe",
          startMs: 2_600,
          endMs: 4_100,
          region: { x: 0.11, y: 0.49, width: 0.08, height: 0.02 },
          evidence: "recorded_action_target",
          interaction: "observe"
        },
        {
          stepId: "write",
          startMs: 4_150,
          endMs: 6_900,
          region: { x: 0.07, y: 0.35, width: 0.13, height: 0.04 },
          evidence: "recorded_action_target",
          interaction: "synthetic_write"
        }
      ]
    };
    const jobsShots = compileCreatorEditorialV4(compileInput).shots.filter(({ productEvidenceIds }) =>
      productEvidenceIds.includes("jobs")
    );
    expect(jobsShots.length).toBeGreaterThan(0);
    expect(jobsShots.every(({ sourceIntervalMs }) =>
      sourceIntervalMs
      && sourceIntervalMs.startMs <= 4_350
      && sourceIntervalMs.endMs > 4_350
    )).toBe(true);
    expect(jobsShots.every(({ evidenceTreatment }) =>
      evidenceTreatment.actionRegion?.x === 0.07
    )).toBe(true);
  });

  it("reserves two seconds for the branded close and passes all gates", () => {
    const edl = compileCreatorEditorialV4(input());
    expect(edl.shots[14]!.endMs).toBe(33_000);
    expect(edl.shots[15]!.startMs).toBe(33_000);
    expect(evaluateCreatorEditorialV4(edl).passed).toBe(true);
  });

  it("invalidates only a changed shot and transition neighbors", () => {
    const first = compileCreatorEditorialV4(input());
    const changedInput = input();
    changedInput.cta = { mode: "learn_more", text: "Learn more about Solomon." };
    const second = compileCreatorEditorialV4(changedInput);
    const changed = editorialV4ChangedSceneIds(first, second);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(first.shots.length);
  });

  it("projects v4 onto Gideon's EDL", () => {
    const editorial = compileCreatorEditorialV4(input());
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
    const projected = projectCreatorEditorialV4OntoEditDecisionList(base, editorial);
    expect(projected.templateKey).toBe("creator_editorial_v4");
    expect(projected.templateVersion).toBe(4);
  });
});
