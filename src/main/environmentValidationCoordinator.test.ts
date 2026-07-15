import { describe, expect, it } from "vitest";
import type { CaptureEnvironment } from "../shared/productFlowCapture";
import { createEnvironmentValidationCoordinator, type EnvironmentValidationCoordinatorRepository } from "./environmentValidationCoordinator";

describe("environment validation coordinator", () => {
  it("atomically marks validation queued and safely re-enqueues idempotent requests", async () => {
    const repository = fixture();
    const queued: unknown[] = [];
    const coordinator = createEnvironmentValidationCoordinator({ repository, queue: { async enqueue(input) { queued.push(input); } }, makeId: () => "job-1", now: () => "2026-07-14T10:00:00.000Z" });
    const first = await coordinator.create({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", idempotencyKey: "validate-key-1" });
    expect(first).toMatchObject({ reused: false, job: { kind: "environment_validation", status: "queued" }, environment: { status: "validating" } });
    const second = await coordinator.create({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", idempotencyKey: "validate-key-1" });
    expect(second.reused).toBe(true);
    expect(queued).toHaveLength(2);
  });
});

function fixture(): EnvironmentValidationCoordinatorRepository {
  let environment: CaptureEnvironment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "local_preview", baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], status: "draft", resetAdapter: "fixture_api", revision: 1, createdAt: "2026-07-14T09:00:00.000Z", updatedAt: "2026-07-14T09:00:00.000Z" };
  let idempotent: { job: import("../shared/types").JobRecord; requestHash: string } | null = null;
  return { async getEnvironment() { return environment; }, async getIdempotentEnvironmentValidation() { return idempotent; }, async persistEnvironmentValidationJob(input) { environment = input.environment; idempotent = { job: input.job, requestHash: input.requestHash }; } };
}
