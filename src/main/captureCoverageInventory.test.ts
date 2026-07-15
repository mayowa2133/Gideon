import { describe, expect, it } from "vitest";
import type { CapturePersona, CoverageSnapshot, ProductFlowRevision } from "../shared/productFlowCapture";
import { assessCoverageFreshness, compileCaptureCoverageInventory, createCoverageRevisionBasis } from "./captureCoverageInventory";

describe("capture coverage inventory", () => {
  it("merges bounded evidence with explicit exclusions and blockers", () => {
    const inventory = compileCaptureCoverageInventory({ revision: 3, dimensions: [
      { key: "route", trustworthyDenominator: true, sources: [
        { kind: "repository_routes", revision: "repo-a", ids: ["/", "/projects"] },
        { kind: "rendered_navigation", revision: "render-a", ids: ["/projects"] },
        { kind: "imported_tests", revision: "tests-a", ids: ["/projects/:id"] }
      ], excluded: [{ id: "/internal", reason: "Not user-facing." }], blocked: [{ id: "/billing", code: "financial_action_denied" }] },
      { key: "feature_flag", trustworthyDenominator: false, sources: [{ kind: "declared_feature_flags", revision: "repo-a", ids: ["new-dashboard"] }] }
    ], now: () => "2026-07-15T12:00:00.000Z" });
    expect(inventory.dimensions.find((item) => item.key === "route")).toMatchObject({
      denominatorStatus: "known",
      knownIds: ["/", "/billing", "/internal", "/projects", "/projects/:id"],
      excluded: [{ id: "/internal", reason: "Not user-facing." }],
      blocked: [{ id: "/billing", code: "financial_action_denied" }]
    });
    expect(inventory.dimensions.find((item) => item.key === "feature_flag")).toMatchObject({ denominatorStatus: "unknown", knownIds: ["new-dashboard"] });
    expect(inventory.dimensions.find((item) => item.key === "usage_sequence")).toMatchObject({ denominatorStatus: "unknown", knownIds: [] });
    expect(inventory.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps semantic hashes stable across generation time and rejects ambiguous input", () => {
    const input = { revision: 1, dimensions: [{ key: "route" as const, trustworthyDenominator: true, sources: [{ kind: "manifest_declared" as const, revision: "routes-v1", ids: ["/"] }] }] };
    const first = compileCaptureCoverageInventory({ ...input, now: () => "2026-07-15T12:00:00.000Z" });
    const second = compileCaptureCoverageInventory({ ...input, now: () => "2026-07-16T12:00:00.000Z" });
    expect(first.inventoryHash).toBe(second.inventoryHash);
    expect(() => compileCaptureCoverageInventory({ revision: 1, dimensions: [...input.dimensions, ...input.dimensions] })).toThrow("identity");
    expect(() => compileCaptureCoverageInventory({ revision: 1, dimensions: [{ ...input.dimensions[0]!, sources: [{ kind: "manifest_declared", revision: "routes-v1", ids: ["/", "/"] }] }] })).toThrow("duplicate IDs");
  });

  it("marks every revision-bound source of drift explicitly", () => {
    const inventory = compileCaptureCoverageInventory({ revision: 1, dimensions: [{ key: "persona", trustworthyDenominator: true, sources: [{ kind: "requested_personas", revision: "persona-v1", ids: ["persona-1"] }] }] });
    const basis = createCoverageRevisionBasis({ inventory, environmentVersionId: "environment-v1", policyFingerprint: "policy-v1", fixtureRevision: "fixture-v1", personas: [persona()], flows: [flow()] });
    const snapshot = { schemaVersion: "1", id: "coverage-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "environment-v1", calculationVersion: "capture-coverage-v2", basis, dimensions: [], createdAt: "2026-07-15T12:00:00.000Z" } satisfies CoverageSnapshot;
    expect(assessCoverageFreshness(snapshot, basis, () => "2026-07-15T12:01:00.000Z")).toMatchObject({ status: "current", reasons: [] });
    expect(assessCoverageFreshness(snapshot, { ...basis, inventoryHash: "b".repeat(64), environmentVersionId: "environment-v2", policyFingerprint: "policy-v2", fixtureRevision: "fixture-v2", personaRevisionHash: "c".repeat(64), flowRevisionHash: "d".repeat(64) })).toMatchObject({ status: "stale", reasons: ["inventory", "environment", "policy", "fixture", "persona", "flow"] });
    expect(assessCoverageFreshness({ ...snapshot, basis: undefined }, null)).toMatchObject({ status: "unknown", reasons: ["legacy_snapshot"] });
  });
});

function persona(): CapturePersona { return { id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", key: "admin", displayName: "Admin", roleDescription: "Synthetic admin", status: "active", revision: 1, createdAt: "2026-07-15T10:00:00.000Z", updatedAt: "2026-07-15T10:00:00.000Z" }; }
function flow(): ProductFlowRevision { return { schemaVersion: "1", id: "flow-1", revision: 1, projectId: "project-1", environmentVersionId: "environment-v1", personaId: "persona-1", title: "Projects", goal: "Review projects.", startingState: { entryPath: "/" }, steps: [], finalAssertions: [], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-15T10:00:00.000Z", approvedRevision: 1 }, sourceEvidenceIds: ["goal:projects"] }; }
