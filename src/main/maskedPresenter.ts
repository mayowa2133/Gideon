import { createHash } from "node:crypto";

export const MASKED_PRESENTER_SCHEMA_VERSION = "1" as const;
export const MASKED_PRESENTER_ENGINE_VERSION = "gideon-masked-presenter-v1" as const;

export type MaskedPresenterIntent =
  | "hook"
  | "problem"
  | "explanation"
  | "product_reveal"
  | "demonstration"
  | "benefit"
  | "evidence"
  | "transition"
  | "cta";

export type MaskedPresenterGesture =
  | "neutral_explanation"
  | "single_hand_emphasis"
  | "two_hand_explanation"
  | "point_left"
  | "point_right"
  | "point_up"
  | "count_list"
  | "lean_forward"
  | "small_reaction"
  | "open_handed_cta"
  | "rest"
  | "entrance"
  | "exit";

export const MASKED_PRESENTER_GESTURE_LIBRARY = [
  "neutral_explanation",
  "single_hand_emphasis",
  "two_hand_explanation",
  "point_left",
  "point_right",
  "point_up",
  "count_list",
  "lean_forward",
  "small_reaction",
  "open_handed_cta",
  "rest",
  "entrance",
  "exit"
] as const satisfies readonly MaskedPresenterGesture[];

export type MaskedPresenterLayoutMode =
  | "fullscreen"
  | "lower_third"
  | "split_left"
  | "split_right"
  | "picture_in_picture"
  | "foreground"
  | "product_only";

export interface MaskedPresenterCharacterSpec {
  schemaVersion: typeof MASKED_PRESENTER_SCHEMA_VERSION;
  id: "solomon-axiom-v1";
  displayName: "Axiom";
  ownership: "gideon_original_code_native";
  mouthVisible: false;
  lipSyncRequired: false;
  design: {
    mask: string;
    eyes: string;
    clothing: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    lightColor: string;
    defaultPosture: string;
    lighting: string;
  };
  safePlacement: {
    platformBounds: NormalizedRect;
    preferredProductClearance: number;
    preferredCaptionClearance: number;
  };
  assetLicense: "Gideon-owned code-generated original";
}

export interface MaskedPresenterBeat {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  intent: MaskedPresenterIntent;
  energy: "low" | "medium" | "high";
  emphasizedWords?: string[];
  workflowId?: string;
  presenter: "required" | "preferred" | "hidden";
  preferredGesture?: MaskedPresenterGesture;
  productPriority: number;
  captionPlacement: "top" | "middle" | "bottom";
  cameraEmphasis: "context" | "action" | "result";
}

export interface ScheduledMaskedPresenterGesture {
  id: string;
  beatId: string;
  gesture: MaskedPresenterGesture;
  startMs: number;
  anticipationEndMs: number;
  actionEndMs: number;
  holdEndMs: number;
  endMs: number;
  variant: number;
  energy: MaskedPresenterBeat["energy"];
}

export interface MaskedPresenterGestureSchedule {
  schemaVersion: typeof MASKED_PRESENTER_SCHEMA_VERSION;
  engineVersion: typeof MASKED_PRESENTER_ENGINE_VERSION;
  seed: number;
  durationMs: number;
  gestures: ScheduledMaskedPresenterGesture[];
  checksum: string;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskedPresenterLayoutCue {
  beatId: string;
  startMs: number;
  endMs: number;
  mode: MaskedPresenterLayoutMode;
  presenterRect?: NormalizedRect;
  productRect: NormalizedRect;
  captionRect: NormalizedRect;
  collisionFree: boolean;
  rationale: string;
}

export interface MaskedPresenterLayoutManifest {
  schemaVersion: typeof MASKED_PRESENTER_SCHEMA_VERSION;
  engineVersion: typeof MASKED_PRESENTER_ENGINE_VERSION;
  canvas: { width: number; height: number; fps: 30 | 60 };
  cues: MaskedPresenterLayoutCue[];
  checksum: string;
}

export interface MaskedPresenterArmPose {
  leftHandX: number;
  leftHandY: number;
  rightHandX: number;
  rightHandY: number;
  leftPalmOpen: number;
  rightPalmOpen: number;
}

export interface MaskedPresenterMotionState {
  timeMs: number;
  xShift: number;
  yShift: number;
  bodyRotationDeg: number;
  torsoLeanDeg: number;
  breathingScale: number;
  headTurnDeg: number;
  headTiltDeg: number;
  leftShoulderOffset: number;
  rightShoulderOffset: number;
  eyeIntensity: number;
  gesture?: MaskedPresenterGesture;
  gestureProgress: number;
  arms: MaskedPresenterArmPose;
}

export interface MaskedPresenterMotionQuality {
  schemaVersion: typeof MASKED_PRESENTER_SCHEMA_VERSION;
  sampleRate: number;
  sampleCount: number;
  status: "passed" | "failed";
  checks: Array<{
    code: string;
    status: "pass" | "fail";
    measured: number;
    threshold: number;
    message: string;
  }>;
  diagnostics: {
    maximumHorizontalDisplacement: number;
    maximumHeadAngle: number;
    maximumLean: number;
    maximumVelocity: number;
    maximumAcceleration: number;
    maximumJerk: number;
    longestFrozenIntervalMs: number;
    weightShiftReversalCount: number;
    reversalIntervalCoefficientOfVariation: number;
    repeatedStateRatio: number;
  };
}

const CHARACTER_SPEC: MaskedPresenterCharacterSpec = {
  schemaVersion: MASKED_PRESENTER_SCHEMA_VERSION,
  id: "solomon-axiom-v1",
  displayName: "Axiom",
  ownership: "gideon_original_code_native",
  mouthVisible: false,
  lipSyncRequired: false,
  design: {
    mask: "Softly tapered ivory shield with an offset indigo brow plane and no mouth opening.",
    eyes: "Three restrained cyan aperture lights arranged as an asymmetric constellation.",
    clothing: "Midnight tailored utility jacket with a warm copper placket and simplified gloved hands.",
    primaryColor: "#101A33",
    secondaryColor: "#F4F1E8",
    accentColor: "#39D3C4",
    lightColor: "#B8FFF6",
    defaultPosture: "Relaxed upright stance with shoulders open and hands resting near the lower ribs.",
    lighting: "Soft cool key from camera-left with a narrow warm rim from camera-right."
  },
  safePlacement: {
    platformBounds: { x: 0.035, y: 0.035, width: 0.93, height: 0.86 },
    preferredProductClearance: 0.035,
    preferredCaptionClearance: 0.025
  },
  assetLicense: "Gideon-owned code-generated original"
};

const GESTURES_BY_INTENT: Record<MaskedPresenterIntent, MaskedPresenterGesture[]> = {
  hook: ["lean_forward", "single_hand_emphasis", "small_reaction"],
  problem: ["two_hand_explanation", "single_hand_emphasis", "rest"],
  explanation: ["neutral_explanation", "two_hand_explanation", "single_hand_emphasis"],
  product_reveal: ["point_up", "point_right", "open_handed_cta"],
  demonstration: ["point_right", "point_left", "point_up"],
  benefit: ["count_list", "open_handed_cta", "single_hand_emphasis"],
  evidence: ["point_up", "count_list", "neutral_explanation"],
  transition: ["rest", "neutral_explanation", "single_hand_emphasis"],
  cta: ["open_handed_cta", "point_right", "single_hand_emphasis"]
};

export function maskedPresenterCharacterSpec(): MaskedPresenterCharacterSpec {
  return structuredClone(CHARACTER_SPEC);
}

export function assertMaskedPresenterBeats(beats: MaskedPresenterBeat[], durationMs: number): void {
  if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 60_000) {
    throw new Error("Masked presenter duration must be an integer from 1000 to 60000 milliseconds.");
  }
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const beat of beats) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(beat.id) || ids.has(beat.id)) throw new Error("Masked presenter beat IDs must be unique safe identifiers.");
    if (!Number.isInteger(beat.startMs) || !Number.isInteger(beat.endMs) || beat.startMs < 0 || beat.endMs <= beat.startMs || beat.endMs > durationMs || beat.startMs < previousEnd) {
      throw new Error(`Masked presenter beat ${beat.id} has invalid or overlapping timing.`);
    }
    if (!beat.text.trim() || beat.text.length > 500 || !Number.isFinite(beat.productPriority) || beat.productPriority < 0 || beat.productPriority > 1) {
      throw new Error(`Masked presenter beat ${beat.id} is invalid.`);
    }
    ids.add(beat.id);
    previousEnd = beat.endMs;
  }
}

export function scheduleMaskedPresenterGestures(input: {
  beats: MaskedPresenterBeat[];
  durationMs: number;
  seed: number;
}): MaskedPresenterGestureSchedule {
  assertMaskedPresenterBeats(input.beats, input.durationMs);
  if (!Number.isInteger(input.seed)) throw new Error("Masked presenter seed must be an integer.");
  const gestures: ScheduledMaskedPresenterGesture[] = [];
  const recent: MaskedPresenterGesture[] = [];
  let previousEnd = -220;

  for (const beat of input.beats) {
    if (beat.presenter === "hidden") continue;
    const availableStart = Math.max(beat.startMs + Math.min(220, Math.round((beat.endMs - beat.startMs) * 0.08)), previousEnd + 180);
    const availableEnd = beat.endMs - 100;
    if (availableEnd - availableStart < 620) continue;
    const gesture = chooseGesture(beat, input.seed, recent);
    const requestedDuration = clamp(Math.round((beat.endMs - beat.startMs) * (beat.energy === "high" ? 0.82 : beat.energy === "low" ? 0.62 : 0.72)), 820, 2_700);
    const endMs = Math.min(availableEnd, availableStart + requestedDuration);
    const duration = endMs - availableStart;
    if (duration < 620) continue;
    const anticipationEndMs = availableStart + Math.round(duration * 0.18);
    const actionEndMs = availableStart + Math.round(duration * 0.53);
    const holdEndMs = availableStart + Math.round(duration * 0.69);
    gestures.push({
      id: `${beat.id}-${gesture}`,
      beatId: beat.id,
      gesture,
      startMs: availableStart,
      anticipationEndMs,
      actionEndMs,
      holdEndMs,
      endMs,
      variant: deterministicUnit(input.seed, `gesture:${beat.id}:${gesture}`),
      energy: beat.energy
    });
    previousEnd = endMs;
    recent.push(gesture);
    if (recent.length > 2) recent.shift();
  }

  const unsigned = {
    schemaVersion: MASKED_PRESENTER_SCHEMA_VERSION,
    engineVersion: MASKED_PRESENTER_ENGINE_VERSION,
    seed: input.seed,
    durationMs: input.durationMs,
    gestures
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

export function planMaskedPresenterLayouts(input: {
  beats: MaskedPresenterBeat[];
  durationMs: number;
  fps?: 30 | 60;
  actionRegions?: Array<{ startMs: number; endMs: number; rect: NormalizedRect }>;
}): MaskedPresenterLayoutManifest {
  assertMaskedPresenterBeats(input.beats, input.durationMs);
  const fps = input.fps ?? 30;
  const cues = input.beats.map((beat, index): MaskedPresenterLayoutCue => {
    const mode = chooseLayoutMode(beat, index);
    const rects = layoutRects(mode, beat.captionPlacement);
    const activeActionRegions = (input.actionRegions ?? []).filter((region) => region.endMs > beat.startMs && region.startMs < beat.endMs);
    const collision = rects.presenterRect
      ? activeActionRegions.some((region) => intersectionRatio(rects.presenterRect!, region.rect) > 0.08)
      : false;
    const resolvedMode = collision ? "product_only" : mode;
    const resolved = resolvedMode === mode ? rects : layoutRects("product_only", beat.captionPlacement);
    return {
      beatId: beat.id,
      startMs: beat.startMs,
      endMs: beat.endMs,
      mode: resolvedMode,
      ...(resolved.presenterRect ? { presenterRect: resolved.presenterRect } : {}),
      productRect: resolved.productRect,
      captionRect: resolved.captionRect,
      collisionFree: !resolved.presenterRect || !activeActionRegions.some((region) => intersectionRatio(resolved.presenterRect!, region.rect) > 0.08),
      rationale: resolvedMode === "product_only"
        ? "Product interaction and result evidence receive the full readable canvas."
        : `${beat.intent} uses ${resolvedMode.replaceAll("_", " ")} while preserving the product and caption safe areas.`
    };
  });
  const unsigned = {
    schemaVersion: MASKED_PRESENTER_SCHEMA_VERSION,
    engineVersion: MASKED_PRESENTER_ENGINE_VERSION,
    canvas: { width: 1080, height: 1920, fps },
    cues
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

export function sampleMaskedPresenterMotion(input: {
  timeMs: number;
  seed: number;
  schedule: MaskedPresenterGestureSchedule;
}): MaskedPresenterMotionState {
  const timeMs = clamp(input.timeMs, 0, input.schedule.durationMs);
  const weight = piecewiseMotion(timeMs, input.seed, "weight", 1_900, 4_200, -15, 14, 0.24);
  const vertical = piecewiseMotion(timeMs, input.seed, "vertical", 2_800, 5_100, -2.8, 3.6, 0.34);
  const headTurn = piecewiseMotion(timeMs, input.seed, "head-turn", 1_450, 3_800, -4.8, 5.4, 0.31);
  const headTilt = piecewiseMotion(timeMs, input.seed, "head-tilt", 1_700, 4_400, -2.8, 3.1, 0.39);
  const shoulder = piecewiseMotion(timeMs, input.seed, "shoulder", 2_100, 4_600, -2.2, 2.4, 0.28);
  const breathingPeriod = 3_700 + deterministicUnit(input.seed, "breath-period") * 1_450;
  const breathingPhase = deterministicUnit(input.seed, "breath-phase") * Math.PI * 2;
  const breath = Math.sin(timeMs / breathingPeriod * Math.PI * 2 + breathingPhase) * 0.006
    + Math.sin(timeMs / (breathingPeriod * 2.37) * Math.PI * 2 + breathingPhase * 0.37) * 0.0018;
  const micro = Math.sin(timeMs / 1_487 + deterministicUnit(input.seed, "micro-a") * 5) * 0.44
    + Math.sin(timeMs / 2_293 + deterministicUnit(input.seed, "micro-b") * 5) * 0.31;
  const eyeIntensity = clamp(0.78 + Math.sin(timeMs / 1_210 + breathingPhase) * 0.08 - blinkAmount(timeMs, input.seed) * 0.72, 0.08, 1);
  const active = input.schedule.gestures.find((gesture) => timeMs >= gesture.startMs && timeMs <= gesture.endMs);
  const gesture = active ? gestureEnvelope(active, timeMs) : undefined;
  const baseArms: MaskedPresenterArmPose = {
    leftHandX: -0.22,
    leftHandY: 0.34,
    rightHandX: 0.22,
    rightHandY: 0.34,
    leftPalmOpen: 0.18,
    rightPalmOpen: 0.18
  };
  const pose = active ? gesturePose(active.gesture, active.variant) : baseArms;
  const gestureAmount = gesture?.amount ?? 0;
  const arms = interpolateArmPose(baseArms, pose, gestureAmount);
  const energyScale = active?.energy === "high" ? 1.08 : active?.energy === "low" ? 0.78 : 0.94;
  const leanGesture = active ? gestureLean(active.gesture) * gestureAmount * energyScale : 0;
  const xGesture = active ? gestureHorizontal(active.gesture) * gestureAmount * energyScale : 0;
  const bodyRotation = clamp(-weight * 0.055 + micro * 0.12, -2.4, 2.4);

  return {
    timeMs: Math.round(timeMs),
    xShift: clamp(weight + micro + xGesture, -22, 22),
    yShift: clamp(vertical + breath * 180, -6, 7),
    bodyRotationDeg: bodyRotation,
    torsoLeanDeg: clamp(weight * -0.045 + leanGesture, -5.8, 5.8),
    breathingScale: 1 + breath,
    headTurnDeg: clamp(headTurn - bodyRotation * 0.55, -7.5, 7.5),
    headTiltDeg: clamp(headTilt - shoulder * 0.38, -5.2, 5.2),
    leftShoulderOffset: clamp(shoulder - breath * 90, -4.5, 4.5),
    rightShoulderOffset: clamp(-shoulder * 0.72 - breath * 90, -4.5, 4.5),
    eyeIntensity,
    ...(active ? { gesture: active.gesture } : {}),
    gestureProgress: gesture?.progress ?? 0,
    arms
  };
}

export function evaluateMaskedPresenterMotion(input: {
  durationMs: number;
  seed: number;
  schedule: MaskedPresenterGestureSchedule;
  sampleRate?: number;
}): MaskedPresenterMotionQuality {
  const sampleRate = input.sampleRate ?? 60;
  if (!Number.isInteger(sampleRate) || sampleRate < 30 || sampleRate > 240) throw new Error("Masked presenter quality sample rate must be an integer from 30 to 240.");
  const stepMs = 1_000 / sampleRate;
  const states: MaskedPresenterMotionState[] = [];
  for (let timeMs = 0; timeMs <= input.durationMs + 0.001; timeMs += stepMs) {
    states.push(sampleMaskedPresenterMotion({ timeMs, seed: input.seed, schedule: input.schedule }));
  }
  const velocities = derivatives(states.map((state) => state.xShift), stepMs / 1_000);
  const accelerations = derivatives(velocities, stepMs / 1_000);
  const jerks = derivatives(accelerations, stepMs / 1_000);
  const frozen = longestFrozenInterval(states, stepMs);
  const reversalIntervals = weightShiftReversalIntervals(velocities, stepMs);
  const reversalCv = coefficientOfVariation(reversalIntervals);
  const repeatedStateRatio = repeatedStateShare(states);
  const diagnostics = {
    maximumHorizontalDisplacement: maximumAbsolute(states.map((state) => state.xShift)),
    maximumHeadAngle: maximumAbsolute(states.flatMap((state) => [state.headTurnDeg, state.headTiltDeg])),
    maximumLean: maximumAbsolute(states.map((state) => state.torsoLeanDeg)),
    maximumVelocity: maximumAbsolute(velocities),
    maximumAcceleration: maximumAbsolute(accelerations),
    maximumJerk: maximumAbsolute(jerks),
    longestFrozenIntervalMs: frozen,
    weightShiftReversalCount: reversalIntervals.length,
    reversalIntervalCoefficientOfVariation: reversalCv,
    repeatedStateRatio
  };
  const checks = [
    check("horizontal_bounds", diagnostics.maximumHorizontalDisplacement, 22.01, diagnostics.maximumHorizontalDisplacement <= 22.01, "Horizontal movement remains inside the rig-safe bound."),
    check("head_angle_bounds", diagnostics.maximumHeadAngle, 7.51, diagnostics.maximumHeadAngle <= 7.51, "Head movement remains professional and restrained."),
    check("lean_bounds", diagnostics.maximumLean, 5.81, diagnostics.maximumLean <= 5.81, "Torso lean remains inside the designed balance envelope."),
    check("velocity_continuity", diagnostics.maximumVelocity, 36, diagnostics.maximumVelocity <= 36, "Weight-shift velocity is bounded."),
    check("acceleration_continuity", diagnostics.maximumAcceleration, 95, diagnostics.maximumAcceleration <= 95, "Weight-shift acceleration is bounded."),
    check("jerk_continuity", diagnostics.maximumJerk, 1_600, diagnostics.maximumJerk <= 1_600, "Weight-shift jerk is bounded."),
    check("no_frozen_performance", diagnostics.longestFrozenIntervalMs, 900, diagnostics.longestFrozenIntervalMs <= 900, "Breathing, head or body motion prevents a frozen cutout."),
    check("non_pendulum_motion", diagnostics.reversalIntervalCoefficientOfVariation, 0.1, reversalIntervals.length < 5 || diagnostics.reversalIntervalCoefficientOfVariation >= 0.1, "Irregular holds and travel times avoid pendulum motion."),
    check("no_exact_idle_loop", diagnostics.repeatedStateRatio, 0.025, diagnostics.repeatedStateRatio <= 0.025, "The sampled state does not repeat as a short exact loop.")
  ];
  return {
    schemaVersion: MASKED_PRESENTER_SCHEMA_VERSION,
    sampleRate,
    sampleCount: states.length,
    status: checks.every((candidate) => candidate.status === "pass") ? "passed" : "failed",
    checks,
    diagnostics
  };
}

export function assertMaskedPresenterSchedule(value: MaskedPresenterGestureSchedule): void {
  const unsigned = {
    schemaVersion: value.schemaVersion,
    engineVersion: value.engineVersion,
    seed: value.seed,
    durationMs: value.durationMs,
    gestures: value.gestures
  };
  if (value.schemaVersion !== MASKED_PRESENTER_SCHEMA_VERSION || value.engineVersion !== MASKED_PRESENTER_ENGINE_VERSION || checksum(unsigned) !== value.checksum) {
    throw new Error("Masked presenter gesture schedule is invalid or has changed.");
  }
  let previousEnd = -1;
  for (const gesture of value.gestures) {
    if (gesture.startMs < previousEnd || !(gesture.startMs < gesture.anticipationEndMs && gesture.anticipationEndMs < gesture.actionEndMs && gesture.actionEndMs <= gesture.holdEndMs && gesture.holdEndMs < gesture.endMs) || gesture.endMs > value.durationMs) {
      throw new Error("Masked presenter gesture schedule contains invalid timing.");
    }
    previousEnd = gesture.endMs;
  }
}

export function assertMaskedPresenterLayoutManifest(value: MaskedPresenterLayoutManifest): void {
  const unsigned = {
    schemaVersion: value.schemaVersion,
    engineVersion: value.engineVersion,
    canvas: value.canvas,
    cues: value.cues
  };
  if (value.schemaVersion !== MASKED_PRESENTER_SCHEMA_VERSION || value.engineVersion !== MASKED_PRESENTER_ENGINE_VERSION || checksum(unsigned) !== value.checksum) {
    throw new Error("Masked presenter layout manifest is invalid or has changed.");
  }
  if (value.cues.some((cue) => !cue.collisionFree || !inside(cue.productRect) || !inside(cue.captionRect) || (cue.presenterRect && !inside(cue.presenterRect)))) {
    throw new Error("Masked presenter layout manifest contains an unsafe placement.");
  }
}

function chooseGesture(beat: MaskedPresenterBeat, seed: number, recent: MaskedPresenterGesture[]): MaskedPresenterGesture {
  if (beat.preferredGesture) return beat.preferredGesture;
  const candidates = GESTURES_BY_INTENT[beat.intent];
  const start = Math.floor(deterministicUnit(seed, `gesture-choice:${beat.id}`) * candidates.length);
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length]!;
    if (!recent.includes(candidate)) return candidate;
  }
  return candidates[start]!;
}

function chooseLayoutMode(beat: MaskedPresenterBeat, index: number): MaskedPresenterLayoutMode {
  if (beat.presenter === "hidden" || beat.productPriority >= 0.76 || beat.intent === "demonstration" || beat.intent === "evidence") return "product_only";
  if (beat.intent === "hook" || beat.intent === "cta") return "fullscreen";
  if (beat.intent === "product_reveal") return "lower_third";
  if (beat.productPriority >= 0.55) return "picture_in_picture";
  if (beat.intent === "problem") return "foreground";
  return index % 2 === 0 ? "split_left" : "split_right";
}

function layoutRects(mode: MaskedPresenterLayoutMode, captionPlacement: MaskedPresenterBeat["captionPlacement"]): {
  presenterRect?: NormalizedRect;
  productRect: NormalizedRect;
  captionRect: NormalizedRect;
} {
  const captionRect = captionPlacement === "top"
    ? { x: 0.08, y: 0.07, width: 0.84, height: 0.14 }
    : captionPlacement === "middle"
      ? { x: 0.09, y: 0.39, width: 0.82, height: 0.16 }
      : { x: 0.08, y: 0.73, width: 0.84, height: 0.13 };
  if (mode === "product_only") return { productRect: { x: 0.035, y: 0.12, width: 0.93, height: 0.70 }, captionRect };
  if (mode === "fullscreen") return { presenterRect: { x: 0.12, y: 0.18, width: 0.76, height: 0.69 }, productRect: { x: 0.08, y: 0.09, width: 0.84, height: 0.29 }, captionRect };
  if (mode === "lower_third") return { presenterRect: { x: 0.59, y: 0.55, width: 0.37, height: 0.31 }, productRect: { x: 0.035, y: 0.12, width: 0.93, height: 0.64 }, captionRect };
  if (mode === "split_left") return { presenterRect: { x: 0.035, y: 0.30, width: 0.43, height: 0.49 }, productRect: { x: 0.49, y: 0.14, width: 0.475, height: 0.65 }, captionRect };
  if (mode === "split_right") return { presenterRect: { x: 0.535, y: 0.30, width: 0.43, height: 0.49 }, productRect: { x: 0.035, y: 0.14, width: 0.475, height: 0.65 }, captionRect };
  if (mode === "picture_in_picture") return { presenterRect: { x: 0.67, y: 0.57, width: 0.27, height: 0.26 }, productRect: { x: 0.035, y: 0.12, width: 0.93, height: 0.68 }, captionRect };
  return { presenterRect: { x: 0.27, y: 0.34, width: 0.46, height: 0.49 }, productRect: { x: 0.035, y: 0.12, width: 0.93, height: 0.70 }, captionRect };
}

function piecewiseMotion(timeMs: number, seed: number, channel: string, minDuration: number, maxDuration: number, minimum: number, maximum: number, holdShare: number): number {
  let segmentStart = 0;
  let previous = lerp(minimum, maximum, deterministicUnit(seed, `${channel}:initial`));
  for (let index = 0; index < 64; index += 1) {
    const duration = lerp(minDuration, maxDuration, deterministicUnit(seed, `${channel}:duration:${index}`));
    const segmentEnd = segmentStart + duration;
    const next = lerp(minimum, maximum, deterministicUnit(seed, `${channel}:value:${index}`));
    if (timeMs <= segmentEnd || index === 63) {
      const local = clamp((timeMs - segmentStart) / duration, 0, 1);
      const hold = clamp(holdShare + (deterministicUnit(seed, `${channel}:hold:${index}`) - 0.5) * 0.16, 0.12, 0.48);
      if (local <= hold) return previous;
      const progress = smootherstep((local - hold) / (1 - hold));
      return lerp(previous, next, progress);
    }
    segmentStart = segmentEnd;
    previous = next;
  }
  return previous;
}

function blinkAmount(timeMs: number, seed: number): number {
  let cursor = 1_500 + deterministicUnit(seed, "blink:initial") * 2_200;
  for (let index = 0; index < 24; index += 1) {
    const duration = 115 + deterministicUnit(seed, `blink:duration:${index}`) * 55;
    if (timeMs >= cursor && timeMs <= cursor + duration) {
      const local = (timeMs - cursor) / duration;
      return Math.sin(local * Math.PI);
    }
    cursor += 3_100 + deterministicUnit(seed, `blink:gap:${index}`) * 4_400;
    if (cursor > timeMs + 8_000) break;
  }
  return 0;
}

function gestureEnvelope(gesture: ScheduledMaskedPresenterGesture, timeMs: number): { progress: number; amount: number } {
  if (timeMs <= gesture.anticipationEndMs) {
    const progress = smootherstep((timeMs - gesture.startMs) / (gesture.anticipationEndMs - gesture.startMs));
    return { progress: progress * 0.18, amount: -0.08 * progress };
  }
  if (timeMs <= gesture.actionEndMs) {
    const progress = smootherstep((timeMs - gesture.anticipationEndMs) / (gesture.actionEndMs - gesture.anticipationEndMs));
    return { progress: 0.18 + progress * 0.47, amount: lerp(-0.08, 1, progress) };
  }
  if (timeMs <= gesture.holdEndMs) return { progress: 0.65 + (timeMs - gesture.actionEndMs) / Math.max(1, gesture.holdEndMs - gesture.actionEndMs) * 0.12, amount: 1 };
  const progress = smootherstep((timeMs - gesture.holdEndMs) / (gesture.endMs - gesture.holdEndMs));
  return { progress: 0.77 + progress * 0.23, amount: 1 - progress };
}

function gesturePose(gesture: MaskedPresenterGesture, variant: number): MaskedPresenterArmPose {
  const variation = (variant - 0.5) * 0.035;
  if (gesture === "neutral_explanation") return { leftHandX: -0.29, leftHandY: 0.15, rightHandX: 0.29, rightHandY: 0.17, leftPalmOpen: 0.82, rightPalmOpen: 0.82 };
  if (gesture === "single_hand_emphasis") return { leftHandX: -0.20, leftHandY: 0.34, rightHandX: 0.30 + variation, rightHandY: 0.04, leftPalmOpen: 0.18, rightPalmOpen: 0.58 };
  if (gesture === "two_hand_explanation") return { leftHandX: -0.33, leftHandY: 0.12, rightHandX: 0.33, rightHandY: 0.12, leftPalmOpen: 0.9, rightPalmOpen: 0.9 };
  if (gesture === "point_left") return { leftHandX: -0.47, leftHandY: 0.02, rightHandX: 0.21, rightHandY: 0.32, leftPalmOpen: 0.26, rightPalmOpen: 0.14 };
  if (gesture === "point_right") return { leftHandX: -0.21, leftHandY: 0.32, rightHandX: 0.47, rightHandY: 0.02, leftPalmOpen: 0.14, rightPalmOpen: 0.26 };
  if (gesture === "point_up") return { leftHandX: -0.20, leftHandY: 0.31, rightHandX: 0.29 + variation, rightHandY: -0.18, leftPalmOpen: 0.14, rightPalmOpen: 0.24 };
  if (gesture === "count_list") return { leftHandX: -0.23, leftHandY: 0.27, rightHandX: 0.25, rightHandY: -0.03, leftPalmOpen: 0.16, rightPalmOpen: 0.48 };
  if (gesture === "lean_forward") return { leftHandX: -0.31, leftHandY: 0.20, rightHandX: 0.31, rightHandY: 0.20, leftPalmOpen: 0.68, rightPalmOpen: 0.68 };
  if (gesture === "small_reaction") return { leftHandX: -0.34, leftHandY: 0.01, rightHandX: 0.34, rightHandY: 0.01, leftPalmOpen: 0.92, rightPalmOpen: 0.92 };
  if (gesture === "open_handed_cta") return { leftHandX: -0.38, leftHandY: 0.09, rightHandX: 0.38, rightHandY: 0.09, leftPalmOpen: 1, rightPalmOpen: 1 };
  if (gesture === "entrance") return { leftHandX: -0.27, leftHandY: 0.17, rightHandX: 0.27, rightHandY: 0.17, leftPalmOpen: 0.55, rightPalmOpen: 0.55 };
  if (gesture === "exit") return { leftHandX: -0.19, leftHandY: 0.35, rightHandX: 0.36, rightHandY: 0.06, leftPalmOpen: 0.12, rightPalmOpen: 0.7 };
  return { leftHandX: -0.22, leftHandY: 0.34, rightHandX: 0.22, rightHandY: 0.34, leftPalmOpen: 0.18, rightPalmOpen: 0.18 };
}

function gestureLean(gesture: MaskedPresenterGesture): number {
  if (gesture === "lean_forward") return -4.4;
  if (gesture === "small_reaction") return 2.2;
  if (gesture === "open_handed_cta") return -1.4;
  return 0;
}

function gestureHorizontal(gesture: MaskedPresenterGesture): number {
  if (gesture === "point_left") return -2.8;
  if (gesture === "point_right") return 2.8;
  if (gesture === "entrance") return 3.2;
  if (gesture === "exit") return -3.2;
  return 0;
}

function interpolateArmPose(left: MaskedPresenterArmPose, right: MaskedPresenterArmPose, amount: number): MaskedPresenterArmPose {
  const progress = clamp(amount, 0, 1);
  return {
    leftHandX: lerp(left.leftHandX, right.leftHandX, progress),
    leftHandY: lerp(left.leftHandY, right.leftHandY, progress),
    rightHandX: lerp(left.rightHandX, right.rightHandX, progress),
    rightHandY: lerp(left.rightHandY, right.rightHandY, progress),
    leftPalmOpen: lerp(left.leftPalmOpen, right.leftPalmOpen, progress),
    rightPalmOpen: lerp(left.rightPalmOpen, right.rightPalmOpen, progress)
  };
}

function derivatives(values: number[], stepSeconds: number): number[] {
  return values.slice(1).map((value, index) => (value - values[index]!) / stepSeconds);
}

function longestFrozenInterval(states: MaskedPresenterMotionState[], stepMs: number): number {
  let current = 0;
  let longest = 0;
  for (let index = 1; index < states.length; index += 1) {
    const previous = states[index - 1]!;
    const state = states[index]!;
    const delta = Math.abs(state.xShift - previous.xShift)
      + Math.abs(state.yShift - previous.yShift)
      + Math.abs(state.headTurnDeg - previous.headTurnDeg)
      + Math.abs(state.headTiltDeg - previous.headTiltDeg)
      + Math.abs(state.breathingScale - previous.breathingScale) * 100;
    current = delta < 0.001 ? current + stepMs : 0;
    longest = Math.max(longest, current);
  }
  return Math.round(longest);
}

function weightShiftReversalIntervals(velocities: number[], stepMs: number): number[] {
  const reversals: number[] = [];
  let previousSign = 0;
  let lastReversal = 0;
  velocities.forEach((velocity, index) => {
    const sign = Math.abs(velocity) < 0.08 ? 0 : Math.sign(velocity);
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) {
      const at = index * stepMs;
      if (at - lastReversal > 300) {
        if (lastReversal > 0) reversals.push(at - lastReversal);
        lastReversal = at;
      }
    }
    if (sign !== 0) previousSign = sign;
  });
  return reversals;
}

function repeatedStateShare(states: MaskedPresenterMotionState[]): number {
  const seen = new Map<string, number>();
  let repeated = 0;
  for (const state of states) {
    const key = [
      state.xShift.toFixed(3),
      state.yShift.toFixed(3),
      state.headTurnDeg.toFixed(3),
      state.headTiltDeg.toFixed(3),
      state.breathingScale.toFixed(5),
      state.gesture ?? "idle"
    ].join(":");
    const count = seen.get(key) ?? 0;
    if (count > 0) repeated += 1;
    seen.set(key, count + 1);
  }
  return repeated / Math.max(1, states.length);
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function check(code: string, measured: number, threshold: number, passed: boolean, message: string): MaskedPresenterMotionQuality["checks"][number] {
  return {
    code,
    status: passed ? "pass" : "fail",
    measured: round(measured),
    threshold,
    message
  };
}

function intersectionRatio(left: NormalizedRect, right: NormalizedRect): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height / Math.max(0.000001, Math.min(left.width * left.height, right.width * right.height));
}

function inside(rect: NormalizedRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
    && rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
}

function deterministicUnit(seed: number, key: string): number {
  const digest = createHash("sha256").update(`${seed}:${key}`).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function maximumAbsolute(values: number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}

function smootherstep(value: number): number {
  const progress = clamp(value, 0, 1);
  return progress ** 3 * (progress * (progress * 6 - 15) + 10);
}

function lerp(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 5): number {
  return Number(value.toFixed(digits));
}
