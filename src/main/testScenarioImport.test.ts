import { describe, expect, it } from "vitest";
import { importTestScenarioFlows } from "./testScenarioImport";

describe("existing browser test import", () => {
  it("imports supported declarative scenarios as unapproved flow revisions", () => {
    const [flow] = importTestScenarioFlows({ projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", makeId: () => "flow-1", scenarios: [{ id: "test-1", framework: "playwright", title: "opens projects", entryPath: "/", sourcePath: "tests/projects.spec.ts", steps: [{ intent: "Open projects.", action: { type: "navigate", path: "/projects" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/projects" }] }] });
    expect(flow).toMatchObject({ id: "flow-1", approval: { status: "draft" }, sourceEvidenceIds: ["playwright:tests/projects.spec.ts:test-1"] });
  });

  it("rejects executable or unknown imported fields", () => {
    expect(() => importTestScenarioFlows({ projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", scenarios: [{ id: "test-1", framework: "playwright", title: "unsafe", entryPath: "/", sourcePath: "test.ts", evaluate: "process.env", steps: [], finalAssertions: [] }] })).toThrow("evaluate is not supported");
  });
});
