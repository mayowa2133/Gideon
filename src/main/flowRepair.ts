import { parseProductFlowRevision, type AssertionSpec, type LocatorSpec, type ProductFlowRevision } from "../shared/productFlowCapture";

export interface FlowRepairProposal {
  stepId: string;
  replacementLocator?: LocatorSpec;
  replacementWaitAssertion?: AssertionSpec;
  evidenceIds: string[];
  rationale: string;
}

export interface FlowRepairProvider {
  provider: string;
  model: string;
  propose(input: {
    trustedInstructions: { schemaVersion: "1"; allowedChanges: ["locator", "wait_assertion"]; maxRepairs: number };
    untrustedFailureEvidence: { flowId: string; revision: number; failedStepIds: string[]; visibleControls: Array<{ role: string; name: string }>; currentPath: string };
  }): Promise<unknown[]>;
}

export async function proposeBoundedFlowRepair(input: {
  flow: ProductFlowRevision;
  failedStepIds: string[];
  visibleControls: Array<{ role: string; name: string }>;
  currentPath: string;
  provider: FlowRepairProvider;
  maxRepairs?: number;
}): Promise<{ repairedDraft: ProductFlowRevision; proposals: FlowRepairProposal[]; provider: string; model: string }> {
  if (input.flow.approval.status !== "approved" || input.flow.approval.approvedRevision !== input.flow.revision) throw new Error("Only a current approved flow can be repaired.");
  const maxRepairs = Math.max(1, Math.min(5, input.maxRepairs ?? 2));
  const raw = await input.provider.propose({
    trustedInstructions: { schemaVersion: "1", allowedChanges: ["locator", "wait_assertion"], maxRepairs },
    untrustedFailureEvidence: { flowId: input.flow.id, revision: input.flow.revision, failedStepIds: input.failedStepIds.slice(0, 10), visibleControls: input.visibleControls.slice(0, 200), currentPath: input.currentPath.slice(0, 2_000) }
  });
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > maxRepairs) throw new Error("Flow repair provider returned an invalid proposal count.");
  const proposals = raw.map(parseProposal);
  const next = structuredClone(input.flow);
  next.revision += 1;
  next.approval = { status: "draft" };
  for (const proposal of proposals) {
    if (!input.failedStepIds.includes(proposal.stepId)) throw new Error("Flow repair targeted a step that did not fail.");
    const step = next.steps.find((candidate) => candidate.id === proposal.stepId);
    if (!step) throw new Error("Flow repair targeted an unknown step.");
    if (proposal.replacementLocator) {
      if (!("target" in step.action) || !step.action.target) throw new Error("Flow repair cannot add a locator to this action.");
      step.action.target = proposal.replacementLocator;
    }
    if (proposal.replacementWaitAssertion) {
      if (step.action.type !== "wait_for") throw new Error("Flow repair can change wait assertions only on wait steps.");
      step.action.assertion = proposal.replacementWaitAssertion;
    }
    next.sourceEvidenceIds = [...new Set([...next.sourceEvidenceIds, ...proposal.evidenceIds])];
  }
  return { repairedDraft: parseProductFlowRevision(next), proposals, provider: input.provider.provider, model: input.provider.model };
}

function parseProposal(value: unknown): FlowRepairProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Flow repair proposal must be an object.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["stepId", "replacementLocator", "replacementWaitAssertion", "evidenceIds", "rationale"]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Flow repair proposal.${unknown} is not allowed.`);
  if (typeof record.stepId !== "string" || !record.stepId || typeof record.rationale !== "string" || !record.rationale.trim()) throw new Error("Flow repair proposal identity is invalid.");
  if (!Array.isArray(record.evidenceIds) || record.evidenceIds.some((id) => typeof id !== "string" || !id)) throw new Error("Flow repair evidence IDs are invalid.");
  if (!record.replacementLocator && !record.replacementWaitAssertion) throw new Error("Flow repair proposal does not contain a bounded change.");
  return { stepId: record.stepId, replacementLocator: record.replacementLocator as LocatorSpec | undefined, replacementWaitAssertion: record.replacementWaitAssertion as AssertionSpec | undefined, evidenceIds: record.evidenceIds as string[], rationale: record.rationale };
}
