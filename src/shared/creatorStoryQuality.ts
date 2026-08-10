// The quality rules that are about films, not about Solomon.
//
// Twenty-four of the render's gates never knew which product they were looking
// at: pacing, loudness, palette, motion, held stability, presenter occupancy,
// bounds, transitions, caption windows, backdrop cadence. They lived in a
// V22-named module behind V22-named functions purely because that is the fork
// they were written in, and a generated film had no way to import them without
// importing a story.
//
// This is the surface a blueprint-driven render uses. It re-exports rather than
// relocates, and that is deliberate: V22 is the reference film, its master is
// shipped, and its scorecard is the regression floor every future film is
// measured against. Physically moving the implementations would churn the one
// artifact this whole system is calibrated on, in exchange for nothing a rename
// does not already give. When V22 is retired, the bodies move here and the
// re-exports become definitions.
//
// The bands are the valuable part and they are all reference-derived -- measured
// on three real creator videos with the same code that measures Gideon's output,
// after the V17 lesson about a metric tuned against its own film. Nothing here
// is a number someone liked the look of.
export {
  // Reference-calibrated bands.
  V22_MOTION_BANDS as MOTION_BANDS,
  V22_SHOT_BANDS as SHOT_BANDS,
  V22_PALETTE_BANDS as PALETTE_BANDS,
  V22_PRESENTER_OCCUPANCY_BAND as PRESENTER_OCCUPANCY_BAND,
  V22_SPEECH_RATE_BAND as SPEECH_RATE_BAND,
  V22_MIN_SCENE_FRAMES as MIN_SCENE_FRAMES,
  V22_CAMERA_ENVELOPE as CAMERA_ENVELOPE,
  V22_TEXT_ZONES as TEXT_ZONES,

  // Evaluators. Each takes a measurement and answers whether it sits in band.
  evaluateV22MotionBands as evaluateMotionBands,
  evaluateV22ShotBands as evaluateShotBands,
  evaluateV22PaletteBands as evaluatePaletteBands,

  // Audits over a film's own declarations, none of which read product content.
  auditV22SceneDurations as auditSceneDurations,
  auditV22PresenterOccupancy as auditPresenterOccupancy,
  auditV22RenderedBounds as auditRenderedBounds,
  auditV22Layout as auditLayout,
  auditV22Transitions as auditTransitions,
  auditV22Captions as auditCaptions,
  auditV22SemanticMotion as auditSemanticMotion,
  auditV22CompositionSimilarity as auditCompositionSimilarity,
  auditV22BackdropCadence as auditBackdropCadence,
  auditV22BackdropLuma as auditBackdropLuma,
  auditV22PhoneScale as auditPhoneScale,

  // Geometry the renderer and the audits must agree on.
  mascotBoxForScene,
  v22CameraTransform as cameraTransform,
  backdropCssLuma,
  v22ProductStillFile as productStillFile,
  v22ProductStillTrims as productStillTrims
} from "./creatorStoryV22Quality";

export type { V22Rect as LayoutRect, V22SemanticEvent as SemanticEvent, V22CompositionFingerprint as CompositionFingerprint } from "./creatorStoryV22Quality";

// What a film's contract checks, derived rather than restated.
//
// `scenes.length === 18` used to be asserted directly and it was the one rule
// that made a second angle impossible -- contiguity from zero and a terminal
// frame already pin a timeline exactly, so the count said nothing they did not.
// The word band is likewise the speech rate times the running time, which is why
// it is computed here instead of typed.
export function contractExpectations(filmFrames: number, speechRateBand: readonly [number, number]) {
  const minutes = filmFrames / 30 / 60;
  return {
    filmFrames,
    words: [Math.floor(speechRateBand[0] * minutes), Math.ceil(speechRateBand[1] * minutes)] as const,
    wordsPerMinute: speechRateBand
  };
}
