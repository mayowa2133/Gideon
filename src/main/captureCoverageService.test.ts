import { describe, expect, it } from "vitest";
import type { CoverageRevisionBasis, CoverageSnapshot } from "../shared/productFlowCapture";
import { createCaptureCoverageService } from "./captureCoverageService";

describe("capture coverage service", () => {
  it("rejects a repository result outside the requested workspace/project", async () => {
    const snapshot = fixture();
    const service = createCaptureCoverageService({ async getLatestCoverageSnapshot() { return { ...snapshot, workspaceId: "other" }; }, async upsertCoverageSnapshot(value) { return value; } });
    await expect(service.latest({ workspaceId: "workspace-1", projectId: "project-1" })).rejects.toThrow("not found");
  });

  it("re-evaluates freshness against the current revision basis", async () => {
    const snapshot = { ...fixture(), calculationVersion: "capture-coverage-v2", basis: basis() };
    let current = basis();
    const service = createCaptureCoverageService({ async getLatestCoverageSnapshot() { return snapshot; }, async upsertCoverageSnapshot(value) { return value; } }, { revisionSource: { async getCurrentCoverageBasis() { return current; } }, now: () => "2026-07-15T12:00:00.000Z" });
    await expect(service.latest({ workspaceId: "workspace-1", projectId: "project-1" })).resolves.toMatchObject({ freshness: { status: "current", reasons: [] } });
    current = { ...current, fixtureRevision: "fixture-v2", flowRevisionHash: "f".repeat(64) };
    await expect(service.latest({ workspaceId: "workspace-1", projectId: "project-1" })).resolves.toMatchObject({ freshness: { status: "stale", reasons: ["fixture", "flow"] } });
  });
});

function fixture(): CoverageSnapshot { return { schemaVersion: "1", id: "coverage-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", calculationVersion: "capture-coverage-v1", dimensions: [], createdAt: "2026-07-14T10:00:00.000Z" }; }
function basis(): CoverageRevisionBasis { return { schemaVersion: "1", inventoryVersion: "capture-coverage-inventory-v1", inventoryRevision: 1, inventoryHash: "a".repeat(64), environmentVersionId: "version-1", policyFingerprint: "policy-v1", fixtureRevision: "fixture-v1", personaRevisionHash: "b".repeat(64), flowRevisionHash: "c".repeat(64) }; }
