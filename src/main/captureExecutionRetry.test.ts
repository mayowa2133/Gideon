import { describe, expect, it } from "vitest";
import { createJob } from "../shared/jobState";
import type { CaptureRun } from "../shared/productFlowCapture";
import { createCaptureExecutionRetryService } from "./captureExecutionRetry";

describe("capture execution retry", () => {
  it("creates a one-flow capture run through the normal idempotent coordinator", async () => {
    const calls: unknown[] = [];
    const run: CaptureRun = { id: "run-2", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "job-2", status: "queued", flowRevisionIds: ["flow-1:revision:2"], compiledPlanHashes: ["a".repeat(64)], policyFingerprint: "b".repeat(64), idempotencyKey: "retry-key-1", requestHash: "c".repeat(64), estimatedBrowserSeconds: 48, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" };
    const service = createCaptureExecutionRetryService({ repository: { async getFlowExecution() { return { id: "execution-1", workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1", flowId: "flow-1", flowRevision: 2, environmentVersionId: "version-1", status: "failed", attempt: 1, compiledPlanHash: "a".repeat(64), createdAt: run.createdAt, updatedAt: run.updatedAt }; }, async getEnvironmentVersion() { return { id: "version-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", revision: 1, applicationFingerprint: "a".repeat(64), browserPolicyFingerprint: "b".repeat(64), validatedAt: run.createdAt, createdAt: run.createdAt }; } }, coordinator: { async create(input) { calls.push(input); return { captureRun: run, job: createJob({ id: "job-2", projectId: "project-1", kind: "flow_capture", now: run.createdAt }), reused: false }; } } });
    await service.retry({ workspaceId: "workspace-1", projectId: "project-1", executionId: "execution-1", idempotencyKey: "retry-key-1" });
    expect(calls).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", flowIds: ["flow-1"], idempotencyKey: "retry-key-1" }]);
  });
});
