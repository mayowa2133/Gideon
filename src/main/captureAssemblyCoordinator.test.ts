import { describe, expect, it } from "vitest";
import type { CaptureAssemblyCoordinatorRepository } from "./captureAssemblyCoordinator";
import { createCaptureAssemblyCoordinator } from "./captureAssemblyCoordinator";

describe("capture assembly coordinator", () => {
  it("queues an ordered selection of verified clips with only opaque IDs", async () => {
    const persisted: unknown[] = []; const queued: unknown[] = [];
    const repository = fixture(persisted);
    const coordinator = createCaptureAssemblyCoordinator({ repository, queue: { async enqueue(input) { queued.push(input); } }, makeId: () => "assembly-job-1", now: () => "2026-07-14T10:00:00.000Z" });
    const result = await coordinator.create({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", executionIds: ["execution-2", "execution-1"], actorUserId: "user-1", idempotencyKey: "assembly-key-1" });
    expect(result).toMatchObject({ reused: false, job: { id: "assembly-job-1", kind: "capture_assembly" } });
    expect(persisted[0]).toMatchObject({ executionIds: ["execution-2", "execution-1"] });
    expect(queued).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "assembly-job-1" }]);
  });
});

function fixture(persisted: unknown[]): CaptureAssemblyCoordinatorRepository {
  const now = "2026-07-14T09:00:00.000Z";
  return { async getCaptureRun() { return { id: "capture-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "capture-job-1", status: "completed", flowRevisionIds: [], compiledPlanHashes: [], policyFingerprint: "a".repeat(64), idempotencyKey: "capture-key-1", requestHash: "b".repeat(64), estimatedBrowserSeconds: 20, createdAt: now, updatedAt: now }; }, async listCaptureRunExecutions() { return ["execution-1", "execution-2"].map((id) => ({ id, workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", flowId: id, flowRevision: 1, environmentVersionId: "version-1", status: "verified" as const, attempt: 1, compiledPlanHash: "a".repeat(64), normalizedClipArtifactId: `artifact-${id}`, createdAt: now, updatedAt: now })); }, async getIdempotentAssembly() { return null; }, async persistAssemblyJob(input) { persisted.push(input); } };
}
