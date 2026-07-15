import { describe, expect, it } from "vitest";
import { createJob } from "../shared/jobState";
import type { CaptureApplicationService } from "./captureService";
import { createEnvironmentValidationWorker } from "./environmentValidationWorker";

describe("environment validation worker", () => {
  it("records a safe failed state without exposing network diagnostics", async () => {
    let job = createJob({ id: "job-1", projectId: "project-1", kind: "environment_validation", now: "2026-07-14T10:00:00.000Z" });
    let environment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "staging" as const, baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "validating" as const, resetAdapter: "fixture_api" as const, revision: 1, createdAt: job.createdAt, updatedAt: job.updatedAt };
    const service = { async validateEnvironment() { throw new Error("resolved to 169.254.169.254"); } } as CaptureApplicationService;
    const worker = createEnvironmentValidationWorker({ repository: { async getJob() { return job; }, async upsertJob(input) { job = input.job; return job; }, async getEnvironment() { return environment; }, async upsertEnvironment(input) { environment = input as typeof environment; return input; } }, service, now: () => "2026-07-14T10:01:00.000Z" });
    await expect(worker.execute({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", jobId: "job-1" })).rejects.toThrow("could not be validated safely");
    expect(job).toMatchObject({ status: "failed", safeError: "Capture environment could not be validated safely." });
    expect(JSON.stringify({ job, environment })).not.toContain("169.254");
  });
});
