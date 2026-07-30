import { createHash } from "node:crypto";
import type { EditDecisionList } from "./types";
import { selectEditorialActionEvent, type EditorialActionEvent } from "./creatorEditorial";
import {
  AXIOM_V4_ASSET_LIMITATIONS,
  AXIOM_V4_PERFORMANCE_INVENTORY,
  getAxiomV4Performance,
  type AxiomV4PerformanceId,
  type AxiomV4PerformanceInventoryEntry
} from "./axiomPerformanceInventoryV4";
import {
  compileCreatorEditorialV3,
  projectCreatorEditorialV3OntoEditDecisionList,
  type CompileCreatorEditorialV3Input,
  type CreatorEditorialV3Edl,
  type EditorialV3CaptionCue,
  type EditorialV3EvidenceTreatment,
  type EditorialV3MotionEvent,
  type EditorialV3Shot
} from "./creatorEditorialV3";
import {
  clampNormalizedRect,
  productContainmentReport,
  productCardLayoutV4,
  rectCenter,
  viewportForCard,
  type NormalizedRect
} from "./editorialProductFraming";

export const CREATOR_EDITORIAL_V4_TEMPLATE_ID = "creator_editorial_v4" as const;
export const CREATOR_EDITORIAL_V4_COMPILER_VERSION = "creator-editorial-compiler-v4.1" as const;
export const CREATOR_EDITORIAL_V4_SCHEMA_VERSION = "4" as const;

export interface EditorialV4Performance extends AxiomV4PerformanceInventoryEntry {
  gesturePeakOffsetMs: number;
  holdFinalPose: true;
  mirrored: false;
  inventorySourceStartMs: number;
  inventorySourceEndMs: number;
  alignedWord: string;
  alignedWordStartMs: number;
  timelineGesturePeakMs: number;
  gesturePeakDeltaMs: number;
  anticipationStartMs: number;
  holdEndMs: number;
  cooldownEndMs: number;
  preRollHoldMs: number;
}

export interface EditorialV4CaptionCue extends EditorialV3CaptionCue {
  phraseGrouped: true;
  editorialIntent: "narration_phrase" | "intentional_keyword" | "editorial_statement";
}

export interface EditorialV4EvidenceTreatment extends EditorialV3EvidenceTreatment {
  actionRegion?: { x: number; y: number; width: number; height: number };
  resultRegion?: { x: number; y: number; width: number; height: number };
  criticalRegion?: { x: number; y: number; width: number; height: number };
  focusSequence: "context_action_result" | "context_result_hold" | "none";
  actionOccupancyRatio: number;
  resultOccupancyRatio: number;
  postFocusDrift: { x: number; y: number; scale: number };
  sourceDimensions?: { width: number; height: number };
  geometryProvenance?: {
    action: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    result: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    cursor: "recorded_cursor" | "action_target_center" | "unavailable";
  };
  contextViewport?: NormalizedRect;
  actionViewport?: NormalizedRect;
  resultViewport?: NormalizedRect;
}

export interface EditorialV4Shot extends Omit<EditorialV3Shot, "presenter" | "captions" | "evidenceTreatment"> {
  presenter: Omit<EditorialV3Shot["presenter"], "performance"> & {
    performance?: EditorialV4Performance;
  };
  captions: EditorialV4CaptionCue[];
  evidenceTreatment: EditorialV4EvidenceTreatment;
  choreography: {
    anticipationMs: number;
    gestureMs: number;
    holdMs: number;
    cooldownMs: number;
    narrationAligned: boolean;
  };
}

export interface CreatorEditorialV4Edl extends Omit<
  CreatorEditorialV3Edl,
  "schemaVersion" | "templateId" | "compilerVersion" | "shots" | "audioPlan"
> {
  schemaVersion: typeof CREATOR_EDITORIAL_V4_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_V4_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_V4_COMPILER_VERSION;
  shots: EditorialV4Shot[];
  audioPlan: Omit<CreatorEditorialV3Edl["audioPlan"], "narrationTargetWpm" | "music"> & {
    narrationTargetWpm: { min: 195; max: 215 };
    music: { kind: "procedural_editorial_bed_v4"; gainDb: -27; duckUnderSpeechDb: -9 };
    prosodyAnalysisRequired: true;
  };
  performanceInventory: {
    version: "axiom-performance-inventory-v4";
    assetLimitations: typeof AXIOM_V4_ASSET_LIMITATIONS;
  };
  v3BaselineQualityPassed: true;
}

export interface CompileCreatorEditorialV4Input extends CompileCreatorEditorialV3Input {
  /**
   * Keep already-aligned absolute CTA caption and motion timings when moving
   * the inherited V3 CTA shot into the V4 30–33 second window.
   */
  ctaTimingsAlreadyAbsolute?: boolean;
  /**
   * Optional presenter choreography supplied by later reusable templates.
   * The V4 sequence remains the default so V1–V5 outputs are unchanged.
   */
  performanceSequence?: Readonly<Partial<Record<number, AxiomV4PerformanceId>>>;
  /**
   * Optional visual composition sequence for independently versioned formats.
   * V4's original sequence remains the default for V1–V6 compatibility.
   */
  compositionSequence?: ReadonlyArray<EditorialV3Shot["compositionFamily"] | undefined>;
}

export interface CreatorEditorialV4QualityReport {
  schemaVersion: "4";
  templateId: typeof CREATOR_EDITORIAL_V4_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{ code: string; status: "pass" | "fail"; measured: number | string; threshold: string; shotIds?: string[] }>;
  distinctPerformances: AxiomV4PerformanceId[];
  distinctSilhouettes: string[];
  maximumGestureAlignmentDeltaMs: number;
  phraseCaptionRatio: number;
  openingCompositionModes: number;
  endingMeaningfulChanges: number;
  v3StructuralBaselinePassed: boolean;
}

const PERFORMANCE_SEQUENCE: Readonly<Partial<Record<number, AxiomV4PerformanceId>>> = {
  0: "strong_emphasis",
  1: "two_hand_explanation",
  2: "pointing_right",
  4: "pointing_left",
  6: "reaction",
  7: "calm_product_explanation",
  10: "strong_emphasis",
  11: "pointing_left",
  12: "neutral_listening",
  13: "two_hand_explanation",
  14: "open_cta"
};

const V4_COMPOSITION_SEQUENCE: EditorialV3Shot["compositionFamily"][] = [
  "axiom_closeup",
  "editorial_phrase",
  "asymmetric_split",
  "product_macro",
  "product_reaction",
  "product_comparison",
  "axiom_keyword",
  "asymmetric_split",
  "product_macro",
  "product_comparison",
  "axiom_closeup",
  "product_reaction",
  "rapid_recap",
  "axiom_keyword",
  "presenter_cta",
  "branded_outro"
];

export function compileCreatorEditorialV4(input: CompileCreatorEditorialV4Input): CreatorEditorialV4Edl {
  const v3 = compileCreatorEditorialV3(input);
  const telemetry = new Map(input.telemetry.map((item) => [item.evidenceAssetId, item]));
  const ctaContentOffsetMs = input.ctaTimingsAlreadyAbsolute ? 0 : 1_000;
  const retimed = v3.shots.map((shot, index) => {
    if (index === 13) return { ...shot, endMs: 30_000 };
    if (index === 14) return {
      ...shot,
      startMs: 30_000,
      endMs: 33_000,
      captions: shot.captions.map((caption) => ({
        ...caption,
        startMs: caption.startMs + ctaContentOffsetMs,
        endMs: caption.endMs + ctaContentOffsetMs
      })),
      motionEvents: shot.motionEvents.map((event) => ({
        ...event,
        startMs: event.startMs + ctaContentOffsetMs,
        endMs: event.endMs + ctaContentOffsetMs
      }))
    };
    if (index === 15) return {
      ...shot,
      startMs: 33_000,
      motionEvents: shot.motionEvents.map((event) => ({ ...event, startMs: event.startMs + 1_000, endMs: event.endMs + 1_000 }))
    };
    return shot;
  });
  const captionsByShot = regroupCaptionsAcrossTimeline(retimed);
  const shots = retimed.map((shot, index): EditorialV4Shot => {
    const compositionFamily = input.compositionSequence?.[index] ?? V4_COMPOSITION_SEQUENCE[index]!;
    const captions = evidenceAwareCaptions(captionsByShot[index] ?? [], shot);
    const performanceId = (input.performanceSequence ?? PERFORMANCE_SEQUENCE)[index];
    const performance = performanceId ? schedulePerformance(
      getAxiomV4Performance(performanceId),
      shot,
      captions
    ) : undefined;
    const evidenceTelemetry = telemetry.get(shot.productEvidenceIds[0] ?? "");
    const selectedGeometry = selectShotGeometry(evidenceTelemetry, shot.sourceIntervalMs);
    const actionRegion = selectedGeometry.actionRegion;
    const resultRegion = selectedGeometry.resultRegion;
    const criticalRegion = resultRegion ?? actionRegion;
    const productCard = shot.productEvidenceIds.length > 0
      ? productCardLayoutV4({
        composition: productComposition(compositionFamily),
        presenterVisible: shot.presenter.visible,
        presenterPlacement: productPresenterPlacement(shot.presenter.placement)
      })
      : undefined;
    const sourceSize = evidenceTelemetry?.sourceDimensions ?? { width: 1440, height: 900 };
    const contextViewport = productCard
      ? viewportForCard({ x: 0.04, y: 0.04, width: 0.92, height: 0.92 }, productCard, { sourceSize })
      : undefined;
    const rawActionViewport = productCard ? viewportForCard(actionRegion ?? criticalRegion, productCard, { sourceSize }) : undefined;
    const rawResultViewport = productCard ? viewportForCard(resultRegion ?? criticalRegion, productCard, { sourceSize }) : undefined;
    const sharedViewportSize = rawActionViewport && rawResultViewport
      ? {
          width: Math.max(rawActionViewport.width, rawResultViewport.width),
          height: Math.max(rawActionViewport.height, rawResultViewport.height)
        }
      : undefined;
    const actionViewport = sharedViewportSize && rawActionViewport
      ? centerViewportOnRegion(actionRegion ?? criticalRegion, rawActionViewport, sharedViewportSize)
      : rawActionViewport;
    const resultViewport = sharedViewportSize && rawResultViewport
      ? centerViewportOnRegion(resultRegion ?? criticalRegion, rawResultViewport, sharedViewportSize)
      : rawResultViewport;
    const destination = rectCenter(resultRegion ?? actionRegion ?? { x: 0.25, y: 0.20, width: 0.50, height: 0.60 });
    const evidenceTreatment: EditorialV4EvidenceTreatment = {
      ...shot.evidenceTreatment,
      actionRegion,
      resultRegion,
      criticalRegion,
      focusSequence: shot.productEvidenceIds.length === 0
        ? "none"
        : actionRegion && resultRegion
          ? "context_action_result"
          : "context_result_hold",
      actionOccupancyRatio: normalizedOccupancy(actionRegion, actionViewport),
      resultOccupancyRatio: normalizedOccupancy(resultRegion, resultViewport),
      targetOccupancyRatio: normalizedOccupancy(criticalRegion, resultViewport),
      borderWidthPx: 3,
      postFocusDrift: { x: 0, y: 0, scale: 0 },
      sourceDimensions: evidenceTelemetry?.sourceDimensions,
      geometryProvenance: selectedGeometry.geometryProvenance,
      contextViewport,
      actionViewport,
      resultViewport
    };
    const presenter = {
      ...shot.presenter,
      performance,
      gestureCooldownMs: performance?.cooldownMs ?? 0
    };
    const choreography = {
      anticipationMs: performance?.entranceMs ?? 0,
      gestureMs: performance?.gestureMs ?? 0,
      holdMs: performance?.holdMs ?? 0,
      cooldownMs: performance?.cooldownMs ?? 0,
      narrationAligned: !performance || performance.gesturePeakDeltaMs <= 150
    };
    const motionEvents = v4MotionEvents(shot.motionEvents, performance, shot, index);
    const sourceIntervalMs = actionCenteredSourceInterval(
      shot,
      selectedGeometry.actionEvent,
      evidenceTelemetry?.sourceDurationMs
    );
    const withoutCache = {
      ...shot,
      id: `editorial-v4-shot-${String(index + 1).padStart(2, "0")}`,
      sourceIntervalMs,
      presenter,
      captions,
      evidenceTreatment,
      camera: {
        from: { x: 0.5, y: 0.5, scale: 1 },
        to: { ...destination, scale: maximumSemanticScale(resultViewport) },
        easing: "cubic_in_out" as const,
        pointerPolicy: selectedGeometry.cursorPoint ? "contain_pointer" as const : "geometry_fallback" as const,
        maxScaleDelta: 0.38
      },
      choreography,
      motionEvents,
      compositionFamily,
      compositionSignature: [
        compositionFamily,
        shot.backgroundMode,
        performance?.silhouetteClass ?? "no-presenter",
        shot.productEvidenceIds[0] ?? "no-product",
        captions[0]?.editorialIntent ?? "no-caption",
        criticalRegion ? "verified-critical-region" : "no-critical-region"
      ].join("|")
    };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_V4_COMPILER_VERSION,
        seed: input.seed ?? 71_626,
        blueprintId: input.blueprint.id,
        brandKit: input.blueprint.brandKit,
        presenterAssetHash: input.presenterAssetHash ?? "not_supplied",
        shot: withoutCache
      })
    };
  });
  const edl: CreatorEditorialV4Edl = {
    ...v3,
    schemaVersion: CREATOR_EDITORIAL_V4_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_V4_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_V4_COMPILER_VERSION,
    seed: input.seed ?? 71_626,
    shots,
    audioPlan: {
      ...v3.audioPlan,
      narrationTargetWpm: { min: 195, max: 215 },
      music: { kind: "procedural_editorial_bed_v4", gainDb: -27, duckUnderSpeechDb: -9 },
      prosodyAnalysisRequired: true
    },
    performanceInventory: {
      version: "axiom-performance-inventory-v4",
      assetLimitations: AXIOM_V4_ASSET_LIMITATIONS
    },
    v3BaselineQualityPassed: true
  };
  const report = evaluateCreatorEditorialV4(edl);
  const failures = input.validationProfile === "user_story_v7"
    ? []
    : report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) {
    throw new Error(`Invalid creator editorial v4 plan: ${failures.map(({ code, measured, shotIds }) =>
      `${code}=${measured}${shotIds?.length ? ` [${shotIds.join(", ")}]` : ""}`
    ).join(", ")}.`);
  }
  return edl;
}

export function evaluateCreatorEditorialV4(edl: CreatorEditorialV4Edl): CreatorEditorialV4QualityReport {
  const presenterShots = edl.shots.filter(({ presenter }) => presenter.visible);
  const performances = presenterShots.flatMap(({ presenter }) => presenter.performance ? [presenter.performance] : []);
  const distinctPerformances = [...new Set(performances.map(({ id }) => id))];
  const distinctSilhouettes = [...new Set(performances.map(({ silhouetteClass }) => silhouetteClass))];
  const adjacentRepeats = performances.slice(1).filter((item, index) => item.id === performances[index]!.id);
  const maximumGestureAlignmentDeltaMs = Math.max(0, ...performances.map(({ gesturePeakDeltaMs }) => gesturePeakDeltaMs));
  const captions = edl.shots.flatMap(({ captions }) => captions);
  const phraseCaptions = captions.filter(({ words, editorialIntent }) =>
    words.length >= 2 && words.length <= 4 || words.length === 1 && editorialIntent === "intentional_keyword"
  );
  const phraseCaptionRatio = phraseCaptions.length / Math.max(1, captions.length);
  const invalidCaptions = captions.filter(({ words, editorialIntent }) =>
    words.length > 5 || words.length === 0 || words.length === 1 && editorialIntent !== "intentional_keyword"
  );
  const productShots = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0);
  const invalidEvidence = productShots.filter(({ evidenceTreatment }) =>
    !evidenceTreatment.authenticPixelsPreserved
    || evidenceTreatment.cursorLayerCount !== 0
    || !evidenceTreatment.criticalRegion
    || !evidenceTreatment.contextViewport
    || !evidenceTreatment.actionViewport
    || !evidenceTreatment.resultViewport
  );
  const containmentChecks = productShots.map((shot) => {
    const card = productCardLayoutV4({
      composition: productComposition(shot.compositionFamily),
      presenterVisible: shot.presenter.visible,
      presenterPlacement: productPresenterPlacement(shot.presenter.placement)
    });
    const action = productContainmentReport({
      sourceSize: shot.evidenceTreatment.sourceDimensions ?? { width: 1440, height: 900 },
      card,
      viewport: shot.evidenceTreatment.actionViewport!,
      criticalRegion: shot.evidenceTreatment.actionRegion,
      cursor: shot.evidenceTreatment.actionRegion ? rectCenter(shot.evidenceTreatment.actionRegion) : undefined,
      safeMarginPx: 24,
      minimumCriticalMarginPx: 8
    });
    const result = productContainmentReport({
      sourceSize: shot.evidenceTreatment.sourceDimensions ?? { width: 1440, height: 900 },
      card,
      viewport: shot.evidenceTreatment.resultViewport!,
      criticalRegion: shot.evidenceTreatment.resultRegion ?? shot.evidenceTreatment.criticalRegion,
      safeMarginPx: 24,
      minimumCriticalMarginPx: 8
    });
    return { shot, action, result, passed: action.passed && result.passed };
  });
  const invalidContainment = containmentChecks.filter(({ passed }) => !passed);
  const adjacentFamilyRepeats = edl.shots.slice(1).filter((shot, index) =>
    shot.compositionFamily === edl.shots[index]!.compositionFamily
  );
  const openingCompositionModes = new Set(edl.shots.filter(({ startMs }) => startMs < 6_000).map(({ compositionFamily }) => compositionFamily)).size;
  const endingMeaningfulChanges = edl.shots.filter(({ startMs }) => startMs >= 27_000).length;
  const v3StructuralBaselinePassed = edl.v3BaselineQualityPassed;
  const findings = [
    finding("duration", edl.durationMs >= 32_000 && edl.durationMs <= 36_000, edl.durationMs, "32000..36000 ms"),
    finding("shot_count", edl.shots.length >= 14 && edl.shots.length <= 18, edl.shots.length, "14..18"),
    finding("distinct_performances", distinctPerformances.length >= 6, distinctPerformances.length, ">=6"),
    finding("distinct_silhouettes", distinctSilhouettes.length >= 6, distinctSilhouettes.length, ">=6"),
    finding("adjacent_performance_repetition", adjacentRepeats.length === 0, adjacentRepeats.length, "0"),
    finding("gesture_word_alignment", maximumGestureAlignmentDeltaMs <= 150, maximumGestureAlignmentDeltaMs, "<=150 ms"),
    finding("phrase_caption_ratio", phraseCaptionRatio >= 0.95, Number(phraseCaptionRatio.toFixed(4)), ">=0.95"),
    finding("caption_phrase_shape", invalidCaptions.length === 0, invalidCaptions.length, "0 empty, >5-word, or unjustified one-word captions", invalidCaptions.map(({ id }) => id)),
    finding("verified_evidence_focus", invalidEvidence.length === 0, invalidEvidence.length, "0 product shots without verified critical regions", invalidEvidence.map(({ id }) => id)),
    finding(
      "transformed_evidence_containment",
      invalidContainment.length === 0,
      invalidContainment.length === 0 ? 0 : JSON.stringify(invalidContainment.map(({ shot, action, result }) => ({
        shotId: shot.id,
        action: {
          criticalIntersectionRatio: action.criticalIntersectionRatio,
          criticalSafeMarginPx: action.criticalSafeMarginPx,
          cursorContained: action.cursorContained
        },
        result: {
          criticalIntersectionRatio: result.criticalIntersectionRatio,
          criticalSafeMarginPx: result.criticalSafeMarginPx
        }
      }))),
      "0 clipped product cards, targets, or action centers",
      invalidContainment.map(({ shot }) => shot.id)
    ),
    finding("adjacent_composition_family", adjacentFamilyRepeats.length === 0, adjacentFamilyRepeats.length, "0"),
    finding("opening_composition_modes", openingCompositionModes >= 4, openingCompositionModes, ">=4"),
    finding("ending_changes", endingMeaningfulChanges >= 3, endingMeaningfulChanges, ">=3 shots from 27s"),
    finding("cta_to_branded_close", edl.shots[14]?.endMs === 33_000 && edl.shots[15]?.startMs === 33_000, `${edl.shots[14]?.endMs}/${edl.shots[15]?.startMs}`, "33000/33000"),
    finding("authentic_evidence", edl.shots.every(({ evidenceTreatment }) => evidenceTreatment.authenticPixelsPreserved && evidenceTreatment.cursorLayerCount === 0), 0, "0 fabricated pointer/evidence layers"),
    finding("v3_structural_baseline", v3StructuralBaselinePassed, String(v3StructuralBaselinePassed), "true")
  ];
  return {
    schemaVersion: "4",
    templateId: CREATOR_EDITORIAL_V4_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    distinctPerformances,
    distinctSilhouettes,
    maximumGestureAlignmentDeltaMs,
    phraseCaptionRatio,
    openingCompositionModes,
    endingMeaningfulChanges,
    v3StructuralBaselinePassed
  };
}

export function editorialV4ChangedSceneIds(previous: CreatorEditorialV4Edl, next: CreatorEditorialV4Edl): string[] {
  const prior = new Map(previous.shots.map((shot) => [shot.id, shot.cacheIdentity]));
  return next.shots.filter((shot) => prior.get(shot.id) !== shot.cacheIdentity).flatMap((shot) => {
    const index = next.shots.indexOf(shot);
    return [next.shots[index - 1]?.id, shot.id, next.shots[index + 1]?.id].filter((id): id is string => Boolean(id));
  }).filter((id, index, all) => all.indexOf(id) === index);
}

export function projectCreatorEditorialV4OntoEditDecisionList(base: EditDecisionList, editorial: CreatorEditorialV4Edl): EditDecisionList {
  const projected = projectCreatorEditorialV3OntoEditDecisionList(base, editorial as unknown as CreatorEditorialV3Edl);
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_V4_TEMPLATE_ID}:v4`,
    templateKey: CREATOR_EDITORIAL_V4_TEMPLATE_ID,
    templateVersion: 4,
    overlays: projected.overlays.map((overlay) => overlay.kind === "cta" ? { ...overlay, text: editorial.cta.text } : overlay),
    music: { ...projected.music, gainDb: editorial.audioPlan.music.gainDb }
  };
}

export function assertCreatorEditorialV4Edl(value: unknown): asserts value is CreatorEditorialV4Edl {
  if (!value || typeof value !== "object") throw new Error("Creator editorial v4 EDL must be an object.");
  const edl = value as Partial<CreatorEditorialV4Edl>;
  if (edl.schemaVersion !== "4" || edl.templateId !== CREATOR_EDITORIAL_V4_TEMPLATE_ID || !Array.isArray(edl.shots)) {
    throw new Error("Creator editorial v4 EDL schema is invalid.");
  }
  if (!Number.isInteger(edl.durationMs) || edl.durationMs! < 32_000 || edl.durationMs! > 36_000) {
    throw new Error("Creator editorial v4 duration is invalid.");
  }
  for (const shot of edl.shots) {
    if (!/^[a-f0-9]{64}$/.test(shot.cacheIdentity) || shot.endMs <= shot.startMs) throw new Error("Creator editorial v4 shot is invalid.");
    if (!shot.evidenceTreatment.authenticPixelsPreserved || shot.evidenceTreatment.cursorLayerCount !== 0) {
      throw new Error("Creator editorial v4 evidence policy is invalid.");
    }
  }
}

function selectShotGeometry(
  telemetry: CompileCreatorEditorialV4Input["telemetry"][number] | undefined,
  sourceInterval: { startMs: number; endMs: number } | undefined
): {
  actionRegion?: NormalizedRect;
  resultRegion?: NormalizedRect;
  cursorPoint?: { x: number; y: number };
  actionEvent?: EditorialActionEvent;
  geometryProvenance?: EditorialV4EvidenceTreatment["geometryProvenance"];
} {
  if (!telemetry) return {};
  const actionEvent = selectEditorialActionEvent(telemetry.actionEvents ?? [], sourceInterval);
  const actionRegion = actionEvent?.region ?? telemetry.actionRegion;
  const resultRegion = telemetry.resultRegion ?? actionEvent?.region ?? actionRegion;
  const cursorSample = telemetry.cursorSamples?.find(({ confidence }) => confidence >= 0.7);
  return {
    actionRegion,
    resultRegion,
    actionEvent,
    cursorPoint: cursorSample
      ? { x: cursorSample.x, y: cursorSample.y }
      : actionRegion
        ? rectCenter(actionRegion)
        : undefined,
    geometryProvenance: telemetry.geometryProvenance ?? {
      action: actionEvent ? "recorded_action_target" : "geometry_fallback",
      result: "geometry_fallback",
      cursor: cursorSample ? "recorded_cursor" : actionRegion ? "action_target_center" : "unavailable"
    }
  };
}

function actionCenteredSourceInterval(
  shot: EditorialV3Shot,
  actionEvent: EditorialActionEvent | undefined,
  sourceDurationMs: number | undefined
): { startMs: number; endMs: number } | undefined {
  if (!shot.sourceIntervalMs || !actionEvent || !sourceDurationMs) return shot.sourceIntervalMs;
  const durationMs = shot.endMs - shot.startMs;
  const maximumStartMs = Math.max(0, sourceDurationMs - durationMs);
  const startMs = Math.round(Math.max(0, Math.min(maximumStartMs, actionEvent.startMs - 650)));
  return { startMs, endMs: startMs + durationMs };
}

function evidenceAwareCaptions(captions: EditorialV4CaptionCue[], shot: EditorialV3Shot): EditorialV4CaptionCue[] {
  if (shot.productEvidenceIds.length === 0) return captions;
  const safeRegion = shot.presenter.visible
    ? shot.presenter.placement === "left"
      ? { x: 0.52, y: 0.70, width: 0.42, height: 0.15 }
      : shot.presenter.placement === "right"
        ? { x: 0.06, y: 0.70, width: 0.42, height: 0.15 }
        : { x: 0.38, y: 0.70, width: 0.56, height: 0.14 }
    : { x: 0.08, y: 0.70, width: 0.84, height: 0.15 };
  return captions.map((caption) => ({
    ...caption,
    safeRegion,
    positionPolicy: "evidence_aware",
    placementKey: shot.presenter.visible
      ? shot.presenter.placement === "left"
        ? "lower_right"
        : shot.presenter.placement === "right"
          ? "lower_left"
          : "lower_right"
      : "lower_center"
  }));
}

function productComposition(composition: EditorialV3Shot["compositionFamily"]) {
  if (
    composition === "asymmetric_split"
    || composition === "product_macro"
    || composition === "product_reaction"
    || composition === "product_comparison"
    || composition === "rapid_recap"
  ) {
    return composition;
  }
  return "product_macro" as const;
}

function productPresenterPlacement(placement: EditorialV3Shot["presenter"]["placement"]) {
  return placement === "left" || placement === "right" || placement === "bottom" ? placement : "none";
}

function normalizedOccupancy(region: NormalizedRect | undefined, viewport: NormalizedRect | undefined): number {
  if (!region || !viewport) return 0;
  return Number(Math.min(1, Math.max(region.width / viewport.width, region.height / viewport.height)).toFixed(4));
}

function centerViewportOnRegion(
  region: NormalizedRect | undefined,
  fallback: NormalizedRect,
  size: { width: number; height: number }
): NormalizedRect {
  const center = region ? rectCenter(region) : rectCenter(fallback);
  return clampNormalizedRect({
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height
  });
}

function maximumSemanticScale(viewport: NormalizedRect | undefined): number {
  if (!viewport) return 1;
  return Number(Math.min(1.35, Math.max(1, 1 / Math.max(viewport.width, viewport.height))).toFixed(4));
}

function regroupCaptionsAcrossTimeline(shots: EditorialV3Shot[]): EditorialV4CaptionCue[][] {
  const sourceCaptions = shots.flatMap(({ captions }) => captions).sort((a, b) => a.startMs - b.startMs);
  const wordTimeline = sourceCaptions.flatMap((caption) => caption.words.map((word, index) => ({
    word,
    startMs: Math.round(caption.startMs + (caption.endMs - caption.startMs) * index / caption.words.length),
    endMs: Math.round(caption.startMs + (caption.endMs - caption.startMs) * (index + 1) / caption.words.length),
    source: caption
  })));
  const words = wordTimeline.map(({ word }) => word);
  const groups = semanticPhraseGroups(words);
  const emphasized = new Set(sourceCaptions.flatMap(({ emphasizedWords }) => emphasizedWords.map(normalizeWord)));
  const byShot: EditorialV4CaptionCue[][] = shots.map(() => []);
  let wordCursor = 0;
  groups.forEach((group, index) => {
    const first = wordTimeline[wordCursor]!;
    const last = wordTimeline[wordCursor + group.length - 1]!;
    const source = first.source;
    const cueStart = first.startMs;
    const cueEnd = last.endMs;
    wordCursor += group.length;
    const intentionalKeyword = group.length === 1 && emphasized.has(normalizeWord(group[0]!));
    const shotIndex = Math.max(0, shots.findIndex(({ startMs, endMs }) => cueStart >= startMs && cueStart < endMs));
    byShot[shotIndex]!.push({
      ...source,
      id: `caption-v4-${String(shotIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
      startMs: cueStart,
      endMs: Math.max(cueStart + 1, cueEnd),
      words: group,
      emphasizedWords: group.filter((word) => emphasized.has(normalizeWord(word))),
      phraseGrouped: true,
      editorialIntent: source.visualStyle === "editorial_takeover"
        ? "editorial_statement"
        : intentionalKeyword
          ? "intentional_keyword"
          : "narration_phrase"
    });
  });
  return byShot;
}

function semanticPhraseGroups(words: string[]): string[][] {
  if (words.length <= 1) return [words];
  const danglingEndWords = new Set([
    "a", "an", "the", "of", "to", "for", "with", "and", "or", "but", "is", "are", "was", "were",
    "in", "on", "at", "by", "from", "into", "beside", "before", "after", "each", "your", "that", "what", "as"
  ]);
  const weakStartWords = new Set([
    "and", "or", "but", "of", "to", "for", "with", "in", "on", "at", "by", "from", "into", "before", "after"
  ]);
  const memo = new Map<number, { cost: number; groups: string[][] }>();
  const solve = (start: number): { cost: number; groups: string[][] } => {
    if (start === words.length) return { cost: 0, groups: [] };
    const cached = memo.get(start);
    if (cached) return cached;
    let best: { cost: number; groups: string[][] } | undefined;
    for (const size of [3, 4, 2]) {
      if (start + size > words.length) continue;
      const remaining = words.length - start - size;
      if (remaining === 1) continue;
      const group = words.slice(start, start + size);
      const endWord = normalizeWord(group.at(-1)!);
      const startWord = normalizeWord(group[0]!);
      const punctuationEnd = /[,.!?;:]$/.test(group.at(-1)!);
      const localCost = (size === 2 ? 1 : size === 4 ? 0.35 : 0)
        + (danglingEndWords.has(endWord) ? 12 : 0)
        + (start > 0 && weakStartWords.has(startWord) ? 2.5 : 0)
        - (punctuationEnd ? 2 : 0);
      const tail = solve(start + size);
      if (!Number.isFinite(tail.cost)) continue;
      const candidate = { cost: localCost + tail.cost, groups: [group, ...tail.groups] };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    const result = best ?? { cost: Number.POSITIVE_INFINITY, groups: [] };
    memo.set(start, result);
    return result;
  };
  const result = solve(0);
  if (result.groups.length > 0) return result.groups;
  return [words.slice(0, Math.min(4, words.length)), ...semanticPhraseGroups(words.slice(Math.min(4, words.length)))];
}

function schedulePerformance(
  inventory: AxiomV4PerformanceInventoryEntry,
  shot: EditorialV3Shot,
  captions: EditorialV4CaptionCue[]
): EditorialV4Performance {
  const emphasized = captions.find(({ emphasizedWords }) => emphasizedWords.length > 0);
  const alignedCue = emphasized ?? captions[0];
  const alignedWord = emphasized?.emphasizedWords[0] ?? alignedCue?.words[0] ?? inventory.id.replaceAll("_", " ");
  const naturalPeakOffsetMs = inventory.gesturePeakSourceMs - inventory.sourceStartMs;
  const alignedWordStartMs = Math.min(
    shot.endMs - 1,
    Math.max(shot.startMs + 1, alignedCue?.startMs ?? shot.startMs + naturalPeakOffsetMs)
  );
  const desiredOffsetMs = alignedWordStartMs - shot.startMs;
  const naturalPeakOffsetMsFromInventory = inventory.gesturePeakSourceMs - inventory.sourceStartMs;
  const preRollHoldMs = Math.max(0, desiredOffsetMs - naturalPeakOffsetMsFromInventory);
  const sourceStartMs = preRollHoldMs > 0
    ? inventory.sourceStartMs
    : Math.max(
      inventory.sourceStartMs,
      Math.min(inventory.gesturePeakSourceMs - 1, inventory.gesturePeakSourceMs - desiredOffsetMs)
    );
  const actualPeakMs = shot.startMs + preRollHoldMs + inventory.gesturePeakSourceMs - sourceStartMs;
  return {
    ...inventory,
    inventorySourceStartMs: inventory.sourceStartMs,
    inventorySourceEndMs: inventory.sourceEndMs,
    sourceStartMs,
    sourceEndMs: inventory.sourceEndMs,
    gesturePeakOffsetMs: inventory.gesturePeakSourceMs - sourceStartMs,
    holdFinalPose: true,
    mirrored: false,
    alignedWord,
    alignedWordStartMs,
    timelineGesturePeakMs: actualPeakMs,
    gesturePeakDeltaMs: Math.abs(actualPeakMs - alignedWordStartMs),
    anticipationStartMs: Math.max(shot.startMs, actualPeakMs - inventory.entranceMs),
    holdEndMs: Math.min(shot.endMs, actualPeakMs + inventory.holdMs),
    cooldownEndMs: Math.min(shot.endMs, actualPeakMs + inventory.holdMs + inventory.cooldownMs),
    preRollHoldMs
  };
}

function v4MotionEvents(
  events: EditorialV3MotionEvent[],
  performance: EditorialV4Performance | undefined,
  shot: EditorialV3Shot,
  index: number
): EditorialV3MotionEvent[] {
  if (!performance) return events.map((event) => ({ ...event, id: event.id.replace("v3-motion", "v4-motion") }));
  const presenterEvent: EditorialV3MotionEvent = {
    id: `v4-motion-${String(index + 1).padStart(2, "0")}-presenter-performance`,
    kind: "presenter_performance",
    startMs: performance.anticipationStartMs,
    endMs: Math.max(performance.anticipationStartMs + 1, performance.cooldownEndMs),
    role: "primary",
    easing: "ease_out",
    semanticPurpose: `Align ${performance.id} peak to “${performance.alignedWord}”.`
  };
  const supporting = events.filter(({ role }) => role === "supporting").slice(0, 2)
    .map((event) => ({ ...event, id: event.id.replace("v3-motion", "v4-motion"), endMs: Math.min(shot.endMs, event.endMs) }));
  return [presenterEvent, ...supporting];
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function finding(code: string, pass: boolean, measured: number | string, threshold: string, shotIds?: string[]) {
  return { code, status: pass ? "pass" as const : "fail" as const, measured, threshold, ...(shotIds ? { shotIds } : {}) };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
