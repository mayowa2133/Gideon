import type { ArtifactRecord, ArtifactKind, JobRecord } from "../shared/types";
import type { PostgresQuery } from "./persistence";
import { Pool } from "pg";

export interface PersistJobInput {
  workspaceId: string;
  job: JobRecord;
  queueName: string;
  stage?: string;
  idempotencyKey?: string;
  inputJson?: Record<string, unknown>;
  resultJson?: Record<string, unknown> | null;
}

export interface ListProjectJobsInput {
  workspaceId: string;
  projectId: string;
  limit?: number;
}

export interface ListProjectArtifactsInput {
  workspaceId: string;
  projectId: string;
  kind?: ArtifactKind;
  limit?: number;
}

interface JsonRecordRow<T> {
  record_json: T | string;
}

export class PostgresJobArtifactRepository {
  constructor(
    private readonly query: PostgresQuery,
    private readonly closeClient?: () => Promise<void> | void
  ) {}

  async upsertJob(input: PersistJobInput): Promise<JobRecord> {
    const job = input.job;
    const values = [
      job.id,
      input.workspaceId,
      job.projectId,
      job.kind,
      input.queueName,
      job.status,
      input.stage ?? job.status,
      job.attempt,
      job.maxAttempts,
      job.progress.current,
      job.progress.total,
      job.progress.unit,
      job.userMessage,
      job.cancelable,
      job.retryable,
      job.safeError ?? null,
      input.idempotencyKey ?? job.id,
      JSON.stringify(input.inputJson ?? { projectId: job.projectId, jobId: job.id, kind: job.kind }),
      input.resultJson === undefined ? null : JSON.stringify(input.resultJson),
      JSON.stringify(job),
      job.workerId ?? null,
      job.heartbeatAt ?? null,
      job.leaseExpiresAt ?? null,
      job.startedAt ?? null,
      job.finishedAt ?? null,
      job.createdAt,
      job.updatedAt
    ];
    const result = await this.query<JsonRecordRow<JobRecord>>(
      `insert into gideon_jobs (
         id, workspace_id, project_id, kind, queue_name, status, stage, attempt, max_attempts,
         progress_current, progress_total, progress_unit, user_message, cancelable, retryable,
         safe_error, idempotency_key, input_json, result_json, record_json, worker_id,
         heartbeat_at, lease_expires_at, started_at, finished_at, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15,
         $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21,
         $22, $23, $24, $25, $26, $27
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         project_id = excluded.project_id,
         kind = excluded.kind,
         queue_name = excluded.queue_name,
         status = excluded.status,
         stage = excluded.stage,
         attempt = excluded.attempt,
         max_attempts = excluded.max_attempts,
         progress_current = excluded.progress_current,
         progress_total = excluded.progress_total,
         progress_unit = excluded.progress_unit,
         user_message = excluded.user_message,
         cancelable = excluded.cancelable,
         retryable = excluded.retryable,
         safe_error = excluded.safe_error,
         input_json = excluded.input_json,
         result_json = excluded.result_json,
         record_json = excluded.record_json,
         worker_id = excluded.worker_id,
         heartbeat_at = excluded.heartbeat_at,
         lease_expires_at = excluded.lease_expires_at,
         started_at = excluded.started_at,
         finished_at = excluded.finished_at,
         updated_at = excluded.updated_at
       returning record_json`,
      values
    );
    return parseRecordJson(result.rows[0]?.record_json, "job");
  }

  async getJob(input: { workspaceId: string; jobId: string }): Promise<JobRecord | null> {
    const result = await this.query<JsonRecordRow<JobRecord>>(
      "select record_json from gideon_jobs where workspace_id = $1 and id = $2 limit 1",
      [input.workspaceId, input.jobId]
    );
    return result.rows[0] ? parseRecordJson(result.rows[0].record_json, "job") : null;
  }

  async listProjectJobs(input: ListProjectJobsInput): Promise<JobRecord[]> {
    const result = await this.query<JsonRecordRow<JobRecord>>(
      `select record_json from gideon_jobs
       where workspace_id = $1 and project_id = $2
       order by created_at desc
       limit $3`,
      [input.workspaceId, input.projectId, clampLimit(input.limit)]
    );
    return result.rows.map((row) => parseRecordJson(row.record_json, "job"));
  }

  async upsertArtifact(artifact: ArtifactRecord): Promise<ArtifactRecord> {
    const result = await this.query<JsonRecordRow<ArtifactRecord>>(
      `insert into gideon_artifacts (
         id, workspace_id, project_id, kind, provider, storage_key, content_type,
         byte_size, sha256, original_file_name, local_path, local_url, record_json, created_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13::jsonb, $14
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         project_id = excluded.project_id,
         kind = excluded.kind,
         provider = excluded.provider,
         storage_key = excluded.storage_key,
         content_type = excluded.content_type,
         byte_size = excluded.byte_size,
         sha256 = excluded.sha256,
         original_file_name = excluded.original_file_name,
         local_path = excluded.local_path,
         local_url = excluded.local_url,
         record_json = excluded.record_json
       returning record_json`,
      [
        artifact.id,
        artifact.workspaceId,
        artifact.projectId,
        artifact.kind,
        artifact.provider,
        artifact.storageKey,
        artifact.contentType,
        artifact.byteSize,
        artifact.sha256,
        artifact.originalFileName,
        artifact.localPath ?? null,
        artifact.localUrl ?? null,
        JSON.stringify(artifact),
        artifact.createdAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "artifact");
  }

  async getArtifact(input: { workspaceId: string; artifactId: string }): Promise<ArtifactRecord | null> {
    const result = await this.query<JsonRecordRow<ArtifactRecord>>(
      "select record_json from gideon_artifacts where workspace_id = $1 and id = $2 limit 1",
      [input.workspaceId, input.artifactId]
    );
    return result.rows[0] ? parseRecordJson(result.rows[0].record_json, "artifact") : null;
  }

  async listProjectArtifacts(input: ListProjectArtifactsInput): Promise<ArtifactRecord[]> {
    const values: unknown[] = [input.workspaceId, input.projectId];
    const kindClause = input.kind ? " and kind = $3" : "";
    if (input.kind) {
      values.push(input.kind);
    }
    values.push(clampLimit(input.limit));
    const limitPlaceholder = `$${values.length}`;
    const result = await this.query<JsonRecordRow<ArtifactRecord>>(
      `select record_json from gideon_artifacts
       where workspace_id = $1 and project_id = $2${kindClause}
       order by created_at desc
       limit ${limitPlaceholder}`,
      values
    );
    return result.rows.map((row) => parseRecordJson(row.record_json, "artifact"));
  }

  async close(): Promise<void> {
    await this.closeClient?.();
  }
}

function parseRecordJson<T>(value: T | string | undefined, label: string): T {
  if (!value) {
    throw new Error(`PostgreSQL ${label} repository returned no record_json.`);
  }
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}

export function createPostgresJobArtifactRepositoryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PostgresJobArtifactRepository {
  const connectionString = trimEnv(env.GIDEON_DATABASE_URL ?? env.DATABASE_URL);
  if (!connectionString) {
    throw new Error("PostgreSQL jobs/artifacts repository requires GIDEON_DATABASE_URL or DATABASE_URL.");
  }
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  return new PostgresJobArtifactRepository(
    async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      const result = await pool.query(text, values ? [...values] : undefined);
      return { rows: result.rows as Row[] };
    },
    async () => {
      await pool.end();
    }
  );
}

function trimEnv(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
