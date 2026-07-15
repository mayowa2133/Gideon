import { describe, expect, it } from "vitest";
import { buildFocusedCropFilter, compileCaptureFraming } from "./captureFraming";

const source = { width: 1440, height: 900, durationMs: 8_000 };
const receiptStartedAt = "2026-07-14T10:00:00.000Z";
const visualEvidence = {
  schemaVersion: "1" as const,
  viewport: { width: 1440, height: 900, scrollX: 0, scrollY: 0 },
  actionTarget: { x: 100, y: 100, width: 120, height: 40 },
  resultTarget: { x: 1100, y: 600, width: 200, height: 100 }
};

describe("capture framing", () => {
  it("compiles action-aware keyframes with bounded crops and stable motion", () => {
    const manifest = compileCaptureFraming({
      config: { mode: "automatic_focus", maxZoom: 1.6, transitionMs: 650 }, source, receiptStartedAt,
      stepTimings: [
        { stepId: "one", startedAt: "2026-07-14T10:00:01.000Z", completedAt: "2026-07-14T10:00:02.000Z", visualEvidence: { ...visualEvidence, resultTarget: undefined } },
        { stepId: "two", startedAt: "2026-07-14T10:00:04.000Z", completedAt: "2026-07-14T10:00:05.000Z", visualEvidence }
      ]
    });
    expect(manifest).toMatchObject({ appliedMode: "focused", crop: { width: 900, height: 562 }, keyframes: [{ evidence: "action_target", x: 0, y: 0 }, { evidence: "result_target", x: 540, y: 338 }] });
    expect(buildFocusedCropFilter(manifest)).toContain("if(lt(t,3.350)");
  });

  it("falls back to full-frame when trustworthy target geometry is unavailable", () => {
    expect(compileCaptureFraming({ config: { mode: "automatic_focus", maxZoom: 1.6, transitionMs: 650 }, source, receiptStartedAt, stepTimings: [] })).toMatchObject({ appliedMode: "full_frame", fallbackReason: "insufficient_visual_evidence", keyframes: [] });
  });

  it("supports a bounded manual focus region", () => {
    const manifest = compileCaptureFraming({ config: { mode: "manual", maxZoom: 1.5, transitionMs: 0, manualFocus: { x: 0.25, y: 0.2, width: 0.5, height: 0.5 } }, source, receiptStartedAt, stepTimings: [] });
    expect(manifest).toMatchObject({ appliedMode: "focused", keyframes: [{ stepId: "manual-focus", evidence: "manual" }] });
  });
});
