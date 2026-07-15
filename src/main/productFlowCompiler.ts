import { createHash } from "node:crypto";
import {
  authorizeBrowserAction,
  parseProductFlowRevision,
  type BrowserExecutionPolicy,
  type BrowserPolicyDecision,
  type ProductFlowAction,
  type ProductFlowRevision
} from "../shared/productFlowCapture";

export interface CompiledFlowStep {
  id: string;
  intent: string;
  action: ProductFlowAction;
  expectedState: ProductFlowRevision["finalAssertions"];
  policyDecision: BrowserPolicyDecision;
}

export interface CompiledFlowPlan {
  schemaVersion: "1";
  flowId: string;
  flowRevision: number;
  projectId: string;
  environmentVersionId: string;
  personaId: string;
  startingState: ProductFlowRevision["startingState"];
  steps: CompiledFlowStep[];
  finalAssertions: ProductFlowRevision["finalAssertions"];
  policyFingerprint: string;
  compiledPlanHash: string;
}

export function compileProductFlow(
  rawFlow: unknown,
  policy: BrowserExecutionPolicy
): CompiledFlowPlan {
  const flow = parseProductFlowRevision(rawFlow);
  if (flow.approval.status !== "approved" || flow.approval.approvedRevision !== flow.revision) {
    throw new Error("Only the current approved flow revision can be compiled.");
  }
  if (flow.steps.length > policy.maxSteps) {
    throw new Error(`Flow has ${flow.steps.length} steps but policy allows ${policy.maxSteps}.`);
  }
  const startingDecision = authorizeBrowserAction(
    { action: { type: "navigate", path: flow.startingState.entryPath }, declaredRisk: "navigate", origin: "approved_plan" },
    policy
  );
  if (!startingDecision.allowed) throw new Error(`Starting state blocked: ${startingDecision.code}.`);

  const steps: CompiledFlowStep[] = flow.steps.map((step) => {
    const policyDecision = authorizeBrowserAction(
      { action: step.action, declaredRisk: step.riskClass, origin: "approved_plan" },
      policy
    );
    if (!policyDecision.allowed) throw new Error(`Step ${step.id} blocked: ${policyDecision.code}.`);
    return {
      id: step.id,
      intent: step.intent,
      action: structuredClone(step.action),
      expectedState: structuredClone(step.expectedState ?? []),
      policyDecision
    };
  });
  const policyFingerprint = sha256(stableSerialize(normalizedPolicy(policy)));
  const withoutHash = {
    schemaVersion: "1" as const,
    flowId: flow.id,
    flowRevision: flow.revision,
    projectId: flow.projectId,
    environmentVersionId: flow.environmentVersionId,
    personaId: flow.personaId,
    startingState: structuredClone(flow.startingState),
    steps,
    finalAssertions: structuredClone(flow.finalAssertions),
    policyFingerprint
  };
  return { ...withoutHash, compiledPlanHash: sha256(stableSerialize(withoutHash)) };
}

export function verifyCompiledFlowPlan(plan: CompiledFlowPlan): void {
  const { compiledPlanHash, ...withoutHash } = plan;
  if (sha256(stableSerialize(withoutHash)) !== compiledPlanHash) {
    throw new Error("Compiled flow plan hash does not match its contents.");
  }
  if (!compiledPlanHash.match(/^[a-f0-9]{64}$/)) throw new Error("Compiled flow plan hash is invalid.");
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function normalizedPolicy(policy: BrowserExecutionPolicy): BrowserExecutionPolicy {
  return {
    ...policy,
    allowedDomains: [...new Set(policy.allowedDomains.map((domain) => domain.trim().toLowerCase()))].sort(),
    allowedRisks: [...new Set(policy.allowedRisks)].sort(),
    allowedKeys: [...new Set(policy.allowedKeys)].sort()
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}
