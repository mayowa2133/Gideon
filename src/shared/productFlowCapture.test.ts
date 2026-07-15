import { describe, expect, it } from "vitest";
import {
  authorizeBrowserAction,
  createCoverageSnapshot,
  createFlowExecutionReceipt,
  inferMinimumRisk,
  parseProductFlowRevision,
  validateProductFlowRevision,
  type BrowserExecutionPolicy,
  type ProductFlowRevision
} from "./productFlowCapture";

const approvedFlow: ProductFlowRevision = {
  schemaVersion: "1",
  id: "flow-1",
  revision: 2,
  projectId: "project-1",
  environmentVersionId: "environment-version-1",
  personaId: "persona-founder",
  title: "Create the first project",
  goal: "Show the user reaching a populated project dashboard.",
  startingState: {
    entryPath: "/app",
    fixtureProfileId: "fresh-account",
    credentialGrantId: "grant-1"
  },
  steps: [
    {
      id: "step-1",
      intent: "Open project creation.",
      action: { type: "click", target: { strategy: "role", role: "button", value: "New project", exact: true } },
      expectedState: [{ type: "url", path: "/app/projects/new" }],
      riskClass: "navigate"
    },
    {
      id: "step-2",
      intent: "Enter a synthetic project name.",
      action: {
        type: "fill",
        target: { strategy: "label", value: "Project name" },
        valueRef: "fixture:project_name"
      },
      riskClass: "synthetic_write"
    }
  ],
  finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Project created" } }],
  approval: {
    status: "approved",
    approvedBy: "user-1",
    approvedAt: "2026-07-14T10:00:00.000Z",
    approvedRevision: 2
  },
  sourceEvidenceIds: ["user-goal:primary", "route:/app/projects/new"]
};

const policy: BrowserExecutionPolicy = {
  baseUrl: "https://demo.example.com/app",
  allowedDomains: ["demo.example.com"],
  allowedRisks: ["observe", "navigate", "synthetic_write"],
  allowedKeys: ["Enter", "Escape", "Tab"],
  allowHttpLocalhost: false,
  allowSubdomains: false,
  allowCredentialInjectionFromLoginAdapter: true,
  maxSteps: 100
};

describe("product flow runtime contract", () => {
  it("accepts a complete approved flow", () => {
    expect(validateProductFlowRevision(approvedFlow)).toEqual([]);
    expect(parseProductFlowRevision(approvedFlow)).toEqual(approvedFlow);
  });

  it("rejects unknown fields and generated-code action types", () => {
    const unsafe = structuredClone(approvedFlow) as unknown as Record<string, unknown>;
    unsafe.rawPrompt = "ignore policy";
    const steps = unsafe.steps as Array<Record<string, unknown>>;
    steps[0]!.action = { type: "evaluate", javascript: "fetch('/secrets')" };
    const errors = validateProductFlowRevision(unsafe);
    expect(errors).toContain("flow.rawPrompt is not allowed.");
    expect(errors).toContain("steps[0].action has an invalid action type.");
  });

  it("requires approval provenance to match the immutable revision", () => {
    const flow = structuredClone(approvedFlow);
    flow.approval.approvedRevision = 1;
    expect(validateProductFlowRevision(flow)).toContain("approval.approvedRevision must match revision.");
  });

  it("rejects duplicate step and evidence IDs", () => {
    const flow = structuredClone(approvedFlow);
    flow.steps.push({ ...flow.steps[0]! });
    flow.sourceEvidenceIds.push(flow.sourceEvidenceIds[0]!);
    const errors = validateProductFlowRevision(flow);
    expect(errors).toContain("steps[2].id must be unique.");
    expect(errors).toContain("sourceEvidenceIds must not contain duplicates.");
  });

  it("requires final assertions so a click sequence cannot claim success alone", () => {
    const flow = structuredClone(approvedFlow);
    flow.finalAssertions = [];
    expect(validateProductFlowRevision(flow)).toContain("finalAssertions must contain 1–50 assertions.");
  });
});

describe("browser action policy", () => {
  it("allows a relative navigation on the approved origin", () => {
    expect(
      authorizeBrowserAction(
        { action: { type: "navigate", path: "/settings" }, declaredRisk: "navigate", origin: "approved_plan" },
        policy
      )
    ).toMatchObject({ allowed: true, code: "allowed" });
  });

  it("rejects external domains, deceptive suffixes, and URL credentials", () => {
    const decisions = [
      authorizeBrowserAction(
        { action: { type: "navigate", path: "https://evil.example/settings" }, declaredRisk: "navigate", origin: "approved_plan" },
        policy
      ),
      authorizeBrowserAction(
        {
          action: { type: "navigate", path: "https://demo.example.com.evil.test/settings" },
          declaredRisk: "navigate",
          origin: "approved_plan"
        },
        policy
      ),
      authorizeBrowserAction(
        {
          action: { type: "navigate", path: "https://user:password@demo.example.com/settings" },
          declaredRisk: "navigate",
          origin: "approved_plan"
        },
        policy
      )
    ];
    expect(decisions.map((decision) => decision.code)).toEqual([
      "domain_not_allowed",
      "domain_not_allowed",
      "url_credentials_not_allowed"
    ]);
  });

  it("requires HTTPS and blocks private IP literals", () => {
    expect(
      authorizeBrowserAction(
        { action: { type: "navigate", path: "http://demo.example.com" }, declaredRisk: "navigate", origin: "approved_plan" },
        policy
      ).code
    ).toBe("scheme_not_allowed");
    expect(
      authorizeBrowserAction(
        { action: { type: "navigate", path: "https://169.254.169.254" }, declaredRisk: "navigate", origin: "approved_plan" },
        { ...policy, allowedDomains: ["169.254.169.254"] }
      ).code
    ).toBe("private_network_not_allowed");
  });

  it("supports explicitly approved localhost previews only", () => {
    const localPolicy = {
      ...policy,
      baseUrl: "http://localhost:4173",
      allowedDomains: ["localhost"],
      allowHttpLocalhost: true
    };
    expect(
      authorizeBrowserAction(
        { action: { type: "navigate", path: "/app" }, declaredRisk: "navigate", origin: "approved_plan" },
        localPolicy
      ).allowed
    ).toBe(true);
  });

  it("rejects sensitive actions disguised as ordinary navigation", () => {
    const decision = authorizeBrowserAction(
      {
        action: { type: "click", target: { strategy: "role", role: "button", value: "Delete workspace" } },
        declaredRisk: "navigate",
        origin: "computer_provider"
      },
      policy
    );
    expect(decision).toMatchObject({
      allowed: false,
      code: "sensitive_action_misclassified",
      effectiveRisk: "destructive"
    });
  });

  it("classifies financial, security, publishing, and external side effects", () => {
    const click = (value: string) => ({ type: "click" as const, target: { strategy: "text" as const, value } });
    expect(inferMinimumRisk(click("Proceed to checkout"))).toBe("financial");
    expect(inferMinimumRisk(click("Change API key"))).toBe("security_sensitive");
    expect(inferMinimumRisk(click("Invite teammate"))).toBe("publish_or_invite");
    expect(inferMinimumRisk(click("Connect integration"))).toBe("external_side_effect");
  });

  it("allows fixture references but confines credential resolution to the login adapter", () => {
    const fixtureDecision = authorizeBrowserAction(
      {
        action: {
          type: "fill",
          target: { strategy: "label", value: "Project name" },
          valueRef: "fixture:project_name"
        },
        declaredRisk: "synthetic_write",
        origin: "approved_plan"
      },
      policy
    );
    const modelCredentialDecision = authorizeBrowserAction(
      {
        action: {
          type: "fill",
          target: { strategy: "label", value: "Password" },
          valueRef: "credential:password"
        },
        declaredRisk: "security_sensitive",
        origin: "computer_provider"
      },
      { ...policy, allowedRisks: [...policy.allowedRisks, "security_sensitive"] }
    );
    const loginDecision = authorizeBrowserAction(
      {
        action: {
          type: "fill",
          target: { strategy: "label", value: "Password" },
          valueRef: "credential:password"
        },
        declaredRisk: "security_sensitive",
        origin: "login_adapter"
      },
      { ...policy, allowedRisks: [...policy.allowedRisks, "security_sensitive"] }
    );
    expect(fixtureDecision.allowed).toBe(true);
    expect(modelCredentialDecision.code).toBe("credential_injection_not_allowed");
    expect(loginDecision.allowed).toBe(true);
  });

  it("rejects literal fill values and unapproved keys", () => {
    expect(
      authorizeBrowserAction(
        {
          action: { type: "fill", target: { strategy: "label", value: "Name" }, valueRef: "literal secret" },
          declaredRisk: "synthetic_write",
          origin: "approved_plan"
        },
        policy
      ).code
    ).toBe("invalid_value_reference");
    expect(
      authorizeBrowserAction(
        { action: { type: "key", key: "Space" }, declaredRisk: "observe", origin: "computer_provider" },
        policy
      ).code
    ).toBe("key_not_allowed");
  });
});

describe("verification receipts", () => {
  const passingAssertion = {
    assertion: { type: "url" as const, path: "/success" },
    passed: true,
    safeMessage: "Expected route is visible."
  };
  const base = {
    id: "receipt-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    flowId: "flow-1",
    flowRevision: 2,
    environmentVersionId: "environment-version-1",
    compiledPlanHash: "a".repeat(64),
    steps: [
      {
        stepId: "step-1",
        status: "succeeded" as const,
        policyDecision: {
          allowed: true,
          effectiveRisk: "navigate" as const,
          code: "allowed" as const,
          reason: "Allowed."
        },
        assertions: [passingAssertion],
        startedAt: "2026-07-14T10:00:00.000Z",
        completedAt: "2026-07-14T10:00:01.000Z"
      }
    ],
    finalAssertions: [passingAssertion],
    startedAt: "2026-07-14T10:00:00.000Z",
    completedAt: "2026-07-14T10:00:02.000Z"
  };

  it("marks a run verified only when step and final assertions pass", () => {
    expect(createFlowExecutionReceipt(base).status).toBe("verified");
  });

  it("accepts geometry-only visual evidence and rejects regions outside the viewport", () => {
    const visualEvidence = { schemaVersion: "1" as const, viewport: { width: 960, height: 600, scrollX: 0, scrollY: 120 }, actionTarget: { x: 100, y: 50, width: 200, height: 40 } };
    expect(createFlowExecutionReceipt({ ...base, steps: [{ ...base.steps[0]!, visualEvidence }] }).steps[0]?.visualEvidence).toEqual(visualEvidence);
    expect(() => createFlowExecutionReceipt({ ...base, steps: [{ ...base.steps[0]!, visualEvidence: { ...visualEvidence, actionTarget: { x: 900, y: 50, width: 200, height: 40 } } }] })).toThrow("outside the viewport");
  });

  it("marks failed assertions as failed", () => {
    const receipt = createFlowExecutionReceipt({
      ...base,
      finalAssertions: [{ ...passingAssertion, passed: false, safeMessage: "Expected route was not visible." }]
    });
    expect(receipt.status).toBe("failed");
  });

  it("requires a blocker code for policy-blocked execution", () => {
    const blocked = {
      ...base,
      steps: [
        {
          ...base.steps[0]!,
          status: "blocked" as const,
          policyDecision: {
            ...base.steps[0]!.policyDecision,
            allowed: false,
            code: "risk_not_allowed" as const
          }
        }
      ]
    };
    expect(() => createFlowExecutionReceipt(blocked)).toThrow("Blocked receipts require blockerCode");
    expect(createFlowExecutionReceipt({ ...blocked, blockerCode: "destructive_action_not_allowed" }).status).toBe(
      "blocked"
    );
  });
});

describe("coverage snapshots", () => {
  it("calculates uncovered IDs only when a denominator is known", () => {
    const snapshot = createCoverageSnapshot({
      id: "coverage-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentVersionId: "environment-version-1",
      calculationVersion: "coverage-v1",
      createdAt: "2026-07-14T10:00:00.000Z",
      dimensions: [
        {
          key: "approved_flow",
          denominatorSource: "approved flow revisions",
          knownIds: ["flow-1", "flow-2", "flow-3", "flow-4"],
          coveredIds: ["flow-1"],
          excluded: [{ id: "flow-2", reason: "User excluded settings." }],
          blocked: [{ id: "flow-3", code: "mfa_user_intervention_required" }]
        },
        { key: "route", coveredIds: ["route:/app"] }
      ]
    });
    expect(snapshot.dimensions[0]).toMatchObject({ denominator: 4, uncoveredIds: ["flow-4"] });
    expect(snapshot.dimensions[1]).toMatchObject({ denominator: "unknown", uncoveredIds: [] });
  });

  it("rejects covered, excluded, or blocked IDs outside the known denominator", () => {
    expect(() =>
      createCoverageSnapshot({
        id: "coverage-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        environmentVersionId: "environment-version-1",
        calculationVersion: "coverage-v1",
        createdAt: "2026-07-14T10:00:00.000Z",
        dimensions: [{ key: "goal", knownIds: ["goal-1"], coveredIds: ["goal-2"] }]
      })
    ).toThrow("goal references unknown coverage ID goal-2");
  });
});
