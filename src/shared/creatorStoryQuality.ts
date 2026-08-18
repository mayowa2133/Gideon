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

// The size product type has to reach in a shot whose job is recognition rather
// than proof.
//
// This is a second floor, and it exists because one floor was wrong. `READABLE_
// PX` is 20 and it is right for a band that carries a claim: a viewer asked to
// take a figure on trust has to be able to read it. Applied to every product
// shot it forbids the one thing a marketing video most needs -- a look at the
// actual application -- because a screen only reads at 20px if it is magnified
// three or four times, and a screen magnified four times is a fragment of a card.
//
// Measured on the reference, not chosen. OCR of V22's two widest product shots
// puts their body type at a median of 14px (the Jobs page, frame 300) and 10px
// (the message composer, frame 960) once rendered into the 1080-wide frame. Both
// are the shots that make Solomon recognisable, and both would have been rejected
// by the 20px floor -- the generated film's crops sit at 222-389 source pixels
// and 2.6-4.5x magnification precisely because nothing else could pass.
//
// So: 10, from the narrower of the two. A shot at this size is not evidence and
// is never allowed to carry a claim; it is the establishing wide that gives the
// tight proof cut somewhere to come from.
export const SCREEN_RECOGNISABLE_PX = 10;

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
