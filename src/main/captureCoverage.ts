import { randomUUID } from "node:crypto";
import { createCoverageSnapshot, type CapturePersona, type CoverageSnapshot, type FlowExecutionRecord, type ProductFlowRevision } from "../shared/productFlowCapture";

export interface CaptureCoverageInput {
  workspaceId: string;
  projectId: string;
  environmentVersionId: string;
  goals: Array<{ id: string; flowIds: string[] }>;
  approvedFlows: ProductFlowRevision[];
  personas: CapturePersona[];
  executions: FlowExecutionRecord[];
  knownRouteIds?: string[];
  visitedRouteIds: string[];
  knownStateIds?: string[];
  observedStateIds: string[];
  knownUsageSequenceIds?: string[];
  coveredUsageSequenceIds: string[];
  knownFeatureFlagIds?: string[];
  coveredFeatureFlagIds: string[];
  knownOutcomeIds?: string[];
  verifiedOutcomeIds: string[];
  requestedFailureStateIds?: string[];
  coveredFailureStateIds: string[];
  excludedFlowIds?: Array<{ id: string; reason: string }>;
  blockedFlowIds?: Array<{ id: string; code: string }>;
}

export function calculateCaptureCoverage(
  input: CaptureCoverageInput,
  options: { makeId?: () => string; now?: () => string } = {}
): CoverageSnapshot {
  const currentApproved = input.approvedFlows.filter((flow) => flow.approval.status === "approved" && flow.approval.approvedRevision === flow.revision);
  const verifiedFlowIds = [...new Set(input.executions.filter((execution) => execution.status === "verified" && currentApproved.some((flow) => flow.id === execution.flowId && flow.revision === execution.flowRevision)).map((execution) => execution.flowId))];
  const verifiedPersonaIds = [...new Set(currentApproved.filter((flow) => verifiedFlowIds.includes(flow.id)).map((flow) => flow.personaId))];
  const coveredGoalIds = input.goals.filter((goal) => goal.flowIds.some((flowId) => verifiedFlowIds.includes(flowId))).map((goal) => goal.id);
  return createCoverageSnapshot({
    id: options.makeId?.() ?? randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    environmentVersionId: input.environmentVersionId,
    calculationVersion: "capture-coverage-v1",
    createdAt: options.now?.() ?? new Date().toISOString(),
    dimensions: [
      { key: "goal", denominatorSource: "declared_goals", knownIds: input.goals.map((goal) => goal.id), coveredIds: coveredGoalIds },
      { key: "approved_flow", denominatorSource: "current_approved_flow_revisions", knownIds: currentApproved.map((flow) => flow.id), coveredIds: verifiedFlowIds, excluded: input.excludedFlowIds, blocked: input.blockedFlowIds },
      { key: "persona", denominatorSource: "requested_capture_personas", knownIds: input.personas.map((persona) => persona.id), coveredIds: verifiedPersonaIds },
      { key: "route", denominatorSource: input.knownRouteIds ? "bounded_route_inventory" : undefined, knownIds: input.knownRouteIds, coveredIds: input.visitedRouteIds },
      { key: "state", denominatorSource: input.knownStateIds ? "bounded_state_inventory" : undefined, knownIds: input.knownStateIds, coveredIds: input.observedStateIds },
      { key: "usage_sequence", denominatorSource: input.knownUsageSequenceIds ? "privacy_thresholded_analytics" : undefined, knownIds: input.knownUsageSequenceIds, coveredIds: input.coveredUsageSequenceIds },
      { key: "feature_flag", denominatorSource: input.knownFeatureFlagIds ? "declared_feature_flags" : undefined, knownIds: input.knownFeatureFlagIds, coveredIds: input.coveredFeatureFlagIds },
      { key: "outcome", denominatorSource: input.knownOutcomeIds ? "declared_outcomes" : undefined, knownIds: input.knownOutcomeIds, coveredIds: input.verifiedOutcomeIds },
      { key: "failure_state", denominatorSource: input.requestedFailureStateIds ? "requested_failure_states" : undefined, knownIds: input.requestedFailureStateIds, coveredIds: input.coveredFailureStateIds }
    ]
  });
}
