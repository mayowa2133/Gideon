import { describe, expect, it } from "vitest";
import { createCaptureProjectDeletionService } from "./captureDeletion";

describe("capture project deletion", () => {
  it("deletes scoped rows, destroys unique secret references, and reports retryable cleanup failures", async () => {
    const deleted: string[] = [];
    const pending: unknown[] = [];
    const taskStates: string[] = [];
    const service = createCaptureProjectDeletionService({ repository: { async revokeAndDeleteProjectCaptureData(input) { expect(input).toMatchObject({ workspaceId: "workspace-1", projectId: "project-1" }); return { cleanupTasks: [{ id: "task-1", kind: "secret", reference: "vault/a" }, { id: "task-2", kind: "secret", reference: "vault/fail" }, { id: "task-3", kind: "object", provider: "s3", reference: "workspaces/workspace-1/projects/project-1/render/a.mp4" }, { id: "task-4", kind: "object", provider: "s3", reference: "workspaces/workspace-1/projects/project-1/render/fail.mp4" }], deletedRows: 12 }; }, async markCleanupTask(input) { taskStates.push(`${input.taskId}:${input.status}`); } }, secrets: { async delete(reference) { if (reference === "vault/fail") throw new Error("provider unavailable"); deleted.push(reference); } }, objects: { async delete(reference) { if (reference.storageKey.endsWith("fail.mp4")) throw new Error("storage unavailable"); deleted.push(reference.storageKey); } }, onCleanupFailure(input) { pending.push(input); }, now: () => "2026-07-14T10:00:00.000Z" });
    const result = await service.delete({ workspaceId: "workspace-1", projectId: "project-1" });
    expect(result).toMatchObject({ schemaVersion: "1", deletedRows: 12, deletedSecrets: 1, deletedObjects: 1, cleanupFailures: [{ kind: "secret", referenceHash: expect.stringMatching(/^[a-f0-9]{64}$/) }, { kind: "object", referenceHash: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    expect(JSON.stringify(result)).not.toContain("vault/fail");
    expect(JSON.stringify(result)).not.toContain("fail.mp4");
    expect(deleted).toEqual(expect.arrayContaining(["vault/a", "workspaces/workspace-1/projects/project-1/render/a.mp4"]));
    expect(pending).toHaveLength(2);
    expect(taskStates).toEqual(["task-1:completed", "task-2:failed", "task-3:completed", "task-4:failed"]);
  });
});
