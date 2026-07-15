import { describe, expect, it } from "vitest";
import { evaluateDiscoveryProvider } from "./captureEvaluation";
import { createDiscoveryEvidenceBundle } from "./flowDiscovery";

describe("discovery provider evaluation", () => {
  it("gates provider rollout on recall and invalid-output thresholds", async () => {
    const bundle = createDiscoveryEvidenceBundle({ environmentVersionId: "version-1", projectId: "project-1", goals: [{ id: "goal-1", text: "Open projects", priority: 100 }], personas: [{ id: "persona-1", key: "founder", displayName: "Founder", roleDescription: "Founder role" }], renderedPages: [], allowedRisks: ["observe", "navigate"], maxCandidates: 10 });
    const provider = { provider: "test", model: "test-model", async propose() { return [{ schemaVersion: "1", id: "flow-1", revision: 1, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Projects", goal: "Open projects.", startingState: { entryPath: "/" }, steps: [{ id: "step-1", intent: "Open projects.", action: { type: "navigate", path: "/projects" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/projects" }], approval: { status: "draft" }, sourceEvidenceIds: ["goal-1"] }]; } };
    const report = await evaluateDiscoveryProvider({ provider, promptVersion: "v1", cases: [{ id: "case-1", bundle, expectedPaths: ["/projects"] }] });
    expect(report).toMatchObject({ passed: true, expectedPathRecall: 1, invalidOutputCount: 0, provider: "test" });
  });
});
