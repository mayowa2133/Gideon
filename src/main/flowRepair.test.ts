import { describe, expect, it } from "vitest";
import type { ProductFlowRevision } from "../shared/productFlowCapture";
import { proposeBoundedFlowRepair } from "./flowRepair";

describe("bounded flow repair", () => {
  it("creates a new draft revision for human approval without changing intent or action type", async () => {
    const original = flow();
    const result = await proposeBoundedFlowRepair({ flow: original, failedStepIds: ["step-1"], visibleControls: [{ role: "button", name: "Create project" }], currentPath: "/projects", provider: { provider: "test", model: "test-model", async propose() { return [{ stepId: "step-1", replacementLocator: { strategy: "role", role: "button", value: "Create project" }, evidenceIds: ["screenshot:1"], rationale: "Label changed." }]; } } });
    expect(result.repairedDraft).toMatchObject({ revision: 3, approval: { status: "draft" }, steps: [{ action: { type: "click", target: { value: "Create project" } } }] });
    expect(original.steps[0]?.action).toMatchObject({ type: "click", target: { value: "New project" } });
  });

  it("rejects arbitrary provider fields and repairs to non-failed steps", async () => {
    await expect(proposeBoundedFlowRepair({ flow: flow(), failedStepIds: ["step-1"], visibleControls: [], currentPath: "/", provider: { provider: "test", model: "test", async propose() { return [{ stepId: "step-1", shell: "rm -rf", evidenceIds: [], rationale: "bad", replacementLocator: { strategy: "text", value: "x" } }]; } } })).rejects.toThrow("shell is not allowed");
  });
});

function flow(): ProductFlowRevision { return { schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Create project", goal: "Create a project.", startingState: { entryPath: "/projects" }, steps: [{ id: "step-1", intent: "Open project creation.", action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } }, riskClass: "navigate" }], finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Create project" } }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["goal-1"] }; }
