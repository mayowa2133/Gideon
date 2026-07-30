import { describe, expect, it } from "vitest";
import {
  assertCreatorEditorialReferenceRhythmEdl,
  compileCreatorEditorialReferenceRhythm,
  evaluateCreatorEditorialReferenceRhythm,
  projectCreatorEditorialReferenceRhythmOntoEditDecisionList,
  type CompileCreatorEditorialReferenceRhythmInput,
  type ReferenceRhythmBeatSpec
} from "./creatorEditorialReferenceRhythm";
import {
  assertCreatorEditorialAiCreatorV6Edl,
  compileCreatorEditorialAiCreatorV6,
  evaluateCreatorEditorialAiCreatorV6,
  projectCreatorEditorialAiCreatorV6OntoEditDecisionList,
  type CompileCreatorEditorialAiCreatorV6Input
} from "./creatorEditorialAiCreatorV6";
import {
  assertCreatorEditorialUserStoryV7Edl,
  compileCreatorEditorialUserStoryV7,
  evaluateCreatorEditorialUserStoryV7,
  projectCreatorEditorialUserStoryV7OntoEditDecisionList,
  type CompileCreatorEditorialUserStoryV7Input
} from "./creatorEditorialUserStoryV7";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset } from "./types";

const hash = (character: string): string => character.repeat(64);
const claimIds = ["claim-jobs", "claim-tracker", "claim-contacts", "claim-outreach"];
const evidenceIds = [undefined, undefined, "jobs", "jobs", "tracker", "tracker", undefined, "contacts", "contacts", "outreach", undefined, "outreach", "jobs", undefined, undefined, undefined] as const;
const spokenClaims = [
  "Stop rebuilding job-search decisions across tabs.",
  "Solomon keeps your next-move evidence together.",
  "Start with roles and narrow what fits.",
  "Roles, contacts, and follow-ups stay together.",
  "Move the role into your tracker with the evidence.",
  "When priorities change, passive trackers lose context.",
  "Solomon keeps the next decision connected.",
  "Open a saved contact.",
  "The details stay beside the person.",
  "Review outreach before anything is sent.",
  "This is not another passive list.",
  "Inspect the message with its context before anything moves.",
  "Roles, people, and next steps stay reviewable.",
  "Move forward without rebuilding the story.",
  "Ready to see the workflow? Open the Solomon demo.",
  ""
] as const;

function evidence(id: string, character: string): ProductEvidenceAsset {
  return {
    id,
    kind: "interaction_clip",
    label: id,
    sourceMomentIds: [`moment-${id}`],
    sourceEvidenceIds: [`verified-${id}`],
    supportedClaimIds: [`claim-${id}`],
    sourceStartMs: 1_000,
    sourceEndMs: 8_000,
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
    id: "reference-rhythm-fixture",
    templateId: "creator-product-explainer",
    templateVersion: 1,
    targetDurationMs: 36_000,
    pacePreset: "energetic",
    estimatedWordsPerMinute: 200,
    hook: spokenClaims[0],
    cta: spokenClaims[14],
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
    claimIds,
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
      maxVisualChangesPerTenSeconds: 18,
      minProductTextScale: 1.3
    },
    compiledAt: "2026-07-28T00:00:00.000Z"
  };
}

function specs(): ReferenceRhythmBeatSpec[] {
  const functions: ReferenceRhythmBeatSpec["narrativeFunction"][] = [
    "outcome_hook",
    "visual_metaphor",
    "credibility_proof",
    "scale_claim",
    "mechanism_action",
    "failure_state",
    "benefit_translation",
    "mechanism_action",
    "mechanism_result",
    "secondary_benefit",
    "objection",
    "evidence_answer",
    "credibility_proof",
    "benefit_translation",
    "direct_cta",
    "branded_hold"
  ];
  const cycleRoles: Array<ReferenceRhythmBeatSpec["cycleRole"]> = [
    "claim", "proof", "proof", "claim", "proof", "claim", "benefit", "proof",
    "proof", "benefit", "claim", "proof", "proof", "benefit", undefined, undefined
  ];
  const cycleIds = [
    ["cycle-1"], ["cycle-1"], ["cycle-1"], ["cycle-2"], ["cycle-2"], ["cycle-3"],
    ["cycle-1"], ["cycle-3"], ["cycle-3"], ["cycle-3"], ["cycle-4"], ["cycle-4"],
    ["cycle-4"], ["cycle-2", "cycle-4"], [], []
  ];
  return functions.map((narrativeFunction, index) => ({
    id: `reference-beat-${String(index + 1).padStart(2, "0")}`,
    narrativeFunction,
    spokenClaim: spokenClaims[index]!,
    captionPhrases: spokenClaims[index] ? spokenClaims[index]!.split(/\s+/).reduce<string[][]>((groups, word) => {
      const current = groups.at(-1);
      if (!current || current.length >= 4) groups.push([word]);
      else current.push(word);
      return groups;
    }, []).map((words) => words.join(" ")) : ["OPEN THE DEMO"],
    claimIds: [...claimIds],
    evidenceRequirement: evidenceIds[index]
      ? narrativeFunction === "mechanism_result" || narrativeFunction === "evidence_answer"
        ? "authenticated_result"
        : "authenticated_product"
      : narrativeFunction === "visual_metaphor"
        ? "conceptual_diagram"
        : "none",
    ...(evidenceIds[index] ? { evidenceAssetId: evidenceIds[index] } : {}),
    cycleIds: cycleIds[index]!,
    cycleRole: cycleRoles[index],
    ...(narrativeFunction === "visual_metaphor" ? {
      visualMetaphor: {
        kind: "connected_decision_trail" as const,
        conceptual: true as const,
        disclosure: "Conceptual workflow" as const
      }
    } : {}),
    typography: narrativeFunction === "outcome_hook" || narrativeFunction === "scale_claim"
      ? "editorial_serif"
      : narrativeFunction === "branded_hold"
        ? "brand_lockup"
        : evidenceIds[index]
          ? "product_annotation"
          : "bold_sans",
    emphasisWords: narrativeFunction === "outcome_hook"
      ? ["Stop", "tabs"]
      : narrativeFunction === "direct_cta"
        ? ["Solomon", "demo"]
        : [],
    transitionBehavior: narrativeFunction === "branded_hold"
      ? "brand_resolve"
      : evidenceIds[index]
        ? "card_slide"
        : "hard_cut",
    presenterDirection: evidenceIds[index] ? index % 2 === 0 ? "product_right" : "product_left" : "audience",
    ...(narrativeFunction === "direct_cta" ? {
      cta: {
        action: "open_demo" as const,
        keyword: "DEMO" as const,
        text: "Open the Solomon demo.",
        availabilityConfirmed: false as const
      }
    } : {})
  }));
}

function input(): CompileCreatorEditorialReferenceRhythmInput {
  const beatSpecs = specs();
  const starts = [0, 2_200, 4_000, 6_000, 8_000, 10_000, 12_000, 14_000, 16_200, 18_500, 20_800, 23_000, 25_300, 27_800, 30_000];
  const ends = [2_200, 4_000, 6_000, 8_000, 10_000, 12_000, 14_000, 16_200, 18_500, 20_800, 23_000, 25_300, 27_800, 30_000, 33_000];
  return {
    blueprint: blueprint(),
    narrationBeats: beatSpecs.slice(0, -1).map((beat, index) => ({
      id: `narration-${index + 1}`,
      text: beat.spokenClaim,
      startMs: starts[index]!,
      endMs: ends[index]!,
      purpose: index === 0 ? "hook" : index === 14 ? "cta" : evidenceIds[index] ? "evidence" : "benefit",
      claimIds: [...beat.claimIds],
      evidenceAssetIds: beat.evidenceAssetId ? [beat.evidenceAssetId] : [],
      emphasizedWords: [...beat.emphasisWords]
    })),
    telemetry: assets.map((asset, index) => ({
      evidenceAssetId: asset.id,
      sourceSha256: hash(String(index + 1)),
      sourceDimensions: { width: 1440, height: 900 },
      sourceDurationMs: 12_000,
      actionRegion: { x: 0.29, y: 0.31, width: 0.42, height: 0.30 },
      resultRegion: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 },
      geometryProvenance: {
        action: "recorded_action_target" as const,
        result: "reviewed_capture_geometry" as const,
        cursor: "action_target_center" as const
      }
    })),
    presenterAssetHash: hash("e"),
    seed: 71_627,
    targetDurationMs: 36_000,
    cta: {
      mode: "non_transactional",
      text: "Open the Solomon demo.",
      availabilityConfirmed: false
    },
    narrativeBeatSpecs: beatSpecs,
    claimProvenance: assets.map((asset) => ({
      claimId: `claim-${asset.id}`,
      statement: `Authenticated ${asset.id} workflow is available for factual use.`,
      evidenceAssetIds: [asset.id],
      source: "approved_product_evidence" as const
    }))
  };
}

describe("creator_editorial_reference_rhythm_v1", () => {
  it("compiles deterministically with the reference narrative grammar", () => {
    const first = compileCreatorEditorialReferenceRhythm(input());
    expect(compileCreatorEditorialReferenceRhythm(input())).toEqual(first);
    expect(first.templateId).toBe("creator_editorial_reference_rhythm_v1");
    expect(first.schemaVersion).toBe("5");
    expect(first.shots).toHaveLength(16);
    expect(first.durationMs).toBe(36_000);
    expect(() => assertCreatorEditorialReferenceRhythmEdl(first)).not.toThrow();
  });

  it("keeps CTA captions and presenter emphasis inside the spoken 30–33 second window", () => {
    const ctaShot = compileCreatorEditorialReferenceRhythm(input()).shots[14]!;
    expect(ctaShot.captions.length).toBeGreaterThan(0);
    expect(Math.max(...ctaShot.captions.map(({ endMs }) => endMs))).toBeLessThanOrEqual(33_000);
    expect(ctaShot.presenter.performance?.alignedWordStartMs).toBeLessThan(33_000);
    expect(ctaShot.presenter.performance?.gesturePeakDeltaMs).toBeLessThanOrEqual(150);
  });

  it("enforces the outcome, mechanism, objection, CTA, and three proof cycles", () => {
    const report = evaluateCreatorEditorialReferenceRhythm(
      compileCreatorEditorialReferenceRhythm(input())
    );
    expect(report.passed).toBe(true);
    expect(report.claimProofBenefitCycleCount).toBeGreaterThanOrEqual(3);
    expect(report.averageSectionDurationMs).toBeGreaterThanOrEqual(1_800);
    expect(report.averageSectionDurationMs).toBeLessThanOrEqual(2_300);
    expect(report.maximumInternalEventGapMs).toBeLessThanOrEqual(700);
  });

  it("rejects unsupported claims and evidence mismatches", () => {
    const unsupported = input();
    unsupported.narrativeBeatSpecs[0]!.claimIds = ["claim-invented"];
    expect(() => compileCreatorEditorialReferenceRhythm(unsupported)).toThrow(/unsupported claim/);

    const mismatch = input();
    mismatch.narrativeBeatSpecs[2]!.evidenceAssetId = "contacts";
    expect(() => compileCreatorEditorialReferenceRhythm(mismatch)).toThrow(/does not match shot evidence/);
  });

  it("fails viewer-facing legacy naming and generic CTA audits", () => {
    const edl = compileCreatorEditorialReferenceRhythm(input());
    edl.narrativeBeats[0]!.captionPhrases = ["NexusReach"];
    edl.narrativeBeats[14]!.cta = undefined;
    const report = evaluateCreatorEditorialReferenceRhythm(edl);
    expect(report.findings.find(({ code }) => code === "viewer_facing_product_name")?.status).toBe("fail");
    expect(report.findings.find(({ code }) => code === "specific_cta")?.status).toBe("fail");
  });

  it("projects onto the regular Gideon EDL as an independently selectable template", () => {
    const editorial = compileCreatorEditorialReferenceRhythm(input());
    const base: EditDecisionList = {
      schemaVersion: "2",
      templateId: "creator-template:brand_presenter:v1",
      templateKey: "brand_presenter",
      templateVersion: 1,
      brandKitId: "fixture-brand",
      durationMs: 36_000,
      canvas: { width: 1080, height: 1920, fps: 30 },
      brandKit: blueprint().brandKit,
      sourceSegments: [],
      zooms: [],
      transitions: [],
      captions: [],
      overlays: [],
      callouts: [],
      cursorCues: [],
      sfx: [],
      presenter: {
        enabled: true,
        style: "fictional_illustrated",
        avatarId: "orbit",
        provenance: "gideon_fictional_catalog",
        disclosure: "AI-generated brand presenter",
        startMs: 0,
        endMs: 36_000,
        position: "lower_left",
        motion: "caption_sync"
      },
      music: { enabled: true, mood: "clean_tech", gainDb: -27 },
      qualityGates: {
        requireEvidenceBackedClaims: true,
        requireCaptionSafeArea: true,
        requireAudioAlignment: true
      }
    };
    const projected = projectCreatorEditorialReferenceRhythmOntoEditDecisionList(base, editorial);
    expect(projected.templateKey).toBe("creator_editorial_reference_rhythm_v1");
    expect(projected.templateVersion).toBe(1);
  });
});

function v6Input(): CompileCreatorEditorialAiCreatorV6Input {
  const base = input();
  const hook = "In Solomon, review roles, contacts, and outreach before a message sends.";
  base.narrativeBeatSpecs[0]!.spokenClaim = hook;
  base.narrativeBeatSpecs[0]!.captionPhrases = ["IN SOLOMON", "REVIEW BEFORE SEND"];
  base.narrationBeats[0]!.text = hook;
  return {
    ...base,
    seed: 71_628,
    claimEvidenceMatrix: assets.flatMap((asset) => [1, 2, 3].map((claimIndex) => ({
      spokenClaim: `Approved ${asset.id} claim ${claimIndex}.`,
      onScreenCaption: asset.id.toUpperCase(),
      requiredProductAction: `Review ${asset.id}.`,
      evidenceAssetIds: [asset.id],
      sourceHashes: [asset.contentHash!],
      verifiedSourceIntervals: [{ assetId: asset.id, startMs: 1_000, endMs: 6_000 }],
      visibleResult: `${asset.id} result remains visible.`,
      approvalStatus: "approved" as const,
      qualification: "Limited to authenticated captured evidence."
    })))
  };
}

describe("creator_editorial_ai_creator_v6", () => {
  it("compiles a reusable creator-directed plan with all eight presenter states", () => {
    const edl = compileCreatorEditorialAiCreatorV6(v6Input());
    const report = evaluateCreatorEditorialAiCreatorV6(edl);
    expect(edl.templateId).toBe("creator_editorial_ai_creator_v6");
    expect(edl.schemaVersion).toBe("6");
    expect(report.passed).toBe(true);
    expect(report.distinctPresenterPerformances).toHaveLength(8);
    expect(edl.shots.filter(({ v6Direction }) => v6Direction.trustPayoff)).toHaveLength(3);
    expect(edl.shots.at(-1)?.v6Direction.persistentCta).toBe(true);
    expect(() => assertCreatorEditorialAiCreatorV6Edl(edl)).not.toThrow();
  });

  it("fails closed when a source hash is not the approved evidence hash", () => {
    const invalid = v6Input();
    invalid.claimEvidenceMatrix[0]!.sourceHashes[0] = hash("z");
    expect(() => compileCreatorEditorialAiCreatorV6(invalid)).toThrow(/evidence mismatch/);
  });

  it("projects as an independently selectable V6 template", () => {
    const editorial = compileCreatorEditorialAiCreatorV6(v6Input());
    const base: EditDecisionList = {
      schemaVersion: "2",
      templateId: "creator-template:brand_presenter:v1",
      templateKey: "brand_presenter",
      templateVersion: 1,
      brandKitId: "fixture-brand",
      durationMs: 36_000,
      canvas: { width: 1080, height: 1920, fps: 30 },
      brandKit: blueprint().brandKit,
      sourceSegments: [],
      zooms: [],
      transitions: [],
      captions: [],
      overlays: [],
      callouts: [],
      cursorCues: [],
      sfx: [],
      presenter: {
        enabled: true,
        style: "fictional_illustrated",
        avatarId: "orbit",
        provenance: "gideon_fictional_catalog",
        disclosure: "AI-generated brand presenter",
        startMs: 0,
        endMs: 36_000,
        position: "lower_left",
        motion: "caption_sync"
      },
      music: { enabled: true, mood: "clean_tech", gainDb: -27 },
      qualityGates: {
        requireEvidenceBackedClaims: true,
        requireCaptionSafeArea: true,
        requireAudioAlignment: true
      }
    };
    expect(projectCreatorEditorialAiCreatorV6OntoEditDecisionList(base, editorial).templateKey)
      .toBe("creator_editorial_ai_creator_v6");
  });
});

function v7Input(): CompileCreatorEditorialUserStoryV7Input {
  const base = input();
  const v7Evidence = [
    undefined, undefined, "jobs", undefined, undefined, "tracker", undefined, undefined,
    "contacts", undefined, undefined, "outreach", undefined, undefined, undefined, undefined
  ] as const;
  base.narrativeBeatSpecs.forEach((spec, index) => {
    const evidenceAssetId = v7Evidence[index];
    spec.evidenceRequirement = evidenceAssetId ? "authenticated_product" : "none";
    spec.evidenceAssetId = evidenceAssetId;
    spec.claimIds = evidenceAssetId ? [`claim-${evidenceAssetId}`] : [...claimIds];
  });
  base.narrationBeats.forEach((beat, index) => {
    const evidenceAssetId = v7Evidence[index];
    beat.evidenceAssetIds = evidenceAssetId ? [evidenceAssetId] : [];
  });
  const sceneData = [
    ["jobs-scroll", assets[0]!, "gentle_vertical_scroll", "HIDDEN_WHEN_NONESSENTIAL"],
    ["tracker-result", assets[1]!, "single_status_change", "SINGLE_ACTION"],
    ["contact-context", assets[2]!, "static_hold_subtle_push_in", "VISIBLE_STATIC"],
    ["outreach-review", assets[3]!, "single_field_or_draft_appearance", "SOURCE_CURSOR_REQUIRED"]
  ] as const;
  return {
    ...base,
    seed: 71_629,
    userStory: {
      initialCondition: "A job seeker is overwhelmed by roles, people, and follow-ups.",
      desiredChange: "The next useful decision becomes clear.",
      trustBoundary: "The user reviews outreach before it moves forward.",
      outcome: "The search remains understandable and reviewable.",
      cta: "Open the Solomon demo."
    },
    microScenes: sceneData.map(([id, asset, allowedMotion, cursorPolicy]) => ({
      id,
      semanticPurpose: `Prove ${asset.id} without showing navigation.`,
      primaryIdea: `${asset.id} proof`,
      evidenceAssetId: asset.id,
      sourceHash: asset.contentHash!,
      verifiedSourceInterval: { startMs: 1_000, endMs: 6_000 },
      regionOfInterest: { x: 0.26, y: 0.27, width: 0.48, height: 0.38 },
      startingCrop: { x: 0.16, y: 0.12, width: 0.68, height: 0.68 },
      endingCrop: { x: 0.18, y: 0.14, width: 0.64, height: 0.64 },
      allowedMotion,
      cursorPolicy,
      loopPolicy: "forbidden" as const,
      maximumDurationMs: 3_000,
      claimIds: [`claim-${asset.id}`],
      expectedVisibleResult: `${asset.id} remains visible.`,
      fabricatedInterface: false as const,
      continuousNavigation: false as const
    })),
    claimEvidenceMatrix: assets.map((asset) => ({
      claimId: `claim-${asset.id}`,
      spokenClaim: `Authenticated ${asset.id} proof.`,
      evidenceAssetIds: [asset.id],
      sourceHashes: [asset.contentHash!],
      verifiedSourceIntervals: [{ assetId: asset.id, startMs: 1_000, endMs: 6_000 }],
      visibleResult: `${asset.id} remains visible.`,
      qualification: "Limited to the captured product state.",
      approvalStatus: "approved" as const
    }))
  };
}

describe("creator_editorial_user_story_v7", () => {
  it("compiles deterministically as a presenter-led user story", () => {
    const first = compileCreatorEditorialUserStoryV7(v7Input());
    expect(compileCreatorEditorialUserStoryV7(v7Input())).toEqual(first);
    const report = evaluateCreatorEditorialUserStoryV7(first);
    expect(first.templateId).toBe("creator_editorial_user_story_v7");
    expect(report.passed).toBe(true);
    expect(report.presenterOnlyRatio).toBeGreaterThanOrEqual(0.55);
    expect(report.productInsertCount).toBe(4);
    expect(report.longestConnectedProductSequenceMs).toBeLessThanOrEqual(3_000);
    expect(() => assertCreatorEditorialUserStoryV7Edl(first)).not.toThrow();
  });

  it("alternates isolated product proofs with presenter resets", () => {
    const edl = compileCreatorEditorialUserStoryV7(v7Input());
    const productIndexes = edl.shots
      .map((shot, index) => shot.v7Direction.visualMode === "product_micro_scene" ? index : -1)
      .filter((index) => index >= 0);
    expect(productIndexes).toEqual([2, 5, 8, 11]);
    expect(productIndexes.every((index) => edl.shots[index + 1]?.v7Direction.visualMode === "presenter_only")).toBe(true);
    expect(edl.microScenes.every(({ continuousNavigation }) => !continuousNavigation)).toBe(true);
  });

  it("fails closed for fabricated footage and unapproved source hashes", () => {
    const fabricated = v7Input();
    (fabricated.microScenes[0] as unknown as { fabricatedInterface: boolean }).fabricatedInterface = true;
    expect(() => compileCreatorEditorialUserStoryV7(fabricated)).toThrow(/authentic evidence contract/);

    const mismatched = v7Input();
    mismatched.claimEvidenceMatrix[0]!.sourceHashes[0] = hash("z");
    expect(() => compileCreatorEditorialUserStoryV7(mismatched)).toThrow(/invalid evidence/);
  });

  it("projects as an independently selectable V7 template", () => {
    const base: EditDecisionList = {
      schemaVersion: "2",
      templateId: "creator-template:brand_presenter:v1",
      templateKey: "brand_presenter",
      templateVersion: 1,
      brandKitId: "fixture-brand",
      durationMs: 36_000,
      canvas: { width: 1080, height: 1920, fps: 30 },
      brandKit: blueprint().brandKit,
      sourceSegments: [],
      zooms: [],
      transitions: [],
      captions: [],
      overlays: [],
      callouts: [],
      cursorCues: [],
      sfx: [],
      presenter: {
        enabled: true,
        style: "fictional_illustrated",
        avatarId: "orbit",
        provenance: "gideon_fictional_catalog",
        disclosure: "AI-generated brand presenter",
        startMs: 0,
        endMs: 36_000,
        position: "lower_left",
        motion: "caption_sync"
      },
      music: { enabled: true, mood: "clean_tech", gainDb: -27 },
      qualityGates: {
        requireEvidenceBackedClaims: true,
        requireCaptionSafeArea: true,
        requireAudioAlignment: true
      }
    };
    const projected = projectCreatorEditorialUserStoryV7OntoEditDecisionList(
      base,
      compileCreatorEditorialUserStoryV7(v7Input())
    );
    expect(projected.templateKey).toBe("creator_editorial_user_story_v7");
  });
});
