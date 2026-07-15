import { calculateCaptureCoverage } from "./captureCoverage";
import type { CapturePersona, CaptureRun, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import type { CoverageRevisionBasis } from "../shared/productFlowCapture";
import type { CaptureCoverageService } from "./captureCoverageService";
import type { CaptureCoverageInventory } from "./captureCoverageInventory";

export interface PostRunCoverageRepository {
  listProjectFlows(input: { workspaceId: string; projectId: string; limit?: number }): Promise<ProductFlowRevision[]>;
  listProjectPersonas(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CapturePersona[]>;
}

export function createPostRunCoverageHook(options: { repository: PostRunCoverageRepository; coverage: CaptureCoverageService; makeId?: () => string; now?: () => string }) {
  return async (input: {
    workspaceId: string;
    projectId: string;
    captureRun: CaptureRun;
    executions: FlowExecutionRecord[];
    inventory?: CaptureCoverageInventory;
    basis?: CoverageRevisionBasis;
    evidence?: {
      visitedRouteIds?: string[];
      observedStateIds?: string[];
      coveredUsageSequenceIds?: string[];
      coveredFeatureFlagIds?: string[];
      verifiedOutcomeIds?: string[];
      coveredFailureStateIds?: string[];
    };
  }) => {
    const [flows, personas] = await Promise.all([
      options.repository.listProjectFlows({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 500 }),
      options.repository.listProjectPersonas({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 100 })
    ]);
    const approvedFlows = flows.filter((flow) => flow.environmentVersionId === input.captureRun.environmentVersionId && flow.approval.status === "approved");
    const goals = goalMappings(approvedFlows);
    const verifiedFlows = approvedFlows.filter((flow) => input.executions.some((execution) => execution.status === "verified" && execution.flowId === flow.id && execution.flowRevision === flow.revision));
    const snapshot = calculateCaptureCoverage({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      environmentVersionId: input.captureRun.environmentVersionId,
      goals,
      approvedFlows,
      personas: personas.filter((persona) => approvedFlows.some((flow) => flow.personaId === persona.id)),
      executions: input.executions,
      visitedRouteIds: input.evidence?.visitedRouteIds ?? verifiedRouteIds(verifiedFlows),
      observedStateIds: input.evidence?.observedStateIds ?? verifiedFlows.map(startingStateId),
      coveredUsageSequenceIds: input.evidence?.coveredUsageSequenceIds ?? [],
      coveredFeatureFlagIds: input.evidence?.coveredFeatureFlagIds ?? [],
      verifiedOutcomeIds: input.evidence?.verifiedOutcomeIds ?? [],
      coveredFailureStateIds: input.evidence?.coveredFailureStateIds ?? [],
      inventory: input.inventory,
      basis: input.basis
    }, { makeId: options.makeId, now: options.now });
    await options.coverage.persist({ workspaceId: input.workspaceId, projectId: input.projectId, snapshot });
    return snapshot;
  };
}

export function startingStateId(flow: ProductFlowRevision): string {
  return `state:${flow.startingState.entryPath}:${flow.startingState.fixtureProfileId ?? "default"}:${flow.personaId}`;
}

function verifiedRouteIds(flows: ProductFlowRevision[]): string[] {
  return [...new Set(flows.flatMap((flow) => [flow.startingState.entryPath, ...flow.steps.flatMap((step) => step.action.type === "navigate" ? [step.action.path] : []), ...flow.finalAssertions.flatMap((assertion) => assertion.type === "url" ? [assertion.path] : [])]))];
}

function goalMappings(flows: ProductFlowRevision[]) {
  const mapping = new Map<string, string[]>();
  for (const flow of flows) for (const evidenceId of flow.sourceEvidenceIds) if (evidenceId.startsWith("goal:")) mapping.set(evidenceId, [...new Set([...(mapping.get(evidenceId) ?? []), flow.id])]);
  return [...mapping].map(([id, flowIds]) => ({ id, flowIds }));
}
