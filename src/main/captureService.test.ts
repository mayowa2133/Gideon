import { describe, expect, it } from "vitest";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CapturePersona,
  ProductFlowRevision
} from "../shared/productFlowCapture";
import { createCaptureApplicationService, type CaptureServiceRepository } from "./captureService";

describe("capture application service", () => {
  it("creates a normalized draft environment without accepting insecure remote URLs", async () => {
    const repository = new MemoryCaptureRepository();
    const service = createService(repository, ["environment-1"]);
    const environment = await service.createEnvironment({
      workspaceId: "workspace-1",
      projectId: "project-1",
      name: " Demo staging ",
      type: "staging",
      baseUrl: "https://demo.example.test/",
      allowedDomains: ["DEMO.EXAMPLE.TEST"],
      resetAdapter: "fixture_api"
    });
    expect(environment).toMatchObject({
      id: "environment-1",
      name: "Demo staging",
      baseUrl: "https://demo.example.test",
      allowedDomains: ["demo.example.test"],
      status: "draft",
      revision: 1
    });
    await expect(
      service.createEnvironment({
        workspaceId: "workspace-1",
        projectId: "project-1",
        name: "Unsafe",
        type: "staging",
        baseUrl: "http://demo.example.test",
        allowedDomains: ["demo.example.test"],
        resetAdapter: "none"
      })
    ).rejects.toThrow("require HTTPS");
    await expect(
      service.createEnvironment({
        workspaceId: "workspace-1",
        projectId: "project-1",
        name: "Credentials",
        type: "staging",
        baseUrl: "https://user:pass@demo.example.test",
        allowedDomains: ["demo.example.test"],
        resetAdapter: "none"
      })
    ).rejects.toThrow("credentials are forbidden");
  });

  it("validates network policy and commits an immutable environment version before ready state", async () => {
    const repository = new MemoryCaptureRepository();
    const service = createService(repository, ["environment-1", "environment-version-1"]);
    await service.createEnvironment({
      workspaceId: "workspace-1",
      projectId: "project-1",
      name: "Demo",
      type: "staging",
      baseUrl: "https://demo.example.test",
      allowedDomains: ["demo.example.test"],
      resetAdapter: "fixture_api"
    });
    const result = await service.validateEnvironment({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1"
    });
    expect(result.environment).toMatchObject({ status: "ready", currentVersionId: "environment-version-1" });
    expect(result.version.applicationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.version.browserPolicyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.versions.get("environment-version-1")).toEqual(result.version);
  });

  it("creates normalized personas only within the environment project scope", async () => {
    const repository = seededRepository();
    const service = createService(repository, ["persona-new"]);
    const persona = await service.createPersona({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      key: "Founder Admin",
      displayName: "Founder",
      roleDescription: "Workspace owner using synthetic fixtures.",
      fixtureProfileId: "fresh-account"
    });
    expect(persona).toMatchObject({ id: "persona-new", key: "founder-admin", revision: 1, status: "active" });
    await expect(
      service.createPersona({
        workspaceId: "workspace-1",
        projectId: "other-project",
        environmentId: "environment-1",
        key: "member",
        displayName: "Member",
        roleDescription: "A member role."
      })
    ).rejects.toThrow("Capture environment was not found");
  });

  it("versions environment and persona edits and invalidates prior validation", async () => {
    const repository = seededRepository();
    const service = createService(repository, []);
    const environment = await service.updateEnvironment({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", name: "Updated demo", type: "local_preview", baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], resetAdapter: "fixture_api" });
    expect(environment).toMatchObject({ revision: 2, status: "draft", currentVersionId: undefined });
    const persona = await service.updatePersona({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1", key: "founder", displayName: "Founder admin", roleDescription: "Updated synthetic founder role.", status: "disabled" });
    expect(persona).toMatchObject({ revision: 2, status: "disabled", displayName: "Founder admin" });
  });

  it("requires current environment/persona ownership and monotonic draft flow revisions", async () => {
    const repository = seededRepository();
    const service = createService(repository, []);
    const draft = flowFixture();
    await expect(
      service.saveFlowRevision({
        workspaceId: "workspace-1",
        projectId: "project-1",
        flow: draft
      })
    ).resolves.toEqual(draft);

    const staleRevision = structuredClone(draft);
    await expect(
      service.saveFlowRevision({
        workspaceId: "workspace-1",
        projectId: "project-1",
        flow: staleRevision
      })
    ).rejects.toThrow("revision must be 2");

    const forgedApproval = structuredClone(draft);
    forgedApproval.revision = 2;
    forgedApproval.approval = {
      status: "approved",
      approvedBy: "attacker",
      approvedAt: "2026-07-14T10:00:00.000Z",
      approvedRevision: 2
    };
    await expect(
      service.saveFlowRevision({
        workspaceId: "workspace-1",
        projectId: "project-1",
        flow: forgedApproval
      })
    ).rejects.toThrow("must begin as drafts");
  });

  it("creates an immutable approval revision with server-owned provenance", async () => {
    const repository = seededRepository();
    repository.flows.set("flow-1", flowFixture());
    const service = createService(repository, []);
    const approved = await service.setFlowApproval({
      workspaceId: "workspace-1",
      projectId: "project-1",
      flowId: "flow-1",
      status: "approved",
      actorUserId: "user-1"
    });
    expect(approved).toMatchObject({
      revision: 2,
      approval: {
        status: "approved",
        approvedBy: "user-1",
        approvedAt: "2026-07-14T10:00:00.000Z",
        approvedRevision: 2
      }
    });
    expect(repository.flows.get("flow-1")).toEqual(approved);
    await expect(service.setFlowApproval({ workspaceId: "workspace-1", projectId: "project-1", flowId: "flow-1", status: "rejected", actorUserId: "user-1", expectedRevision: 1 })).rejects.toThrow("revision conflict");
  });
});

class MemoryCaptureRepository implements CaptureServiceRepository {
  environments = new Map<string, CaptureEnvironment>();
  versions = new Map<string, CaptureEnvironmentVersion>();
  personas = new Map<string, CapturePersona>();
  flows = new Map<string, ProductFlowRevision>();

  async upsertEnvironment(environment: CaptureEnvironment): Promise<CaptureEnvironment> {
    this.environments.set(environment.id, structuredClone(environment));
    return structuredClone(environment);
  }
  async getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null> {
    const value = this.environments.get(input.environmentId);
    return value?.workspaceId === input.workspaceId ? structuredClone(value) : null;
  }
  async listProjectEnvironments(input: { workspaceId: string; projectId: string }): Promise<CaptureEnvironment[]> {
    return [...this.environments.values()].filter(
      (value) => value.workspaceId === input.workspaceId && value.projectId === input.projectId
    );
  }
  async upsertEnvironmentVersion(version: CaptureEnvironmentVersion): Promise<CaptureEnvironmentVersion> {
    this.versions.set(version.id, structuredClone(version));
    return structuredClone(version);
  }
  async getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null> {
    const value = this.versions.get(input.versionId);
    return value?.workspaceId === input.workspaceId ? structuredClone(value) : null;
  }
  async upsertPersona(persona: CapturePersona): Promise<CapturePersona> {
    this.personas.set(persona.id, structuredClone(persona));
    return structuredClone(persona);
  }
  async getPersona(input: { workspaceId: string; personaId: string }): Promise<CapturePersona | null> {
    const value = this.personas.get(input.personaId);
    return value?.workspaceId === input.workspaceId ? structuredClone(value) : null;
  }
  async listProjectPersonas(input: { workspaceId: string; projectId: string }): Promise<CapturePersona[]> {
    return [...this.personas.values()].filter(
      (value) => value.workspaceId === input.workspaceId && value.projectId === input.projectId
    );
  }
  async upsertFlowRevision(input: {
    workspaceId: string;
    environmentId: string;
    flow: ProductFlowRevision;
  }): Promise<ProductFlowRevision> {
    this.flows.set(input.flow.id, structuredClone(input.flow));
    return structuredClone(input.flow);
  }
  async getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null> {
    const value = this.flows.get(input.flowId);
    return value && input.workspaceId === "workspace-1" ? structuredClone(value) : null;
  }
  async listProjectFlows(input: { workspaceId: string; projectId: string }): Promise<ProductFlowRevision[]> {
    return [...this.flows.values()].filter((value) => input.workspaceId === "workspace-1" && value.projectId === input.projectId);
  }
}

function createService(repository: MemoryCaptureRepository, ids: string[]) {
  let index = 0;
  return createCaptureApplicationService({
    repository,
    makeId: () => ids[index++] ?? `generated-${index}`,
    now: () => "2026-07-14T10:00:00.000Z",
    networkPolicyOptions: {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      now: () => "2026-07-14T10:00:00.000Z"
    },
    reachabilityProbe: async (baseUrl) => ({ finalUrl: baseUrl, statusCode: 200, redirects: [], resolvedAddresses: ["93.184.216.34"] })
  });
}

function seededRepository(): MemoryCaptureRepository {
  const repository = new MemoryCaptureRepository();
  repository.environments.set("environment-1", {
    id: "environment-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    name: "Demo",
    type: "staging",
    baseUrl: "https://demo.example.test",
    allowedDomains: ["demo.example.test"],
    status: "ready",
    resetAdapter: "fixture_api",
    revision: 1,
    currentVersionId: "environment-version-1",
    createdAt: "2026-07-14T09:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z"
  });
  repository.versions.set("environment-version-1", {
    id: "environment-version-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentId: "environment-1",
    revision: 1,
    applicationFingerprint: "a".repeat(64),
    browserPolicyFingerprint: "b".repeat(64),
    validatedAt: "2026-07-14T10:00:00.000Z",
    createdAt: "2026-07-14T10:00:00.000Z"
  });
  repository.personas.set("persona-1", {
    id: "persona-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentId: "environment-1",
    key: "founder",
    displayName: "Founder",
    roleDescription: "Workspace owner using synthetic data.",
    status: "active",
    revision: 1,
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z"
  });
  return repository;
}

function flowFixture(): ProductFlowRevision {
  return {
    schemaVersion: "1",
    id: "flow-1",
    revision: 1,
    projectId: "project-1",
    environmentVersionId: "environment-version-1",
    personaId: "persona-1",
    title: "Create project",
    goal: "Create a project and verify the result.",
    startingState: { entryPath: "/app" },
    steps: [
      {
        id: "step-1",
        intent: "Open project creation.",
        action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } },
        riskClass: "navigate"
      }
    ],
    finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Create project" } }],
    approval: { status: "draft" },
    sourceEvidenceIds: ["user-goal:1"]
  };
}
