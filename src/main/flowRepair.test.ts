import { describe, expect, it, vi } from "vitest";
import type { ProductFlowRevision } from "../shared/productFlowCapture";
import { FlowRepairCircuitBreaker, classifyRepairChange, proposeBoundedFlowRepair, type FlowRepairPageComparison, type FlowRepairProvider } from "./flowRepair";

describe("bounded flow repair", () => {
  it("creates a bounded draft for harmless locator drift and preserves flow intent", async () => {
    const original = flow();
    let providerInput: unknown;
    const result = await proposeBoundedFlowRepair({
      ...baseInput(original),
      provider: provider(async (input) => {
        providerInput = input;
        return [proposal()];
      })
    });

    expect(result.repairedDraft).toMatchObject({
      revision: 3,
      approval: { status: "draft" },
      goal: original.goal,
      startingState: original.startingState,
      finalAssertions: original.finalAssertions
    });
    expect(result.repairedDraft.steps[0]).toMatchObject({ id: "step-1", intent: original.steps[0]!.intent, riskClass: "navigate", action: { type: "click", target: { value: "Create project" } } });
    expect(result.repairedDraft.steps[1]).toEqual(original.steps[1]);
    expect(original.steps[0]?.action).toMatchObject({ type: "click", target: { value: "New project" } });
    expect(result.receipt).toMatchObject({ decision: "locator_repair_draft", changeClassification: "locator_drift", attempt: 1, maxAttempts: 2, proposalCount: 1 });
    expect(providerInput).toMatchObject({
      trustedInstructions: { allowedChanges: ["locator", "wait_assertion"], maxRepairs: 2, attempt: 1, maxAttempts: 2 },
      untrustedFailureEvidence: { failureCode: "locator_not_found", currentPath: "/projects" }
    });
  });

  it("requires a new human-reviewed revision for material page changes without calling a provider", async () => {
    const propose = vi.fn(async () => [proposal()]);
    const result = await proposeBoundedFlowRepair({ ...baseInput(), pageComparison: comparison({ currentDom: "e", accessibilitySimilarity: 0.4 }), provider: provider(propose) });
    expect(propose).not.toHaveBeenCalled();
    expect(result).toMatchObject({ proposals: [], repairedDraft: { revision: 3, approval: { status: "draft" } }, receipt: { decision: "material_change_review_required", blockerCode: "material_application_change", changeClassification: "material_change" } });
    expect(result.repairedDraft.steps).toEqual(flow().steps);
  });

  it.each([
    ["unknown provider fields", [{ ...proposal(), shell: "rm -rf" }], "repair_provider_output_invalid"],
    ["duplicate proposals", [proposal(), proposal()], "repair_duplicate_proposal"],
    ["scope expansion", [{ ...proposal(), stepId: "step-2" }], "repair_scope_expanded"],
    ["ambiguous replacement", [proposal()], "repair_locator_ambiguous"]
  ])("fails closed for %s", async (_label, output, blockerCode) => {
    const controls = blockerCode === "repair_locator_ambiguous"
      ? [{ role: "button" as const, name: "Create project" }, { role: "button" as const, name: "Create project" }]
      : [{ role: "button" as const, name: "Create project" }];
    const promise = proposeBoundedFlowRepair({ ...baseInput(), visibleControls: controls, provider: provider(async () => output) });
    await expect(promise).rejects.toMatchObject({ receipt: { decision: "blocked", blockerCode } });
  });

  it("enforces provider timeout and attempt budgets", async () => {
    const timeout = proposeBoundedFlowRepair({ ...baseInput(), timeoutMs: 250, provider: provider(() => new Promise(() => undefined)) });
    await expect(timeout).rejects.toMatchObject({ receipt: { blockerCode: "repair_provider_timeout" } });

    const propose = vi.fn(async () => [proposal()]);
    const exhausted = proposeBoundedFlowRepair({ ...baseInput(), attempt: 3, maxAttempts: 2, provider: provider(propose) });
    await expect(exhausted).rejects.toMatchObject({ receipt: { blockerCode: "repair_attempt_budget_exhausted", attempt: 3, maxAttempts: 2 } });
    expect(propose).not.toHaveBeenCalled();
  });

  it("opens and cools down the provider circuit after bounded failures", async () => {
    let now = 1_000;
    const breaker = new FlowRepairCircuitBreaker(2, 1_000);
    const failing = provider(async () => { throw new Error("offline"); });
    for (let index = 0; index < 2; index += 1) {
      await expect(proposeBoundedFlowRepair({ ...baseInput(), provider: failing, circuitBreaker: breaker, nowMs: () => now })).rejects.toMatchObject({ receipt: { blockerCode: "repair_provider_failed" } });
    }
    await expect(proposeBoundedFlowRepair({ ...baseInput(), provider: failing, circuitBreaker: breaker, nowMs: () => now })).rejects.toMatchObject({ receipt: { blockerCode: "repair_circuit_open" } });
    now += 1_001;
    await expect(proposeBoundedFlowRepair({ ...baseInput(), provider: provider(async () => [proposal()]), circuitBreaker: breaker, nowMs: () => now })).resolves.toMatchObject({ receipt: { decision: "locator_repair_draft" } });
  });

  it("classifies path and safe visual/accessibility drift conservatively", () => {
    expect(classifyRepairChange(comparison())).toBe("locator_drift");
    expect(classifyRepairChange(comparison({ currentPath: "/settings" }))).toBe("material_change");
    expect(classifyRepairChange(comparison({ screenshotSimilarity: 0.64 }))).toBe("material_change");
  });

  it("rejects inconsistent or unsafe runtime evidence before provider execution", async () => {
    const propose = vi.fn(async () => [proposal()]);
    await expect(proposeBoundedFlowRepair({ ...baseInput(), currentPath: "/other", provider: provider(propose) })).rejects.toThrow("does not match");
    await expect(proposeBoundedFlowRepair({ ...baseInput(), visibleControls: [{ role: "script" as never, name: "Create project" }], provider: provider(propose) })).rejects.toThrow("control evidence is invalid");
    expect(propose).not.toHaveBeenCalled();
  });
});

function proposal() {
  return { stepId: "step-1", replacementLocator: { strategy: "role", role: "button", value: "Create project", exact: true }, evidenceIds: ["page:current"], rationale: "The accessible name changed while page structure remained stable." };
}

function provider(propose: FlowRepairProvider["propose"]): FlowRepairProvider {
  return { provider: "fake-local", model: "golden-v1", propose };
}

function baseInput(repairFlow = flow()) {
  return {
    flow: repairFlow,
    failedStepIds: ["step-1"],
    visibleControls: [{ role: "button" as const, name: "Create project" }],
    currentPath: "/projects",
    pageComparison: comparison(),
    provider: provider(async () => [proposal()])
  };
}

function comparison(overrides: { currentPath?: string; currentDom?: string; accessibilitySimilarity?: number; screenshotSimilarity?: number } = {}): FlowRepairPageComparison {
  return {
    failureCode: "locator_not_found",
    approved: { path: "/projects", accessibleTreeHash: "a".repeat(64), domStructureHash: "b".repeat(64), screenshotHash: "c".repeat(64) },
    current: { path: overrides.currentPath ?? "/projects", accessibleTreeHash: "d".repeat(64), domStructureHash: (overrides.currentDom ?? "b").repeat(64), screenshotHash: "f".repeat(64) },
    accessibilitySimilarity: overrides.accessibilitySimilarity ?? 0.9,
    screenshotSimilarity: overrides.screenshotSimilarity ?? 0.9
  };
}

function flow(): ProductFlowRevision {
  return {
    schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Create project", goal: "Create a project.", startingState: { entryPath: "/projects" },
    steps: [
      { id: "step-1", intent: "Open project creation.", action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } }, riskClass: "navigate" },
      { id: "step-2", intent: "Observe the form.", action: { type: "wait_for", assertion: { type: "visible", target: { strategy: "text", value: "Project name" } } }, riskClass: "observe" }
    ],
    finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Create project" } }],
    approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["goal-1"]
  };
}
