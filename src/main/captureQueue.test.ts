import { describe, expect, it } from "vitest";
import { BullMqCaptureAssemblyQueue, BullMqCaptureRunQueue, BullMqDiscoveryRunQueue, BullMqEnvironmentValidationQueue } from "./captureQueue";

describe("capture run queue", () => {
  it("enqueues only opaque scoped identifiers with bounded retries", async () => {
    const calls: unknown[] = [];
    const queue = new BullMqCaptureRunQueue({ async add(...args) { calls.push(args); }, async close() {} });
    await queue.enqueue({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "job-1" });
    expect(calls[0]).toEqual(["flow_capture", { workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "job-1" }, expect.objectContaining({ attempts: 2, jobId: "job-1" })]);
    expect(JSON.stringify(calls)).not.toContain("password");
  });

  it("rejects unsafe identifiers before enqueue", async () => {
    const queue = new BullMqCaptureRunQueue({ async add() {}, async close() {} });
    await expect(queue.enqueue({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture 1", jobId: "job-1" })).rejects.toThrow("captureRunId is invalid");
  });

  it("queues environment validation separately with bounded retries", async () => {
    const calls: unknown[] = [];
    const queue = new BullMqEnvironmentValidationQueue({ async add(...args) { calls.push(args); }, async close() {} });
    await queue.enqueue({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", jobId: "job-1" });
    expect(calls[0]).toEqual(["environment_validation", { workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", jobId: "job-1" }, expect.objectContaining({ attempts: 3, jobId: "job-1" })]);
  });

  it("queues discovery using opaque identifiers instead of goals or credentials", async () => {
    const calls: unknown[] = [];
    const queue = new BullMqDiscoveryRunQueue({ async add(...args) { calls.push(args); }, async close() {} });
    await queue.enqueue({ workspaceId: "workspace-1", projectId: "project-1", discoveryRunId: "discovery-1", jobId: "job-1" });
    expect(calls[0]).toEqual(["flow_discovery", { workspaceId: "workspace-1", projectId: "project-1", discoveryRunId: "discovery-1", jobId: "job-1" }, expect.objectContaining({ attempts: 2, jobId: "job-1" })]);
    expect(JSON.stringify(calls)).not.toContain("goal");
  });

  it("queues assembly without exposing the clip selection", async () => {
    const calls: unknown[] = [];
    const queue = new BullMqCaptureAssemblyQueue({ async add(...args) { calls.push(args); }, async close() {} });
    await queue.enqueue({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "assembly-job-1" });
    expect(calls[0]).toEqual(["capture_assembly", { workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "assembly-job-1" }, expect.objectContaining({ attempts: 2 })]);
    expect(JSON.stringify(calls)).not.toContain("executionIds");
  });
});
