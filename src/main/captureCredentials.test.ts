import { describe, expect, it } from "vitest";
import { createExternalCaptureCredentialVault, createInMemoryCaptureCredentialVault } from "./captureCredentials";

describe("capture credential vault", () => {
  const clock = { value: "2026-07-14T10:00:00.000Z" };
  const createVault = () =>
    createInMemoryCaptureCredentialVault({
      makeId: () => "grant-1",
      now: () => clock.value
    });

  it("returns metadata without serializing secret material", async () => {
    const vault = createVault();
    const metadata = await vault.create({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1",
      kind: "username_password",
      secret: { username: "robot@example.test", password: "private-password-value" },
      expiresAt: "2026-07-14T11:00:00.000Z"
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("robot@example.test");
    expect(serialized).not.toContain("private-password-value");
    expect(metadata).toMatchObject({ id: "grant-1", purpose: "capture_login", kind: "username_password" });
  });

  it("resolves a secret only inside a correctly scoped consumer", async () => {
    const vault = createVault();
    await vault.create({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1",
      kind: "session_bootstrap_token",
      secret: { sessionBootstrapToken: "single-use-token" },
      expiresAt: "2026-07-14T11:00:00.000Z"
    });
    const length = await vault.use(
      {
        grantId: "grant-1",
        workspaceId: "workspace-1",
        projectId: "project-1",
        environmentId: "environment-1",
        personaId: "persona-1"
      },
      async (secret) => secret.sessionBootstrapToken!.length
    );
    expect(length).toBe(16);
    expect(await vault.getMetadata({ grantId: "grant-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1" })).toMatchObject({ lastUsedAt: clock.value });
  });

  it("returns the same not-found error for missing and cross-workspace grants", async () => {
    const vault = createVault();
    await vault.create({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1",
      kind: "session_bootstrap_token",
      secret: { sessionBootstrapToken: "single-use-token" },
      expiresAt: "2026-07-14T11:00:00.000Z"
    });
    const consume = async (grantId: string, workspaceId: string) =>
      vault.use(
        { grantId, workspaceId, projectId: "project-1", environmentId: "environment-1", personaId: "persona-1" },
        async () => true
      );
    await expect(consume("missing", "workspace-1")).rejects.toThrow("Credential grant was not found.");
    await expect(consume("grant-1", "workspace-2")).rejects.toThrow("Credential grant was not found.");
  });

  it("denies expired and revoked grants and erases the stored secret on revoke", async () => {
    const vault = createVault();
    await vault.create({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1",
      kind: "username_password",
      secret: { username: "robot@example.test", password: "private-password-value" },
      expiresAt: "2026-07-14T11:00:00.000Z"
    });
    const scope = {
      grantId: "grant-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1"
    };
    await vault.revoke(scope);
    await expect(vault.use(scope, async () => true)).rejects.toThrow("Credential grant has been revoked.");

    const expiringVault = createVault();
    await expiringVault.create({
      workspaceId: "workspace-1",
      projectId: "project-1",
      environmentId: "environment-1",
      personaId: "persona-1",
      kind: "session_bootstrap_token",
      secret: { sessionBootstrapToken: "single-use-token" },
      expiresAt: "2026-07-14T10:30:00.000Z"
    });
    clock.value = "2026-07-14T10:31:00.000Z";
    await expect(expiringVault.use(scope, async () => true)).rejects.toThrow("Credential grant has expired.");
    clock.value = "2026-07-14T10:00:00.000Z";
  });

  it("rejects malformed secret variants and non-future expiry", async () => {
    const vault = createVault();
    await expect(
      vault.create({
        workspaceId: "workspace-1",
        projectId: "project-1",
        environmentId: "environment-1",
        personaId: "persona-1",
        kind: "username_password",
        secret: { username: "robot@example.test" },
        expiresAt: "2026-07-14T11:00:00.000Z"
      })
    ).rejects.toThrow("Username and password are required.");
    await expect(
      vault.create({
        workspaceId: "workspace-1",
        projectId: "project-1",
        environmentId: "environment-1",
        personaId: "persona-1",
        kind: "session_bootstrap_token",
        secret: { sessionBootstrapToken: "token" },
        expiresAt: "2026-07-14T09:00:00.000Z"
      })
    ).rejects.toThrow("Credential grant expiry must be in the future.");
  });

  it("keeps production secret material in an external callback-only store", async () => {
    const records = new Map<string, { metadata: import("./captureCredentials").CaptureCredentialGrant; vaultReference: string }>();
    const secrets = new Map<string, import("./captureCredentials").CaptureCredentialSecret>();
    const ids = ["grant-external", "vault-random"];
    const vault = createExternalCaptureCredentialVault({
      makeId: () => ids.shift()!, now: () => "2026-07-14T10:00:00.000Z",
      metadata: { async upsert(record) { records.set(record.metadata.id, structuredClone(record)); }, async get(input) { const record = records.get(input.grantId); return record?.metadata.workspaceId === input.workspaceId ? record : null; } },
      secrets: { async put(input) { secrets.set(input.reference, structuredClone(input.secret)); }, async use(reference, consumer) { return consumer(Object.freeze(structuredClone(secrets.get(reference)!))); }, async delete(reference) { secrets.delete(reference); } }
    });
    const metadata = await vault.create({ workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1", kind: "username_password", secret: { username: "robot@example.test", password: "private-password-value" }, expiresAt: "2026-07-14T11:00:00.000Z" });
    expect(JSON.stringify({ metadata, database: [...records.values()] })).not.toContain("private-password-value");
    await expect(vault.use({ grantId: metadata.id, workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1" }, async (secret) => secret.password)).resolves.toBe("private-password-value");
    await vault.revoke({ grantId: metadata.id, workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1" });
    expect(secrets.size).toBe(0);
  });
});
