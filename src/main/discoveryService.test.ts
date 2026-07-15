import { describe, expect, it } from "vitest";
import type { CaptureEnvironment, CaptureEnvironmentVersion, CapturePersona, DiscoveryRun, ProductFlowRevision } from "../shared/productFlowCapture";
import { createDeterministicDiscoveryService, type DiscoveryServiceRepository } from "./discoveryService";

describe("deterministic discovery service", () => {
  it("persists reviewable draft flows and a completed discovery lifecycle", async () => {
    const repository = fixture();
    const ids = ["discovery-1", "flow-1"];
    const result = await createDeterministicDiscoveryService({ repository, makeId: () => ids.shift()!, now: () => "2026-07-14T10:00:00.000Z" }).run({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", jobId: "job-1", goals: [{ id: "goal-1", text: "Show projects", priority: 100 }], renderedPages: [{ id: "page-1", url: "/projects", title: "Projects", controls: [], accessibleTreeHash: "a".repeat(64), domStructureHash: "b".repeat(64) }] });
    expect(result.run.status).toBe("ready_for_review");
    expect(result.flows[0]).toMatchObject({ id: "flow-1", approval: { status: "draft" } });
    expect(repository.runs.map((run) => run.status)).toEqual(["inventory", "ready_for_review"]);
  });
});

function fixture(): DiscoveryServiceRepository & { runs: DiscoveryRun[] } {
  const environment: CaptureEnvironment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "local_preview", baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: "version-1", createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" };
  const version: CaptureEnvironmentVersion = { id: "version-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", revision: 1, applicationFingerprint: "a".repeat(64), browserPolicyFingerprint: "b".repeat(64), validatedAt: environment.createdAt, createdAt: environment.createdAt };
  const persona: CapturePersona = { id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", key: "founder", displayName: "Founder", roleDescription: "Founder role", status: "active", revision: 1, createdAt: environment.createdAt, updatedAt: environment.createdAt };
  return { runs: [], async getEnvironment() { return environment; }, async getEnvironmentVersion() { return version; }, async listProjectPersonas() { return [persona]; }, async upsertDiscoveryRun(run) { this.runs.push(structuredClone(run)); return run; }, async upsertFlowRevision(input) { return input.flow; } };
}
