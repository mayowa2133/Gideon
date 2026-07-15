import { describe, expect, it } from "vitest";
import type { JobRecord } from "../shared/types";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CaptureRun,
  ProductFlowRevision
} from "../shared/productFlowCapture";
import { createCaptureRunCoordinator, type CaptureRunCoordinatorRepository } from "./captureRunCoordinator";

describe("capture run coordinator", () => {
  it("compiles approved current flows, stores safe job input, and queues once", async () => {
    const repository = fixtureRepository();
    const queued: unknown[] = [];
    const quota: unknown[] = [];
    const coordinator = createCaptureRunCoordinator({
      repository,
      queue: { async enqueue(input) { queued.push(input); } },
      quota: { async authorize(input) { quota.push(input); } },
      makeId: sequentialIds("job-1", "capture-1"),
      now: () => "2026-07-14T12:00:00.000Z"
    });

    const result = await coordinator.create(request());

    expect(result.reused).toBe(false);
    expect(result.captureRun).toMatchObject({ status: "queued", jobId: "job-1", id: "capture-1" });
    expect(result.captureRun.compiledPlanHashes[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.persisted[0].safeInput).not.toHaveProperty("baseUrl");
    expect(queued).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "job-1" }]);
    expect(quota).toEqual([expect.objectContaining({ workspaceId: "workspace-1", projectId: "project-1", flowCount: 1, estimatedBrowserSeconds: 48 })]);
  });

  it("reuses an identical idempotent request and safely re-enqueues a still-queued run", async () => {
    const repository = fixtureRepository();
    const queued: unknown[] = [];
    const coordinator = createCaptureRunCoordinator({
      repository,
      queue: { async enqueue(input) { queued.push(input); } },
      makeId: sequentialIds("job-1", "capture-1")
    });
    const first = await coordinator.create(request());
    repository.existing = first.captureRun;

    const second = await coordinator.create(request());

    expect(second.reused).toBe(true);
    expect(second.captureRun.id).toBe(first.captureRun.id);
    expect(queued).toHaveLength(2);
  });

  it("rejects idempotency conflicts, unapproved flows, stale flows, and cross-project access", async () => {
    const repository = fixtureRepository();
    const coordinator = createCaptureRunCoordinator({ repository, queue: { async enqueue() {} } });
    const first = await coordinator.create(request());
    repository.existing = first.captureRun;
    await expect(coordinator.create({ ...request(), flowIds: ["flow-2"] })).rejects.toThrow("different capture request");

    repository.existing = null;
    repository.flow = { ...repository.flow, approval: { status: "draft" } };
    await expect(coordinator.create(request())).rejects.toThrow("current approved flow revision");
    repository.flow = approvedFlow();
    repository.flow.environmentVersionId = "old-version";
    await expect(coordinator.create(request())).rejects.toThrow("stale");
    repository.flow = approvedFlow();
    repository.environment.projectId = "another-project";
    await expect(coordinator.create(request())).rejects.toThrow("not found");
  });

  it("does not expose a queued job as success when enqueue fails", async () => {
    const repository = fixtureRepository();
    const coordinator = createCaptureRunCoordinator({
      repository,
      queue: { async enqueue() { throw new Error("broker unavailable"); } }
    });
    await expect(coordinator.create(request())).rejects.toThrow("saved but could not be queued");
    expect(repository.persisted).toHaveLength(1);
  });

  it("converges an idempotency race on the already committed run", async () => {
    const repository = fixtureRepository();
    const queued: unknown[] = [];
    const coordinator = createCaptureRunCoordinator({ repository, queue: { async enqueue(input) { queued.push(input); } }, makeId: sequentialIds("job-1", "capture-1") });
    const originalPersist = repository.persistCaptureRunAndJob.bind(repository);
    repository.persistCaptureRunAndJob = async (input) => { await originalPersist(input); repository.existing = input.captureRun; throw new Error("unique violation"); };
    const result = await coordinator.create(request());
    expect(result).toMatchObject({ reused: true, captureRun: { id: "capture-1" } });
    expect(queued).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "job-1" }]);
  });
});

interface FixtureRepository extends CaptureRunCoordinatorRepository {
  environment: CaptureEnvironment;
  version: CaptureEnvironmentVersion;
  flow: ProductFlowRevision;
  existing: CaptureRun | null;
  persisted: Array<{ captureRun: CaptureRun; job: JobRecord; safeInput: Record<string, unknown> }>;
}

function fixtureRepository(): FixtureRepository {
  return {
    environment: environment(),
    version: environmentVersion(),
    flow: approvedFlow(),
    existing: null,
    persisted: [],
    async getEnvironment() { return this.environment; },
    async getEnvironmentVersion() { return this.version; },
    async getFlow(input) { return input.flowId === this.flow.id ? this.flow : null; },
    async getCaptureRunByIdempotency() { return this.existing; },
    async persistCaptureRunAndJob(input) { this.persisted.push(input); }
  };
}

function request() {
  return { workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", flowIds: ["flow-1"], idempotencyKey: "capture-key-1" };
}

function environment(): CaptureEnvironment {
  return {
    id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "local_preview",
    baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], status: "ready", resetAdapter: "fixture_api",
    revision: 1, currentVersionId: "version-1", createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z"
  };
}

function environmentVersion(): CaptureEnvironmentVersion {
  return {
    id: "version-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", revision: 1,
    applicationFingerprint: "a".repeat(64), browserPolicyFingerprint: "b".repeat(64),
    validatedAt: "2026-07-14T10:00:00.000Z", createdAt: "2026-07-14T10:00:00.000Z"
  };
}

function approvedFlow(): ProductFlowRevision {
  return {
    schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1",
    title: "Create project", goal: "Create a project and see its dashboard.", startingState: { entryPath: "/app" },
    steps: [{ id: "step-1", intent: "Open the project form.", action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } }, riskClass: "navigate" }],
    finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Create project" } }],
    approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T11:00:00.000Z", approvedRevision: 2 },
    sourceEvidenceIds: ["goal:user-1"]
  };
}

function sequentialIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}
