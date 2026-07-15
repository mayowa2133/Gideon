import { describe, expect, it } from "vitest";
import type { CaptureRun } from "../shared/productFlowCapture";
import { createCaptureRunControlService } from "./captureRunService";

describe("capture run control service", () => {
  it("scopes reads and cooperative cancellation to the project workspace", async () => {
    const run = fixture();
    const canceled: string[] = [];
    const service = createCaptureRunControlService({ repository: { async getCaptureRun() { return run; }, async upsertCaptureRun(next) { Object.assign(run, next); return run; }, async listCaptureRunExecutions() { return []; } }, cancelQueuedJob: async (id) => { canceled.push(id); return true; }, now: () => "2026-07-14T11:00:00.000Z" });
    await expect(service.get({ workspaceId: "workspace-1", projectId: "other", captureRunId: "run-1" })).rejects.toThrow("not found");
    const result = await service.cancel({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1" });
    expect(result).toMatchObject({ status: "canceled", updatedAt: "2026-07-14T11:00:00.000Z" });
    expect(canceled).toEqual(["job-1"]);
    await expect(service.isCancellationRequested({ workspaceId: "workspace-1", captureRunId: "run-1" })).resolves.toBe(true);
  });
});

function fixture(): CaptureRun { return { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "job-1", status: "recording", flowRevisionIds: ["flow-1:revision:2"], compiledPlanHashes: ["a".repeat(64)], policyFingerprint: "b".repeat(64), idempotencyKey: "capture-key-1", requestHash: "c".repeat(64), estimatedBrowserSeconds: 48, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }; }
