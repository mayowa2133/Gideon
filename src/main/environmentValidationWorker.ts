import { failJob, startJob, succeedJob } from "../shared/jobState";
import type { CaptureEnvironment } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import type { CaptureApplicationService } from "./captureService";
import type { CaptureAuditSink } from "./captureAudit";

export interface EnvironmentValidationWorkerRepository {
  getJob(input: { workspaceId: string; jobId: string }): Promise<JobRecord | null>;
  upsertJob(input: { workspaceId: string; job: JobRecord; stage: string }): Promise<JobRecord>;
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  upsertEnvironment(environment: CaptureEnvironment): Promise<CaptureEnvironment>;
}

export function createEnvironmentValidationWorker(options: {
  repository: EnvironmentValidationWorkerRepository;
  service: CaptureApplicationService;
  audit?: CaptureAuditSink;
  now?: () => string;
}) {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async execute(input: { workspaceId: string; projectId: string; environmentId: string; jobId: string }) {
      const current = await options.repository.getJob({ workspaceId: input.workspaceId, jobId: input.jobId });
      if (!current || current.projectId !== input.projectId || current.kind !== "environment_validation") throw new Error("Environment validation job was not found.");
      if (current.status === "succeeded") return current;
      const running = current.status === "queued" ? startJob(current, now(), "Validating capture environment.") : current;
      await options.repository.upsertJob({ workspaceId: input.workspaceId, job: running, stage: "environment_validation" });
      try {
        await options.service.validateEnvironment({ workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId });
        const succeeded = succeedJob(running, now(), "Capture environment validated.");
        const saved = await options.repository.upsertJob({ workspaceId: input.workspaceId, job: succeeded, stage: "finalize" });
        await options.audit?.record({ workspaceId: input.workspaceId, projectId: input.projectId, actorUserId: "system:environment-validation-worker", actorType: "system", action: "capture_environment.validate", targetType: "capture_environment", targetId: input.environmentId, metadata: { succeeded: true } });
        return saved;
      } catch {
        const environment = await options.repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: input.environmentId });
        if (environment && environment.projectId === input.projectId) {
          await options.repository.upsertEnvironment({ ...environment, status: "failed", safeErrorCode: "environment_validation_failed", currentVersionId: undefined, updatedAt: now() });
        }
        const failed = failJob(running, now(), "Capture environment could not be validated safely.");
        await options.repository.upsertJob({ workspaceId: input.workspaceId, job: failed, stage: "environment_validation" });
        throw new Error("Capture environment could not be validated safely.");
      }
    }
  };
}
