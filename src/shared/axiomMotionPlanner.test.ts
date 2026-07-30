import { describe, expect, it } from "vitest";
import { planAxiomEditorialMotion } from "./axiomMotionPlanner";
import { axiomEditorialPoseForShot, axiomEditorialPoseNames } from "./axiomPoseLibrary";

describe("Axiom editorial performance planning", () => {
  it("provides all required framing and gesture families", () => {
    const poses = Array.from({ length: 16 }, (_, index) => axiomEditorialPoseForShot(index));
    expect(new Set(poses.map(({ framing }) => framing))).toEqual(new Set(["intimate_closeup", "chest_up", "waist_up", "none"]));
    expect(axiomEditorialPoseNames()).toEqual(expect.arrayContaining(["neutral", "explain", "point_left", "point_right", "emphasis", "open_cta"]));
  });

  it("aligns gestures deterministically and keeps motion restrained", () => {
    const pose = axiomEditorialPoseForShot(0);
    const motion = planAxiomEditorialMotion(0, 1_000, pose);
    expect(motion.gestureStartMs).toBe(1_260);
    expect(motion.gestureDurationMs).toBe(720);
    expect(motion.idleSwayAmplitudePx).toBeLessThanOrEqual(18);
    expect(motion.punchIn).toBeLessThanOrEqual(0.05);
    expect(planAxiomEditorialMotion(0, 1_000, pose)).toEqual(motion);
  });
});
