import { randomUUID } from "node:crypto";
import { createCoverageSnapshot, type CapturePersona, type CoverageDimensionInput, type CoverageRevisionBasis, type CoverageSnapshot, type FlowExecutionRecord, type ProductFlowRevision } from "../shared/productFlowCapture";
import { inventoryDimension, type CaptureCoverageInventory, type CaptureCoverageInventoryDimensionKey } from "./captureCoverageInventory";

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
  inventory?: CaptureCoverageInventory;
  basis?: CoverageRevisionBasis;
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
    calculationVersion: input.inventory ? "capture-coverage-v2" : "capture-coverage-v1",
    ...(input.basis ? { basis: input.basis, freshness: { status: "current" as const, reasons: [], evaluatedAt: options.now?.() ?? new Date().toISOString() } } : {}),
    createdAt: options.now?.() ?? new Date().toISOString(),
    dimensions: [
      { key: "goal", denominatorSource: "declared_goals", knownIds: input.goals.map((goal) => goal.id), coveredIds: coveredGoalIds },
      { key: "approved_flow", denominatorSource: "current_approved_flow_revisions", knownIds: currentApproved.map((flow) => flow.id), coveredIds: verifiedFlowIds, excluded: input.excludedFlowIds, blocked: input.blockedFlowIds },
      input.inventory ? inventoryCoverage(input.inventory, "persona", verifiedPersonaIds) : { key: "persona", denominatorSource: "requested_capture_personas", knownIds: input.personas.map((persona) => persona.id), coveredIds: verifiedPersonaIds },
      input.inventory ? inventoryCoverage(input.inventory, "route", input.visitedRouteIds) : { key: "route", denominatorSource: input.knownRouteIds ? "bounded_route_inventory" : undefined, knownIds: input.knownRouteIds, coveredIds: input.visitedRouteIds },
      input.inventory ? inventoryCoverage(input.inventory, "state", input.observedStateIds) : { key: "state", denominatorSource: input.knownStateIds ? "bounded_state_inventory" : undefined, knownIds: input.knownStateIds, coveredIds: input.observedStateIds },
      input.inventory ? inventoryCoverage(input.inventory, "usage_sequence", input.coveredUsageSequenceIds) : { key: "usage_sequence", denominatorSource: input.knownUsageSequenceIds ? "privacy_thresholded_analytics" : undefined, knownIds: input.knownUsageSequenceIds, coveredIds: input.coveredUsageSequenceIds },
      input.inventory ? inventoryCoverage(input.inventory, "feature_flag", input.coveredFeatureFlagIds) : { key: "feature_flag", denominatorSource: input.knownFeatureFlagIds ? "declared_feature_flags" : undefined, knownIds: input.knownFeatureFlagIds, coveredIds: input.coveredFeatureFlagIds },
      input.inventory ? inventoryCoverage(input.inventory, "outcome", input.verifiedOutcomeIds) : { key: "outcome", denominatorSource: input.knownOutcomeIds ? "declared_outcomes" : undefined, knownIds: input.knownOutcomeIds, coveredIds: input.verifiedOutcomeIds },
      input.inventory ? inventoryCoverage(input.inventory, "failure_state", input.coveredFailureStateIds) : { key: "failure_state", denominatorSource: input.requestedFailureStateIds ? "requested_failure_states" : undefined, knownIds: input.requestedFailureStateIds, coveredIds: input.coveredFailureStateIds }
    ]
  });
}

function inventoryCoverage(inventory: CaptureCoverageInventory, key: CaptureCoverageInventoryDimensionKey, coveredIds: string[]): CoverageDimensionInput {
  const dimension = inventoryDimension(inventory, key);
  const denominatorSources = dimension.sources.map((source) => `${source.kind}@${source.revision}`);
  return {
    key,
    denominatorSource: dimension.denominatorStatus === "known" ? "versioned_bounded_inventory" : undefined,
    denominatorSources,
    inventoryRevision: inventory.revision,
    inventoryHash: inventory.inventoryHash,
    knownIds: dimension.denominatorStatus === "known" ? dimension.knownIds : undefined,
    coveredIds,
    excluded: dimension.excluded,
    blocked: dimension.blocked
  };
}
