import { describe, expect, it } from "vitest";
import { createCaptureProjectDeletionService } from "./captureDeletion";

describe("capture project deletion", () => {
  it("deletes scoped rows, destroys unique secret references, and reports retryable cleanup failures", async () => {
    const deleted: string[] = [];
    const service = createCaptureProjectDeletionService({ repository: { async revokeAndDeleteProjectCaptureData(input) { expect(input).toMatchObject({ workspaceId: "workspace-1", projectId: "project-1" }); return { vaultReferences: ["vault/a", "vault/a", "vault/fail"], deletedRows: 12 }; } }, secrets: { async delete(reference) { if (reference === "vault/fail") throw new Error("provider unavailable"); deleted.push(reference); } }, now: () => "2026-07-14T10:00:00.000Z" });
    await expect(service.delete({ workspaceId: "workspace-1", projectId: "project-1" })).resolves.toEqual({ deletedRows: 12, deletedSecrets: 1, secretCleanupFailures: ["vault/fail"] });
    expect(deleted).toEqual(["vault/a"]);
  });
});
