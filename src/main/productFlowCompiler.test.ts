import { describe, expect, it } from "vitest";
import { compileProductFlow, verifyCompiledFlowPlan } from "./productFlowCompiler";
import type { BrowserExecutionPolicy, ProductFlowRevision } from "../shared/productFlowCapture";

const flow: ProductFlowRevision = {
  schemaVersion: "1",
  id: "flow-1",
  revision: 1,
  projectId: "project-1",
  environmentVersionId: "environment-version-1",
  personaId: "persona-1",
  title: "Create a project",
  goal: "Create a project and verify its success state.",
  startingState: { entryPath: "/app" },
  steps: [
    {
      id: "step-1",
      intent: "Start project creation.",
      action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } },
      expectedState: [{ type: "url", path: "/projects/new" }],
      riskClass: "navigate"
    },
    {
      id: "step-2",
      intent: "Enter synthetic data.",
      action: { type: "fill", target: { strategy: "label", value: "Name" }, valueRef: "fixture:project_name" },
      riskClass: "synthetic_write"
    }
  ],
  finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Project created" } }],
  approval: {
    status: "approved",
    approvedBy: "user-1",
    approvedAt: "2026-07-14T10:00:00.000Z",
    approvedRevision: 1
  },
  sourceEvidenceIds: ["user-goal:1"]
};

const policy: BrowserExecutionPolicy = {
  baseUrl: "https://demo.example.com",
  allowedDomains: ["demo.example.com"],
  allowedRisks: ["observe", "navigate", "synthetic_write"],
  allowedKeys: ["Enter", "Escape", "Tab"],
  allowHttpLocalhost: false,
  allowSubdomains: false,
  allowCredentialInjectionFromLoginAdapter: false,
  maxSteps: 10
};

describe("product flow compiler", () => {
  it("compiles an approved flow into a deterministic immutable manifest", () => {
    const first = compileProductFlow(flow, policy);
    const second = compileProductFlow(structuredClone(flow), {
      ...policy,
      allowedKeys: ["Tab", "Escape", "Enter"],
      allowedRisks: ["synthetic_write", "navigate", "observe"]
    });
    expect(first.compiledPlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.compiledPlanHash).toBe(first.compiledPlanHash);
    expect(() => verifyCompiledFlowPlan(first)).not.toThrow();
  });

  it("detects compiled plan mutation", () => {
    const plan = compileProductFlow(flow, policy);
    plan.steps[0]!.intent = "Mutated after approval";
    expect(() => verifyCompiledFlowPlan(plan)).toThrow("hash does not match");
  });

  it("rejects draft flows, step-budget excess, and blocked actions", () => {
    const draft = structuredClone(flow);
    draft.approval = { status: "draft" };
    expect(() => compileProductFlow(draft, policy)).toThrow("Only the current approved flow revision");
    expect(() => compileProductFlow(flow, { ...policy, maxSteps: 1 })).toThrow("policy allows 1");

    const destructive = structuredClone(flow);
    destructive.steps[0] = {
      id: "step-1",
      intent: "Delete workspace.",
      action: { type: "click", target: { strategy: "role", role: "button", value: "Delete workspace" } },
      riskClass: "destructive"
    };
    expect(() => compileProductFlow(destructive, policy)).toThrow("Step step-1 blocked: risk_not_allowed");
  });

  it("rejects a starting URL outside the environment policy", () => {
    const external = structuredClone(flow);
    external.startingState.entryPath = "https://evil.example";
    expect(() => compileProductFlow(external, policy)).toThrow("Starting state blocked: domain_not_allowed");
  });
});
