import type { CaptureEnvironmentVersion, FlowExecutionRecord } from "../shared/productFlowCapture";
import type { CaptureRunCoordinator } from "./captureRunCoordinator";

export interface CaptureExecutionRetryRepository {
  getFlowExecution(input: { workspaceId: string; executionId: string }): Promise<FlowExecutionRecord | null>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
}

export function createCaptureExecutionRetryService(options: {
  repository: CaptureExecutionRetryRepository;
  coordinator: CaptureRunCoordinator;
}) {
  return {
    async retry(input: { workspaceId: string; projectId: string; executionId: string; idempotencyKey: string }) {
      const execution = await options.repository.getFlowExecution({ workspaceId: input.workspaceId, executionId: input.executionId });
      if (!execution || execution.projectId !== input.projectId) throw new Error("Flow execution was not found.");
      if (execution.status === "running" || execution.status === "queued") throw new Error("Flow execution is still active.");
      const version = await options.repository.getEnvironmentVersion({ workspaceId: input.workspaceId, versionId: execution.environmentVersionId });
      if (!version || version.projectId !== input.projectId) throw new Error("Capture environment version was not found.");
      return options.coordinator.create({ workspaceId: input.workspaceId, projectId: input.projectId, environmentId: version.environmentId, flowIds: [execution.flowId], idempotencyKey: input.idempotencyKey });
    }
  };
}

export type CaptureExecutionRetryService = ReturnType<typeof createCaptureExecutionRetryService>;
