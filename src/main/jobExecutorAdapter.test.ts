import { describe, expect, it } from "vitest";
import { createExecutorWorkerQueueTask, createHostedWorkerExecutorAdapter, runGideonExecutorJob } from "./jobExecutorAdapter";
import type { GideonJobExecutor } from "./jobExecutor";
import type { Project } from "../shared/types";

describe("job executor adapters", () => {
  it("creates desktop worker queue tasks that use the shared Gideon executor", async () => {
    const calls: string[] = [];
    const executor = executorFixture(calls);

    const analysisTask = createExecutorWorkerQueueTask(executor, {
      kind: "analysis",
      projectId: "project-1",
      jobId: "job-analysis"
    });
    const renderTask = createExecutorWorkerQueueTask(executor, {
      kind: "render",
      projectId: "project-1",
      jobId: "job-render"
    });

    await analysisTask.run();
    await renderTask.run();

    expect(analysisTask).toMatchObject({ id: "job-analysis", kind: "analysis", projectId: "project-1" });
    expect(renderTask).toMatchObject({ id: "job-render", kind: "render", projectId: "project-1" });
    expect(calls).toEqual(["analysis:project-1:job-analysis", "render:project-1:job-render"]);
  });

  it("adapts hosted worker jobs to the same shared Gideon executor methods", async () => {
    const calls: string[] = [];
    const hostedExecutor = createHostedWorkerExecutorAdapter(executorFixture(calls));

    await hostedExecutor.runAnalysisJob({ projectId: "project-2", jobId: "job-analysis" });
    await hostedExecutor.runRenderJob({ projectId: "project-2", jobId: "job-render" });

    expect(calls).toEqual(["analysis:project-2:job-analysis", "render:project-2:job-render"]);
  });

  it("rejects unsupported executable kinds at compile-time and routes supported kinds explicitly", async () => {
    const calls: string[] = [];
    const executor = executorFixture(calls);

    await runGideonExecutorJob(executor, { kind: "analysis", projectId: "project-3", jobId: "job-1" });
    await runGideonExecutorJob(executor, { kind: "render", projectId: "project-3", jobId: "job-2" });

    expect(calls).toEqual(["analysis:project-3:job-1", "render:project-3:job-2"]);
  });
});

function executorFixture(calls: string[]): GideonJobExecutor {
  return {
    async runAnalysisJob(projectId, jobId) {
      calls.push(`analysis:${projectId}:${jobId}`);
      return { id: projectId } as Project;
    },
    async runRenderJob(projectId, jobId) {
      calls.push(`render:${projectId}:${jobId}`);
      return { id: projectId } as Project;
    }
  };
}
