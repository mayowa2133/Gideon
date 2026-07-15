import { describe, expect, it } from "vitest";
import type { CaptureEnvironment, CapturePersona, DiscoveryRun } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import { createDiscoveryRunCoordinator, type DiscoveryRunCoordinatorRepository } from "./discoveryRunCoordinator";

describe("discovery run coordinator", () => {
  it("atomically creates and safely re-enqueues an idempotent discovery run", async () => {
    const repository = fixture();
    const queued: unknown[] = [];
    let id = 0;
    const coordinator = createDiscoveryRunCoordinator({ repository, queue: { async enqueue(input) { queued.push(input); } }, makeId: () => `id-${++id}`, now: () => "2026-07-14T10:00:00.000Z" });
    const input = { workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", goals: [{ id: "goal-1", text: "Show reporting", priority: 80 }], idempotencyKey: "discover-key-1" };
    const first = await coordinator.create(input);
    const second = await coordinator.create(input);
    expect(first).toMatchObject({ reused: false, run: { status: "queued", jobId: "id-1", id: "id-2" }, job: { kind: "flow_discovery" } });
    expect(second.reused).toBe(true);
    expect(queued).toHaveLength(2);
  });

  it("requires a ready environment and an active persona", async () => {
    const repository = fixture({ personas: [] });
    const coordinator = createDiscoveryRunCoordinator({ repository, queue: { async enqueue() {} } });
    await expect(coordinator.create({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", goals: [{ id: "goal-1", text: "Show reporting", priority: 80 }], idempotencyKey: "discover-key-1" })).rejects.toThrow("active capture persona");
  });
});

function fixture(options: { personas?: CapturePersona[] } = {}): DiscoveryRunCoordinatorRepository {
  const environment: CaptureEnvironment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "staging", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "ready", currentVersionId: "version-1", resetAdapter: "fixture_api", revision: 1, createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T09:00:00.000Z" };
  const personas = options.personas ?? [{ id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", key: "admin", displayName: "Admin", roleDescription: "Admin", status: "active", revision: 1, createdAt: environment.createdAt, updatedAt: environment.updatedAt }];
  let saved: { run: DiscoveryRun; job: JobRecord; requestHash: string } | null = null;
  return { async getEnvironment() { return environment; }, async listProjectPersonas() { return personas; }, async getIdempotentDiscovery() { return saved; }, async persistDiscoveryJob(input) { saved = { run: input.run, job: input.job, requestHash: input.requestHash }; } };
}
