import type { AxiomPoseConfiguration } from "./axiomPoseLibrary";
import type { EditorialV2Presenter } from "./creatorEditorialV2";

export function planAxiomEditorialMotion(
  index: number,
  startMs: number,
  pose: AxiomPoseConfiguration
): EditorialV2Presenter["motion"] {
  if (!pose.visible) {
    return {
      idleSwayAmplitudePx: 0,
      idleSwayPeriodMs: 4_000,
      headAmplitudePx: 0,
      lateralShiftPx: 0,
      punchIn: 0,
      gestureStartMs: startMs,
      gestureDurationMs: 1,
      easing: "cubic_in_out"
    };
  }
  return {
    idleSwayAmplitudePx: pose.framing === "intimate_closeup" ? 12 : 18,
    idleSwayPeriodMs: 3_600 + index % 3 * 420,
    headAmplitudePx: pose.framing === "intimate_closeup" ? 6 : 9,
    lateralShiftPx: index % 2 === 0 ? 16 : -16,
    punchIn: pose.framing === "intimate_closeup" ? 0.05 : 0.025,
    gestureStartMs: startMs + 260,
    gestureDurationMs: 720,
    easing: "cubic_in_out"
  };
}
