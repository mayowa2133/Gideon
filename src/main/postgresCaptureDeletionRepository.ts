import { Pool } from "pg";
import { createHash } from "node:crypto";
import type { CaptureCleanupTask, CaptureProjectDeletionRepository } from "./captureDeletion";

export class PostgresCaptureDeletionRepository implements CaptureProjectDeletionRepository {
  constructor(private readonly pool: Pool) {}

  async revokeAndDeleteProjectCaptureData(input: { workspaceId: string; projectId: string; deletedAt: string }): Promise<{ cleanupTasks: CaptureCleanupTask[]; deletedRows: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const grants = await client.query<{ vault_reference: string }>(
        `update gideon_capture_credential_grants set revoked_at=coalesce(revoked_at,$3)
         where workspace_id=$1 and project_id=$2 returning vault_reference`,
        [input.workspaceId, input.projectId, input.deletedAt]
      );
      const artifacts = await client.query<{ provider: string; storage_key: string }>(
        `select provider,storage_key from gideon_artifacts where workspace_id=$1 and project_id=$2
         union select provider,storage_key from gideon_recording_upload_sessions where workspace_id=$1 and project_id=$2`,
        [input.workspaceId, input.projectId]
      );
      const cleanupTasks: CaptureCleanupTask[] = [...new Set(grants.rows.map((row) => row.vault_reference))].map((reference) => ({ id: taskId(input.workspaceId, input.projectId, "secret", reference), kind: "secret" as const, reference }));
      for (const artifact of artifacts.rows) if (!cleanupTasks.some((task) => task.kind === "object" && task.reference === artifact.storage_key)) cleanupTasks.push({ id: taskId(input.workspaceId, input.projectId, "object", artifact.storage_key), kind: "object", reference: artifact.storage_key, provider: artifact.provider });
      for (const task of cleanupTasks) await client.query(
        `insert into gideon_capture_cleanup_tasks(id,workspace_id,project_id,target_kind,target_reference,provider,status,attempts,created_at,updated_at)
         values($1,$2,$3,$4,$5,$6,'pending',0,$7,$7)
         on conflict (workspace_id,project_id,target_kind,target_reference) do update set provider=excluded.provider,status=case when gideon_capture_cleanup_tasks.status='completed' then 'completed' else 'pending' end,updated_at=excluded.updated_at`,
        [task.id, input.workspaceId, input.projectId, task.kind, task.reference, task.provider ?? null, input.deletedAt]
      );
      let deletedRows = 0;
      const tables = [
        "gideon_flow_executions", "gideon_capture_runs", "gideon_coverage_snapshots",
        "gideon_product_flow_revisions", "gideon_product_flows", "gideon_ui_transitions",
        "gideon_ui_states", "gideon_discovery_runs", "gideon_capture_credential_grants",
        "gideon_capture_personas", "gideon_capture_environment_versions", "gideon_capture_environments",
        "gideon_recording_upload_sessions", "gideon_artifacts", "gideon_jobs"
      ];
      for (const table of tables) {
        const result = await client.query(`delete from ${table} where workspace_id=$1 and project_id=$2`, [input.workspaceId, input.projectId]);
        deletedRows += result.rowCount ?? 0;
      }
      await client.query("commit");
      return { cleanupTasks, deletedRows };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async markCleanupTask(input: { workspaceId: string; projectId: string; taskId: string; status: "completed" | "failed"; updatedAt: string; safeErrorCode?: "provider_unavailable" }): Promise<void> {
    const result = await this.pool.query(`update gideon_capture_cleanup_tasks set status=$4,attempts=attempts+1,safe_error_code=$5,updated_at=$6 where workspace_id=$1 and project_id=$2 and id=$3`, [input.workspaceId, input.projectId, input.taskId, input.status, input.safeErrorCode ?? null, input.updatedAt]);
    if (result.rowCount !== 1) throw new Error("Capture cleanup task was not found in the authorized scope.");
  }
}

function taskId(workspaceId: string, projectId: string, kind: string, reference: string): string { return createHash("sha256").update(`${workspaceId}:${projectId}:${kind}:${reference}`).digest("hex"); }
