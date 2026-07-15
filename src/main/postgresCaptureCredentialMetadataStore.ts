import type { CaptureCredentialGrant, CaptureCredentialMetadataStore } from "./captureCredentials";
import type { PostgresQuery } from "./persistence";

interface CredentialRow {
  record_json: CaptureCredentialGrant | string;
  vault_reference: string;
}

export class PostgresCaptureCredentialMetadataStore implements CaptureCredentialMetadataStore {
  constructor(private readonly query: PostgresQuery) {}

  async upsert(input: { metadata: CaptureCredentialGrant; vaultReference: string }): Promise<void> {
    const grant = input.metadata;
    const result = await this.query<CredentialRow>(
      `insert into gideon_capture_credential_grants (
         id, workspace_id, project_id, environment_id, persona_id, vault_reference,
         credential_kind, purpose, expires_at, revoked_at, last_used_at, record_json, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
       on conflict (id) do update set
         expires_at=excluded.expires_at, revoked_at=excluded.revoked_at,
         last_used_at=excluded.last_used_at, record_json=excluded.record_json
       where gideon_capture_credential_grants.workspace_id=excluded.workspace_id
       returning record_json, vault_reference`,
      [grant.id, grant.workspaceId, grant.projectId, grant.environmentId, grant.personaId, input.vaultReference, grant.kind, grant.purpose, grant.expiresAt, grant.revokedAt ?? null, grant.lastUsedAt ?? null, JSON.stringify(grant), grant.createdAt]
    );
    if (!result.rows[0]) throw new Error("Credential grant metadata could not be persisted.");
  }

  async get(input: { grantId: string; workspaceId: string }): Promise<{ metadata: CaptureCredentialGrant; vaultReference: string } | null> {
    const result = await this.query<CredentialRow>(
      "select record_json, vault_reference from gideon_capture_credential_grants where id=$1 and workspace_id=$2 limit 1",
      [input.grantId, input.workspaceId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { metadata: typeof row.record_json === "string" ? JSON.parse(row.record_json) as CaptureCredentialGrant : row.record_json, vaultReference: row.vault_reference };
  }
}
