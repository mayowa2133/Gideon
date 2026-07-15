import { describe, expect, it } from "vitest";
import { createPostRunCoverageHook } from "./postRunCoverage";

describe("post-run coverage hook", () => {
  it("persists honest per-dimension coverage after verified capture", async () => {
    let saved: unknown;
    const flow = { schemaVersion: "1" as const, id: "flow-1", revision: 1, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Report", goal: "Show report", startingState: { entryPath: "/" }, steps: [], finalAssertions: [], approval: { status: "approved" as const, approvedBy: "user-1", approvedAt: "2026-07-14T09:00:00.000Z", approvedRevision: 1 }, sourceEvidenceIds: ["goal:reporting"] };
    const persona = { id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", key: "admin", displayName: "Admin", roleDescription: "Admin", status: "active" as const, revision: 1, createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T09:00:00.000Z" };
    const hook = createPostRunCoverageHook({ repository: { async listProjectFlows() { return [flow]; }, async listProjectPersonas() { return [persona]; } }, coverage: { async latest() { return null; }, async persist(input) { saved = input.snapshot; return input.snapshot; } }, makeId: () => "coverage-1", now: () => "2026-07-14T10:00:00.000Z" });
    await hook({ workspaceId: "workspace-1", projectId: "project-1", captureRun: { id: "capture-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "job-1", status: "completed", flowRevisionIds: ["flow-1:revision:1"], compiledPlanHashes: ["a".repeat(64)], policyFingerprint: "b".repeat(64), idempotencyKey: "capture-key-1", requestHash: "c".repeat(64), estimatedBrowserSeconds: 20, createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }, executions: [{ id: "execution-1", workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", flowId: "flow-1", flowRevision: 1, environmentVersionId: "version-1", status: "verified", attempt: 1, compiledPlanHash: "a".repeat(64), createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }] });
    expect(saved).toMatchObject({ id: "coverage-1" });
    expect((saved as { dimensions: unknown[] }).dimensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "goal", coveredIds: ["goal:reporting"] }),
      expect.objectContaining({ key: "approved_flow", coveredIds: ["flow-1"] }),
      expect.objectContaining({ key: "persona", coveredIds: ["persona-1"] })
    ]));
  });
});
