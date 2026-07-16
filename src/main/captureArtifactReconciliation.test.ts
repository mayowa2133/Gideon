import { describe, expect, it } from "vitest";
import { executeCaptureArtifactRetention, planCaptureArtifactReconciliation } from "./captureArtifactReconciliation";

describe("capture artifact reconciliation", () => {
  it("plans bounded retention and reports missing/orphan evidence without exposing object keys", async () => {
    const prefix = "workspaces/workspace-1/projects/project-1/";
    const plan = planCaptureArtifactReconciliation({ workspaceId: "workspace-1", projectId: "project-1", retentionDays: 30, now: new Date("2026-07-16T00:00:00.000Z"), databaseArtifacts: [{ id: "old", workspaceId: "workspace-1", projectId: "project-1", storageKey: `${prefix}render/old.mp4`, createdAt: "2026-05-01T00:00:00.000Z" }, { id: "missing", workspaceId: "workspace-1", projectId: "project-1", storageKey: `${prefix}render/missing.mp4`, createdAt: "2026-07-15T00:00:00.000Z" }], objectKeys: [`${prefix}render/old.mp4`, `${prefix}render/orphan.mp4`] });
    expect(plan.receipt).toMatchObject({ databaseArtifacts: 2, objects: 2, expired: 1, missingObjects: 1, orphanObjects: 1, evidenceHashes: [expect.stringMatching(/^[a-f0-9]{64}$/), expect.stringMatching(/^[a-f0-9]{64}$/)] });
    expect(JSON.stringify(plan.receipt)).not.toContain("old.mp4");
    const deleted: string[] = [];
    await expect(executeCaptureArtifactRetention({ plan, objects: { async delete(input) { deleted.push(input.storageKey); } }, repository: { async deleteArtifact(input) { deleted.push(input.artifactId); } } })).resolves.toEqual({ schemaVersion: "1", deleted: 1, failures: [] });
    expect(deleted).toEqual([`${prefix}render/old.mp4`, "old"]);
  });

  it("keeps database lineage when object deletion fails and respects legal hold", async () => {
    const artifact = { id: "old", workspaceId: "workspace-1", projectId: "project-1", storageKey: "workspaces/workspace-1/projects/project-1/render/old.mp4", createdAt: "2026-05-01T00:00:00.000Z" };
    const plan = planCaptureArtifactReconciliation({ workspaceId: "workspace-1", projectId: "project-1", retentionDays: 30, now: new Date("2026-07-16T00:00:00.000Z"), databaseArtifacts: [artifact], objectKeys: [artifact.storageKey] });
    let databaseDeletes = 0;
    const receipt = await executeCaptureArtifactRetention({ plan, objects: { async delete() { throw new Error("storage unavailable"); } }, repository: { async deleteArtifact() { databaseDeletes += 1; } } });
    expect(receipt).toMatchObject({ deleted: 0, failures: [{ artifactId: "old", referenceHash: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    expect(databaseDeletes).toBe(0);
    expect(planCaptureArtifactReconciliation({ workspaceId: "workspace-1", projectId: "project-1", retentionDays: 30, legalHold: true, now: new Date("2026-07-16T00:00:00.000Z"), databaseArtifacts: [artifact], objectKeys: [artifact.storageKey] }).expired).toEqual([]);
  });

  it("rejects cross-workspace and traversal inventories", () => {
    expect(() => planCaptureArtifactReconciliation({ workspaceId: "workspace-1", projectId: "project-1", retentionDays: 30, databaseArtifacts: [{ id: "bad", workspaceId: "workspace-2", projectId: "project-1", storageKey: "workspaces/workspace-2/projects/project-1/a", createdAt: "2026-01-01T00:00:00.000Z" }], objectKeys: [] })).toThrow("authorized scope");
    expect(() => planCaptureArtifactReconciliation({ workspaceId: "workspace-1", projectId: "project-1", retentionDays: 30, databaseArtifacts: [], objectKeys: ["workspaces/workspace-1/projects/project-1/../private"] })).toThrow("authorized scope");
  });
});
