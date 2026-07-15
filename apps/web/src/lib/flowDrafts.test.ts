import { describe, expect, it } from "vitest";
import type { ProductFlowDto } from "./captureApi";
import { mergeFlowDrafts } from "./flowDrafts";

describe("flow draft merging", () => {
  it("creates one bounded unapproved revision with unique step IDs and combined evidence", () => {
    const merged = mergeFlowDrafts([flow("flow-1", "Create campaign"), flow("flow-2", "Review results")], "merged-1");
    expect(merged).toMatchObject({ id: "merged-1", revision: 1, title: "Create campaign + Review results", approval: { status: "draft" } });
    expect(merged.steps.map((step) => step.id)).toEqual(["merge-1-1", "merge-2-1"]);
    expect(merged.sourceEvidenceIds).toEqual(["shared", "flow-1", "flow-2"]);
  });

  it("rejects cross-persona merges", () => {
    const second = flow("flow-2", "Review results");
    second.personaId = "persona-2";
    expect(() => mergeFlowDrafts([flow("flow-1", "Create campaign"), second], "merged-1")).toThrow(/share a project/);
  });
});

function flow(id: string, title: string): ProductFlowDto {
  return { schemaVersion: "1", id, revision: 1, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title, goal: `${title} safely`, startingState: { entryPath: "/app" }, steps: [{ id: `${id}-step`, intent: title, riskClass: "navigate", action: { type: "click", locator: { kind: "role", role: "button", name: title } } }], finalAssertions: [{ type: "visible" }], approval: { status: "draft" }, sourceEvidenceIds: ["shared", id] };
}
