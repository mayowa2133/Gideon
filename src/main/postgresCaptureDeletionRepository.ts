import { Pool } from "pg";
import type { CaptureProjectDeletionRepository } from "./captureDeletion";

export class PostgresCaptureDeletionRepository implements CaptureProjectDeletionRepository {
  constructor(private readonly pool: Pool) {}

  async revokeAndDeleteProjectCaptureData(input: { workspaceId: string; projectId: string; deletedAt: string }): Promise<{ vaultReferences: string[]; deletedRows: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const grants = await client.query<{ vault_reference: string }>(
        `update gideon_capture_credential_grants set revoked_at=coalesce(revoked_at,$3)
         where workspace_id=$1 and project_id=$2 returning vault_reference`,
        [input.workspaceId, input.projectId, input.deletedAt]
      );
      let deletedRows = 0;
      const tables = [
        "gideon_flow_executions", "gideon_capture_runs", "gideon_coverage_snapshots",
        "gideon_product_flow_revisions", "gideon_product_flows", "gideon_ui_transitions",
        "gideon_ui_states", "gideon_discovery_runs", "gideon_capture_credential_grants",
        "gideon_capture_personas", "gideon_capture_environment_versions", "gideon_capture_environments"
      ];
      for (const table of tables) {
        const result = await client.query(`delete from ${table} where workspace_id=$1 and project_id=$2`, [input.workspaceId, input.projectId]);
        deletedRows += result.rowCount ?? 0;
      }
      await client.query("commit");
      return { vaultReferences: grants.rows.map((row) => row.vault_reference), deletedRows };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
