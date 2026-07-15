import { describe, expect, it } from "vitest";
import { createFlowExecutionReceipt } from "../shared/productFlowCapture";
import { createIsolatedCaptureRuntime, type IsolatedCaptureManifest } from "./isolatedCaptureRuntime";
import { compileProductFlow } from "./productFlowCompiler";
import { browserPolicyForEnvironment } from "./captureService";

describe("isolated capture runtime boundary", () => {
  it("sends a hashed declarative manifest with no secret callbacks", async () => {
    let manifest: IsolatedCaptureManifest | undefined;
    const plan = compiledPlan();
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", async execute(input) { manifest = input; return { receipt: receipt(plan), networkReceipts: [] }; } });
    await runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { project_name: "Demo" }, outputDir: "/ignored", recordVideo: false });
    expect(manifest).toMatchObject({ schemaVersion: "1", outputHandle: "capture-output:execution-1", manifestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(manifest)).not.toContain("useCredential");
  });

  it("rejects credential-like fixture keys before remote execution", async () => {
    const plan = compiledPlan();
    const runtime = createIsolatedCaptureRuntime({ isolation: "microvm", async execute() { throw new Error("must not call"); } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { password: "bad" }, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("credential-like");
  });
});

function policy() { return browserPolicyForEnvironment({ id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "staging", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: "version-1", createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }); }
function compiledPlan() { return compileProductFlow({ schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Projects", goal: "Open projects.", startingState: { entryPath: "/" }, steps: [{ id: "step-1", intent: "Open projects.", action: { type: "navigate", path: "/projects" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/projects" }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["goal-1"] }, policy()); }
function receipt(plan: ReturnType<typeof compiledPlan>) { return createFlowExecutionReceipt({ id: "receipt-1", workspaceId: "workspace-1", projectId: "project-1", flowId: plan.flowId, flowRevision: plan.flowRevision, environmentVersionId: plan.environmentVersionId, compiledPlanHash: plan.compiledPlanHash, steps: [{ stepId: "step-1", status: "succeeded", policyDecision: plan.steps[0]!.policyDecision, assertions: [], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z" }], finalAssertions: [{ assertion: { type: "url", path: "/projects" }, passed: true, safeMessage: "passed" }], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z" }); }
