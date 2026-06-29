import { Pool } from "pg";
import type { PostgresQuery } from "./persistence";
import type { Project, RecordingUploadSessionRecord, UserAccount, Workspace, WorkspaceMember } from "../shared/types";

interface JsonRecordRow<T> {
  record_json: T | string;
}

export interface ListWorkspaceProjectsInput {
  workspaceId: string;
  status?: Project["status"];
  limit?: number;
}

export class PostgresCoreRepository {
  constructor(
    private readonly query: PostgresQuery,
    private readonly closeClient?: () => Promise<void> | void
  ) {}

  async upsertUser(user: UserAccount): Promise<UserAccount> {
    const result = await this.query<JsonRecordRow<UserAccount>>(
      `insert into gideon_users (
         id, email, display_name, auth_subject, identity_provider,
         last_signed_in_at, record_json, created_at
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7::jsonb, $8
       )
       on conflict (id) do update set
         email = excluded.email,
         display_name = excluded.display_name,
         auth_subject = excluded.auth_subject,
         identity_provider = excluded.identity_provider,
         last_signed_in_at = excluded.last_signed_in_at,
         record_json = excluded.record_json
       returning record_json`,
      [
        user.id,
        user.email,
        user.displayName,
        user.authSubject ?? null,
        user.identityProvider ?? null,
        user.lastSignedInAt ?? null,
        JSON.stringify(user),
        user.createdAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "user");
  }

  async upsertWorkspace(workspace: Workspace): Promise<Workspace> {
    const result = await this.query<JsonRecordRow<Workspace>>(
      `insert into gideon_workspaces (
         id, name, slug, plan, billing_status, billing_provider,
         billing_customer_id, billing_subscription_id, billing_current_period_end,
         billing_cancel_at_period_end, billing_last_event_id, entitlements_json,
         record_json, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12::jsonb,
         $13::jsonb, $14, $15
       )
       on conflict (id) do update set
         name = excluded.name,
         slug = excluded.slug,
         plan = excluded.plan,
         billing_status = excluded.billing_status,
         billing_provider = excluded.billing_provider,
         billing_customer_id = excluded.billing_customer_id,
         billing_subscription_id = excluded.billing_subscription_id,
         billing_current_period_end = excluded.billing_current_period_end,
         billing_cancel_at_period_end = excluded.billing_cancel_at_period_end,
         billing_last_event_id = excluded.billing_last_event_id,
         entitlements_json = excluded.entitlements_json,
         record_json = excluded.record_json,
         updated_at = excluded.updated_at
       returning record_json`,
      [
        workspace.id,
        workspace.name,
        workspace.slug,
        workspace.plan,
        workspace.billingStatus,
        workspace.billingProvider ?? null,
        workspace.billingCustomerId ?? null,
        workspace.billingSubscriptionId ?? null,
        workspace.billingCurrentPeriodEnd ?? null,
        workspace.billingCancelAtPeriodEnd ?? null,
        workspace.billingLastEventId ?? null,
        JSON.stringify(workspace.entitlements),
        JSON.stringify(workspace),
        workspace.createdAt,
        workspace.updatedAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "workspace");
  }

  async upsertWorkspaceMember(member: WorkspaceMember): Promise<WorkspaceMember> {
    const result = await this.query<JsonRecordRow<WorkspaceMember>>(
      `insert into gideon_workspace_members (
         id, workspace_id, user_id, role, record_json, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5::jsonb, $6, $7
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         user_id = excluded.user_id,
         role = excluded.role,
         record_json = excluded.record_json,
         updated_at = excluded.updated_at
       returning record_json`,
      [
        member.id,
        member.workspaceId,
        member.userId,
        member.role,
        JSON.stringify(member),
        member.createdAt,
        member.updatedAt ?? null
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "workspace member");
  }

  async upsertProject(project: Project): Promise<Project> {
    const result = await this.query<JsonRecordRow<Project>>(
      `insert into gideon_projects (
         id, workspace_id, name, status, profile_json, recording_artifact_id,
         source_storage_key, transcript_status, analysis_summary, moment_count,
         script_count, render_count, artifact_count, upload_session_count,
         provider_run_count, record_json, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5::jsonb, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16::jsonb, $17, $18
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         name = excluded.name,
         status = excluded.status,
         profile_json = excluded.profile_json,
         recording_artifact_id = excluded.recording_artifact_id,
         source_storage_key = excluded.source_storage_key,
         transcript_status = excluded.transcript_status,
         analysis_summary = excluded.analysis_summary,
         moment_count = excluded.moment_count,
         script_count = excluded.script_count,
         render_count = excluded.render_count,
         artifact_count = excluded.artifact_count,
         upload_session_count = excluded.upload_session_count,
         provider_run_count = excluded.provider_run_count,
         record_json = excluded.record_json,
         updated_at = excluded.updated_at
       returning record_json`,
      [
        project.id,
        project.workspaceId,
        project.name,
        project.status,
        JSON.stringify(project.profile),
        project.recording?.artifactId ?? null,
        project.recording?.storageKey ?? null,
        project.transcript?.status ?? null,
        project.analysisSummary ?? null,
        project.moments.length,
        project.scripts.length,
        project.renders.length,
        project.artifacts.length,
        project.uploadSessions.length,
        project.providerRuns.length,
        JSON.stringify(project),
        project.createdAt,
        project.updatedAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "project");
  }

  async getProject(input: { workspaceId: string; projectId: string }): Promise<Project | null> {
    const result = await this.query<JsonRecordRow<Project>>(
      "select record_json from gideon_projects where workspace_id = $1 and id = $2 limit 1",
      [input.workspaceId, input.projectId]
    );
    return result.rows[0] ? parseRecordJson(result.rows[0].record_json, "project") : null;
  }

  async listWorkspaceProjects(input: ListWorkspaceProjectsInput): Promise<Project[]> {
    const values: unknown[] = [input.workspaceId];
    const statusClause = input.status ? " and status = $2" : "";
    if (input.status) {
      values.push(input.status);
    }
    values.push(clampLimit(input.limit));
    const result = await this.query<JsonRecordRow<Project>>(
      `select record_json from gideon_projects
       where workspace_id = $1${statusClause}
       order by updated_at desc
       limit $${values.length}`,
      values
    );
    return result.rows.map((row) => parseRecordJson(row.record_json, "project"));
  }

  async upsertRecordingUploadSession(session: RecordingUploadSessionRecord): Promise<RecordingUploadSessionRecord> {
    const result = await this.query<JsonRecordRow<RecordingUploadSessionRecord>>(
      `insert into gideon_recording_upload_sessions (
         id, workspace_id, project_id, artifact_id, provider, storage_key, status,
         content_type, byte_size, original_file_name, expires_at, record_json,
         created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12::jsonb,
         $13, $14
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         project_id = excluded.project_id,
         artifact_id = excluded.artifact_id,
         provider = excluded.provider,
         storage_key = excluded.storage_key,
         status = excluded.status,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         original_file_name = excluded.original_file_name,
         expires_at = excluded.expires_at,
         record_json = excluded.record_json,
         updated_at = excluded.updated_at
       returning record_json`,
      [
        session.id,
        session.workspaceId,
        session.projectId,
        session.artifactId,
        session.provider,
        session.storageKey,
        session.status,
        session.contentType,
        session.byteSize,
        session.originalFileName,
        session.expiresAt,
        JSON.stringify(session),
        session.createdAt,
        session.updatedAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "recording upload session");
  }

  async close(): Promise<void> {
    await this.closeClient?.();
  }
}

export function createPostgresCoreRepositoryFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresCoreRepository {
  const connectionString = trimEnv(env.GIDEON_DATABASE_URL ?? env.DATABASE_URL);
  if (!connectionString) {
    throw new Error("PostgreSQL core repository requires GIDEON_DATABASE_URL or DATABASE_URL.");
  }
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  return new PostgresCoreRepository(
    async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      const result = await pool.query(text, values ? [...values] : undefined);
      return { rows: result.rows as Row[] };
    },
    async () => {
      await pool.end();
    }
  );
}

function parseRecordJson<T>(value: T | string | undefined, label: string): T {
  if (!value) {
    throw new Error(`PostgreSQL core repository returned no ${label} record_json.`);
  }
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}

function trimEnv(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
