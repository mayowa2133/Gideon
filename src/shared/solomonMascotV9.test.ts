import { describe, expect, it } from "vitest";
import { SOLOMON_MASCOT_V9_GEOMETRY, auditSolomonMascotV9, v9MascotPerformanceSchema, type V9MascotGeometry } from "./solomonMascotV9";

describe("Solomon V9 mascot baby-schema contract", () => {
  it("accepts the selected cute geometry", () => {
    const result = auditSolomonMascotV9(SOLOMON_MASCOT_V9_GEOMETRY);
    expect(result.passed).toBe(true);
    expect(result.ratios).toMatchObject({ headHeight: expect.any(Number), headToBodyWidth: expect.any(Number) });
    expect(result.ratios.headHeight).toBeGreaterThanOrEqual(.45);
    expect(result.ratios.headToBodyWidth).toBeGreaterThanOrEqual(1.05);
  });

  it.each([
    ["head_height", { headHeight: 350 }],
    ["head_body_width", { bodyWidth: 620 }],
    ["screen_area", { screenWidth: 400 }],
    ["screen_corner_radius", { screenCornerRadius: 100 }],
    ["eye_size", { eyeWidth: 80 }],
    ["eye_center", { eyeCenterYRatio: .65 }],
    ["badge_size", { badgeWidth: 140 }],
    ["cameo_fingers", { cameoFingerDetails: true }],
    ["straight_silhouette", { roundedSilhouette: false }],
    ["armored_body", { eggBody: false }],
    ["antenna_clearance", { antennaClearance: 10 }],
    ["face_contrast", { faceColor: "#334455" }]
  ] as const)("rejects %s regressions", (failure, patch) => {
    const geometry = { ...SOLOMON_MASCOT_V9_GEOMETRY, ...patch } as V9MascotGeometry;
    expect(auditSolomonMascotV9(geometry)).toMatchObject({ passed: false, failures: expect.arrayContaining([failure]) });
  });

  it("rejects gaze that arrives after the gesture peak", () => {
    expect(() => v9MascotPerformanceSchema.parse(performance({ gazeArrivalFrame: 12, gesturePeakFrame: 10 }))).toThrow("gaze");
  });

  it("rejects decorative mascot appearances without interaction", () => {
    const value = performance({});
    delete (value as { interactionTarget?: unknown }).interactionTarget;
    expect(() => v9MascotPerformanceSchema.parse(value)).toThrow("interaction");
  });
});

function performance(overrides: Record<string, unknown>) {
  return {
    sceneId: "hook",
    role: "host",
    emotion: "friendly_rest",
    gazePath: [{ frame: 0, target: "camera" }],
    torso: { lean: .5, rotate: 0, shiftX: 0, shiftY: 0 },
    head: { tilt: 0, turn: 0, beats: [3] },
    leftGesture: "rest_mitt",
    rightGesture: "point_right",
    gazeArrivalFrame: 2,
    gestureStartFrame: 4,
    gesturePeakFrame: 10,
    recoveryFrame: 16,
    interactionTarget: { elementId: "proof", x: .8, y: .4, action: "present" },
    audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: true, emphasized: false, pitchDelta: 0, mouth: "smile_rest" }],
    skin: "solomon_s",
    material: "code_glossy",
    ...overrides
  };
}
