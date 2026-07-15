import { describe, expect, it } from "vitest";
import type { CapturePersona, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import { calculateCaptureCoverage } from "./captureCoverage";

describe("capture coverage", () => {
  it("reports verified approved flows while preserving unknown denominators", () => {
    const snapshot = calculateCaptureCoverage({
      workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1",
      goals: [{ id: "goal-1", flowIds: ["flow-1"] }], approvedFlows: [flow()], personas: [persona()], executions: [execution()],
      visitedRouteIds: ["/projects"], observedStateIds: ["state-projects"], coveredUsageSequenceIds: [], coveredFeatureFlagIds: [],
      knownOutcomeIds: ["projects-visible", "export-created"], verifiedOutcomeIds: ["projects-visible"], coveredFailureStateIds: []
    }, { makeId: () => "coverage-1", now: () => "2026-07-14T12:00:00.000Z" });
    expect(snapshot.dimensions.find((item) => item.key === "approved_flow")).toMatchObject({ denominator: 1, coveredIds: ["flow-1"], uncoveredIds: [] });
    expect(snapshot.dimensions.find((item) => item.key === "route")).toMatchObject({ denominator: "unknown", coveredIds: ["/projects"], uncoveredIds: [] });
    expect(snapshot.dimensions.find((item) => item.key === "outcome")).toMatchObject({ denominator: 2, uncoveredIds: ["export-created"] });
  });

  it("does not count stale or failed flow executions", () => {
    const stale = { ...execution(), flowRevision: 1, status: "verified" as const };
    const failed = { ...execution(), id: "execution-2", status: "failed" as const };
    const snapshot = calculateCaptureCoverage({ workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", goals: [{ id: "goal-1", flowIds: ["flow-1"] }], approvedFlows: [flow()], personas: [persona()], executions: [stale, failed], visitedRouteIds: [], observedStateIds: [], coveredUsageSequenceIds: [], coveredFeatureFlagIds: [], verifiedOutcomeIds: [], coveredFailureStateIds: [] });
    expect(snapshot.dimensions.find((item) => item.key === "approved_flow")?.uncoveredIds).toEqual(["flow-1"]);
  });
});

function flow(): ProductFlowRevision { return { schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Projects", goal: "Show projects.", startingState: { entryPath: "/" }, steps: [{ id: "navigate", intent: "Open projects.", action: { type: "navigate", path: "/projects" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/projects" }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["goal-1"] }; }
function persona(): CapturePersona { return { id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", key: "founder", displayName: "Founder", roleDescription: "Workspace founder", status: "active", revision: 1, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }; }
function execution(): FlowExecutionRecord { return { id: "execution-1", workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1", flowId: "flow-1", flowRevision: 2, environmentVersionId: "version-1", status: "verified", attempt: 1, compiledPlanHash: "a".repeat(64), createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:01:00.000Z" }; }
