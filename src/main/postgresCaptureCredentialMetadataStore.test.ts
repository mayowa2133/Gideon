import { describe, expect, it } from "vitest";
import { PostgresCaptureCredentialMetadataStore } from "./postgresCaptureCredentialMetadataStore";
import type { CaptureCredentialGrant } from "./captureCredentials";

describe("PostgreSQL capture credential metadata", () => {
  it("persists only grant metadata and an opaque vault reference", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const grant: CaptureCredentialGrant = { id: "grant-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: "environment-1", personaId: "persona-1", kind: "username_password", purpose: "capture_login", expiresAt: "2026-07-14T11:00:00.000Z", createdAt: "2026-07-14T10:00:00.000Z" };
    const store = new PostgresCaptureCredentialMetadataStore(async (text, values) => { calls.push({ text, values }); return { rows: [{ record_json: grant, vault_reference: "gideon-capture/random" }] }; });
    await store.upsert({ metadata: grant, vaultReference: "gideon-capture/random" });
    expect(JSON.stringify(calls)).not.toContain("password-value");
    await expect(store.get({ grantId: "grant-1", workspaceId: "workspace-1" })).resolves.toEqual({ metadata: grant, vaultReference: "gideon-capture/random" });
  });
});
