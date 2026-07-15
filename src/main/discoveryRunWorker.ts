import { failJob, startJob, succeedJob } from "../shared/jobState";
import type { CaptureEnvironment, CaptureEnvironmentVersion, DiscoveryRun, ProductFlowRevision } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import type { RepositoryEvidence, RenderedPageEvidence, UsageSequenceEvidence } from "./flowDiscovery";
import type { DiscoveryGoal } from "./discoveryRunCoordinator";
import type { CaptureAuditSink } from "./captureAudit";

export interface DiscoveryRunWorkerRepository {
  getJobRequest(input: { workspaceId: string; jobId: string }): Promise<{ job: JobRecord; inputJson: Record<string, unknown> } | null>;
  upsertJob(input: { workspaceId: string; job: JobRecord; stage: string; resultJson?: Record<string, unknown> }): Promise<JobRecord>;
  getDiscoveryRun(input: { workspaceId: string; discoveryRunId: string }): Promise<DiscoveryRun | null>;
  upsertDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
}

export interface DiscoveryInventoryRuntime {
  isolation: "container" | "microvm" | "local_test";
  collect(input: { workspaceId: string; projectId: string; environment: CaptureEnvironment; version: CaptureEnvironmentVersion; maxPages: number }): Promise<{ renderedPages: RenderedPageEvidence[]; repository?: RepositoryEvidence; usageSequences?: UsageSequenceEvidence[] }>;
}

export interface DeterministicDiscoveryRunner {
  run(input: { workspaceId: string; projectId: string; environmentId: string; goals: DiscoveryGoal[]; renderedPages: RenderedPageEvidence[]; repository?: RepositoryEvidence; usageSequences?: UsageSequenceEvidence[]; maxCandidates?: number; jobId: string; discoveryRunId?: string }): Promise<{ run: DiscoveryRun; flows: ProductFlowRevision[] }>;
}

export function createDiscoveryRunWorker(options: { repository: DiscoveryRunWorkerRepository; runtime: DiscoveryInventoryRuntime; discovery: DeterministicDiscoveryRunner; audit?: CaptureAuditSink; now?: () => string }) {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async execute(input: { workspaceId: string; projectId: string; discoveryRunId: string; jobId: string }) {
      const request = await options.repository.getJobRequest({ workspaceId: input.workspaceId, jobId: input.jobId });
      const run = await options.repository.getDiscoveryRun({ workspaceId: input.workspaceId, discoveryRunId: input.discoveryRunId });
      if (!request || request.job.projectId !== input.projectId || request.job.kind !== "flow_discovery" || !run || run.projectId !== input.projectId || run.jobId !== input.jobId) throw new Error("Discovery job was not found.");
      if (request.job.status === "succeeded" && run.status === "ready_for_review") return { run, flows: [] };
      const version = await options.repository.getEnvironmentVersion({ workspaceId: input.workspaceId, versionId: run.environmentVersionId });
      const environment = version ? await options.repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: version.environmentId }) : null;
      if (!version || !environment || environment.projectId !== input.projectId || environment.currentVersionId !== version.id || environment.status !== "ready") throw new Error("Capture environment changed after discovery was queued.");
      if (options.runtime.isolation === "local_test" && environment.type !== "local_preview") throw new Error("Remote discovery environments require a container or microVM browser runtime.");
      const goals = parseGoals(request.inputJson.goals);
      const maxCandidates = parseMaxCandidates(request.inputJson.maxCandidates);
      const running = request.job.status === "queued" ? startJob(request.job, now(), "Inventorying the product interface.") : request.job;
      await options.repository.upsertJob({ workspaceId: input.workspaceId, job: running, stage: "inventory" });
      try {
        const evidence = await options.runtime.collect({ workspaceId: input.workspaceId, projectId: input.projectId, environment, version, maxPages: Math.min(run.maxScreenshots, 100) });
        const result = await options.discovery.run({ workspaceId: input.workspaceId, projectId: input.projectId, environmentId: environment.id, goals, ...evidence, maxCandidates, jobId: input.jobId, discoveryRunId: run.id });
        const succeeded = succeedJob(running, now(), `Discovered ${result.flows.length} product flows for review.`);
        await options.repository.upsertJob({ workspaceId: input.workspaceId, job: succeeded, stage: "ready_for_review", resultJson: { discoveryRunId: run.id, flowCount: result.flows.length } });
        await options.audit?.record({ workspaceId: input.workspaceId, projectId: input.projectId, actorUserId: "system:discovery-worker", actorType: "system", action: "flow_discovery.complete", targetType: "discovery_run", targetId: run.id, metadata: { flow_count: result.flows.length } });
        return result;
      } catch {
        await options.repository.upsertDiscoveryRun({ ...run, status: "failed", safeErrorCode: "discovery_failed", updatedAt: now() }).catch(() => undefined);
        const failed = failJob(running, now(), "Product flow discovery could not be completed safely.");
        await options.repository.upsertJob({ workspaceId: input.workspaceId, job: failed, stage: "flow_discovery" });
        throw new Error("Product flow discovery could not be completed safely.");
      }
    }
  };
}

function parseGoals(value: unknown): DiscoveryGoal[] { if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Stored discovery goals are invalid."); return value.map((item) => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Stored discovery goals are invalid."); const goal = item as Record<string, unknown>; if (typeof goal.id !== "string" || typeof goal.text !== "string" || typeof goal.priority !== "number") throw new Error("Stored discovery goals are invalid."); return { id: goal.id, text: goal.text, priority: goal.priority }; }); }
function parseMaxCandidates(value: unknown) { if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) throw new Error("Stored discovery budget is invalid."); return value; }
