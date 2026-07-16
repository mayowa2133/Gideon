import { Pool } from "pg";
import type { AuditEvent, UsageEvent } from "../shared/types";
import type { PostgresQuery } from "./persistence";

interface JsonRecordRow<T> {
  record_json: T | string;
}

export interface ListUsageEventsInput {
  workspaceId: string;
  projectId?: string;
  limit?: number;
}

export interface ListAuditEventsInput {
  workspaceId: string;
  projectId?: string;
  limit?: number;
}

export class PostgresUsageAuditRepository {
  constructor(
    private readonly query: PostgresQuery,
    private readonly closeClient?: () => Promise<void> | void
  ) {}

  async upsertUsageEvent(event: UsageEvent): Promise<UsageEvent> {
    const result = await this.query<JsonRecordRow<UsageEvent>>(
      `insert into gideon_usage_events (
         id, workspace_id, project_id, metric, quantity, unit, source,
         idempotency_key, record_json, created_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9::jsonb, $10
       )
       on conflict (workspace_id, idempotency_key) do update set
         idempotency_key = excluded.idempotency_key
       returning record_json`,
      [
        event.id,
        event.workspaceId,
        event.projectId ?? null,
        event.metric,
        event.quantity,
        event.unit,
        event.source,
        event.idempotencyKey,
        JSON.stringify(event),
        event.createdAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "usage event");
  }

  async listUsageEvents(input: ListUsageEventsInput): Promise<UsageEvent[]> {
    const values: unknown[] = [input.workspaceId];
    const projectClause = input.projectId ? " and project_id = $2" : "";
    if (input.projectId) {
      values.push(input.projectId);
    }
    values.push(clampLimit(input.limit));
    const result = await this.query<JsonRecordRow<UsageEvent>>(
      `select record_json from gideon_usage_events
       where workspace_id = $1${projectClause}
       order by created_at desc
       limit $${values.length}`,
      values
    );
    return result.rows.map((row) => parseRecordJson(row.record_json, "usage event"));
  }

  async upsertAuditEvent(event: AuditEvent): Promise<AuditEvent> {
    const result = await this.query<JsonRecordRow<AuditEvent>>(
      `insert into gideon_audit_events (
         id, workspace_id, project_id, actor_user_id, actor_type, action,
         target_type, target_id, summary, metadata_json, record_json, created_at
       ) values (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10::jsonb, $11::jsonb, $12
       )
       on conflict (id) do update set
         workspace_id = excluded.workspace_id,
         project_id = excluded.project_id,
         actor_user_id = excluded.actor_user_id,
         actor_type = excluded.actor_type,
         action = excluded.action,
         target_type = excluded.target_type,
         target_id = excluded.target_id,
         summary = excluded.summary,
         metadata_json = excluded.metadata_json,
         record_json = excluded.record_json,
         created_at = excluded.created_at
       returning record_json`,
      [
        event.id,
        event.workspaceId,
        event.projectId ?? null,
        event.actorUserId,
        event.actorType,
        event.action,
        event.targetType,
        event.targetId ?? null,
        event.summary,
        event.metadata ? JSON.stringify(event.metadata) : null,
        JSON.stringify(event),
        event.createdAt
      ]
    );
    return parseRecordJson(result.rows[0]?.record_json, "audit event");
  }

  async listAuditEvents(input: ListAuditEventsInput): Promise<AuditEvent[]> {
    const values: unknown[] = [input.workspaceId];
    const projectClause = input.projectId ? " and project_id = $2" : "";
    if (input.projectId) {
      values.push(input.projectId);
    }
    values.push(clampLimit(input.limit));
    const result = await this.query<JsonRecordRow<AuditEvent>>(
      `select record_json from gideon_audit_events
       where workspace_id = $1${projectClause}
       order by created_at desc
       limit $${values.length}`,
      values
    );
    return result.rows.map((row) => parseRecordJson(row.record_json, "audit event"));
  }

  async close(): Promise<void> {
    await this.closeClient?.();
  }
}

export function createPostgresUsageAuditRepositoryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PostgresUsageAuditRepository {
  const connectionString = trimEnv(env.GIDEON_DATABASE_URL ?? env.DATABASE_URL);
  if (!connectionString) {
    throw new Error("PostgreSQL usage/audit repository requires GIDEON_DATABASE_URL or DATABASE_URL.");
  }
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  return new PostgresUsageAuditRepository(
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

function trimEnv(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
