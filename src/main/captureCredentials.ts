import { randomUUID, timingSafeEqual } from "node:crypto";
import type { CaptureAuditSink } from "./captureAudit";

export type CaptureCredentialKind = "username_password" | "session_bootstrap_token";

export interface CaptureCredentialSecret {
  username?: string;
  password?: string;
  sessionBootstrapToken?: string;
}

export interface CaptureCredentialGrant {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  personaId: string;
  kind: CaptureCredentialKind;
  purpose: "capture_login";
  expiresAt: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CreateCaptureCredentialGrantInput {
  workspaceId: string;
  projectId: string;
  environmentId: string;
  personaId: string;
  kind: CaptureCredentialKind;
  secret: CaptureCredentialSecret;
  expiresAt: string;
}

export interface ResolveCaptureCredentialInput {
  grantId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  personaId: string;
}

export interface CaptureCredentialVault {
  create(input: CreateCaptureCredentialGrantInput): Promise<CaptureCredentialGrant>;
  getMetadata(input: ResolveCaptureCredentialInput): Promise<CaptureCredentialGrant | null>;
  use<T>(input: ResolveCaptureCredentialInput, consumer: (secret: Readonly<CaptureCredentialSecret>) => Promise<T>): Promise<T>;
  revoke(input: ResolveCaptureCredentialInput): Promise<CaptureCredentialGrant>;
}

interface StoredGrant {
  metadata: CaptureCredentialGrant;
  secret: CaptureCredentialSecret;
}

export interface InMemoryCaptureCredentialVaultOptions {
  makeId?: () => string;
  now?: () => string;
}

export interface CaptureSecretStore {
  put(input: { reference: string; secret: CaptureCredentialSecret; expiresAt: string }): Promise<void>;
  use<T>(reference: string, consumer: (secret: Readonly<CaptureCredentialSecret>) => Promise<T>): Promise<T>;
  delete(reference: string): Promise<void>;
}

export interface CaptureCredentialMetadataStore {
  upsert(input: { metadata: CaptureCredentialGrant; vaultReference: string }): Promise<void>;
  get(input: { grantId: string; workspaceId: string }): Promise<{ metadata: CaptureCredentialGrant; vaultReference: string } | null>;
}

/** Production vault adapter: only opaque references enter persistence; secrets stay inside the secret-store callback. */
export function createExternalCaptureCredentialVault(options: {
  secrets: CaptureSecretStore;
  metadata: CaptureCredentialMetadataStore;
  makeId?: () => string;
  now?: () => string;
  audit?: CaptureAuditSink;
}): CaptureCredentialVault {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async create(input) {
      validateCreateInput(input, now());
      const id = makeId();
      const vaultReference = `gideon-capture/${makeId()}`;
      const metadata: CaptureCredentialGrant = { id, workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId, personaId: input.personaId, kind: input.kind, purpose: "capture_login", expiresAt: input.expiresAt, createdAt: now() };
      await options.secrets.put({ reference: vaultReference, secret: cloneSecret(input.secret), expiresAt: input.expiresAt });
      try {
        await options.metadata.upsert({ metadata, vaultReference });
      } catch (error) {
        await options.secrets.delete(vaultReference).catch(() => undefined);
        throw error;
      }
      return cloneMetadata(metadata);
    },
    async getMetadata(input) {
      const record = await options.metadata.get(input);
      if (!record) return null;
      assertScope(record.metadata, input);
      return cloneMetadata(record.metadata);
    },
    async use(input, consumer) {
      const record = await options.metadata.get(input);
      if (!record) throw new Error("Credential grant was not found.");
      assertScope(record.metadata, input);
      const usedAt = now();
      if (record.metadata.revokedAt) throw new Error("Credential grant has been revoked.");
      if (Date.parse(record.metadata.expiresAt) <= Date.parse(usedAt)) {
        await auditCredential(options.audit, record.metadata, "capture_credential_grant.expire");
        throw new Error("Credential grant has expired.");
      }
      const result = await options.secrets.use(record.vaultReference, consumer);
      await options.metadata.upsert({ metadata: { ...record.metadata, lastUsedAt: usedAt }, vaultReference: record.vaultReference });
      await auditCredential(options.audit, record.metadata, "capture_credential_grant.use");
      return result;
    },
    async revoke(input) {
      const record = await options.metadata.get(input);
      if (!record) throw new Error("Credential grant was not found.");
      assertScope(record.metadata, input);
      const metadata = { ...record.metadata, revokedAt: record.metadata.revokedAt ?? now() };
      await options.secrets.delete(record.vaultReference);
      await options.metadata.upsert({ metadata, vaultReference: record.vaultReference });
      return cloneMetadata(metadata);
    }
  };
}

async function auditCredential(audit: CaptureAuditSink | undefined, grant: CaptureCredentialGrant, action: "capture_credential_grant.use" | "capture_credential_grant.expire") {
  await audit?.record({ workspaceId: grant.workspaceId, projectId: grant.projectId, actorUserId: "system:capture-worker", actorType: "system", action, targetType: "capture_credential_grant", targetId: grant.id, metadata: { environment_id: grant.environmentId, persona_id: grant.personaId, kind: grant.kind } });
}

export function createInMemoryCaptureCredentialVault(
  options: InMemoryCaptureCredentialVaultOptions = {}
): CaptureCredentialVault {
  const records = new Map<string, StoredGrant>();
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async create(input) {
      validateCreateInput(input, now());
      const createdAt = now();
      const metadata: CaptureCredentialGrant = {
        id: makeId(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        personaId: input.personaId,
        kind: input.kind,
        purpose: "capture_login",
        expiresAt: input.expiresAt,
        createdAt
      };
      records.set(metadata.id, { metadata, secret: cloneSecret(input.secret) });
      return cloneMetadata(metadata);
    },

    async getMetadata(input) {
      const record = records.get(input.grantId);
      if (!record) return null;
      assertScope(record.metadata, input);
      return cloneMetadata(record.metadata);
    },

    async use(input, consumer) {
      const record = records.get(input.grantId);
      if (!record) throw new Error("Credential grant was not found.");
      assertScope(record.metadata, input);
      const usedAt = now();
      if (record.metadata.revokedAt) throw new Error("Credential grant has been revoked.");
      if (Date.parse(record.metadata.expiresAt) <= Date.parse(usedAt)) throw new Error("Credential grant has expired.");
      const result = await consumer(Object.freeze(cloneSecret(record.secret)));
      record.metadata = { ...record.metadata, lastUsedAt: usedAt };
      return result;
    },

    async revoke(input) {
      const record = records.get(input.grantId);
      if (!record) throw new Error("Credential grant was not found.");
      assertScope(record.metadata, input);
      record.metadata = { ...record.metadata, revokedAt: record.metadata.revokedAt ?? now() };
      record.secret = {};
      return cloneMetadata(record.metadata);
    }
  };
}

function validateCreateInput(input: CreateCaptureCredentialGrantInput, currentTime: string): void {
  for (const [label, value] of Object.entries({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    personaId: input.personaId
  })) {
    if (!value.trim() || value.length > 200) throw new Error(`${label} is invalid.`);
  }
  if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.parse(currentTime)) {
    throw new Error("Credential grant expiry must be in the future.");
  }
  if (input.kind === "username_password") {
    if (!input.secret.username?.trim() || !input.secret.password) {
      throw new Error("Username and password are required.");
    }
    if (input.secret.sessionBootstrapToken !== undefined) throw new Error("Unexpected bootstrap token.");
  } else {
    if (!input.secret.sessionBootstrapToken) throw new Error("Session bootstrap token is required.");
    if (input.secret.username !== undefined || input.secret.password !== undefined) {
      throw new Error("Unexpected username or password.");
    }
  }
}

function assertScope(grant: CaptureCredentialGrant, input: ResolveCaptureCredentialInput): void {
  const comparisons: Array<[string, string]> = [
    [grant.workspaceId, input.workspaceId],
    [grant.projectId, input.projectId],
    [grant.environmentId, input.environmentId],
    [grant.personaId, input.personaId]
  ];
  if (comparisons.some(([expected, actual]) => !constantTimeEqual(expected, actual))) {
    throw new Error("Credential grant was not found.");
  }
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function cloneSecret(secret: CaptureCredentialSecret): CaptureCredentialSecret {
  return {
    username: secret.username,
    password: secret.password,
    sessionBootstrapToken: secret.sessionBootstrapToken
  };
}

function cloneMetadata(metadata: CaptureCredentialGrant): CaptureCredentialGrant {
  return { ...metadata };
}
