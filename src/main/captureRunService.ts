import type { CaptureRun, FlowExecutionRecord } from "../shared/productFlowCapture";

export interface CaptureRunControlRepository {
  getCaptureRun(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRun | null>;
  upsertCaptureRun(run: CaptureRun): Promise<CaptureRun>;
  listCaptureRunExecutions(input: { workspaceId: string; captureRunId: string; limit?: number }): Promise<FlowExecutionRecord[]>;
}

export interface CaptureRunControlService {
  get(input: { workspaceId: string; projectId: string; captureRunId: string }): Promise<{ run: CaptureRun; executions: FlowExecutionRecord[] }>;
  cancel(input: { workspaceId: string; projectId: string; captureRunId: string }): Promise<CaptureRun>;
  isCancellationRequested(input: { workspaceId: string; captureRunId: string }): Promise<boolean>;
}

export function createCaptureRunControlService(options: {
  repository: CaptureRunControlRepository;
  cancelQueuedJob?: (jobId: string) => Promise<boolean>;
  now?: () => string;
}): CaptureRunControlService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async get(input) {
      const run = await requireRun(options.repository, input);
      const executions = await options.repository.listCaptureRunExecutions({ workspaceId: input.workspaceId, captureRunId: run.id, limit: 200 });
      if (executions.some((execution) => execution.projectId !== input.projectId)) throw new Error("Capture run was not found.");
      return { run, executions };
    },
    async cancel(input) {
      const run = await requireRun(options.repository, input);
      if (["completed", "failed", "needs_review", "canceled"].includes(run.status)) return run;
      await options.cancelQueuedJob?.(run.jobId).catch(() => false);
      return options.repository.upsertCaptureRun({ ...run, status: "canceled", updatedAt: now() });
    },
    async isCancellationRequested(input) {
      const run = await options.repository.getCaptureRun(input);
      return run?.status === "canceled";
    }
  };
}

async function requireRun(repository: CaptureRunControlRepository, input: { workspaceId: string; projectId: string; captureRunId: string }): Promise<CaptureRun> {
  const run = await repository.getCaptureRun({ workspaceId: input.workspaceId, captureRunId: input.captureRunId });
  if (!run || run.projectId !== input.projectId) throw new Error("Capture run was not found.");
  return run;
}
