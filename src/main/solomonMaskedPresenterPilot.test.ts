import { describe, expect, it } from "vitest";
import { MASKED_PRESENTER_GESTURE_LIBRARY, assertMaskedPresenterSchedule, planMaskedPresenterLayouts, scheduleMaskedPresenterGestures } from "./maskedPresenter";
import { parseSolomonMaskedPresenterPilotArguments } from "./solomonMaskedPresenterPilotCli";
import { solomonMaskedPresenterPilotBeats } from "./solomonMaskedPresenterPilot";

describe("Solomon masked-presenter pilot", () => {
  it("defines a 43-second evidence-led pilot with detailed product-only beats", () => {
    const beats = solomonMaskedPresenterPilotBeats();
    expect(beats[0]?.startMs).toBe(0);
    expect(beats.at(-1)?.endMs).toBe(43_000);
    expect(new Set(beats.map((beat) => beat.workflowId).filter(Boolean))).toEqual(new Set([
      "browse-filter-jobs",
      "update-job-tracker",
      "review-saved-contacts",
      "review-draft-outreach"
    ]));
    expect(beats.filter((beat) => ["demonstration", "evidence"].includes(beat.intent)).every((beat) => beat.productPriority >= 0.76)).toBe(true);
    expect(beats.map((beat) => beat.text).join(" ")).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:%|x|times)\b/i);
  });

  it("builds a valid deterministic schedule with more than eight gesture families available", () => {
    const beats = solomonMaskedPresenterPilotBeats();
    const schedule = scheduleMaskedPresenterGestures({ beats, durationMs: 43_000, seed: 71623 });
    expect(() => assertMaskedPresenterSchedule(schedule)).not.toThrow();
    expect(schedule.gestures.length).toBeGreaterThanOrEqual(5);
    expect(new Set(MASKED_PRESENTER_GESTURE_LIBRARY).size).toBeGreaterThanOrEqual(8);
  });

  it("keeps interaction-heavy scenes product-only", () => {
    const beats = solomonMaskedPresenterPilotBeats();
    const layouts = planMaskedPresenterLayouts({ beats, durationMs: 43_000, fps: 30 });
    for (const beat of beats.filter((candidate) => ["demonstration", "evidence"].includes(candidate.intent))) {
      expect(layouts.cues.find((cue) => cue.beatId === beat.id)?.mode).toBe("product_only");
    }
  });

  it("parses explicit private input and output paths", () => {
    expect(parseSolomonMaskedPresenterPilotArguments(["--capture-run", "/tmp/capture", "--output-dir", "/tmp/output"])).toEqual({
      captureRunRoot: "/tmp/capture",
      outputDir: "/tmp/output"
    });
    expect(() => parseSolomonMaskedPresenterPilotArguments(["--unknown"])).toThrow(/Unsupported/);
  });
});
