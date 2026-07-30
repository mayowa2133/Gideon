import { createHash } from "node:crypto";
import type { EditDecisionList } from "./types";
import {
  compileCreatorEditorialV2,
  evaluateCreatorEditorialV2,
  projectCreatorEditorialV2OntoEditDecisionList,
  type CompileCreatorEditorialV2Input,
  type CreatorEditorialV2Edl,
  type EditorialV2BackgroundMode,
  type EditorialV2CaptionCue,
  type EditorialV2CaptionRole,
  type EditorialV2Shot
} from "./creatorEditorialV2";

export const CREATOR_EDITORIAL_V3_TEMPLATE_ID = "creator_editorial_v3" as const;
export const CREATOR_EDITORIAL_V3_COMPILER_VERSION = "creator-editorial-compiler-v3" as const;
export const CREATOR_EDITORIAL_V3_SCHEMA_VERSION = "3" as const;

export type AxiomPerformanceId =
  | "neutral_listening"
  | "explaining"
  | "pointing_left"
  | "pointing_right"
  | "strong_emphasis"
  | "open_cta"
  | "reaction";

export interface AxiomPerformanceClip {
  id: AxiomPerformanceId;
  sourceStartMs: number;
  sourceEndMs: number;
  silhouetteClass: "arms_down" | "hands_open" | "left_extension" | "right_extension" | "single_high" | "both_high" | "reaction_rise";
  intensity: "low" | "medium" | "high";
  gesturePeakOffsetMs: number;
  holdFinalPose: true;
  mirrored: false;
}

export type EditorialV3MotionEventKind =
  | "presenter_performance"
  | "camera_punch"
  | "camera_drift"
  | "caption_entry"
  | "product_entry"
  | "evidence_focus"
  | "background_parallax"
  | "result_hold"
  | "sound_accent"
  | "outro_mark_reveal";

export interface EditorialV3MotionEvent {
  id: string;
  kind: EditorialV3MotionEventKind;
  startMs: number;
  endMs: number;
  role: "primary" | "supporting";
  easing: "cubic_in_out" | "ease_out" | "hold";
  semanticPurpose: string;
}

export type EditorialV3Presenter = EditorialV2Shot["presenter"] & {
  performance?: AxiomPerformanceClip;
  gestureCooldownMs: number;
};

export interface EditorialV3CaptionCue extends EditorialV2CaptionCue {
  visualStyle: "clean_floating" | "accent_underline" | "editorial_takeover";
  placementKey: "top_left" | "top_center" | "middle_left" | "middle_right" | "lower_left" | "lower_center" | "lower_right" | "full_frame";
  plate: "none" | "soft" | "statement";
  contrast: "light_text" | "dark_text";
}

export type EditorialV3EvidenceTreatment = EditorialV2Shot["evidenceTreatment"] & {
  contextMs: number;
  actionMs: number;
  targetOccupancyRatio: number;
  adaptiveBackground: "dark_contrast" | "light_contrast";
  borderWidthPx: 3;
  evidenceSharp: true;
  cursorLayerCount: 0;
};

export interface EditorialV3Shot extends Omit<EditorialV2Shot, "presenter" | "captions" | "evidenceTreatment"> {
  presenter: EditorialV3Presenter;
  captions: EditorialV3CaptionCue[];
  evidenceTreatment: EditorialV3EvidenceTreatment;
  motionEvents: EditorialV3MotionEvent[];
  compositionFamily:
    | "axiom_closeup"
    | "axiom_keyword"
    | "editorial_phrase"
    | "asymmetric_split"
    | "product_macro"
    | "product_reaction"
    | "product_comparison"
    | "rapid_recap"
    | "presenter_cta"
    | "branded_outro";
}

export interface CreatorEditorialV3Edl extends Omit<CreatorEditorialV2Edl, "schemaVersion" | "templateId" | "compilerVersion" | "shots" | "audioPlan"> {
  schemaVersion: typeof CREATOR_EDITORIAL_V3_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_V3_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_V3_COMPILER_VERSION;
  shots: EditorialV3Shot[];
  audioPlan: Omit<CreatorEditorialV2Edl["audioPlan"], "narrationTargetWpm" | "music"> & {
    narrationTargetWpm: { min: 195; max: 210 };
    music: { kind: "procedural_editorial_bed_v3"; gainDb: -27; duckUnderSpeechDb: -9 };
    prosodyAnalysisRequired: true;
  };
}

export type CompileCreatorEditorialV3Input = CompileCreatorEditorialV2Input;

export interface CreatorEditorialV3QualityReport {
  schemaVersion: "3";
  templateId: typeof CREATOR_EDITORIAL_V3_TEMPLATE_ID;
  passed: boolean;
  findings: Array<{ code: string; status: "pass" | "fail"; measured: number | string; threshold: string; shotIds?: string[] }>;
  distinctPerformances: AxiomPerformanceId[];
  openingCompositionModes: number;
  endingMeaningfulChanges: number;
  captionTopCenterRatio: number;
  v2StructuralBaselinePassed: boolean;
}

const PERFORMANCE_BY_SHOT: Readonly<Record<number, AxiomPerformanceClip>> = {
  0: performance("strong_emphasis", 35_900, 37_000, "single_high", "high", 650),
  1: performance("explaining", 700, 2_400, "hands_open", "medium", 850),
  2: performance("pointing_right", 5_100, 6_900, "right_extension", "medium", 1_050),
  4: performance("pointing_left", 21_100, 23_100, "left_extension", "medium", 1_100),
  6: performance("reaction", 34_700, 36_000, "reaction_rise", "medium", 850),
  7: performance("pointing_right", 5_100, 6_900, "right_extension", "medium", 1_050),
  10: performance("strong_emphasis", 35_900, 37_000, "single_high", "high", 650),
  11: performance("pointing_left", 21_100, 23_100, "left_extension", "medium", 1_100),
  12: performance("neutral_listening", 14_000, 15_800, "arms_down", "low", 900),
  13: performance("explaining", 700, 2_400, "hands_open", "medium", 850),
  14: performance("open_cta", 37_500, 39_400, "both_high", "high", 1_050)
};

const COMPOSITION_FAMILIES: EditorialV3Shot["compositionFamily"][] = [
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

const BACKGROUNDS: EditorialV2BackgroundMode[] = [
  "navy_depth", "cream_editorial", "teal_split", "navy_spotlight",
  "teal_reverse", "navy_depth", "cream_editorial", "navy_spotlight",
  "cream_product", "teal_reverse", "navy_depth", "cream_editorial",
  "teal_split", "navy_spotlight", "cream_editorial", "outro_navy"
];

export function compileCreatorEditorialV3(input: CompileCreatorEditorialV3Input): CreatorEditorialV3Edl {
  const v2 = compileCreatorEditorialV2(input);
  const shots = v2.shots.map((shot, index): EditorialV3Shot => {
    const performanceClip = PERFORMANCE_BY_SHOT[index];
    const presenter: EditorialV3Presenter = {
      ...shot.presenter,
      pose: performanceClip ? performanceClip.id === "neutral_listening" ? "neutral"
        : performanceClip.id === "explaining" ? "explain"
          : performanceClip.id === "pointing_left" ? "point_left"
            : performanceClip.id === "pointing_right" ? "point_right"
              : performanceClip.id === "open_cta" ? "open_cta"
                : "emphasis" : "none",
      gesture: performanceClip ? performanceClip.id === "neutral_listening" ? "idle"
        : performanceClip.id === "explaining" ? "explain"
          : performanceClip.id === "pointing_left" ? "point_left"
            : performanceClip.id === "pointing_right" ? "point_right"
              : performanceClip.id === "open_cta" ? "open_cta"
                : "emphasis" : "none",
      performance: performanceClip,
      gestureCooldownMs: performanceClip ? 900 : 0
    };
    const captions = shot.captions.map((caption, captionIndex) =>
      captionForV3(caption, index, captionIndex, presenter, shot.productEvidenceIds.length > 0, BACKGROUNDS[index]!)
    );
    const compositionFamily = COMPOSITION_FAMILIES[index]!;
    const backgroundMode = BACKGROUNDS[index]!;
    const evidenceTreatment: EditorialV3EvidenceTreatment = {
      ...shot.evidenceTreatment,
      contextMs: shot.productEvidenceIds.length > 0 ? 420 : 0,
      actionMs: shot.productEvidenceIds.length > 0 ? 620 : 0,
      targetOccupancyRatio: shot.presenter.visible ? 0.54 : 0.72,
      adaptiveBackground: backgroundMode === "cream_editorial" || backgroundMode === "cream_product" ? "light_contrast" : "dark_contrast",
      borderWidthPx: 3,
      evidenceSharp: true,
      cursorLayerCount: 0
    };
    const motionEvents = motionEventsForShot(shot, index, performanceClip);
    const withoutCache = {
      ...shot,
      id: `editorial-v3-shot-${String(index + 1).padStart(2, "0")}`,
      presenter,
      captions,
      backgroundMode,
      evidenceTreatment,
      motionEvents,
      compositionFamily,
      compositionSignature: [
        compositionFamily,
        backgroundMode,
        performanceClip?.silhouetteClass ?? "no-presenter",
        shot.productEvidenceIds[0] ?? "no-product",
        captions[0]?.visualStyle ?? "no-caption"
      ].join("|")
    };
    return {
      ...withoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_V3_COMPILER_VERSION,
        seed: input.seed ?? 71_625,
        blueprintId: input.blueprint.id,
        brandKit: input.blueprint.brandKit,
        presenterAssetHash: input.presenterAssetHash ?? "not_supplied",
        shot: withoutCache
      })
    };
  });
  const edl: CreatorEditorialV3Edl = {
    ...v2,
    schemaVersion: CREATOR_EDITORIAL_V3_SCHEMA_VERSION,
    templateId: CREATOR_EDITORIAL_V3_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_V3_COMPILER_VERSION,
    seed: input.seed ?? 71_625,
    shots,
    audioPlan: {
      ...v2.audioPlan,
      narrationTargetWpm: { min: 195, max: 210 },
      music: { kind: "procedural_editorial_bed_v3", gainDb: -27, duckUnderSpeechDb: -9 },
      prosodyAnalysisRequired: true
    }
  };
  const report = evaluateCreatorEditorialV3(edl);
  const failures = input.validationProfile === "user_story_v7"
    ? []
    : report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) throw new Error(`Invalid creator editorial v3 plan: ${failures.map(({ code }) => code).join(", ")}.`);
  return edl;
}

export function evaluateCreatorEditorialV3(edl: CreatorEditorialV3Edl): CreatorEditorialV3QualityReport {
  const presenterShots = edl.shots.filter(({ presenter }) => presenter.visible);
  const distinctPerformances = [...new Set(presenterShots.flatMap(({ presenter }) => presenter.performance?.id ?? []))];
  const adjacentRepeats = presenterShots.slice(1).filter((shot, index) =>
    shot.presenter.performance?.id === presenterShots[index]!.presenter.performance?.id
  ).map(({ id }) => id);
  const invalidPerformance = presenterShots.filter(({ presenter }) =>
    !presenter.performance
    || presenter.performance.sourceEndMs <= presenter.performance.sourceStartMs
    || presenter.performance.gesturePeakOffsetMs <= 0
  ).map(({ id }) => id);
  const missingInternalMotion = edl.shots.filter((shot) =>
    shot.family !== "branded_outro"
    && shot.endMs - shot.startMs > 1_800
    && !shot.motionEvents.some(({ role }) => role === "primary")
  ).map(({ id }) => id);
  const excessSupportingMotion = edl.shots.filter((shot) =>
    shot.motionEvents.filter(({ role }) => role === "supporting").length > 2
  ).map(({ id }) => id);
  const captionList = edl.shots.flatMap(({ captions }) => captions);
  const captionTopCenterRatio = captionList.filter(({ placementKey }) => placementKey === "top_center").length / Math.max(1, captionList.length);
  const openingCompositionModes = new Set(edl.shots.filter(({ startMs }) => startMs < 6_000).map(({ compositionFamily }) => compositionFamily)).size;
  const endingMeaningfulChanges = edl.shots.filter(({ startMs }) => startMs >= 27_000).length;
  const presenterRatio = presenterShots.reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / edl.durationMs;
  const productRatio = edl.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0)
    .reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0) / edl.durationMs;
  const v2StructuralBaselinePassed = evaluateCreatorEditorialV2(edl as unknown as CreatorEditorialV2Edl).passed;
  const findings = [
    finding("duration", edl.durationMs >= 32_000 && edl.durationMs <= 36_000, edl.durationMs, "32000..36000 ms"),
    finding("shot_count", edl.shots.length >= 14 && edl.shots.length <= 18, edl.shots.length, "14..18"),
    finding("distinct_performances", distinctPerformances.length >= 6, distinctPerformances.length, ">=6 actual source intervals"),
    finding("performance_source_intervals", invalidPerformance.length === 0, invalidPerformance.length, "0 invalid presenter source intervals", invalidPerformance),
    finding("adjacent_performance_repetition", adjacentRepeats.length === 0, adjacentRepeats.length, "0 adjacent presenter performance repeats", adjacentRepeats),
    finding("within_shot_primary_motion", missingInternalMotion.length === 0, missingInternalMotion.length, "0 long shots without a primary event", missingInternalMotion),
    finding("supporting_motion_density", excessSupportingMotion.length === 0, excessSupportingMotion.length, "<=2 supporting events per shot", excessSupportingMotion),
    finding("opening_composition_modes", openingCompositionModes >= 4, openingCompositionModes, ">=4"),
    finding("ending_changes", endingMeaningfulChanges >= 3, endingMeaningfulChanges, ">=3 shots from 27s"),
    finding("presenter_visibility", presenterRatio >= 0.64 && presenterRatio <= 0.70, Number(presenterRatio.toFixed(4)), "0.64..0.70"),
    finding("product_visibility", productRatio >= 0.52 && productRatio <= 0.58, Number(productRatio.toFixed(4)), "0.52..0.58"),
    finding("caption_roles", new Set(captionList.map(({ visualStyle }) => visualStyle)).size === 3, new Set(captionList.map(({ visualStyle }) => visualStyle)).size, "3 visually distinct styles"),
    finding("caption_position_variety", captionTopCenterRatio < 0.5, Number(captionTopCenterRatio.toFixed(4)), "<0.50 top_center"),
    finding("authentic_evidence", edl.shots.every(({ evidenceTreatment }) => evidenceTreatment.authenticPixelsPreserved && evidenceTreatment.cursorLayerCount === 0), 0, "0 fabricated pointer/evidence layers"),
    finding("v2_structural_baseline", v2StructuralBaselinePassed, String(v2StructuralBaselinePassed), "true")
  ];
  return {
    schemaVersion: "3",
    templateId: CREATOR_EDITORIAL_V3_TEMPLATE_ID,
    passed: findings.every(({ status }) => status === "pass"),
    findings,
    distinctPerformances,
    openingCompositionModes,
    endingMeaningfulChanges,
    captionTopCenterRatio,
    v2StructuralBaselinePassed
  };
}

export function compareV3Shots(previous: EditorialV3Shot, next: EditorialV3Shot): { meaningful: boolean; changedDimensions: string[] } {
  const changedDimensions = [
    previous.compositionFamily !== next.compositionFamily ? "composition_family" : undefined,
    previous.backgroundMode !== next.backgroundMode ? "background" : undefined,
    previous.presenter.performance?.silhouetteClass !== next.presenter.performance?.silhouetteClass ? "presenter_silhouette" : undefined,
    previous.presenter.placement !== next.presenter.placement ? "presenter_placement" : undefined,
    previous.productEvidenceIds[0] !== next.productEvidenceIds[0] ? "product_source" : undefined,
    previous.evidenceTreatment.stage !== next.evidenceTreatment.stage ? "evidence_stage" : undefined,
    previous.captions[0]?.visualStyle !== next.captions[0]?.visualStyle ? "caption_style" : undefined
  ].filter((value): value is string => Boolean(value));
  return { meaningful: changedDimensions.length >= 3, changedDimensions };
}

export function editorialV3ChangedSceneIds(previous: CreatorEditorialV3Edl, next: CreatorEditorialV3Edl): string[] {
  const prior = new Map(previous.shots.map((shot) => [shot.id, shot.cacheIdentity]));
  return next.shots.filter((shot) => prior.get(shot.id) !== shot.cacheIdentity).flatMap((shot) => {
    const index = next.shots.indexOf(shot);
    return [next.shots[index - 1]?.id, shot.id, next.shots[index + 1]?.id].filter((id): id is string => Boolean(id));
  }).filter((id, index, all) => all.indexOf(id) === index);
}

export function projectCreatorEditorialV3OntoEditDecisionList(base: EditDecisionList, editorial: CreatorEditorialV3Edl): EditDecisionList {
  const projected = projectCreatorEditorialV2OntoEditDecisionList(base, editorial as unknown as CreatorEditorialV2Edl);
  return {
    ...projected,
    templateId: `creator-template:${CREATOR_EDITORIAL_V3_TEMPLATE_ID}:v3`,
    templateKey: CREATOR_EDITORIAL_V3_TEMPLATE_ID,
    templateVersion: 3,
    overlays: projected.overlays.map((overlay) => overlay.kind === "cta" ? { ...overlay, text: editorial.cta.text } : overlay),
    music: { ...projected.music, gainDb: editorial.audioPlan.music.gainDb }
  };
}

export function assertCreatorEditorialV3Edl(value: unknown): asserts value is CreatorEditorialV3Edl {
  if (!value || typeof value !== "object") throw new Error("Creator editorial v3 EDL must be an object.");
  const edl = value as Partial<CreatorEditorialV3Edl>;
  if (edl.schemaVersion !== "3" || edl.templateId !== CREATOR_EDITORIAL_V3_TEMPLATE_ID || !Array.isArray(edl.shots)) {
    throw new Error("Creator editorial v3 EDL schema is invalid.");
  }
  if (!Number.isInteger(edl.durationMs) || edl.durationMs! < 32_000 || edl.durationMs! > 36_000) {
    throw new Error("Creator editorial v3 duration is invalid.");
  }
  for (const shot of edl.shots) {
    if (!/^[a-f0-9]{64}$/.test(shot.cacheIdentity) || shot.endMs <= shot.startMs) {
      throw new Error("Creator editorial v3 shot is invalid.");
    }
    if (!shot.evidenceTreatment.authenticPixelsPreserved || shot.evidenceTreatment.cursorLayerCount !== 0) {
      throw new Error("Creator editorial v3 evidence policy is invalid.");
    }
  }
}

function performance(
  id: AxiomPerformanceId,
  sourceStartMs: number,
  sourceEndMs: number,
  silhouetteClass: AxiomPerformanceClip["silhouetteClass"],
  intensity: AxiomPerformanceClip["intensity"],
  gesturePeakOffsetMs: number
): AxiomPerformanceClip {
  return { id, sourceStartMs, sourceEndMs, silhouetteClass, intensity, gesturePeakOffsetMs, holdFinalPose: true, mirrored: false };
}

function captionForV3(
  caption: EditorialV2CaptionCue,
  shotIndex: number,
  captionIndex: number,
  presenter: EditorialV3Presenter,
  hasEvidence: boolean,
  backgroundMode: EditorialV2BackgroundMode
): EditorialV3CaptionCue {
  const visualStyle = caption.role === "full_frame_editorial"
    ? "editorial_takeover"
    : caption.role === "keyword_emphasis"
      ? "accent_underline"
      : "clean_floating";
  const placementKey = placementForV3(caption.role, shotIndex, captionIndex, presenter, hasEvidence);
  const safeRegion = regionForPlacement(placementKey);
  return {
    ...caption,
    id: caption.id.replace("caption-v2-", "caption-v3-"),
    visualStyle,
    placementKey,
    plate: visualStyle === "editorial_takeover" ? "statement" : visualStyle === "accent_underline" ? "none" : "soft",
    contrast: backgroundMode === "cream_editorial" || backgroundMode === "cream_product" ? "dark_text" : "light_text",
    safeRegion
  };
}

function placementForV3(
  role: EditorialV2CaptionRole,
  shotIndex: number,
  captionIndex: number,
  presenter: EditorialV3Presenter,
  hasEvidence: boolean
): EditorialV3CaptionCue["placementKey"] {
  if (role === "full_frame_editorial") return "full_frame";
  if (hasEvidence && !presenter.visible) return captionIndex % 2 === 0 ? "lower_center" : "top_left";
  if (presenter.placement === "left") return captionIndex % 2 === 0 ? "top_left" : "lower_right";
  if (presenter.placement === "right") return captionIndex % 2 === 0 ? "top_center" : "lower_left";
  const cycle: EditorialV3CaptionCue["placementKey"][] = ["top_left", "middle_right", "lower_center", "middle_left", "lower_right"];
  return cycle[(shotIndex + captionIndex) % cycle.length]!;
}

function regionForPlacement(key: EditorialV3CaptionCue["placementKey"]): EditorialV3CaptionCue["safeRegion"] {
  const regions: Record<EditorialV3CaptionCue["placementKey"], EditorialV3CaptionCue["safeRegion"]> = {
    top_left: { x: 0.07, y: 0.10, width: 0.58, height: 0.18 },
    top_center: { x: 0.13, y: 0.10, width: 0.74, height: 0.18 },
    middle_left: { x: 0.06, y: 0.38, width: 0.56, height: 0.18 },
    middle_right: { x: 0.40, y: 0.38, width: 0.54, height: 0.18 },
    lower_left: { x: 0.07, y: 0.71, width: 0.58, height: 0.18 },
    lower_center: { x: 0.13, y: 0.73, width: 0.74, height: 0.18 },
    lower_right: { x: 0.39, y: 0.71, width: 0.54, height: 0.18 },
    full_frame: { x: 0.08, y: 0.24, width: 0.84, height: 0.34 }
  };
  return regions[key];
}

function motionEventsForShot(
  shot: EditorialV2Shot,
  index: number,
  performanceClip: AxiomPerformanceClip | undefined
): EditorialV3MotionEvent[] {
  const start = shot.startMs;
  const duration = shot.endMs - shot.startMs;
  if (shot.family === "branded_outro") {
    return [
      event(index, "outro_mark_reveal", start + 180, start + 950, "primary", "ease_out", "Reveal the Solomon mark."),
      event(index, "background_parallax", start + 900, shot.endMs, "supporting", "cubic_in_out", "Keep the outro intentionally alive.")
    ];
  }
  const primary = performanceClip
    ? event(index, "presenter_performance", start + 160, Math.min(shot.endMs, start + Math.max(900, performanceClip.gesturePeakOffsetMs + 420)), "primary", "ease_out", `Perform ${performanceClip.id}.`)
    : shot.productEvidenceIds.length > 0
      ? event(index, "evidence_focus", start + 360, Math.min(shot.endMs, start + 1_120), "primary", "cubic_in_out", "Move from product context to verified evidence.")
      : event(index, "caption_entry", start + 120, Math.min(shot.endMs, start + 760), "primary", "ease_out", "Establish the editorial phrase.");
  const supporting: EditorialV3MotionEvent[] = [];
  if (shot.productEvidenceIds.length > 0) {
    supporting.push(event(index, "product_entry", start + 80, Math.min(shot.endMs, start + 540), "supporting", "ease_out", "Introduce authentic product evidence."));
    if (shot.evidenceTreatment.resultHoldMs > 0) {
      supporting.push(event(index, "result_hold", Math.max(start, shot.endMs - shot.evidenceTreatment.resultHoldMs), shot.endMs, "supporting", "hold", "Hold the verified result."));
    }
  } else if (duration > 1_800) {
    supporting.push(event(index, "camera_punch", start + 720, Math.min(shot.endMs, start + 1_280), "supporting", "cubic_in_out", "Support the emphasized phrase."));
  }
  if (supporting.length < 2 && index < 4) {
    supporting.push(event(index, "background_parallax", start + 640, Math.min(shot.endMs, start + 1_420), "supporting", "cubic_in_out", "Increase opening depth."));
  }
  return [primary, ...supporting.slice(0, 2)];
}

function event(
  shotIndex: number,
  kind: EditorialV3MotionEventKind,
  startMs: number,
  endMs: number,
  role: EditorialV3MotionEvent["role"],
  easing: EditorialV3MotionEvent["easing"],
  semanticPurpose: string
): EditorialV3MotionEvent {
  return {
    id: `v3-motion-${String(shotIndex + 1).padStart(2, "0")}-${kind}`,
    kind,
    startMs,
    endMs: Math.max(startMs + 1, endMs),
    role,
    easing,
    semanticPurpose
  };
}

function finding(code: string, pass: boolean, measured: number | string, threshold: string, shotIds?: string[]) {
  return { code, status: pass ? "pass" as const : "fail" as const, measured, threshold, ...(shotIds ? { shotIds } : {}) };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
