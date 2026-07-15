import { describe, expect, it } from "vitest";
import { createJob } from "../shared/jobState";
import type { CaptureEnvironment, CaptureEnvironmentVersion, DiscoveryRun } from "../shared/productFlowCapture";
import { createDiscoveryRunWorker } from "./discoveryRunWorker";

describe("discovery run worker", () => {
  it("collects inventory in an isolated runtime and completes the durable job", async () => {
    const state = fixture();
    const calls: unknown[] = [];
    const worker = createDiscoveryRunWorker({ repository: state.repository, runtime: { isolation: "container", async collect(input) { calls.push(input); return { renderedPages: [] }; } }, discovery: { async run(input) { calls.push(input); state.run = { ...state.run, status: "ready_for_review" }; return { run: state.run, flows: [] }; } }, now: () => "2026-07-14T10:01:00.000Z" });
    const result = await worker.execute({ workspaceId: "workspace-1", projectId: "project-1", discoveryRunId: "discovery-1", jobId: "job-1" });
    expect(result.run.status).toBe("ready_for_review");
    expect(state.job.status).toBe("succeeded");
    expect(calls).toHaveLength(2);
  });

  it("refuses a local browser runtime for remote environments", async () => {
    const state = fixture();
    const worker = createDiscoveryRunWorker({ repository: state.repository, runtime: { isolation: "local_test", async collect() { return { renderedPages: [] }; } }, discovery: { async run() { throw new Error("unreachable"); } } });
    await expect(worker.execute({ workspaceId: "workspace-1", projectId: "project-1", discoveryRunId: "discovery-1", jobId: "job-1" })).rejects.toThrow("container or microVM");
  });
});

function fixture() {
  let job = createJob({ id: "job-1", projectId: "project-1", kind: "flow_discovery", now: "2026-07-14T10:00:00.000Z" });
  let run: DiscoveryRun = { id: "discovery-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: job.id, status: "queued", promptVersion: "deterministic-v1", maxSteps: 500, maxScreenshots: 100, maxDurationMs: 300_000, createdAt: job.createdAt, updatedAt: job.updatedAt };
  const version: CaptureEnvironmentVersion = { id: "version-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", revision: 1, baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], policyFingerprint: "a".repeat(64), createdAt: job.createdAt };
  const environment: CaptureEnvironment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "staging", baseUrl: version.baseUrl, allowedDomains: version.allowedDomains, status: "ready", currentVersionId: version.id, resetAdapter: "fixture_api", revision: 1, createdAt: job.createdAt, updatedAt: job.updatedAt };
  const state = {
    get job() { return job; }, get run() { return run; }, set run(value: DiscoveryRun) { run = value; },
    repository: {
      async getJobRequest() { return { job, inputJson: { goals: [{ id: "goal-1", text: "Show reports", priority: 80 }], maxCandidates: 30 } }; },
      async upsertJob(input: { job: typeof job }) { job = input.job; return job; },
      async getDiscoveryRun() { return run; }, async upsertDiscoveryRun(input: DiscoveryRun) { run = input; return run; }, async getEnvironmentVersion() { return version; }, async getEnvironment() { return environment; }
    }
  };
  return state;
}
