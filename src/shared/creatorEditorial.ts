import { createHash } from "node:crypto";
import type {
  BrandKit,
  CaptionSegment,
  CreativeBlueprint,
  EditDecisionList,
  ProductEvidenceAsset,
  RenderFocusPoint
} from "./types";

export const CREATOR_EDITORIAL_TEMPLATE_ID = "creator_editorial_v1" as const;
export const CREATOR_EDITORIAL_SCHEMA_VERSION = "1" as const;
export const CREATOR_EDITORIAL_COMPILER_VERSION = "creator-editorial-compiler-v1" as const;

export type EditorialShotFamily =
  | "presenter_hook"
  | "presenter_closeup"
  | "presenter_medium"
  | "presenter_product_split"
  | "product_evidence_card"
  | "product_detail_crop"
  | "product_result_hold"
  | "kinetic_emphasis"
  | "comparison_card"
  | "benefit_cutaway"
  | "recap_montage"
  | "presenter_cta"
  | "branded_outro";

export type EditorialTimingProvenance = "provider_exact" | "local_alignment" | "deterministic_estimate";

export interface EditorialNarrationWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface EditorialNarrationBeat {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  purpose: "hook" | "reveal" | "evidence" | "benefit" | "recap" | "cta" | "outro";
  claimIds: string[];
  evidenceAssetIds: string[];
  emphasizedWords?: string[];
  words?: EditorialNarrationWord[];
}

export interface EditorialCaptureTelemetry {
  evidenceAssetId: string;
  sourceSha256: string;
  cursorSamples?: Array<{ timestampMs: number; x: number; y: number; confidence: number }>;
  actionRegion?: { x: number; y: number; width: number; height: number };
  resultRegion?: { x: number; y: number; width: number; height: number };
  sourceDimensions?: { width: number; height: number };
  sourceDurationMs?: number;
  geometryProvenance?: {
    action: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    result: "recorded_action_target" | "reviewed_capture_geometry" | "geometry_fallback";
    cursor: "recorded_cursor" | "action_target_center" | "unavailable";
  };
  actionEvents?: EditorialActionEvent[];
}

export interface EditorialActionEvent {
  stepId: string;
  startMs: number;
  endMs: number;
  region: { x: number; y: number; width: number; height: number };
  evidence: "recorded_action_target";
  interaction: "observe" | "navigate" | "synthetic_write" | "unknown";
}

export function selectEditorialActionEvent(
  events: EditorialActionEvent[],
  sourceInterval?: { startMs: number; endMs: number }
): EditorialActionEvent | undefined {
  const intervalCenter = sourceInterval ? (sourceInterval.startMs + sourceInterval.endMs) / 2 : 0;
  const interactionPriority = (interaction: EditorialActionEvent["interaction"]): number =>
    interaction === "synthetic_write" ? 3 : interaction === "navigate" ? 2 : interaction === "observe" ? 1 : 0;
  return [...events].sort((first, second) => {
    const priorityDelta = interactionPriority(second.interaction) - interactionPriority(first.interaction);
    if (priorityDelta !== 0) return priorityDelta;
    const firstOverlaps = sourceInterval && first.endMs > sourceInterval.startMs && first.startMs < sourceInterval.endMs ? 1 : 0;
    const secondOverlaps = sourceInterval && second.endMs > sourceInterval.startMs && second.startMs < sourceInterval.endMs ? 1 : 0;
    if (firstOverlaps !== secondOverlaps) return secondOverlaps - firstOverlaps;
    const firstDistance = sourceInterval ? Math.abs((first.startMs + first.endMs) / 2 - intervalCenter) : first.startMs;
    const secondDistance = sourceInterval ? Math.abs((second.startMs + second.endMs) / 2 - intervalCenter) : second.startMs;
    return firstDistance - secondDistance || first.stepId.localeCompare(second.stepId);
  })[0];
}

export interface EditorialCaptionCue {
  id: string;
  startMs: number;
  endMs: number;
  words: string[];
  emphasizedWords: string[];
  timingProvenance: EditorialTimingProvenance;
  safeRegion: { x: number; y: number; width: number; height: number };
  role: "supporting_sans" | "display_editorial";
}

export interface EditorialCameraCue {
  from: RenderFocusPoint;
  to: RenderFocusPoint;
  easing: "cubic_in_out";
  pointerPolicy: "contain_pointer" | "transition_to_result" | "geometry_fallback";
  maxScaleDelta: number;
}

export interface EditorialShot {
  id: string;
  family: EditorialShotFamily;
  startMs: number;
  endMs: number;
  narrationBeatIds: string[];
  productEvidenceIds: string[];
  sourceCaptureHashes: string[];
  sourceIntervalMs?: { startMs: number; endMs: number };
  crop: RenderFocusPoint;
  presenter: {
    visible: boolean;
    placement: "full" | "left" | "right" | "bottom" | "none";
    scale: number;
    gesture: "emphasis" | "explain" | "point_left" | "point_right" | "open_cta" | "idle" | "none";
  };
  camera: EditorialCameraCue;
  captions: EditorialCaptionCue[];
  transitionIn: { kind: "cut" | "card_slide" | "scale_through" | "punch_in" | "color_reverse" | "blur_reveal"; durationMs: number };
  transitionOut: { kind: "cut" | "card_slide" | "scale_through" | "punch_in" | "color_reverse" | "blur_reveal"; durationMs: number };
  callout: "none" | "spotlight" | "result_hold";
  musicIntensity: number;
  soundEffects: Array<"click" | "soft_whoosh" | "card_entry" | "impact" | "outro_sting">;
  expectedVisualChange: "major" | "micro" | "hold";
  claimIds: string[];
  cacheIdentity: string;
  fallback: "product_card" | "static_evidence_crop" | "branded_graphic";
}

export interface CreatorEditorialEdl {
  schemaVersion: typeof CREATOR_EDITORIAL_SCHEMA_VERSION;
  templateId: typeof CREATOR_EDITORIAL_TEMPLATE_ID;
  compilerVersion: typeof CREATOR_EDITORIAL_COMPILER_VERSION;
  seed: number;
  durationMs: number;
  canvas: { width: 1080; height: 1920; fps: 30 };
  brandKit: BrandKit;
  timingProvenance: EditorialTimingProvenance;
  shots: EditorialShot[];
  audioPlan: {
    narrationTargetWpm: { min: 180; max: 210 };
    targetLufs: -14;
    truePeakDbtp: -1.5;
    loudnessRangeLu: { min: 3; max: 8 };
    music: { kind: "procedural_review_bed"; gainDb: -28; duckUnderSpeechDb: -8 };
    maximumOrdinaryGapMs: 600;
    maximumTempoCorrection: { min: 0.92; max: 1.08 };
  };
  lineage: {
    blueprintId: string;
    sourceCaptureHashes: string[];
    claimIds: string[];
  };
}

export interface EditorialQualityFinding {
  code: string;
  status: "pass" | "fail";
  measured: number | string;
  threshold: string;
  shotIds?: string[];
}

export interface CreatorEditorialQualityReport {
  schemaVersion: "1";
  templateId: typeof CREATOR_EDITORIAL_TEMPLATE_ID;
  passed: boolean;
  findings: EditorialQualityFinding[];
}

export interface CompileCreatorEditorialInput {
  blueprint: CreativeBlueprint;
  narrationBeats: EditorialNarrationBeat[];
  telemetry: EditorialCaptureTelemetry[];
  presenterAssetHash?: string;
  seed?: number;
  timingProvenance?: EditorialTimingProvenance;
  targetDurationMs?: number;
}

export const creatorEditorialTemplateV1 = {
  id: CREATOR_EDITORIAL_TEMPLATE_ID,
  version: 1,
  durationMs: { min: 32_000, preferred: 35_000, max: 36_000, hardMax: 40_000 },
  shotCount: { min: 14, preferred: 16, max: 18 },
  shotDurationMs: { min: 1_500, preferred: 2_150, max: 3_000, flashFloor: 400 },
  meaningfulChangeMs: { min: 1_500, max: 2_500 },
  microChangeMs: { min: 300, max: 800 },
  presenterVisibilityRatio: { min: 0.55, max: 0.70 },
  presenterScale: { min: 0.35, max: 0.50 },
  evidenceCardMs: { min: 1_000, max: 3_000 },
  transitionMs: { min: 150, max: 450 },
  captionWords: { min: 1, max: 5 },
  ctaStartMs: 29_000,
  outroMs: 3_000
} as const;

const FAMILY_PATTERN: EditorialShotFamily[] = [
  "presenter_hook",
  "kinetic_emphasis",
  "presenter_closeup",
  "product_evidence_card",
  "presenter_product_split",
  "product_detail_crop",
  "presenter_medium",
  "product_evidence_card",
  "presenter_product_split",
  "product_result_hold",
  "presenter_closeup",
  "comparison_card",
  "presenter_product_split",
  "benefit_cutaway",
  "recap_montage",
  "presenter_cta",
  "branded_outro"
];

export function compileCreatorEditorial(input: CompileCreatorEditorialInput): CreatorEditorialEdl {
  assertCompileInput(input);
  const durationMs = input.targetDurationMs ?? creatorEditorialTemplateV1.durationMs.preferred;
  if (durationMs < creatorEditorialTemplateV1.durationMs.min || durationMs > creatorEditorialTemplateV1.durationMs.hardMax) {
    throw new Error("creator_editorial_v1 duration must be between 32 and 40 seconds.");
  }
  const seed = input.seed ?? 71_623;
  const timingProvenance = input.timingProvenance ?? inferTimingProvenance(input.narrationBeats);
  const desiredShots = clamp(Math.round(durationMs / creatorEditorialTemplateV1.shotDurationMs.preferred), 14, 18);
  const families = FAMILY_PATTERN.slice(0, desiredShots - 2).concat(["presenter_cta", "branded_outro"] as EditorialShotFamily[]);
  const durations = distributeShotDurations(durationMs, families);
  const assets = approvedFactualAssets(input.blueprint.productAssets);
  const telemetry = new Map(input.telemetry.map((item) => [item.evidenceAssetId, item]));
  const globalCaptions = buildKineticCaptions({
    beats: input.narrationBeats,
    range: { startMs: 0, endMs: durationMs },
    timingProvenance,
    avoid: "none"
  });
  let cursor = 0;
  const shots: EditorialShot[] = families.map((family, index) => {
    const startMs = cursor;
    const endMs = cursor += durations[index]!;
    const overlappingBeats = input.narrationBeats.filter((beat) => beat.endMs > startMs && beat.startMs < endMs);
    const productNeeded = usesProduct(family);
    const requestedIds = overlappingBeats.flatMap((beat) => beat.evidenceAssetIds);
    const asset = productNeeded
      ? assets.find((candidate) => requestedIds.includes(candidate.id)) ?? assets[index % assets.length]
      : undefined;
    if (productNeeded && !asset) throw new Error(`Editorial shot ${index + 1} requires verified product evidence.`);
    const sourceTelemetry = asset ? telemetry.get(asset.id) : undefined;
    const crop = cropForShot(family, asset, sourceTelemetry);
    const presenter = presenterForFamily(family, index);
    const captions = globalCaptions
      .filter((caption) => caption.startMs + (caption.endMs - caption.startMs) / 2 >= startMs && caption.startMs + (caption.endMs - caption.startMs) / 2 < endMs)
      .map((caption) => ({ ...caption, safeRegion: captionSafeRegion(presenter.visible ? presenter.placement : "none") }));
    const transitionIn = transitionFor(index, family);
    const sourceCaptureHashes = sourceTelemetry ? [sourceTelemetry.sourceSha256] : [];
    const sourceIntervalMs = asset?.sourceStartMs !== undefined
      ? editorialSourceInterval(asset, index, endMs - startMs)
      : undefined;
    const shotWithoutCache = {
      id: `editorial-shot-${String(index + 1).padStart(2, "0")}`,
      family,
      startMs,
      endMs,
      narrationBeatIds: overlappingBeats.map(({ id }) => id),
      productEvidenceIds: asset ? [asset.id] : [],
      sourceCaptureHashes,
      sourceIntervalMs,
      crop,
      presenter,
      camera: cameraForShot(crop, sourceTelemetry),
      captions,
      transitionIn,
      transitionOut: { kind: "cut" as const, durationMs: 0 },
      callout: family === "product_result_hold" ? "result_hold" as const : productNeeded ? "spotlight" as const : "none" as const,
      musicIntensity: family === "presenter_cta" || family === "branded_outro" ? 0.8 : index < 3 ? 0.65 : 0.5,
      soundEffects: soundEffectsFor(family, transitionIn.kind),
      expectedVisualChange: family === "product_result_hold" ? "hold" as const : "major" as const,
      claimIds: unique(overlappingBeats.flatMap(({ claimIds }) => claimIds)),
      fallback: productNeeded ? "static_evidence_crop" as const : "branded_graphic" as const
    };
    return {
      ...shotWithoutCache,
      cacheIdentity: stableHash({
        compilerVersion: CREATOR_EDITORIAL_COMPILER_VERSION,
        seed,
        blueprintId: input.blueprint.id,
        brandKit: input.blueprint.brandKit,
        presenterAssetHash: input.presenterAssetHash ?? "not_supplied",
        shot: shotWithoutCache
      })
    };
  });
  const edl: CreatorEditorialEdl = {
    schemaVersion: "1",
    templateId: CREATOR_EDITORIAL_TEMPLATE_ID,
    compilerVersion: CREATOR_EDITORIAL_COMPILER_VERSION,
    seed,
    durationMs,
    canvas: { width: 1080, height: 1920, fps: 30 },
    brandKit: input.blueprint.brandKit,
    timingProvenance,
    shots,
    audioPlan: {
      narrationTargetWpm: { min: 180, max: 210 },
      targetLufs: -14,
      truePeakDbtp: -1.5,
      loudnessRangeLu: { min: 3, max: 8 },
      music: { kind: "procedural_review_bed", gainDb: -28, duckUnderSpeechDb: -8 },
      maximumOrdinaryGapMs: 600,
      maximumTempoCorrection: { min: 0.92, max: 1.08 }
    },
    lineage: {
      blueprintId: input.blueprint.id,
      sourceCaptureHashes: unique(input.telemetry.map(({ sourceSha256 }) => sourceSha256)),
      claimIds: unique(input.narrationBeats.flatMap(({ claimIds }) => claimIds))
    }
  };
  const report = evaluateCreatorEditorial(edl);
  const failures = report.findings.filter(({ status }) => status === "fail");
  if (failures.length > 0) throw new Error(`Invalid creator editorial plan: ${failures.map(({ code }) => code).join(", ")}.`);
  return edl;
}

export function buildKineticCaptions(input: {
  beats: EditorialNarrationBeat[];
  range: { startMs: number; endMs: number };
  timingProvenance: EditorialTimingProvenance;
  avoid: EditorialShot["presenter"]["placement"];
}): EditorialCaptionCue[] {
  const timedWords = input.beats.flatMap((beat) => beat.words?.length
    ? beat.words
    : estimateWords(beat.text, beat.startMs, beat.endMs));
  const inRange = timedWords.filter((word) => {
    const midpoint = word.startMs + (word.endMs - word.startMs) / 2;
    return midpoint >= input.range.startMs && midpoint < input.range.endMs;
  });
  const chunks: EditorialNarrationWord[][] = [];
  let pending: EditorialNarrationWord[] = [];
  for (const word of inRange) {
    if (pending.length > 0 && word.endMs - pending[0]!.startMs > 800) {
      chunks.push(pending);
      pending = [];
    }
    pending.push(word);
    const clauseEnd = /[,.;:!?]$/.test(word.text);
    if (pending.length >= 5 || clauseEnd) {
      chunks.push(pending);
      pending = [];
    }
  }
  if (pending.length > 0) chunks.push(pending);
  const emphasized = new Set(input.beats.flatMap(({ emphasizedWords = [] }) => emphasizedWords.map(normalizeWord)));
  return chunks.map((words, index) => ({
    id: `caption-${input.range.startMs}-${index}`,
    startMs: Math.max(input.range.startMs, words[0]!.startMs),
    endMs: Math.min(input.range.endMs, Math.max(words.at(-1)!.endMs, words[0]!.startMs + 300)),
    words: words.map(({ text }) => text),
    emphasizedWords: words.map(({ text }) => text).filter((text) => emphasized.has(normalizeWord(text))),
    timingProvenance: input.timingProvenance,
    safeRegion: captionSafeRegion(input.avoid),
    role: words.some(({ text }) => emphasized.has(normalizeWord(text))) ? "display_editorial" : "supporting_sans"
  }));
}

export function estimateWords(text: string, startMs: number, endMs: number): EditorialNarrationWord[] {
  const words = splitWords(text);
  if (words.length === 0) return [];
  const weights = words.map((word) => Math.max(1, normalizeWord(word).length ** 0.55));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = startMs;
  return words.map((text, index) => {
    const next = index === words.length - 1 ? endMs : Math.round(cursor + ((endMs - startMs) * weights[index]!) / total);
    const result = { text, startMs: cursor, endMs: Math.max(cursor + 1, next) };
    cursor = result.endMs;
    return result;
  });
}

export function evaluateCreatorEditorial(edl: CreatorEditorialEdl): CreatorEditorialQualityReport {
  const presenterMs = edl.shots.filter(({ presenter }) => presenter.visible).reduce((sum, shot) => sum + shot.endMs - shot.startMs, 0);
  const presenterRatio = presenterMs / edl.durationMs;
  const shotDurations = edl.shots.map((shot) => shot.endMs - shot.startMs);
  const duplicateFamilies = edl.shots.filter((shot, index) => index >= 2 && shot.family === edl.shots[index - 1]!.family && shot.family === edl.shots[index - 2]!.family).map(({ id }) => id);
  const badTransitions = edl.shots.filter(({ transitionIn }) => transitionIn.durationMs !== 0 && (transitionIn.durationMs < 150 || transitionIn.durationMs > 450)).map(({ id }) => id);
  const badPresenterScale = edl.shots.filter(({ presenter }) => presenter.visible && (presenter.scale < 0.35 || presenter.scale > 0.50)).map(({ id }) => id);
  const badCaptions = edl.shots.flatMap((shot) => shot.captions.filter(({ words, endMs, startMs }) => words.length < 1 || words.length > 5 || endMs <= startMs).map(() => shot.id));
  const slowCaptions = edl.shots.flatMap((shot) => shot.captions.filter(({ endMs, startMs }) => endMs - startMs > 850).map(() => shot.id));
  const fastCaptions = edl.shots.flatMap((shot) => shot.captions.filter(({ endMs, startMs }) => endMs - startMs < 300).map(() => shot.id));
  const unsupported = edl.shots.filter((shot) => shot.claimIds.length > 0 && shot.productEvidenceIds.length === 0 && usesProduct(shot.family)).map(({ id }) => id);
  const findings: EditorialQualityFinding[] = [
    check("duration", edl.durationMs >= 32_000 && edl.durationMs <= 36_000, edl.durationMs, "32000..36000 ms"),
    check("shot_count", edl.shots.length >= 14 && edl.shots.length <= 18, edl.shots.length, "14..18"),
    check("shot_duration", shotDurations.every((value) => value >= 1_500 && value <= 3_000), `${Math.min(...shotDurations)}..${Math.max(...shotDurations)}`, "1500..3000 ms"),
    check("presenter_visibility", presenterRatio >= 0.55 && presenterRatio <= 0.70, Number(presenterRatio.toFixed(4)), "0.55..0.70"),
    check("presenter_scale", badPresenterScale.length === 0, badPresenterScale.length, "0 invalid shots", badPresenterScale),
    check("family_repetition", duplicateFamilies.length === 0, duplicateFamilies.length, "no three consecutive identical families", duplicateFamilies),
    check("transition_duration", badTransitions.length === 0, badTransitions.length, "150..450 ms or hard cut", badTransitions),
    check("caption_chunks", badCaptions.length === 0, badCaptions.length, "1..5 words with positive timing", badCaptions),
    check("caption_cadence", slowCaptions.length === 0, slowCaptions.length, "caption phrases no longer than 850 ms", slowCaptions),
    check("caption_minimum_dwell", fastCaptions.length === 0, fastCaptions.length, "caption phrases at least 300 ms", fastCaptions),
    check("claim_lineage", unsupported.length === 0, unsupported.length, "all factual product shots grounded", unsupported),
    check("cta_and_outro", edl.shots.at(-2)?.family === "presenter_cta" && edl.shots.at(-1)?.family === "branded_outro", `${edl.shots.at(-2)?.family}/${edl.shots.at(-1)?.family}`, "presenter_cta/branded_outro")
  ];
  return { schemaVersion: "1", templateId: CREATOR_EDITORIAL_TEMPLATE_ID, passed: findings.every(({ status }) => status === "pass"), findings };
}

export function editorialChangedSceneIds(previous: CreatorEditorialEdl, next: CreatorEditorialEdl): string[] {
  const prior = new Map(previous.shots.map((shot) => [shot.id, shot.cacheIdentity]));
  return next.shots.filter((shot) => prior.get(shot.id) !== shot.cacheIdentity).flatMap((shot) => {
    const index = next.shots.indexOf(shot);
    return [next.shots[index - 1]?.id, shot.id, next.shots[index + 1]?.id].filter((id): id is string => Boolean(id));
  }).filter((id, index, all) => all.indexOf(id) === index);
}

export function projectCreatorEditorialOntoEditDecisionList(
  base: EditDecisionList,
  editorial: CreatorEditorialEdl
): EditDecisionList {
  const fallback = base.sourceSegments[0];
  const sourceSegments = editorial.shots.map((shot) => ({
    momentId: shot.productEvidenceIds[0] ?? fallback?.momentId ?? "editorial-presenter",
    sourceStartMs: shot.sourceIntervalMs?.startMs ?? fallback?.sourceStartMs ?? 0,
    sourceEndMs: shot.sourceIntervalMs?.endMs ?? fallback?.sourceEndMs ?? Math.max(500, shot.endMs - shot.startMs),
    timelineStartMs: shot.startMs,
    timelineEndMs: shot.endMs,
    fit: "contain" as const,
    focus: shot.crop
  }));
  const transitions = editorial.shots.flatMap((shot) => shot.transitionIn.durationMs === 0 ? [] : [{
    id: `editorial-transition-${shot.id}`,
    kind: editorialTransitionKind(shot.transitionIn.kind),
    startMs: shot.startMs,
    endMs: shot.startMs + shot.transitionIn.durationMs,
    emphasis: shot.family === "presenter_hook" || shot.family === "presenter_cta" || shot.family === "branded_outro" ? "primary" as const : "accent" as const
  }]);
  const captions: CaptionSegment[] = editorial.shots.flatMap(({ captions: cues }) => cues).map((caption) => ({
    startMs: caption.startMs,
    endMs: caption.endMs,
    text: caption.words.join(" "),
    words: caption.words.map((text) => ({ startMs: caption.startMs, endMs: caption.endMs, text }))
  }));
  const ctaShot = editorial.shots.find(({ family }) => family === "presenter_cta");
  return {
    ...base,
    templateId: `creator-template:${CREATOR_EDITORIAL_TEMPLATE_ID}:v1`,
    templateKey: "creator_editorial_v1",
    templateVersion: 1,
    durationMs: editorial.durationMs,
    canvas: editorial.canvas,
    brandKit: editorial.brandKit,
    sourceSegments,
    zooms: editorial.shots.filter(({ productEvidenceIds }) => productEvidenceIds.length > 0).map((shot) => ({
      startMs: shot.startMs,
      endMs: shot.endMs,
      fromScale: shot.camera.from.scale,
      toScale: shot.camera.to.scale,
      focus: shot.camera.to,
      easing: "standard"
    })),
    transitions,
    captions,
    overlays: [
      ...base.overlays.filter(({ kind }) => kind !== "hook" && kind !== "cta"),
      { id: "editorial-hook", kind: "hook", startMs: 0, endMs: Math.min(2_000, editorial.durationMs), text: captions[0]?.text ?? editorial.brandKit.productName, position: "top", emphasis: "primary" },
      { id: "editorial-cta", kind: "cta", startMs: ctaShot?.startMs ?? editorial.durationMs - 6_000, endMs: editorial.durationMs - 3_000, text: editorial.brandKit.tagline ?? `Explore ${editorial.brandKit.productName}`, position: "center", emphasis: "primary" }
    ],
    sfx: editorial.shots.flatMap((shot) => shot.soundEffects.map((kind, index) => ({
      id: `editorial-sfx-${shot.id}-${index}`,
      kind: kind === "click" ? "click" as const : kind === "soft_whoosh" ? "whoosh" as const : "pop" as const,
      startMs: shot.startMs + 40 + index * 70,
      gainDb: -16
    }))),
    presenter: { ...base.presenter, enabled: editorial.shots.some(({ presenter }) => presenter.visible), startMs: 0, endMs: editorial.durationMs },
    music: { enabled: true, mood: "clean_tech", gainDb: editorial.audioPlan.music.gainDb },
    qualityGates: { requireEvidenceBackedClaims: true, requireCaptionSafeArea: true, requireAudioAlignment: true }
  };
}

export function assertCreatorEditorialEdl(value: unknown): asserts value is CreatorEditorialEdl {
  if (!value || typeof value !== "object") throw new Error("Editorial EDL must be an object.");
  const edl = value as Partial<CreatorEditorialEdl>;
  if (edl.schemaVersion !== "1" || edl.templateId !== CREATOR_EDITORIAL_TEMPLATE_ID || !Array.isArray(edl.shots)) throw new Error("Editorial EDL schema is invalid.");
  if (!Number.isInteger(edl.durationMs) || edl.durationMs! < 32_000 || edl.durationMs! > 40_000) throw new Error("Editorial EDL duration is invalid.");
  for (const shot of edl.shots) {
    if (!FAMILY_PATTERN.includes(shot.family) || !Number.isInteger(shot.startMs) || !Number.isInteger(shot.endMs) || shot.endMs <= shot.startMs) throw new Error("Editorial shot is invalid.");
    if (!/^[a-f0-9]{64}$/.test(shot.cacheIdentity)) throw new Error("Editorial shot cache identity is invalid.");
  }
}

function assertCompileInput(input: CompileCreatorEditorialInput): void {
  if (input.blueprint.schemaVersion !== "1") throw new Error("CreativeBlueprint schema is unsupported.");
  if (input.narrationBeats.length === 0) throw new Error("Approved narration beats are required.");
  const knownAssets = new Set(input.blueprint.productAssets.map(({ id }) => id));
  for (const beat of input.narrationBeats) {
    if (!beat.id || beat.endMs <= beat.startMs || !beat.text.trim()) throw new Error("Narration beat is invalid.");
    if (beat.evidenceAssetIds.some((id) => !knownAssets.has(id))) throw new Error(`Narration beat ${beat.id} references unknown evidence.`);
  }
  const claimIds = new Set(input.blueprint.claimIds);
  if (input.narrationBeats.some((beat) => beat.claimIds.some((id) => !claimIds.has(id)))) throw new Error("Narration contains an unsupported claim ID.");
  for (const item of input.telemetry) {
    if (!knownAssets.has(item.evidenceAssetId) || !/^[a-f0-9]{64}$/.test(item.sourceSha256)) throw new Error("Capture telemetry lineage is invalid.");
    for (const sample of item.cursorSamples ?? []) if (!inside01(sample.x) || !inside01(sample.y) || sample.confidence < 0 || sample.confidence > 1) throw new Error("Cursor telemetry is invalid.");
  }
}

function distributeShotDurations(total: number, families: EditorialShotFamily[]): number[] {
  const outro = 3_000;
  const cta = 2_400;
  const contentCount = families.length - 2;
  const base = Math.floor((total - outro - cta) / contentCount);
  const values = Array.from({ length: contentCount }, () => base).concat([cta, outro]);
  values[contentCount - 1] = values[contentCount - 1]! + total - values.reduce((sum, value) => sum + value, 0);
  return values;
}

function approvedFactualAssets(assets: ProductEvidenceAsset[]): ProductEvidenceAsset[] {
  return assets.filter((asset) => asset.factualUseAllowed && asset.provenance !== "conceptual" && Boolean(asset.imagePath || asset.clipPath));
}

function editorialSourceInterval(asset: ProductEvidenceAsset, shotIndex: number, shotDurationMs: number): { startMs: number; endMs: number } {
  const sourceStartMs = asset.sourceStartMs ?? 0;
  const sourceEndMs = Math.max(sourceStartMs + shotDurationMs, asset.sourceEndMs ?? sourceStartMs + shotDurationMs);
  const availableOffsetMs = Math.max(0, sourceEndMs - sourceStartMs - shotDurationMs);
  const offsetMs = availableOffsetMs === 0 ? 0 : (shotIndex * 700) % (availableOffsetMs + 1);
  const startMs = sourceStartMs + offsetMs;
  return { startMs, endMs: Math.min(sourceEndMs, startMs + shotDurationMs) };
}

function usesProduct(family: EditorialShotFamily): boolean {
  return ["presenter_product_split", "product_evidence_card", "product_detail_crop", "product_result_hold", "comparison_card", "recap_montage"].includes(family);
}

function presenterForFamily(family: EditorialShotFamily, index: number): EditorialShot["presenter"] {
  if (["product_evidence_card", "product_detail_crop", "product_result_hold", "comparison_card", "recap_montage", "branded_outro"].includes(family)) {
    return { visible: false, placement: "none", scale: 0, gesture: "none" };
  }
  if (family === "presenter_product_split") {
    const left = index % 2 === 0;
    return { visible: true, placement: left ? "left" : "right", scale: 0.40, gesture: left ? "point_right" : "point_left" };
  }
  if (family === "presenter_cta") return { visible: true, placement: "full", scale: 0.48, gesture: "open_cta" };
  if (family === "presenter_hook" || family === "presenter_closeup") return { visible: true, placement: "full", scale: 0.47, gesture: "emphasis" };
  return { visible: true, placement: "bottom", scale: 0.40, gesture: family === "benefit_cutaway" || family === "kinetic_emphasis" ? "explain" : "idle" };
}

function cropForShot(family: EditorialShotFamily, asset: ProductEvidenceAsset | undefined, telemetry: EditorialCaptureTelemetry | undefined): RenderFocusPoint {
  if (!asset) return { x: 0.5, y: 0.5, scale: 1 };
  const region = family === "product_result_hold" ? telemetry?.resultRegion : telemetry?.actionRegion;
  if (region) return { x: clamp01(region.x + region.width / 2), y: clamp01(region.y + region.height / 2), scale: clamp(0.78 / Math.max(region.width, region.height), 1.18, 2.15) };
  return { x: clamp01(asset.crop.x), y: clamp01(asset.crop.y), scale: clamp(asset.crop.scale, 1.18, 1.8) };
}

function cameraForShot(to: RenderFocusPoint, telemetry: EditorialCaptureTelemetry | undefined): EditorialCameraCue {
  const pointer = telemetry?.cursorSamples?.find(({ confidence }) => confidence >= 0.7);
  const contains = pointer ? Math.abs(pointer.x - to.x) <= 0.38 / to.scale && Math.abs(pointer.y - to.y) <= 0.38 / to.scale : false;
  return {
    from: { x: 0.5 + (to.x - 0.5) * 0.45, y: 0.5 + (to.y - 0.5) * 0.45, scale: Math.max(1, to.scale - 0.18) },
    to,
    easing: "cubic_in_out",
    pointerPolicy: pointer ? (contains ? "contain_pointer" : "transition_to_result") : "geometry_fallback",
    maxScaleDelta: 0.42
  };
}

function transitionFor(index: number, family: EditorialShotFamily): EditorialShot["transitionIn"] {
  if (index === 0) return { kind: "cut", durationMs: 0 };
  if (family === "branded_outro") return { kind: "color_reverse", durationMs: 300 };
  if (family === "product_evidence_card") return { kind: "card_slide", durationMs: 240 };
  if (family === "presenter_closeup" || family === "presenter_cta") return { kind: "punch_in", durationMs: 210 };
  return { kind: "cut", durationMs: 0 };
}

function soundEffectsFor(family: EditorialShotFamily, transition: EditorialShot["transitionIn"]["kind"]): EditorialShot["soundEffects"] {
  if (family === "branded_outro") return ["outro_sting"];
  if (family === "product_result_hold") return ["click", "impact"];
  if (transition === "card_slide") return ["card_entry"];
  if (transition !== "cut") return ["soft_whoosh"];
  return [];
}

function captionSafeRegion(avoid: EditorialShot["presenter"]["placement"]): EditorialCaptionCue["safeRegion"] {
  if (avoid === "left") return { x: 0.50, y: 0.08, width: 0.42, height: 0.24 };
  if (avoid === "right") return { x: 0.08, y: 0.08, width: 0.42, height: 0.24 };
  if (avoid === "full" || avoid === "bottom") return { x: 0.08, y: 0.08, width: 0.84, height: 0.22 };
  return { x: 0.08, y: 0.70, width: 0.84, height: 0.18 };
}

function inferTimingProvenance(beats: EditorialNarrationBeat[]): EditorialTimingProvenance {
  return beats.every(({ words }) => words && words.length > 0) ? "provider_exact" : "deterministic_estimate";
}

function check(code: string, ok: boolean, measured: number | string, threshold: string, shotIds?: string[]): EditorialQualityFinding {
  return { code, status: ok ? "pass" : "fail", measured, threshold, shotIds };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function editorialTransitionKind(kind: EditorialShot["transitionIn"]["kind"]): "snap_cut" | "match_cut" | "wipe" {
  if (kind === "card_slide" || kind === "color_reverse") return "wipe";
  if (kind === "scale_through" || kind === "punch_in" || kind === "blur_reveal") return "match_cut";
  return "snap_cut";
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function splitWords(text: string): string[] { return text.trim().split(/\s+/).filter(Boolean); }
function normalizeWord(value: string): string { return value.toLowerCase().replace(/[^a-z0-9']/g, ""); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function clamp01(value: number): number { return clamp(value, 0, 1); }
function inside01(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
