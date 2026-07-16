import { createHash, randomUUID } from "node:crypto";
import {
  parseProductFlowRevision,
  type BrowserExecutionPolicy,
  type CaptureEnvironment,
  type CaptureEnvironmentType,
  type CaptureEnvironmentVersion,
  type CapturePersona,
  type ProductFlowRevision
} from "../shared/productFlowCapture";
import { validateCaptureNetworkDestination, type CaptureNetworkPolicyOptions } from "./captureNetworkPolicy";
import { probeCaptureEnvironmentReachability, type CaptureEnvironmentProbeReceipt } from "./captureEnvironmentProbe";
import { stableSerialize } from "./productFlowCompiler";

export interface CaptureServiceRepository {
  upsertEnvironment(environment: CaptureEnvironment): Promise<CaptureEnvironment>;
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  listProjectEnvironments(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CaptureEnvironment[]>;
  upsertEnvironmentVersion(version: CaptureEnvironmentVersion): Promise<CaptureEnvironmentVersion>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
  upsertPersona(persona: CapturePersona): Promise<CapturePersona>;
  getPersona(input: { workspaceId: string; personaId: string }): Promise<CapturePersona | null>;
  listProjectPersonas(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CapturePersona[]>;
  upsertFlowRevision(input: {
    workspaceId: string;
    environmentId: string;
    flow: ProductFlowRevision;
    createdAt: string;
  }): Promise<ProductFlowRevision>;
  getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null>;
  listProjectFlows(input: { workspaceId: string; projectId: string; limit?: number }): Promise<ProductFlowRevision[]>;
}

export interface CaptureServiceOptions {
  repository: CaptureServiceRepository;
  makeId?: () => string;
  now?: () => string;
  networkPolicyOptions?: CaptureNetworkPolicyOptions;
  reachabilityProbe?: (baseUrl: string, policy: BrowserExecutionPolicy, options?: CaptureNetworkPolicyOptions) => Promise<CaptureEnvironmentProbeReceipt>;
}

export interface CreateCaptureEnvironmentInput {
  workspaceId: string;
  projectId: string;
  name: string;
  type: CaptureEnvironmentType;
  baseUrl: string;
  allowedDomains: string[];
  resetAdapter: CaptureEnvironment["resetAdapter"];
}

export interface CreateCapturePersonaInput {
  workspaceId: string;
  projectId: string;
  environmentId: string;
  key: string;
  displayName: string;
  roleDescription: string;
  fixtureProfileId?: string;
  credentialGrantId?: string;
}

export interface CaptureApplicationService {
  createEnvironment(input: CreateCaptureEnvironmentInput): Promise<CaptureEnvironment>;
  listEnvironments(input: { workspaceId: string; projectId: string }): Promise<CaptureEnvironment[]>;
  getEnvironment(input: { workspaceId: string; projectId: string; environmentId: string }): Promise<CaptureEnvironment>;
  updateEnvironment(input: CreateCaptureEnvironmentInput & { environmentId: string }): Promise<CaptureEnvironment>;
  validateEnvironment(input: {
    workspaceId: string;
    projectId: string;
    environmentId: string;
  }): Promise<{ environment: CaptureEnvironment; version: CaptureEnvironmentVersion }>;
  createPersona(input: CreateCapturePersonaInput): Promise<CapturePersona>;
  listPersonas(input: { workspaceId: string; projectId: string }): Promise<CapturePersona[]>;
  updatePersona(input: CreateCapturePersonaInput & { personaId: string; status?: CapturePersona["status"] }): Promise<CapturePersona>;
  saveFlowRevision(input: {
    workspaceId: string;
    projectId: string;
    flow: unknown;
  }): Promise<ProductFlowRevision>;
  setFlowApproval(input: {
    workspaceId: string;
    projectId: string;
    flowId: string;
    status: "approved" | "rejected";
    actorUserId: string;
    expectedRevision?: number;
  }): Promise<ProductFlowRevision>;
  listFlows(input: { workspaceId: string; projectId: string }): Promise<ProductFlowRevision[]>;
  getFlow(input: { workspaceId: string; projectId: string; flowId: string }): Promise<ProductFlowRevision>;
}

export function createCaptureApplicationService(options: CaptureServiceOptions): CaptureApplicationService {
  const repository = options.repository;
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async createEnvironment(input) {
      const createdAt = now();
      const normalized = normalizeEnvironmentInput(input);
      return repository.upsertEnvironment({
        id: makeId(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        name: normalized.name,
        type: input.type,
        baseUrl: normalized.baseUrl,
        allowedDomains: normalized.allowedDomains,
        status: "draft",
        resetAdapter: input.resetAdapter,
        revision: 1,
        createdAt,
        updatedAt: createdAt
      });
    },

    listEnvironments(input) {
      return repository.listProjectEnvironments(input);
    },

    getEnvironment(input) {
      return requireEnvironment(repository, input);
    },

    async updateEnvironment(input) {
      const current = await requireEnvironment(repository, input);
      const normalized = normalizeEnvironmentInput(input);
      const updatedAt = now();
      return repository.upsertEnvironment({
        ...current,
        name: normalized.name,
        type: input.type,
        baseUrl: normalized.baseUrl,
        allowedDomains: normalized.allowedDomains,
        resetAdapter: input.resetAdapter,
        revision: current.revision + 1,
        status: "draft",
        currentVersionId: undefined,
        safeErrorCode: undefined,
        updatedAt
      });
    },

    async validateEnvironment(input) {
      const environment = await requireEnvironment(repository, input);
      const policy = browserPolicyForEnvironment(environment);
      const receipt = await validateCaptureNetworkDestination(environment.baseUrl, policy, options.networkPolicyOptions);
      const reachability = await (options.reachabilityProbe ?? probeCaptureEnvironmentReachability)(environment.baseUrl, policy, options.networkPolicyOptions);
      const validatedAt = now();
      const version: CaptureEnvironmentVersion = {
        id: makeId(),
        workspaceId: environment.workspaceId,
        projectId: environment.projectId,
        environmentId: environment.id,
        revision: environment.revision,
        applicationFingerprint: sha256(stableSerialize({
          hostname: receipt.hostname,
          resolvedAddresses: receipt.resolvedAddresses,
          finalUrl: reachability.finalUrl,
          redirects: reachability.redirects,
          statusCode: reachability.statusCode,
          environmentRevision: environment.revision
        })),
        browserPolicyFingerprint: sha256(stableSerialize(policy)),
        validatedAt,
        createdAt: validatedAt
      };
      await repository.upsertEnvironmentVersion(version);
      const updated = await repository.upsertEnvironment({
        ...environment,
        status: "ready",
        currentVersionId: version.id,
        safeErrorCode: undefined,
        updatedAt: validatedAt
      });
      return { environment: updated, version };
    },

    async createPersona(input) {
      await requireEnvironment(repository, input);
      const createdAt = now();
      const key = bounded(input.key, "persona key", 1, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      if (!key) throw new Error("Persona key is invalid.");
      const persona: CapturePersona = {
        id: makeId(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        key,
        displayName: bounded(input.displayName, "persona display name", 1, 120),
        roleDescription: bounded(input.roleDescription, "persona role description", 3, 600),
        fixtureProfileId: optionalBounded(input.fixtureProfileId, "fixture profile ID", 1, 200),
        credentialGrantId: optionalBounded(input.credentialGrantId, "credential grant ID", 1, 200),
        status: "active",
        revision: 1,
        createdAt,
        updatedAt: createdAt
      };
      return repository.upsertPersona(persona);
    },

    listPersonas(input) {
      return repository.listProjectPersonas(input);
    },

    async updatePersona(input) {
      await requireEnvironment(repository, input);
      const current = await repository.getPersona({ workspaceId: input.workspaceId, personaId: input.personaId });
      if (!current || current.projectId !== input.projectId || current.environmentId !== input.environmentId) throw new Error("Capture persona was not found.");
      const updatedAt = now();
      return repository.upsertPersona({
        ...current,
        key: bounded(input.key, "persona key", 1, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
        displayName: bounded(input.displayName, "persona display name", 1, 120),
        roleDescription: bounded(input.roleDescription, "persona role description", 3, 600),
        fixtureProfileId: optionalBounded(input.fixtureProfileId, "fixture profile ID", 1, 200),
        credentialGrantId: optionalBounded(input.credentialGrantId, "credential grant ID", 1, 200),
        status: input.status ?? current.status,
        revision: current.revision + 1,
        updatedAt
      });
    },

    async saveFlowRevision(input) {
      const flow = parseProductFlowRevision(input.flow);
      if (flow.approval.status !== "draft") throw new Error("New product flow revisions must begin as drafts.");
      const current = await repository.getFlow({ workspaceId: input.workspaceId, flowId: flow.id });
      const expectedRevision = current ? current.revision + 1 : 1;
      if (flow.revision !== expectedRevision) {
        throw new Error(`Product flow revision must be ${expectedRevision}.`);
      }
      if (current && current.projectId !== flow.projectId) throw new Error("Product flow was not found.");
      const environment = await assertFlowOwnership(repository, input, flow);
      return repository.upsertFlowRevision({
        workspaceId: input.workspaceId,
        environmentId: environment.id,
        flow,
        createdAt: now()
      });
    },

    async setFlowApproval(input) {
      const current = await repository.getFlow({ workspaceId: input.workspaceId, flowId: input.flowId });
      if (!current || current.projectId !== input.projectId) throw new Error("Product flow was not found.");
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
        throw new Error(`Product flow revision conflict: expected ${input.expectedRevision}, current revision is ${current.revision}. Review the latest revision before approving.`);
      }
      const environment = await assertFlowOwnership(repository, input, current);
      if (current.approval.status === input.status) return current;
      const updatedAt = now();
      const next: ProductFlowRevision = {
        ...structuredClone(current),
        revision: current.revision + 1,
        approval:
          input.status === "approved"
            ? {
                status: "approved",
                approvedBy: input.actorUserId,
                approvedAt: updatedAt,
                approvedRevision: current.revision + 1
              }
            : { status: "rejected" }
      };
      return repository.upsertFlowRevision({
        workspaceId: input.workspaceId,
        environmentId: environment.id,
        flow: next,
        createdAt: updatedAt
      });
    },

    listFlows(input) {
      return repository.listProjectFlows(input);
    },

    async getFlow(input) {
      const flow = await repository.getFlow({ workspaceId: input.workspaceId, flowId: input.flowId });
      if (!flow || flow.projectId !== input.projectId) throw new Error("Product flow was not found.");
      return flow;
    }
  };
}

function normalizeEnvironmentInput(input: CreateCaptureEnvironmentInput): {
  name: string;
  baseUrl: string;
  allowedDomains: string[];
} {
  const name = bounded(input.name, "environment name", 1, 120);
  const allowedTypes = new Set<CaptureEnvironmentType>(["local_preview", "staging", "demo", "production_sandbox"]);
  if (!allowedTypes.has(input.type)) throw new Error("Capture environment type is invalid.");
  const allowedResetAdapters = new Set<CaptureEnvironment["resetAdapter"]>([
    "none",
    "http_endpoint",
    "fixture_api",
    "disposable_account",
    "manual"
  ]);
  if (!allowedResetAdapters.has(input.resetAdapter)) throw new Error("Capture reset adapter is invalid.");
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error("Capture environment URL is invalid.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(input.type === "local_preview" && local && url.protocol === "http:")) {
    throw new Error("Capture environments require HTTPS except for local previews.");
  }
  if (url.username || url.password) throw new Error("Capture environment URL credentials are forbidden.");
  url.hash = "";
  const allowedDomains = [...new Set(input.allowedDomains.map(normalizeHostname))];
  if (allowedDomains.length < 1 || allowedDomains.length > 20) throw new Error("Capture environment requires 1–20 allowed domains.");
  if (!allowedDomains.includes(normalizeHostname(url.hostname))) {
    throw new Error("Capture environment host must be included in allowed domains.");
  }
  return { name, baseUrl: url.toString().replace(/\/$/, ""), allowedDomains };
}

export function browserPolicyForEnvironment(environment: CaptureEnvironment): BrowserExecutionPolicy {
  return {
    baseUrl: environment.baseUrl,
    allowedDomains: environment.allowedDomains,
    allowedRisks: ["observe", "navigate", "synthetic_write"],
    allowedKeys: ["Enter", "Escape", "Tab", "Shift+Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    allowHttpLocalhost: environment.type === "local_preview",
    allowSubdomains: false,
    allowCredentialInjectionFromLoginAdapter: true,
    maxSteps: 100
  };
}

async function requireEnvironment(
  repository: CaptureServiceRepository,
  input: { workspaceId: string; projectId: string; environmentId: string }
): Promise<CaptureEnvironment> {
  const environment = await repository.getEnvironment({
    workspaceId: input.workspaceId,
    environmentId: input.environmentId
  });
  if (!environment || environment.projectId !== input.projectId) throw new Error("Capture environment was not found.");
  if (environment.status === "revoked") throw new Error("Capture environment has been revoked.");
  return environment;
}

async function assertFlowOwnership(
  repository: CaptureServiceRepository,
  input: { workspaceId: string; projectId: string },
  flow: ProductFlowRevision
): Promise<CaptureEnvironment> {
  const version = await repository.getEnvironmentVersion({
    workspaceId: input.workspaceId,
    versionId: flow.environmentVersionId
  });
  if (!version || version.projectId !== input.projectId) throw new Error("Capture environment was not found.");
  const environment = await requireEnvironment(repository, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    environmentId: version.environmentId
  });
  if (environment.status !== "ready" || environment.currentVersionId !== flow.environmentVersionId) {
    throw new Error("Product flow environment version is not current and ready.");
  }
  if (flow.projectId !== input.projectId) throw new Error("Product flow was not found.");
  const persona = await repository.getPersona({ workspaceId: input.workspaceId, personaId: flow.personaId });
  if (!persona || persona.projectId !== input.projectId || persona.environmentId !== environment.id) {
    throw new Error("Capture persona was not found.");
  }
  return environment;
}

function bounded(value: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must be ${min}–${max} characters.`);
  return normalized;
}

function optionalBounded(value: string | undefined, label: string, min: number, max: number): string | undefined {
  return value === undefined ? undefined : bounded(value, label, min, max);
}

function normalizeHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.length > 253 || /[^a-z0-9.:-]/.test(hostname)) throw new Error("Allowed domain is invalid.");
  return hostname;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
