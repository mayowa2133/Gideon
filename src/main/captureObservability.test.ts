import { describe, expect, it } from "vitest";
import type { CaptureRun, FlowExecutionRecord } from "../shared/productFlowCapture";
import { createCaptureObservabilitySnapshot } from "./captureObservability";

describe("capture observability", () => {
  it("reports bounded aggregate dimensions without leaking arbitrary blocker text", () => {
    const snapshot = createCaptureObservabilitySnapshot({ runs: [run()], executions: [execution("verified"), { ...execution("blocked"), id: "execution-2", blockerCode: "token_private_value" }, { ...execution("failed"), id: "execution-3", blockerCode: "unsafe text with password" }], now: "2026-07-14T10:00:00.000Z" });
    expect(snapshot).toMatchObject({ runs: { active: 1 }, executions: { verified: 1, blocked: 1, failed: 1, verificationRate: 1 / 3 }, blockerCounts: { other: 2 } });
    expect(JSON.stringify(snapshot)).not.toContain("password");
  });
});

function run(): CaptureRun { return { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "job-1", status: "recording", flowRevisionIds: ["flow-1:revision:2"], compiledPlanHashes: ["a".repeat(64)], policyFingerprint: "b".repeat(64), idempotencyKey: "capture-key-1", requestHash: "c".repeat(64), estimatedBrowserSeconds: 48, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }; }
function execution(status: FlowExecutionRecord["status"]): FlowExecutionRecord { return { id: "execution-1", workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1", flowId: "flow-1", flowRevision: 2, environmentVersionId: "version-1", status, attempt: 1, compiledPlanHash: "a".repeat(64), createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }; }
