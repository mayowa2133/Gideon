import { createHash } from "node:crypto";
import type { EditDecisionList } from "./types";
import type { AxiomV4PerformanceId } from "./axiomPerformanceInventoryV4";
import type { EditorialV2Presenter } from "./creatorEditorialV2";
import type { EditorialV3Shot } from "./creatorEditorialV3";
import {
  compileCreatorEditorialReferenceRhythm,
  projectCreatorEditorialReferenceRhythmOntoEditDecisionList,
  type CompileCreatorEditorialReferenceRhythmInput,
  type CreatorEditorialReferenceRhythmEdl,
  type ReferenceRhythmShot
} from "./creatorEditorialReferenceRhythm";

export const CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID = "creator_editorial_user_story_v7" as const;
export const CREATOR_EDITORIAL_USER_STORY_V7_COMPILER_VERSION = "creator-editorial-user-story-compiler-v7.0" as const;
export const CREATOR_EDITORIAL_USER_STORY_V7_SCHEMA_VERSION = "7" as const;

export type V7BeatClassification =
  | "SPEAKER_ONLY"
  | "USER_PROBLEM"
  | "PRODUCT_EVIDENCE"
  | "PRODUCT_RESULT"
  | "EMOTIONAL_TRANSITION"
  | "TRUST_STATEMENT"
  | "CTA";

export type V7ProductMotion =
  | "gentle_vertical_scroll"
  | "gentle_horizontal_movement"
  | "single_card_movement"
  | "single_panel_open"
  | "single_status_change"
  | "single_field_or_draft_appearance"
  | "static_hold_subtle_push_in"
  | "seamless_short_loop";

export type V7CursorPolicy =
  | "HIDDEN_WHEN_NONESSENTIAL"
  | "VISIBLE_STATIC"
  | "SINGLE_ACTION"
  | "FOLLOW_FOR_SHORT_ACTION"
  | "SOURCE_CURSOR_REQUIRED";

export interface V7UserStory {
  initialCondition: string;
  desiredChange: string;
  trustBoundary: string;
  outcome: string;
  cta: string;
}

export interface V7ProductMicroScene {
  id: string;
  semanticPurpose: string;
  primaryIdea: string;
  evidenceAssetId: string;
  sourceHash: string;
  verifiedSourceInterval: { startMs: number; endMs: number };
  regionOfInterest: { x: number; y: number; width: number; height: number };
  startingCrop: { x: number; y: number; width: number; height: number };
  endingCrop: { x: number; y: number; width: number; height: number };
  allowedMotion: V7ProductMotion;
  cursorPolicy: V7CursorPolicy;
  loopPolicy: "forbidden" | "seamless_only";
  maximumDurationMs: number;
  claimIds: string[];
  expectedVisibleResult: string;
  fabricatedInterface: false;
  continuousNavigation: false;
}

export interface V7EditorialDirection {
  classification: V7BeatClassification;
  visualMode: "presenter_only" | "product_micro_scene" | "branded_hold";
  emotionalPurpose: "tension" | "orientation" | "proof" | "relief" | "trust" | "outcome" | "invitation";
  presenterFraming:
    | "tight_closeup"
    | "medium"
    | "wide_full_body"
    | "slow_push_in"
    | "slow_pull_back"
    | "emphasis_pose"
    | "trust_reassurance_pose"
    | "cta_pose"
    | "none";
  presenterPerformance: AxiomV4PerformanceId | "none";
  microSceneId?: string;
  captionPlacement: "top_center" | "lower_center" | "product_safe";
  transition: "hard_cut" | "controlled_push_in" | "product_cut" | "brand_resolve";
  persistentCta: boolean;
}

export interface CreatorEditorialUserStoryV7Shot extends ReferenceRhythmShot {
  v7Direction: V7EditorialDirection;
}

export interface V7ClaimEvidenceRow {
  claimId: string;
  spokenClaim: string;
  evidenceAssetIds: string[];
  sourceHashes: string[];
  verifiedSourceIntervals: Array<{ assetId: string; startMs: number; endMs: number }>;
  visibleResult: string;
  qualification: string;
  approvalStatus: "approved" | "qualified" | "rejected";
}

export interface CreatorEditorialUserStoryV7Edl extends Omit<
  CreatorEditorialReferenceRhythmEdl,
  "schemaVersion" | "templateId" | "compilerVersion" | "shots"
> {
  schemaVersion: typeof CREATOR_EDITORIAL_USER_STORY_V7_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_USER_STORY_V7_COMPILER_VERSION;
  shots: CreatorEditorialUserStoryV7Shot[];
  userStory: V7UserStory;
  microScenes: V7ProductMicroScene[];
  claimEvidenceMatrix: V7ClaimEvidenceRow[];
  editorialPolicy: {
    targetPresenterRatio: { min: number; max: number };
    maximumProductInsertMs: number;
    maximumConsecutiveProductInserts: number;
    minimumPresenterResetFrequency: number;
    continuousCursorFollowingDefault: false;
    authenticProductPixelsRequired: true;
    mouthlessPresenter: true;
    lipSyncRequired: false;
    ctaPersistsThroughOutro: true;
  };
}

export interface CompileCreatorEditorialUserStoryV7Input extends CompileCreatorEditorialReferenceRhythmInput {
  userStory: V7UserStory;
  microScenes: V7ProductMicroScene[];
  claimEvidenceMatrix: V7ClaimEvidenceRow[];
}

export interface CreatorEditorialUserStoryV7QualityReport {
  schemaVersion: "7";
  templateId: typeof CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{
    code: string;
    status: "pass" | "fail";
    measured: number | string;
    threshold: string;
    shotIds?: string[];
  }>;
  presenterOnlyRatio: number;
  productEvidenceRatio: number;
  productInsertCount: number;
  averageProductInsertMs: number;
  longestConnectedProductSequenceMs: number;
  presenterResetCount: number;
  cursorFollowingSequenceCount: number;
}

const EVIDENCE_SEQUENCE: ReadonlyArray<string | undefined> = [
  undefined,
  undefined,
  "jobs",
  undefined,
  undefined,
  "tracker",
  undefined,
  undefined,
  "contacts",
  undefined,
  undefined,
  "outreach",
  undefined,
  undefined,
  undefined,
  undefined
];

const PRODUCT_SHOT_INDEXES = new Set([2, 5, 8, 11]);

const SHOT_DURATIONS_MS = [
  2_200, 2_400, 1_600, 1_800, 2_000, 2_000, 2_000, 2_600,
  2_200, 2_000, 2_200, 2_300, 2_500, 2_200, 3_000, 3_000
] as const;

const PERFORMANCE_SEQUENCE: Readonly<Partial<Record<number, AxiomV4PerformanceId>>> = {
  0: "strong_emphasis",
  1: "two_hand_explanation",
  3: "neutral_listening",
  4: "pointing_right",
  6: "reaction",
  7: "calm_product_explanation",
  9: "pointing_left",
  10: "strong_emphasis",
  12: "two_hand_explanation",
  13: "neutral_listening",
  14: "open_cta"
};

const COMPOSITION_SEQUENCE: ReadonlyArray<EditorialV3Shot["compositionFamily"]> = [
  "axiom_closeup",
  "editorial_phrase",
  "product_macro",
  "axiom_keyword",
  "axiom_closeup",
  "product_macro",
  "editorial_phrase",
  "axiom_closeup",
  "product_macro",
  "axiom_keyword",
  "axiom_closeup",
  "product_macro",
  "editorial_phrase",
  "axiom_keyword",
  "presenter_cta",
  "branded_outro"
];

const DIRECTIONS: readonly V7EditorialDirection[] = [
  direction("USER_PROBLEM", "presenter_only", "tension", "tight_closeup", "strong_emphasis", "top_center", "hard_cut"),
  direction("SPEAKER_ONLY", "presenter_only", "orientation", "slow_pull_back", "two_hand_explanation", "top_center", "controlled_push_in"),
  productDirection("PRODUCT_EVIDENCE", "proof", "jobs-scroll", "product_cut"),
  direction("EMOTIONAL_TRANSITION", "presenter_only", "relief", "medium", "neutral_listening", "top_center", "hard_cut"),
  direction("SPEAKER_ONLY", "presenter_only", "orientation", "emphasis_pose", "pointing_right", "top_center", "controlled_push_in"),
  productDirection("PRODUCT_RESULT", "proof", "tracker-result", "product_cut"),
  direction("EMOTIONAL_TRANSITION", "presenter_only", "relief", "wide_full_body", "reaction", "top_center", "hard_cut"),
  direction("SPEAKER_ONLY", "presenter_only", "orientation", "medium", "calm_product_explanation", "top_center", "controlled_push_in"),
  productDirection("PRODUCT_EVIDENCE", "proof", "contact-context", "product_cut"),
  direction("EMOTIONAL_TRANSITION", "presenter_only", "relief", "slow_push_in", "pointing_left", "top_center", "hard_cut"),
  direction("TRUST_STATEMENT", "presenter_only", "trust", "trust_reassurance_pose", "strong_emphasis", "top_center", "controlled_push_in"),
  productDirection("PRODUCT_RESULT", "trust", "outreach-review", "product_cut"),
  direction("SPEAKER_ONLY", "presenter_only", "outcome", "medium", "two_hand_explanation", "top_center", "hard_cut"),
  direction("EMOTIONAL_TRANSITION", "presenter_only", "outcome", "slow_push_in", "neutral_listening", "top_center", "controlled_push_in"),
  { ...direction("CTA", "presenter_only", "invitation", "cta_pose", "open_cta", "top_center", "hard_cut"), persistentCta: true },
  { ...direction("CTA", "branded_hold", "invitation", "none", "none", "lower_center", "brand_resolve"), persistentCta: true }
] as const;

export function compileCreatorEditorialUserStoryV7(
  input: CompileCreatorEditorialUserStoryV7Input
): CreatorEditorialUserStoryV7Edl {
  assertV7Inputs(input);
  const base = compileCreatorEditorialReferenceRhythm({
    ...input,
    validationProfile: "user_story_v7",
    shotDurationsMs: SHOT_DURATIONS_MS,
    evidenceSequence: EVIDENCE_SEQUENCE,
    presenterSequence: presenterSequence(),
    performanceSequence: PERFORMANCE_SEQUENCE,
    compositionSequence: COMPOSITION_SEQUENCE
  });
  if (base.shots.length !== DIRECTIONS.length) {
    throw new Error(`V7 requires exactly ${DIRECTIONS.length} directed shots.`);
  }
  const sceneById = new Map(input.microScenes.map((scene) => [scene.id, scene]));
  const shots = base.shots.map((shot, index): CreatorEditorialUserStoryV7Shot => {
    const v7Direction = DIRECTIONS[index]!;
    const scene = v7Direction.microSceneId ? sceneById.get(v7Direction.microSceneId) : undefined;
    if (v7Direction.visualMode === "product_micro_scene" && !scene) {
      throw new Error(`V7 shot ${index + 1} is missing micro-scene ${v7Direction.microSceneId}.`);
    }
    const presenter = {
      ...shot.presenter,
      visible: v7Direction.visualMode === "presenter_only",
      ...(v7Direction.visualMode === "presenter_only"
        ? { placement: "full" as const }
        : { placement: "none" as const, scale: 0 })
    };
    const resultViewport = scene?.endingCrop ?? shot.evidenceTreatment.resultViewport;
    const evidenceTreatment = scene
      ? {
          ...shot.evidenceTreatment,
          actionRegion: scene.regionOfInterest,
          resultRegion: scene.regionOfInterest,
          criticalRegion: scene.regionOfInterest,
          focusSequence: "context_result_hold" as const,
          actionViewport: scene.startingCrop,
          resultViewport,
          contextViewport: scene.startingCrop,
          postFocusDrift: { x: 0, y: 0, scale: scene.allowedMotion === "static_hold_subtle_push_in" ? 0.03 : 0 },
          geometryProvenance: {
            action: "reviewed_capture_geometry" as const,
            result: "reviewed_capture_geometry" as const,
            cursor: scene.cursorPolicy === "SOURCE_CURSOR_REQUIRED" || scene.cursorPolicy === "SINGLE_ACTION"
              ? "recorded_cursor" as const
              : "unavailable" as const
          }
        }
      : shot.evidenceTreatment;
    const captions = shot.captions.map((caption) => ({
      ...caption,
      placementKey: v7Direction.captionPlacement === "product_safe"
        ? "lower_center" as const
        : v7Direction.captionPlacement,
      safeRegion: v7Direction.visualMode === "product_micro_scene"
        ? { x: 0.08, y: 0.80, width: 0.84, height: 0.14 }
        : { x: 0.08, y: 0.10, width: 0.84, height: 0.18 }
    }));
    const sourceIntervalMs = scene
      ? {
          startMs: scene.verifiedSourceInterval.startMs,
          endMs: Math.min(
            scene.verifiedSourceInterval.endMs,
            scene.verifiedSourceInterval.startMs + (shot.endMs - shot.startMs)
          )
        }
      : undefined;
    const withoutCache = {
      ...shot,
      id: `user-story-v7-shot-${String(index + 1).padStart(2, "0")}`,
      presenter,
      captions,
      sourceIntervalMs,
      evidenceTreatment,
      camera: {
        ...shot.camera,
        pointerPolicy: scene && (
          scene.cursorPolicy === "SINGLE_ACTION"
          || scene.cursorPolicy === "FOLLOW_FOR_SHORT_ACTION"
          || scene.cursorPolicy === "SOURCE_CURSOR_REQUIRED"
        )
          ? "contain_pointer" as const
          : "geometry_fallback" as const
      },
      v7Direction,
      compositionSignature: [
        shot.compositionFamily,
        v7Direction.visualMode,
        v7Direction.presenterFraming,
        scene?.id ?? "no-product",
        v7Direction.captionPlacement
      ].join("|")
    };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_USER_STORY_V7_COMPILER_VERSION,
        seed: input.seed ?? 71_629,
        shot: withoutCache
      })
    };
  });
  const edl: CreatorEditorialUserStoryV7Edl = {
    ...base,
    schemaVersion: CREATOR_EDITORIAL_USER_STORY_V7_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_USER_STORY_V7_COMPILER_VERSION,
    seed: input.seed ?? 71_629,
    shots,
    userStory: input.userStory,
    microScenes: input.microScenes,
    claimEvidenceMatrix: input.claimEvidenceMatrix,
    editorialPolicy: {
      targetPresenterRatio: { min: 0.55, max: 0.72 },
      maximumProductInsertMs: 3_000,
      maximumConsecutiveProductInserts: 2,
      minimumPresenterResetFrequency: 1,
      continuousCursorFollowingDefault: false,
      authenticProductPixelsRequired: true,
      mouthlessPresenter: true,
      lipSyncRequired: false,
      ctaPersistsThroughOutro: true
    }
  };
  const report = evaluateCreatorEditorialUserStoryV7(edl);
  const failures = report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) {
    throw new Error(`Invalid V7 user-story plan: ${failures.map(({ code }) => code).join(", ")}.`);
  }
  return edl;
}

export function evaluateCreatorEditorialUserStoryV7(
  edl: CreatorEditorialUserStoryV7Edl
): CreatorEditorialUserStoryV7QualityReport {
  const productShots = edl.shots.filter(({ v7Direction }) => v7Direction.visualMode === "product_micro_scene");
  const presenterShots = edl.shots.filter(({ v7Direction }) => v7Direction.visualMode === "presenter_only");
  const presenterOnlyMs = sumDurations(presenterShots);
  const productMs = sumDurations(productShots);
  const presenterOnlyRatio = presenterOnlyMs / edl.durationMs;
  const productEvidenceRatio = productMs / edl.durationMs;
  const productDurations = productShots.map(({ startMs, endMs }) => endMs - startMs);
  const averageProductInsertMs = Math.round(productDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, productDurations.length));
  const connectedProductSequences = contiguousProductSequences(edl.shots);
  const longestConnectedProductSequenceMs = Math.max(0, ...connectedProductSequences.map(({ durationMs }) => durationMs));
  const presenterResetCount = edl.shots.filter((shot, index) =>
    index > 0
    && index < edl.shots.length - 1
    && shot.v7Direction.visualMode === "presenter_only"
    && (
      edl.shots[index - 1]?.v7Direction.visualMode === "product_micro_scene"
      || edl.shots[index + 1]?.v7Direction.visualMode === "product_micro_scene"
    )
  ).length;
  const cursorFollowingSequenceCount = edl.microScenes.filter(({ cursorPolicy }) => cursorPolicy === "FOLLOW_FOR_SHORT_ACTION").length;
  const productIds = productShots.map(({ v7Direction }) => v7Direction.microSceneId).filter(Boolean);
  const unsupportedRows = edl.claimEvidenceMatrix.filter((row) =>
    row.approvalStatus === "rejected"
    || row.evidenceAssetIds.length === 0
    || row.evidenceAssetIds.length !== row.sourceHashes.length
    || row.evidenceAssetIds.length !== row.verifiedSourceIntervals.length
  );
  const oldName = JSON.stringify({
    story: edl.userStory,
    beats: edl.narrativeBeats,
    cta: edl.editorialPolicy
  }).match(/nexus\s*reach|nexusreach/i);
  const classifications = new Set(edl.shots.map(({ v7Direction }) => v7Direction.classification));
  const findings = [
    finding("user_story_arc", Boolean(edl.userStory.initialCondition && edl.userStory.desiredChange && edl.userStory.trustBoundary && edl.userStory.outcome && edl.userStory.cta), "problem/change/trust/outcome/cta", "all five story fields"),
    finding("sentence_visual_classifier", classifications.size === 7, classifications.size, "all 7 classifications"),
    finding("presenter_leads", presenterOnlyRatio >= 0.55 && presenterOnlyRatio <= 0.72, Number(presenterOnlyRatio.toFixed(4)), "0.55..0.72"),
    finding("isolated_product_proofs", productShots.length === 4 && new Set(productIds).size === 4, `${productShots.length}/${new Set(productIds).size}`, "4 inserts / 4 unique ideas"),
    finding("product_insert_duration", productDurations.every((duration) => duration >= 1_000 && duration <= 3_000), `${Math.min(...productDurations)}..${Math.max(...productDurations)}`, "1000..3000 ms"),
    finding("maximum_consecutive_product_inserts", connectedProductSequences.every(({ count }) => count <= 2), Math.max(0, ...connectedProductSequences.map(({ count }) => count)), "<=2"),
    finding("no_connected_workflow", longestConnectedProductSequenceMs <= 3_000, longestConnectedProductSequenceMs, "<=3000 ms"),
    finding("presenter_resets", presenterResetCount >= productShots.length, presenterResetCount, `>=${productShots.length}`),
    finding("cursor_following_not_default", cursorFollowingSequenceCount === 0, cursorFollowingSequenceCount, "0"),
    finding("micro_scene_authenticity", edl.microScenes.every(({ fabricatedInterface, continuousNavigation, sourceHash }) => !fabricatedInterface && !continuousNavigation && /^[a-f0-9]{64}$/.test(sourceHash)), edl.microScenes.length, "all authentic, hashed, non-navigation"),
    finding("claim_evidence", unsupportedRows.length === 0 && edl.claimEvidenceMatrix.length >= 4, `${edl.claimEvidenceMatrix.length}/${unsupportedRows.length}`, ">=4 rows / 0 unsupported"),
    finding("persistent_cta", edl.shots.slice(-2).every(({ v7Direction }) => v7Direction.persistentCta) && edl.shots.at(-1)?.endMs === edl.durationMs, edl.shots.slice(-2).filter(({ v7Direction }) => v7Direction.persistentCta).length, "2 through final frame"),
    finding("mouthless_no_lipsync", edl.editorialPolicy.mouthlessPresenter && !edl.editorialPolicy.lipSyncRequired, String(!edl.editorialPolicy.lipSyncRequired), "true"),
    finding("viewer_facing_name", !oldName, oldName ? "legacy name found" : "Solomon only", "0 legacy-name references")
  ];
  return {
    schemaVersion: "7",
    templateId: CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    presenterOnlyRatio,
    productEvidenceRatio,
    productInsertCount: productShots.length,
    averageProductInsertMs,
    longestConnectedProductSequenceMs,
    presenterResetCount,
    cursorFollowingSequenceCount
  };
}

export function assertCreatorEditorialUserStoryV7Edl(
  value: unknown
): asserts value is CreatorEditorialUserStoryV7Edl {
  if (!value || typeof value !== "object") throw new Error("V7 EDL must be an object.");
  const edl = value as Partial<CreatorEditorialUserStoryV7Edl>;
  if (
    edl.schemaVersion !== CREATOR_EDITORIAL_USER_STORY_V7_SCHEMA_VERSION
    || edl.templateId !== CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID
    || !Array.isArray(edl.shots)
    || !Array.isArray(edl.microScenes)
    || !Array.isArray(edl.claimEvidenceMatrix)
  ) {
    throw new Error("V7 EDL schema is invalid.");
  }
  if (!evaluateCreatorEditorialUserStoryV7(edl as CreatorEditorialUserStoryV7Edl).passed) {
    throw new Error("V7 EDL failed structural validation.");
  }
}

export function projectCreatorEditorialUserStoryV7OntoEditDecisionList(
  base: EditDecisionList,
  editorial: CreatorEditorialUserStoryV7Edl
): EditDecisionList {
  const projected = projectCreatorEditorialReferenceRhythmOntoEditDecisionList(
    base,
    editorial as unknown as CreatorEditorialReferenceRhythmEdl
  );
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID}:v1`,
    templateKey: CREATOR_EDITORIAL_USER_STORY_V7_TEMPLATE_ID,
    templateVersion: 1
  };
}

function assertV7Inputs(input: CompileCreatorEditorialUserStoryV7Input): void {
  if (input.microScenes.length !== PRODUCT_SHOT_INDEXES.size) {
    throw new Error(`V7 requires ${PRODUCT_SHOT_INDEXES.size} isolated product micro-scenes.`);
  }
  const assets = new Map(input.blueprint.productAssets.map((asset) => [asset.id, asset]));
  const scenes = new Map<string, V7ProductMicroScene>();
  for (const scene of input.microScenes) {
    if (scenes.has(scene.id)) throw new Error(`Duplicate V7 micro-scene ID ${scene.id}.`);
    scenes.set(scene.id, scene);
    const asset = assets.get(scene.evidenceAssetId);
    if (
      !asset
      || asset.approvalStatus !== "approved"
      || !asset.factualUseAllowed
      || asset.contentHash !== scene.sourceHash
      || scene.fabricatedInterface
      || scene.continuousNavigation
      || scene.maximumDurationMs < 1_000
      || scene.maximumDurationMs > 3_000
      || scene.verifiedSourceInterval.endMs <= scene.verifiedSourceInterval.startMs
    ) {
      throw new Error(`V7 micro-scene ${scene.id} failed the authentic evidence contract.`);
    }
  }
  const sceneIds = new Set(input.microScenes.map(({ id }) => id));
  for (const direction of DIRECTIONS) {
    if (direction.microSceneId && !sceneIds.has(direction.microSceneId)) {
      throw new Error(`V7 direction references missing micro-scene ${direction.microSceneId}.`);
    }
  }
  for (const row of input.claimEvidenceMatrix) {
    if (
      row.approvalStatus === "rejected"
      || row.evidenceAssetIds.length === 0
      || row.evidenceAssetIds.length !== row.sourceHashes.length
      || row.evidenceAssetIds.length !== row.verifiedSourceIntervals.length
    ) {
      throw new Error(`V7 rejected or unsupported claim ${row.claimId}.`);
    }
    row.evidenceAssetIds.forEach((assetId, index) => {
      const asset = assets.get(assetId);
      const interval = row.verifiedSourceIntervals[index];
      if (
        !asset
        || asset.approvalStatus !== "approved"
        || !asset.factualUseAllowed
        || asset.contentHash !== row.sourceHashes[index]
        || interval?.assetId !== assetId
        || interval.endMs <= interval.startMs
      ) {
        throw new Error(`V7 claim ${row.claimId} has invalid evidence ${assetId}.`);
      }
    });
  }
}

function presenterSequence(): ReadonlyArray<Omit<EditorialV2Presenter, "motion"> | undefined> {
  return DIRECTIONS.map((item, index) => {
    if (item.visualMode !== "presenter_only") {
      return {
        visible: false,
        placement: "none",
        scale: 0,
        gesture: "none",
        framing: "none",
        pose: "none"
      };
    }
    const close = item.presenterFraming === "tight_closeup"
      || item.presenterFraming === "slow_push_in"
      || item.presenterFraming === "emphasis_pose"
      || item.presenterFraming === "trust_reassurance_pose"
      || item.presenterFraming === "cta_pose";
    const wide = item.presenterFraming === "wide_full_body" || item.presenterFraming === "slow_pull_back";
    return {
      visible: true,
      placement: "full",
      scale: close ? 0.58 : wide ? 0.46 : 0.52,
      gesture: item.presenterPerformance === "open_cta"
        ? "open_cta"
        : item.presenterPerformance === "pointing_left"
          ? "point_left"
          : item.presenterPerformance === "pointing_right"
            ? "point_right"
            : item.presenterPerformance === "neutral_listening"
              ? "idle"
              : item.presenterPerformance === "strong_emphasis"
                ? "emphasis"
                : "explain",
      framing: close ? "intimate_closeup" : wide ? "waist_up" : "chest_up",
      pose: item.presenterPerformance === "open_cta"
        ? "open_cta"
        : item.presenterPerformance === "pointing_left"
          ? "point_left"
          : item.presenterPerformance === "pointing_right"
            ? "point_right"
            : item.presenterPerformance === "neutral_listening"
              ? "neutral"
              : item.presenterPerformance === "strong_emphasis"
                ? "emphasis"
                : "explain"
    };
  });
}

function direction(
  classification: V7BeatClassification,
  visualMode: V7EditorialDirection["visualMode"],
  emotionalPurpose: V7EditorialDirection["emotionalPurpose"],
  presenterFraming: V7EditorialDirection["presenterFraming"],
  presenterPerformance: V7EditorialDirection["presenterPerformance"],
  captionPlacement: V7EditorialDirection["captionPlacement"],
  transition: V7EditorialDirection["transition"]
): V7EditorialDirection {
  return {
    classification,
    visualMode,
    emotionalPurpose,
    presenterFraming,
    presenterPerformance,
    captionPlacement,
    transition,
    persistentCta: false
  };
}

function productDirection(
  classification: "PRODUCT_EVIDENCE" | "PRODUCT_RESULT",
  emotionalPurpose: V7EditorialDirection["emotionalPurpose"],
  microSceneId: string,
  transition: V7EditorialDirection["transition"]
): V7EditorialDirection {
  return {
    ...direction(classification, "product_micro_scene", emotionalPurpose, "none", "none", "product_safe", transition),
    microSceneId
  };
}

function sumDurations(shots: Array<{ startMs: number; endMs: number }>): number {
  return shots.reduce((sum, { startMs, endMs }) => sum + endMs - startMs, 0);
}

function contiguousProductSequences(shots: CreatorEditorialUserStoryV7Shot[]): Array<{ count: number; durationMs: number }> {
  const sequences: Array<{ count: number; durationMs: number }> = [];
  let current: { count: number; durationMs: number } | undefined;
  for (const shot of shots) {
    if (shot.v7Direction.visualMode === "product_micro_scene") {
      current ??= { count: 0, durationMs: 0 };
      current.count += 1;
      current.durationMs += shot.endMs - shot.startMs;
    } else if (current) {
      sequences.push(current);
      current = undefined;
    }
  }
  if (current) sequences.push(current);
  return sequences;
}

function finding(
  code: string,
  pass: boolean,
  measured: number | string,
  threshold: string,
  shotIds?: string[]
) {
  return {
    code,
    status: pass ? "pass" as const : "fail" as const,
    measured,
    threshold,
    ...(shotIds?.length ? { shotIds } : {})
  };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
