import type { GideonJobExecutor } from "./jobExecutor";
import type { HostedWorkerJobExecutor, WorkerQueueTask } from "./jobQueue";
import type { JobKind, Project } from "../shared/types";

export type GideonExecutableJobKind = Extract<JobKind, "analysis" | "render">;

export interface GideonExecutorJobInput {
  projectId: string;
  jobId: string;
  kind: GideonExecutableJobKind;
}

export function createExecutorWorkerQueueTask(
  executor: GideonJobExecutor,
  input: GideonExecutorJobInput
): WorkerQueueTask<Project> {
  return {
    id: input.jobId,
    projectId: input.projectId,
    kind: input.kind,
    run: () => runGideonExecutorJob(executor, input)
  };
}

export function createHostedWorkerExecutorAdapter(executor: GideonJobExecutor): HostedWorkerJobExecutor {
  return {
    async runAnalysisJob(input) {
      await runGideonExecutorJob(executor, { ...input, kind: "analysis" });
    },
    async runRenderJob(input) {
      await runGideonExecutorJob(executor, { ...input, kind: "render" });
    }
  };
}

export function runGideonExecutorJob(executor: GideonJobExecutor, input: GideonExecutorJobInput): Promise<Project> {
  if (input.kind === "analysis") {
    return executor.runAnalysisJob(input.projectId, input.jobId);
  }
  return executor.runRenderJob(input.projectId, input.jobId);
}
