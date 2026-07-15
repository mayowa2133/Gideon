import { describe, expect, it } from "vitest";
import type { ProductFlowRevision } from "../shared/productFlowCapture";
import { buildCaptureCaptionCues, renderCapturePresentation } from "./capturePresentationRenderer";

const flow: ProductFlowRevision = {
  schemaVersion: "1", id: "flow", revision: 1, projectId: "project", environmentVersionId: "version", personaId: "persona", title: "Flow", goal: "Goal",
  startingState: { entryPath: "/" },
  steps: [
    { id: "step-1", intent: "Open {safe} details --> now.", action: { type: "navigate", path: "/details" }, riskClass: "navigate" },
    { id: "step-2", intent: "Confirm the outcome.", action: { type: "wait_for", assertion: { type: "url", path: "/details" } }, riskClass: "observe" }
  ],
  finalAssertions: [{ type: "url", path: "/details" }], sourceEvidenceIds: [], approval: { status: "approved", approvedBy: "user", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 1 }
};

describe("capture presentation renderer", () => {
  it("aligns safe caption cues to recorded action timings", () => {
    const cues = buildCaptureCaptionCues({ flow, receiptStartedAt: "2026-07-14T10:00:00.000Z", durationMs: 8_000, stepTimings: [
      { stepId: "step-1", startedAt: "2026-07-14T10:00:01.000Z", completedAt: "2026-07-14T10:00:02.000Z" },
      { stepId: "step-2", startedAt: "2026-07-14T10:00:03.000Z", completedAt: "2026-07-14T10:00:04.000Z" }
    ] });
    expect(cues).toEqual([
      { stepId: "step-1", startMs: 1_000, endMs: 2_500, text: "Open safe details → now." },
      { stepId: "step-2", startMs: 3_000, endMs: 4_500, text: "Confirm the outcome." }
    ]);
  });

  it("requires explicit narration provider wiring before media work", async () => {
    await expect(renderCapturePresentation({ sourcePath: "/missing.mp4", outputDir: "/tmp/missing", flow, receiptStartedAt: "2026-07-14T10:00:00.000Z", stepTimings: [], narration: "provider" })).rejects.toThrow("requires an explicitly configured provider");
  });
});
