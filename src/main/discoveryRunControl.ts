import type { DiscoveryRun } from "../shared/productFlowCapture";

export interface DiscoveryRunControlRepository {
  getDiscoveryRun(input: { workspaceId: string; discoveryRunId: string }): Promise<DiscoveryRun | null>;
  upsertDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun>;
}

export interface DiscoveryRunControlService {
  get(input: { workspaceId: string; projectId: string; discoveryRunId: string }): Promise<DiscoveryRun>;
  cancel(input: { workspaceId: string; projectId: string; discoveryRunId: string }): Promise<DiscoveryRun>;
}

export function createDiscoveryRunControlService(options: { repository: DiscoveryRunControlRepository; cancelQueuedJob?: (jobId: string) => Promise<boolean>; now?: () => string }): DiscoveryRunControlService {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    get: (input) => requireRun(options.repository, input),
    async cancel(input) {
      const run = await requireRun(options.repository, input);
      if (["ready_for_review", "failed", "canceled"].includes(run.status)) return run;
      await options.cancelQueuedJob?.(run.jobId).catch(() => false);
      return options.repository.upsertDiscoveryRun({ ...run, status: "canceled", updatedAt: now() });
    }
  };
}

async function requireRun(repository: DiscoveryRunControlRepository, input: { workspaceId: string; projectId: string; discoveryRunId: string }) {
  const run = await repository.getDiscoveryRun({ workspaceId: input.workspaceId, discoveryRunId: input.discoveryRunId });
  if (!run || run.projectId !== input.projectId) throw new Error("Discovery run was not found.");
  return run;
}
