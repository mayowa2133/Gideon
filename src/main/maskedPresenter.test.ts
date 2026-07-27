import { describe, expect, it } from "vitest";
import {
  MASKED_PRESENTER_GESTURE_LIBRARY,
  assertMaskedPresenterLayoutManifest,
  assertMaskedPresenterSchedule,
  evaluateMaskedPresenterMotion,
  maskedPresenterCharacterSpec,
  planMaskedPresenterLayouts,
  sampleMaskedPresenterMotion,
  scheduleMaskedPresenterGestures,
  type MaskedPresenterBeat
} from "./maskedPresenter";

const beats: MaskedPresenterBeat[] = [
  { id: "hook", startMs: 0, endMs: 3_500, text: "Stop juggling disconnected tools.", intent: "hook", energy: "high", presenter: "required", productPriority: 0.1, captionPlacement: "top", cameraEmphasis: "context" },
  { id: "reveal", startMs: 3_500, endMs: 7_000, text: "Meet Solomon.", intent: "product_reveal", energy: "medium", presenter: "preferred", productPriority: 0.5, captionPlacement: "top", cameraEmphasis: "context" },
  { id: "demo", startMs: 7_000, endMs: 13_000, text: "Move the opportunity forward.", intent: "demonstration", energy: "medium", presenter: "hidden", productPriority: 1, captionPlacement: "bottom", cameraEmphasis: "action" },
  { id: "benefit", startMs: 13_000, endMs: 17_000, text: "Keep the context close.", intent: "benefit", energy: "medium", presenter: "preferred", productPriority: 0.58, captionPlacement: "top", cameraEmphasis: "result" },
  { id: "cta", startMs: 17_000, endMs: 22_000, text: "See the complete workflow.", intent: "cta", energy: "high", presenter: "required", productPriority: 0.1, captionPlacement: "top", cameraEmphasis: "context" }
];

describe("masked presenter", () => {
  it("defines an original mouthless code-native character", () => {
    const character = maskedPresenterCharacterSpec();
    expect(character.id).toBe("solomon-axiom-v1");
    expect(character.mouthVisible).toBe(false);
    expect(character.lipSyncRequired).toBe(false);
    expect(character.ownership).toBe("gideon_original_code_native");
    expect(new Set(MASKED_PRESENTER_GESTURE_LIBRARY).size).toBeGreaterThanOrEqual(8);
  });

  it("schedules gestures deterministically without collisions or immediate repetition", () => {
    const first = scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 71623 });
    const second = scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 71623 });
    expect(first).toEqual(second);
    expect(first.gestures.length).toBeGreaterThanOrEqual(4);
    expect(first.gestures.every((gesture, index) => index === 0 || gesture.startMs >= first.gestures[index - 1]!.endMs)).toBe(true);
    expect(first.gestures.every((gesture, index) => index === 0 || gesture.gesture !== first.gestures[index - 1]!.gesture)).toBe(true);
    expect(() => assertMaskedPresenterSchedule(first)).not.toThrow();
  });

  it("uses different seeds for bounded natural variation", () => {
    const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 11 });
    const left = sampleMaskedPresenterMotion({ timeMs: 8_555, seed: 11, schedule });
    const right = sampleMaskedPresenterMotion({ timeMs: 8_555, seed: 12, schedule: scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 12 }) });
    expect(left).not.toEqual(right);
    expect(Math.abs(left.xShift)).toBeLessThanOrEqual(22);
    expect(Math.abs(right.xShift)).toBeLessThanOrEqual(22);
    expect(Math.abs(left.headTurnDeg)).toBeLessThanOrEqual(7.5);
  });

  it("passes motion continuity, freeze, repetition, and non-pendulum gates", () => {
    const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 71623 });
    const report = evaluateMaskedPresenterMotion({ durationMs: 22_000, seed: 71623, schedule, sampleRate: 120 });
    expect(report.status, JSON.stringify(report, null, 2)).toBe("passed");
    expect(report.diagnostics.longestFrozenIntervalMs).toBeLessThanOrEqual(900);
    expect(report.diagnostics.maximumHorizontalDisplacement).toBeLessThanOrEqual(22.01);
  });

  it("plans product-only demonstrations and safe presenter layouts", () => {
    const manifest = planMaskedPresenterLayouts({
      beats,
      durationMs: 22_000,
      fps: 60,
      actionRegions: [{ startMs: 13_100, endMs: 15_000, rect: { x: 0.67, y: 0.57, width: 0.25, height: 0.24 } }]
    });
    expect(manifest.canvas.fps).toBe(60);
    expect(manifest.cues.find((cue) => cue.beatId === "demo")?.mode).toBe("product_only");
    expect(manifest.cues.every((cue) => cue.collisionFree)).toBe(true);
    expect(() => assertMaskedPresenterLayoutManifest(manifest)).not.toThrow();
  });

  it("detects tampered manifests", () => {
    const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 22_000, seed: 71623 });
    schedule.gestures[0]!.endMs += 1;
    expect(() => assertMaskedPresenterSchedule(schedule)).toThrow(/invalid or has changed/);
  });
});
