import { describe, expect, it } from "vitest";
import type { CoverageSnapshot } from "../shared/productFlowCapture";
import { createCaptureCoverageService } from "./captureCoverageService";

describe("capture coverage service", () => {
  it("rejects a repository result outside the requested workspace/project", async () => {
    const snapshot = fixture();
    const service = createCaptureCoverageService({ async getLatestCoverageSnapshot() { return { ...snapshot, workspaceId: "other" }; }, async upsertCoverageSnapshot(value) { return value; } });
    await expect(service.latest({ workspaceId: "workspace-1", projectId: "project-1" })).rejects.toThrow("not found");
  });
});

function fixture(): CoverageSnapshot { return { schemaVersion: "1", id: "coverage-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", calculationVersion: "capture-coverage-v1", dimensions: [], createdAt: "2026-07-14T10:00:00.000Z" }; }
