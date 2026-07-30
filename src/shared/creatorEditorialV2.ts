import { createHash } from "node:crypto";
import {
  compileCreatorEditorial,
  estimateWords,
  projectCreatorEditorialOntoEditDecisionList,
  type CompileCreatorEditorialInput,
  type CreatorEditorialEdl,
  type EditorialCameraCue,
  type EditorialCaptionCue,
  type EditorialNarrationBeat,
  type EditorialNarrationWord,
  type EditorialShot,
  type EditorialShotFamily,
  type EditorialTimingProvenance
} from "./creatorEditorial";
import type { EditDecisionList, ProductEvidenceAsset, RenderFocusPoint } from "./types";
import { axiomEditorialPoseForShot } from "./axiomPoseLibrary";
import { planAxiomEditorialMotion } from "./axiomMotionPlanner";

export const CREATOR_EDITORIAL_V2_TEMPLATE_ID = "creator_editorial_v2" as const;
export const CREATOR_EDITORIAL_V2_COMPILER_VERSION = "creator-editorial-compiler-v2" as const;
export const CREATOR_EDITORIAL_V2_SCHEMA_VERSION = "2" as const;

export type CreatorEditorialCtaMode =
  | "try_now"
  | "request_access"
  | "join_waitlist"
  | "learn_more"
  | "non_transactional";

export type EditorialV2CaptionRole =
  | "standard_narration"
  | "keyword_emphasis"
  | "full_frame_editorial";

export type EditorialV2BackgroundMode =
  | "navy_depth"
  | "cream_editorial"
  | "teal_split"
  | "navy_spotlight"
  | "cream_product"
  | "teal_reverse"
  | "outro_navy";

export interface EditorialV2CaptionCue extends Omit<EditorialCaptionCue, "role"> {
  role: EditorialV2CaptionRole;
  animation: {
    kind: "fade_scale" | "slide_up" | "word_punch" | "none";
    settleMs: number;
  };
  positionPolicy: "presenter_aware" | "evidence_aware" | "full_frame";
}

export interface EditorialV2Presenter {
  visible: boolean;
  placement: EditorialShot["presenter"]["placement"];
  scale: number;
  gesture: EditorialShot["presenter"]["gesture"];
  framing: "intimate_closeup" | "chest_up" | "waist_up" | "none";
  pose: "neutral" | "explain" | "point_left" | "point_right" | "emphasis" | "open_cta" | "none";
  motion: {
    idleSwayAmplitudePx: number;
    idleSwayPeriodMs: number;
    headAmplitudePx: number;
    lateralShiftPx: number;
    punchIn: number;
    gestureStartMs: number;
    gestureDurationMs: number;
    easing: "cubic_in_out";
  };
}

export interface EditorialV2EvidenceTreatment {
  stage: "none" | "context_to_detail" | "detail_hold" | "recap";
  dimIrrelevantUi: boolean;
  spotlight: boolean;
  resultHoldMs: number;
  authenticPixelsPreserved: true;
  syntheticPointerAdded: false;
}

export interface EditorialV2Shot extends Omit<EditorialShot, "presenter" | "captions"> {
  presenter: EditorialV2Presenter;
  captions: EditorialV2CaptionCue[];
  backgroundMode: EditorialV2BackgroundMode;
  evidenceTreatment: EditorialV2EvidenceTreatment;
  compositionSignature: string;
}

export interface CreatorEditorialV2Edl extends Omit<
  CreatorEditorialEdl,
  "schemaVersion" | "templateId" | "compilerVersion" | "shots" | "audioPlan"
> {
  schemaVersion: typeof CREATOR_EDITORIAL_V2_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_V2_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_V2_COMPILER_VERSION;
  shots: EditorialV2Shot[];
  cta: {
    mode: CreatorEditorialCtaMode;
    text: string;
    availabilityConfirmed: boolean;
  };
  audioPlan: {
    narrationTargetWpm: { min: 195; max: 205 };
    targetLufs: -14;
    truePeakDbtp: -1.5;
    loudnessRangeLu: { min: 4; max: 5 };
    music: { kind: "procedural_editorial_bed_v2"; gainDb: -27; duckUnderSpeechDb: -9 };
    maximumOrdinaryGapMs: 600;
    maximumTempoCorrection: { min: 0.92; max: 1.08 };
    deliverySampleRateHz: 48_000;
  };
}

export interface CompileCreatorEditorialV2Input extends CompileCreatorEditorialInput {
  validationProfile?: "legacy" | "user_story_v7";
  cta?: {
    mode: CreatorEditorialCtaMode;
    text: string;
    availabilityConfirmed?: boolean;
  };
  /**
   * Later independently versioned templates may select which authenticated
   * product source, if any, supports each of the sixteen editorial shots.
   * The V2 sequence remains the default so existing V1–V6 output is stable.
   */
  evidenceSequence?: ReadonlyArray<string | undefined>;
  /**
   * Later templates may make presenter-only resets explicit. Motion is still
   * planned deterministically from the selected pose and shot start.
   */
  presenterSequence?: ReadonlyArray<Omit<EditorialV2Presenter, "motion"> | undefined>;
  /**
   * Optional exact sixteen-shot clock for formats whose visual changes must
   * align to sentence boundaries. Existing versions retain scaled V2 weights.
   */
  shotDurationsMs?: ReadonlyArray<number>;
}

export interface EditorialV2MeaningfulChange {
  fromShotId: string;
  toShotId: string;
  meaningful: boolean;
  changedDimensions: string[];
}

export interface CreatorEditorialV2QualityReport {
  schemaVersion: "2";
  templateId: typeof CREATOR_EDITORIAL_V2_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{
    code: string;
    status: "pass" | "fail";
    measured: number | string;
    threshold: string;
    shotIds?: string[];
  }>;
  meaningfulChanges: EditorialV2MeaningfulChange[];
  sectionModeCounts: Record<"opening" | "middle" | "benefit" | "ending", number>;
}

export const creatorEditorialTemplateV2 = {
  id: CREATOR_EDITORIAL_V2_TEMPLATE_ID,
  version: 2,
  durationMs: { min: 32_000, preferred: 35_000, max: 36_000 },
  shotCount: { min: 14, preferred: 16, max: 18 },
  presenterVisibilityRatio: { min: 0.62, max: 0.68 },
  productVisibilityRatio: { min: 0.52, max: 0.58 },
  presenterScale: { min: 0.40, max: 0.58 },
  captionWords: { min: 1, preferredMax: 3, hardMax: 5 },
  captionDwellMs: { min: 300, preferredMax: 650, hardMax: 900 },
  animationSettleMs: { min: 120, max: 220 },
  meaningfulChanges: { min: 14, max: 16 },
  firstSixSecondModes: 3,
  finalEightSecondChanges: 3,
  ctaStartMs: 29_000,
  outroMs: 3_000
} as const;

const V2_FAMILIES: EditorialShotFamily[] = [
  "presenter_hook",
  "kinetic_emphasis",
  "presenter_product_split",
  "product_detail_crop",
  "presenter_product_split",
  "product_evidence_card",
  "presenter_closeup",
  "presenter_product_split",
  "product_detail_crop",
  "product_result_hold",
  "presenter_closeup",
  "presenter_product_split",
  "recap_montage",
  "benefit_cutaway",
  "presenter_cta",
  "branded_outro"
];

const V2_DURATION_WEIGHTS = [
  1_500, 1_500, 2_000, 2_000, 2_200, 2_200, 2_200, 2_200,
  2_200, 2_200, 2_200, 2_200, 2_400, 2_000, 3_000, 3_000
] as const;

const V2_EVIDENCE_IDS: Array<string | undefined> = [
  undefined, undefined, "jobs", "jobs", "tracker", "tracker", undefined, "contacts",
  "contacts", "outreach", undefined, "outreach", "jobs", undefined, undefined, undefined
];

const V2_BACKGROUNDS: EditorialV2BackgroundMode[] = [
  "navy_depth",
  "cream_editorial",
  "teal_split",
  "cream_product",
  "navy_spotlight",
  "teal_reverse",
  "cream_editorial",
  "navy_depth",
  "cream_product",
  "teal_reverse",
  "navy_spotlight",
  "cream_editorial",
  "teal_split",
  "navy_depth",
  "cream_editorial",
  "outro_navy"
];

export function compileCreatorEditorialV2(input: CompileCreatorEditorialV2Input): CreatorEditorialV2Edl {
  const durationMs = input.targetDurationMs ?? creatorEditorialTemplateV2.durationMs.preferred;
  if (durationMs < creatorEditorialTemplateV2.durationMs.min || durationMs > creatorEditorialTemplateV2.durationMs.max) {
    throw new Error("creator_editorial_v2 duration must be between 32 and 36 seconds.");
  }
  const safeCta = normalizeCta(input.cta);
  const v1ValidationEdl = compileCreatorEditorial(input);
  const timingProvenance = input.timingProvenance ?? inferTimingProvenance(input.narrationBeats);
  const durations = input.shotDurationsMs
    ? validateShotDurations(input.shotDurationsMs, durationMs)
    : scaledDurations(durationMs);
  const globalCaptions = buildEditorialV2Captions({
    beats: input.narrationBeats,
    range: { startMs: 0, endMs: durationMs },
    timingProvenance
  });
  const telemetryByAsset = new Map(input.telemetry.map((item) => [item.evidenceAssetId, item]));
  const assetsById = new Map(input.blueprint.productAssets.map((asset) => [asset.id, asset]));
  const seed = input.seed ?? 71_624;
  let cursor = 0;
  const shots = V2_FAMILIES.map((family, index): EditorialV2Shot => {
    const startMs = cursor;
    const endMs = cursor += durations[index]!;
    const evidenceId = input.evidenceSequence ? input.evidenceSequence[index] : V2_EVIDENCE_IDS[index];
    const asset = evidenceId ? assetsById.get(evidenceId) : undefined;
    const telemetry = evidenceId ? telemetryByAsset.get(evidenceId) : undefined;
    if (evidenceId && (!asset || !telemetry)) {
      throw new Error(`Creator editorial v2 shot ${index + 1} is missing verified evidence ${evidenceId}.`);
    }
    const presenterOverride = input.presenterSequence?.[index];
    const presenter = presenterOverride
      ? { ...presenterOverride, motion: planAxiomEditorialMotion(index, startMs, presenterOverride) }
      : presenterForV2(index, startMs);
    const crop = cropForV2(family, asset, telemetry);
    const captions = globalCaptions
      .filter((caption) => midpoint(caption.startMs, caption.endMs) >= startMs && midpoint(caption.startMs, caption.endMs) < endMs)
      .map((caption) => ({
        ...caption,
        safeRegion: captionRegionForV2(caption.role, presenter.placement, Boolean(evidenceId)),
        positionPolicy: caption.role === "full_frame_editorial"
          ? "full_frame" as const
          : evidenceId
            ? "evidence_aware" as const
            : "presenter_aware" as const
      }));
    const sourceIntervalMs = asset ? sourceIntervalForV2(asset, index, endMs - startMs) : undefined;
    const camera = cameraForV2(crop, telemetry, family);
    const evidenceTreatment = evidenceTreatmentForV2(family, Boolean(evidenceId));
    const transitionIn = transitionForV2(index, family);
    const backgroundMode = V2_BACKGROUNDS[index]!;
    const compositionSignature = [
      family,
      backgroundMode,
      presenter.visible ? `${presenter.placement}:${presenter.framing}:${presenter.scale.toFixed(2)}` : "no-presenter",
      evidenceId ? `${evidenceId}:${evidenceTreatment.stage}:${crop.scale.toFixed(2)}` : "no-product",
      captions[0]?.role ?? "no-caption"
    ].join("|");
    const overlappingBeats = input.narrationBeats.filter((beat) => beat.endMs > startMs && beat.startMs < endMs);
    const withoutCache = {
      id: `editorial-v2-shot-${String(index + 1).padStart(2, "0")}`,
      family,
      startMs,
      endMs,
      narrationBeatIds: overlappingBeats.map(({ id }) => id),
      productEvidenceIds: evidenceId ? [evidenceId] : [],
      sourceCaptureHashes: telemetry ? [telemetry.sourceSha256] : [],
      sourceIntervalMs,
      crop,
      presenter,
      camera,
      captions,
      transitionIn,
      transitionOut: { kind: "cut" as const, durationMs: 0 },
      callout: family === "product_result_hold" ? "result_hold" as const : evidenceId ? "spotlight" as const : "none" as const,
      musicIntensity: musicIntensityForV2(index),
      soundEffects: soundEffectsForV2(family, transitionIn.kind),
      expectedVisualChange: family === "product_result_hold" ? "hold" as const : "major" as const,
      claimIds: unique(overlappingBeats.flatMap(({ claimIds }) => claimIds)),
      fallback: evidenceId ? "static_evidence_crop" as const : "branded_graphic" as const,
      backgroundMode,
      evidenceTreatment,
      compositionSignature
    };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_V2_COMPILER_VERSION,
        seed,
        blueprintId: input.blueprint.id,
        brandKit: input.blueprint.brandKit,
        presenterAssetHash: input.presenterAssetHash ?? "not_supplied",
        cta: index >= 14 ? safeCta : undefined,
        shot: withoutCache
      })
    };
  });
  const edl: CreatorEditorialV2Edl = {
    ...v1ValidationEdl,
    schemaVersion: CREATOR_EDITORIAL_V2_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_V2_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_V2_COMPILER_VERSION,
    seed,
    durationMs,
    shots,
    cta: safeCta,
    audioPlan: {
      narrationTargetWpm: { min: 195, max: 205 },
      targetLufs: -14,
      truePeakDbtp: -1.5,
      loudnessRangeLu: { min: 4, max: 5 },
      music: { kind: "procedural_editorial_bed_v2", gainDb: -27, duckUnderSpeechDb: -9 },
      maximumOrdinaryGapMs: 600,
      maximumTempoCorrection: { min: 0.92, max: 1.08 },
      deliverySampleRateHz: 48_000
    }
  };
  const quality = evaluateCreatorEditorialV2(edl);
  const failures = input.validationProfile === "user_story_v7"
    ? []
    : quality.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) {
    throw new Error(`Invalid creator editorial v2 plan: ${failures.map(({ code }) => code).join(", ")}.`);
  }
  return edl;
}

export function buildEditorialV2Captions(input: {
  beats: EditorialNarrationBeat[];
  range: { startMs: number; endMs: number };
  timingProvenance: EditorialTimingProvenance;
}): EditorialV2CaptionCue[] {
  const emphasized = new Set(input.beats.flatMap(({ emphasizedWords = [] }) => emphasizedWords.map(normalizeWord)));
  const output: EditorialV2CaptionCue[] = [];
  let cueIndex = 0;
  for (const beat of input.beats) {
    const words = beat.words?.length ? beat.words : estimateWords(beat.text, beat.startMs, beat.endMs);
    const chunks = chunkV2Words(words);
    chunks.forEach((chunk, chunkIndex) => {
      const startMs = Math.max(input.range.startMs, chunk[0]!.startMs);
      const endMs = Math.min(input.range.endMs, Math.max(chunk.at(-1)!.endMs, startMs + 300));
      if (endMs <= input.range.startMs || startMs >= input.range.endMs) return;
      const emphasizedWords = chunk.map(({ text }) => text).filter((text) => emphasized.has(normalizeWord(text)));
      const fullFrame = chunkIndex === 0 && ["hook", "reveal", "benefit", "cta"].includes(beat.purpose);
      const role: EditorialV2CaptionRole = fullFrame
        ? "full_frame_editorial"
        : emphasizedWords.length > 0
          ? "keyword_emphasis"
          : "standard_narration";
      output.push({
        id: `caption-v2-${cueIndex += 1}`,
        startMs,
        endMs,
        words: chunk.map(({ text }) => text),
        emphasizedWords,
        timingProvenance: input.timingProvenance,
        safeRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.22 },
        role,
        animation: {
          kind: role === "full_frame_editorial" ? "fade_scale" : role === "keyword_emphasis" ? "word_punch" : "slide_up",
          settleMs: role === "full_frame_editorial" ? 200 : role === "keyword_emphasis" ? 160 : 140
        },
        positionPolicy: fullFrame ? "full_frame" : "presenter_aware"
      });
    });
  }
  return output;
}

export function evaluateCreatorEditorialV2(edl: CreatorEditorialV2Edl): CreatorEditorialV2QualityReport {
  const presenterMs = edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
  const productMs = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
  const presenterRatio = presenterMs / edl.durationMs;
  const productRatio = productMs / edl.durationMs;
  const meaningfulChanges = edl.shots.slice(1).map((shot, index) => compareV2Shots(edl.shots[index]!, shot));
  const meaningfulCount = meaningfulChanges.filter(({ meaningful }) => meaningful).length;
  const duplicateShots = meaningfulChanges.filter(({ meaningful }) => !meaningful).map(({ toShotId }) => toShotId);
  const badCaptions = edl.shots.flatMap((shot) => shot.captions.filter((caption) =>
    caption.words.length < 1
    || caption.words.length > 5
    || caption.endMs <= caption.startMs
    || caption.endMs - caption.startMs > 900
    || caption.animation.settleMs < 120
    || caption.animation.settleMs > 220
  ).map(() => shot.id));
  const badPresenter = edl.shots.filter(({ presenter }) => presenter.visible && (
    presenter.framing === "none"
    || presenter.scale < creatorEditorialTemplateV2.presenterScale.min
    || presenter.scale > creatorEditorialTemplateV2.presenterScale.max
    || presenter.motion.gestureDurationMs <= 0
  )).map(({ id }) => id);
  const ungrounded = edl.shots.filter(({ productEvidenceIds, sourceCaptureHashes }) =>
    productEvidenceIds.length > 0 && (sourceCaptureHashes.length !== 1 || !/^[a-f0-9]{64}$/.test(sourceCaptureHashes[0]!))
  ).map(({ id }) => id);
  const pointerFailures = edl.shots.filter(({ productEvidenceIds, camera }) =>
    productEvidenceIds.length > 0
    && camera.pointerPolicy === "contain_pointer"
    && [camera.to.x, camera.to.y].some((value) => value < 0 || value > 1)
  ).map(({ id }) => id);
  const allCaptions = edl.shots.flatMap(({ captions }) => captions);
  const preferredCadenceRatio = allCaptions.filter(({ startMs, endMs }) => endMs - startMs <= 650).length / Math.max(1, allCaptions.length);
  const sectionModeCounts = {
    opening: sectionModes(edl.shots, 0, 6_000),
    middle: sectionModes(edl.shots, 6_000, 21_000),
    benefit: sectionModes(edl.shots, 21_000, 29_000),
    ending: sectionModes(edl.shots, 27_000, edl.durationMs)
  };
  const endingChanges = meaningfulChanges.filter((change) => {
    const shot = edl.shots.find(({ id }) => id === change.toShotId);
    return Boolean(shot && shot.startMs >= 27_000);
  }).filter(({ meaningful }) => meaningful).length;
  const findings = [
    finding("duration", edl.durationMs >= 32_000 && edl.durationMs <= 36_000, edl.durationMs, "32000..36000 ms"),
    finding("shot_count", edl.shots.length >= 14 && edl.shots.length <= 18, edl.shots.length, "14..18"),
    finding("meaningful_changes", meaningfulCount >= 14 && meaningfulCount <= 16, meaningfulCount, "14..16", duplicateShots),
    finding("opening_modes", sectionModeCounts.opening >= 3, sectionModeCounts.opening, ">=3"),
    finding("ending_changes", endingChanges >= 3, endingChanges, ">=3 meaningful changes from 27s"),
    finding("presenter_visibility", presenterRatio >= 0.62 && presenterRatio <= 0.68, Number(presenterRatio.toFixed(4)), "0.62..0.68"),
    finding("product_visibility", productRatio >= 0.52 && productRatio <= 0.58, Number(productRatio.toFixed(4)), "0.52..0.58"),
    finding("presenter_motion", badPresenter.length === 0, badPresenter.length, "0 invalid presenter shots", badPresenter),
    finding("caption_hierarchy", new Set(edl.shots.flatMap(({ captions }) => captions.map(({ role }) => role))).size === 3, new Set(edl.shots.flatMap(({ captions }) => captions.map(({ role }) => role))).size, "3 roles"),
    finding("caption_policy", badCaptions.length === 0, badCaptions.length, "1..5 words, 300..900ms hard bound, 120..220ms settle", badCaptions),
    finding("caption_preferred_cadence", preferredCadenceRatio >= 0.70, Number(preferredCadenceRatio.toFixed(4)), ">=0.70 at or below 650ms"),
    finding("evidence_lineage", ungrounded.length === 0, ungrounded.length, "0 ungrounded shots", ungrounded),
    finding("pointer_containment", pointerFailures.length === 0, pointerFailures.length, "0 failures", pointerFailures),
    finding("cta", validCta(edl.cta), `${edl.cta.mode}:${edl.cta.availabilityConfirmed}`, "transactional modes require confirmed availability"),
    finding(
      "cta_outro",
      edl.shots.at(-2)?.family === "presenter_cta"
        && edl.shots.at(-1)?.family === "branded_outro"
        && edl.shots.at(-1)?.endMs === edl.durationMs
        && (edl.shots.at(-2)!.endMs - edl.shots.at(-2)!.startMs) >= 2_800
        && (edl.shots.at(-2)!.endMs - edl.shots.at(-2)!.startMs) <= 3_300
        && (edl.shots.at(-1)!.endMs - edl.shots.at(-1)!.startMs) >= 2_800
        && (edl.shots.at(-1)!.endMs - edl.shots.at(-1)!.startMs) <= 3_300,
      `${edl.shots.at(-2)?.startMs}/${edl.shots.at(-1)?.startMs}`,
      "contiguous 2.8..3.3s CTA and branded outro ending at duration"
    )
  ];
  return {
    schemaVersion: "2",
    templateId: CREATOR_EDITORIAL_V2_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    meaningfulChanges,
    sectionModeCounts
  };
}

export function compareV2Shots(previous: EditorialV2Shot, next: EditorialV2Shot): EditorialV2MeaningfulChange {
  const changedDimensions = [
    previous.family !== next.family ? "family" : undefined,
    previous.backgroundMode !== next.backgroundMode ? "background" : undefined,
    previous.presenter.placement !== next.presenter.placement ? "presenter_placement" : undefined,
    previous.presenter.framing !== next.presenter.framing ? "presenter_framing" : undefined,
    Math.abs(previous.presenter.scale - next.presenter.scale) >= 0.05 ? "presenter_scale" : undefined,
    Boolean(previous.productEvidenceIds.length) !== Boolean(next.productEvidenceIds.length) ? "product_presence" : undefined,
    previous.productEvidenceIds[0] !== next.productEvidenceIds[0] ? "product_source" : undefined,
    previous.evidenceTreatment.stage !== next.evidenceTreatment.stage ? "evidence_stage" : undefined,
    previous.captions[0]?.role !== next.captions[0]?.role ? "caption_role" : undefined
  ].filter((value): value is string => Boolean(value));
  return {
    fromShotId: previous.id,
    toShotId: next.id,
    meaningful: changedDimensions.length >= 2,
    changedDimensions
  };
}

export function editorialV2ChangedSceneIds(previous: CreatorEditorialV2Edl, next: CreatorEditorialV2Edl): string[] {
  const prior = new Map(previous.shots.map((shot) => [shot.id, shot.cacheIdentity]));
  return next.shots.filter((shot) => prior.get(shot.id) !== shot.cacheIdentity).flatMap((shot) => {
    const index = next.shots.indexOf(shot);
    return [next.shots[index - 1]?.id, shot.id, next.shots[index + 1]?.id].filter((id): id is string => Boolean(id));
  }).filter((id, index, all) => all.indexOf(id) === index);
}

export function projectCreatorEditorialV2OntoEditDecisionList(
  base: EditDecisionList,
  editorial: CreatorEditorialV2Edl
): EditDecisionList {
  const projected = projectCreatorEditorialOntoEditDecisionList(base, editorial as unknown as CreatorEditorialEdl);
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_V2_TEMPLATE_ID}:v2`,
    templateKey: CREATOR_EDITORIAL_V2_TEMPLATE_ID,
    templateVersion: 2,
    overlays: projected.overlays.map((overlay) => overlay.kind === "cta" ? { ...overlay, text: editorial.cta.text } : overlay),
    music: { ...projected.music, gainDb: editorial.audioPlan.music.gainDb }
  };
}

export function assertCreatorEditorialV2Edl(value: unknown): asserts value is CreatorEditorialV2Edl {
  if (!value || typeof value !== "object") throw new Error("Creator editorial v2 EDL must be an object.");
  const edl = value as Partial<CreatorEditorialV2Edl>;
  if (edl.schemaVersion !== "2" || edl.templateId !== CREATOR_EDITORIAL_V2_TEMPLATE_ID || !Array.isArray(edl.shots)) {
    throw new Error("Creator editorial v2 EDL schema is invalid.");
  }
  if (!Number.isInteger(edl.durationMs) || edl.durationMs! < 32_000 || edl.durationMs! > 36_000) {
    throw new Error("Creator editorial v2 duration is invalid.");
  }
  for (const shot of edl.shots) {
    if (!V2_FAMILIES.includes(shot.family) || shot.endMs <= shot.startMs || !/^[a-f0-9]{64}$/.test(shot.cacheIdentity)) {
      throw new Error("Creator editorial v2 shot is invalid.");
    }
    if (shot.evidenceTreatment.syntheticPointerAdded || !shot.evidenceTreatment.authenticPixelsPreserved) {
      throw new Error("Creator editorial v2 evidence policy is invalid.");
    }
  }
}

function presenterForV2(index: number, startMs: number): EditorialV2Presenter {
  const selected = axiomEditorialPoseForShot(index);
  return {
    ...selected,
    motion: planAxiomEditorialMotion(index, startMs, selected)
  };
}

function validateShotDurations(values: ReadonlyArray<number>, targetDurationMs: number): number[] {
  if (
    values.length !== V2_FAMILIES.length
    || values.some((value) => !Number.isInteger(value) || value < 1_000 || value > 3_300)
    || values.reduce((sum, value) => sum + value, 0) !== targetDurationMs
  ) {
    throw new Error(`Creator editorial exact shot clock must contain ${V2_FAMILIES.length} integer durations totaling ${targetDurationMs} ms.`);
  }
  return [...values];
}

function cropForV2(
  family: EditorialShotFamily,
  asset: ProductEvidenceAsset | undefined,
  telemetry: CompileCreatorEditorialInput["telemetry"][number] | undefined
): RenderFocusPoint {
  if (!asset) return { x: 0.5, y: 0.5, scale: 1 };
  const region = family === "product_result_hold" ? telemetry?.resultRegion : telemetry?.actionRegion;
  if (region) {
    return {
      x: clamp01(region.x + region.width / 2),
      y: clamp01(region.y + region.height / 2),
      scale: clamp(0.92 / Math.max(region.width, region.height), 1.38, 2.35)
    };
  }
  return { x: clamp01(asset.crop.x), y: clamp01(asset.crop.y), scale: clamp(asset.crop.scale, 1.35, 2.1) };
}

function cameraForV2(
  to: RenderFocusPoint,
  telemetry: CompileCreatorEditorialInput["telemetry"][number] | undefined,
  family: EditorialShotFamily
): EditorialCameraCue {
  const pointer = telemetry?.cursorSamples?.find(({ confidence }) => confidence >= 0.7);
  const pointerContained = pointer
    ? Math.abs(pointer.x - to.x) <= 0.46 / to.scale && Math.abs(pointer.y - to.y) <= 0.46 / to.scale
    : false;
  return {
    from: {
      x: clamp01(0.5 + (to.x - 0.5) * 0.24),
      y: clamp01(0.5 + (to.y - 0.5) * 0.24),
      scale: Math.max(1, to.scale - (family === "product_result_hold" ? 0.12 : 0.28))
    },
    to,
    easing: "cubic_in_out",
    pointerPolicy: pointer ? (pointerContained ? "contain_pointer" : "transition_to_result") : "geometry_fallback",
    maxScaleDelta: 0.42
  };
}

function evidenceTreatmentForV2(family: EditorialShotFamily, hasEvidence: boolean): EditorialV2EvidenceTreatment {
  if (!hasEvidence) {
    return { stage: "none", dimIrrelevantUi: false, spotlight: false, resultHoldMs: 0, authenticPixelsPreserved: true, syntheticPointerAdded: false };
  }
  if (family === "product_result_hold") {
    return { stage: "detail_hold", dimIrrelevantUi: true, spotlight: true, resultHoldMs: 600, authenticPixelsPreserved: true, syntheticPointerAdded: false };
  }
  if (family === "recap_montage") {
    return { stage: "recap", dimIrrelevantUi: false, spotlight: true, resultHoldMs: 400, authenticPixelsPreserved: true, syntheticPointerAdded: false };
  }
  return { stage: "context_to_detail", dimIrrelevantUi: true, spotlight: true, resultHoldMs: 450, authenticPixelsPreserved: true, syntheticPointerAdded: false };
}

function transitionForV2(index: number, family: EditorialShotFamily): EditorialShot["transitionIn"] {
  if (index === 0) return { kind: "cut", durationMs: 0 };
  if (family === "branded_outro") return { kind: "color_reverse", durationMs: 280 };
  if (family === "product_evidence_card" || family === "product_detail_crop") return { kind: "card_slide", durationMs: 220 };
  if (family === "presenter_closeup" || family === "presenter_cta") return { kind: "punch_in", durationMs: 180 };
  return { kind: "cut", durationMs: 0 };
}

function soundEffectsForV2(
  family: EditorialShotFamily,
  transition: EditorialShot["transitionIn"]["kind"]
): EditorialShot["soundEffects"] {
  if (family === "branded_outro") return ["outro_sting"];
  if (family === "product_result_hold") return ["click", "impact"];
  if (transition === "card_slide") return ["card_entry"];
  if (transition !== "cut") return ["soft_whoosh"];
  return [];
}

function captionRegionForV2(
  role: EditorialV2CaptionRole,
  placement: EditorialV2Presenter["placement"],
  hasEvidence: boolean
): EditorialV2CaptionCue["safeRegion"] {
  if (role === "full_frame_editorial") return { x: 0.08, y: 0.10, width: 0.84, height: 0.24 };
  if (placement === "left") return { x: 0.50, y: 0.08, width: 0.42, height: 0.22 };
  if (placement === "right") return { x: 0.08, y: 0.08, width: 0.42, height: 0.22 };
  if (hasEvidence) return { x: 0.08, y: 0.73, width: 0.84, height: 0.15 };
  return placement === "full" || placement === "bottom"
    ? { x: 0.08, y: 0.08, width: 0.84, height: 0.20 }
    : { x: 0.08, y: 0.70, width: 0.84, height: 0.18 };
}

function chunkV2Words(words: EditorialNarrationWord[]): EditorialNarrationWord[][] {
  const chunks: EditorialNarrationWord[][] = [];
  let pending: EditorialNarrationWord[] = [];
  for (const word of words) {
    const projectedDuration = pending.length > 0 ? word.endMs - pending[0]!.startMs : word.endMs - word.startMs;
    if (pending.length > 0 && projectedDuration > 650) {
      chunks.push(pending);
      pending = [];
    }
    pending.push(word);
    if (pending.length >= 3 || /[,.;:!?]$/.test(word.text)) {
      chunks.push(pending);
      pending = [];
    }
  }
  if (pending.length > 0) chunks.push(pending);
  return chunks;
}

function sourceIntervalForV2(asset: ProductEvidenceAsset, index: number, durationMs: number): { startMs: number; endMs: number } {
  const sourceStartMs = asset.sourceStartMs ?? 0;
  const sourceEndMs = Math.max(sourceStartMs + durationMs, asset.sourceEndMs ?? sourceStartMs + durationMs);
  const available = Math.max(0, sourceEndMs - sourceStartMs - durationMs);
  const offset = available > 0 ? (index * 530) % (available + 1) : 0;
  return { startMs: sourceStartMs + offset, endMs: Math.min(sourceEndMs, sourceStartMs + offset + durationMs) };
}

function scaledDurations(durationMs: number): number[] {
  if (durationMs === 35_000) return [...V2_DURATION_WEIGHTS];
  const scale = durationMs / 35_000;
  const durations = V2_DURATION_WEIGHTS.map((value) => Math.round(value * scale));
  durations[durations.length - 1] = durations.at(-1)! + durationMs - durations.reduce((sum, value) => sum + value, 0);
  return durations;
}

function normalizeCta(input: CompileCreatorEditorialV2Input["cta"]): CreatorEditorialV2Edl["cta"] {
  const result = {
    mode: input?.mode ?? "non_transactional" as CreatorEditorialCtaMode,
    text: input?.text?.trim() || "See how Solomon can bring your job search into focus.",
    availabilityConfirmed: input?.availabilityConfirmed === true
  };
  if (!validCta(result)) throw new Error("Transactional creator-editorial CTA requires confirmed product availability.");
  return result;
}

function validCta(cta: CreatorEditorialV2Edl["cta"]): boolean {
  const transactional = new Set<CreatorEditorialCtaMode>(["try_now", "request_access", "join_waitlist"]);
  return Boolean(cta.text.trim()) && (!transactional.has(cta.mode) || cta.availabilityConfirmed);
}

function sectionModes(shots: EditorialV2Shot[], startMs: number, endMs: number): number {
  return new Set(shots.filter((shot) => shot.endMs > startMs && shot.startMs < endMs).map(({ compositionSignature }) => compositionSignature)).size;
}

function musicIntensityForV2(index: number): number {
  if (index <= 2) return 0.74;
  if (index >= 12) return 0.82;
  return index % 3 === 0 ? 0.62 : 0.55;
}

function finding(
  code: string,
  ok: boolean,
  measured: number | string,
  threshold: string,
  shotIds?: string[]
): CreatorEditorialV2QualityReport["findings"][number] {
  return { code, status: ok ? "pass" : "fail", measured, threshold, shotIds };
}

function inferTimingProvenance(beats: EditorialNarrationBeat[]): EditorialTimingProvenance {
  return beats.every(({ words }) => words && words.length > 0) ? "provider_exact" : "deterministic_estimate";
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function midpoint(startMs: number, endMs: number): number {
  return startMs + (endMs - startMs) / 2;
}

function unique<T>(values: T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
