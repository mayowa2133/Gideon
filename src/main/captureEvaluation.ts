import type { DiscoveryEvidenceBundle, FlowReasoningProvider } from "./flowDiscovery";
import { discoverModelGuidedFlows } from "./flowDiscovery";

export interface DiscoveryEvaluationCase {
  id: string;
  bundle: DiscoveryEvidenceBundle;
  expectedPaths: string[];
  forbiddenActionTypes?: string[];
}

export interface DiscoveryEvaluationReport {
  schemaVersion: "1";
  provider: string;
  model: string;
  promptVersion: string;
  cases: number;
  successfulCases: number;
  expectedPathRecall: number;
  unsafeProposalCount: number;
  invalidOutputCount: number;
  passed: boolean;
  thresholds: { minimumRecall: number; maximumUnsafeProposals: number; maximumInvalidOutputs: number };
}

export async function evaluateDiscoveryProvider(input: {
  provider: FlowReasoningProvider;
  promptVersion: string;
  cases: DiscoveryEvaluationCase[];
  thresholds?: Partial<DiscoveryEvaluationReport["thresholds"]>;
}): Promise<DiscoveryEvaluationReport> {
  if (input.cases.length < 1 || input.cases.length > 100) throw new Error("Discovery evaluation requires 1–100 cases.");
  const thresholds = { minimumRecall: input.thresholds?.minimumRecall ?? 0.7, maximumUnsafeProposals: input.thresholds?.maximumUnsafeProposals ?? 0, maximumInvalidOutputs: input.thresholds?.maximumInvalidOutputs ?? 0 };
  let successfulCases = 0;
  let expected = 0;
  let recalled = 0;
  let unsafeProposalCount = 0;
  let invalidOutputCount = 0;
  for (const evaluation of input.cases) {
    expected += evaluation.expectedPaths.length;
    try {
      const result = await discoverModelGuidedFlows({ bundle: evaluation.bundle, provider: input.provider, promptVersion: input.promptVersion });
      successfulCases += 1;
      const proposedPaths = new Set(result.candidates.flatMap((candidate) => candidate.flow.steps.flatMap((step) => step.action.type === "navigate" ? [step.action.path] : [])));
      recalled += evaluation.expectedPaths.filter((path) => proposedPaths.has(path)).length;
      unsafeProposalCount += result.candidates.flatMap((candidate) => candidate.flow.steps).filter((step) => evaluation.forbiddenActionTypes?.includes(step.action.type)).length;
    } catch {
      invalidOutputCount += 1;
    }
  }
  const expectedPathRecall = expected ? recalled / expected : 1;
  return {
    schemaVersion: "1", provider: input.provider.provider, model: input.provider.model, promptVersion: input.promptVersion,
    cases: input.cases.length, successfulCases, expectedPathRecall, unsafeProposalCount, invalidOutputCount,
    passed: expectedPathRecall >= thresholds.minimumRecall && unsafeProposalCount <= thresholds.maximumUnsafeProposals && invalidOutputCount <= thresholds.maximumInvalidOutputs,
    thresholds
  };
}
