import { calculateCaptureCoverage } from "./captureCoverage";
import type { CapturePersona, CaptureRun, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import type { CaptureCoverageService } from "./captureCoverageService";

export interface PostRunCoverageRepository {
  listProjectFlows(input: { workspaceId: string; projectId: string; limit?: number }): Promise<ProductFlowRevision[]>;
  listProjectPersonas(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CapturePersona[]>;
}

export function createPostRunCoverageHook(options: { repository: PostRunCoverageRepository; coverage: CaptureCoverageService; makeId?: () => string; now?: () => string }) {
  return async (input: { workspaceId: string; projectId: string; captureRun: CaptureRun; executions: FlowExecutionRecord[] }) => {
    const [flows, personas] = await Promise.all([
      options.repository.listProjectFlows({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 500 }),
      options.repository.listProjectPersonas({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 100 })
    ]);
    const approvedFlows = flows.filter((flow) => flow.environmentVersionId === input.captureRun.environmentVersionId && flow.approval.status === "approved");
    const goals = goalMappings(approvedFlows);
    const snapshot = calculateCaptureCoverage({ workspaceId: input.workspaceId, projectId: input.projectId, environmentVersionId: input.captureRun.environmentVersionId, goals, approvedFlows, personas: personas.filter((persona) => approvedFlows.some((flow) => flow.personaId === persona.id)), executions: input.executions, visitedRouteIds: [], observedStateIds: [], coveredUsageSequenceIds: [], coveredFeatureFlagIds: [], verifiedOutcomeIds: [], coveredFailureStateIds: [] }, { makeId: options.makeId, now: options.now });
    await options.coverage.persist({ workspaceId: input.workspaceId, projectId: input.projectId, snapshot });
    return snapshot;
  };
}

function goalMappings(flows: ProductFlowRevision[]) {
  const mapping = new Map<string, string[]>();
  for (const flow of flows) for (const evidenceId of flow.sourceEvidenceIds) if (evidenceId.startsWith("goal:")) mapping.set(evidenceId, [...new Set([...(mapping.get(evidenceId) ?? []), flow.id])]);
  return [...mapping].map(([id, flowIds]) => ({ id, flowIds }));
}
