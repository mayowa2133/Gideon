import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { AuditEvent, UsageEvent } from "../shared/types";
import type { PostgresQuery } from "./persistence";
import { PostgresUsageAuditRepository } from "./postgresUsageAuditRepository";

const execFileAsync = promisify(execFile);

describe("PostgresUsageAuditRepository", () => {
  it("upserts usage events into queryable metric columns while preserving the full record", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const usage = usageEvent();
    const repository = new PostgresUsageAuditRepository(createQuery(calls, usage));

    const saved = await repository.upsertUsageEvent(usage);

    expect(saved.id).toBe("usage-1");
    expect(calls[0]?.text).toContain("insert into gideon_usage_events");
    expect(calls[0]?.text).toContain("on conflict (id) do update");
    expect(calls[0]?.values?.slice(0, 8)).toEqual([
      "usage-1",
      "workspace-1",
      "project-1",
      "llm_runs",
      1,
      "count",
      "analysis",
      "analysis:project-1:job-1"
    ]);
  });

  it("upserts audit events into queryable action columns while preserving the full record", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const audit = auditEvent();
    const repository = new PostgresUsageAuditRepository(createQuery(calls, audit));

    const saved = await repository.upsertAuditEvent(audit);

    expect(saved.id).toBe("audit-1");
    expect(calls[0]?.text).toContain("insert into gideon_audit_events");
    expect(calls[0]?.values?.slice(0, 9)).toEqual([
      "audit-1",
      "workspace-1",
      "project-1",
      "user-1",
      "local_user",
      "usage.record",
      "usage",
      "usage-1",
      "Recorded analysis usage."
    ]);
  });

  it("lists usage and audit events by workspace and optional project", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const repository = new PostgresUsageAuditRepository(createQuery(calls, usageEvent()));

    await repository.listUsageEvents({ workspaceId: "workspace-1", projectId: "project-1", limit: 999 });
    await repository.listAuditEvents({ workspaceId: "workspace-1", limit: 2 });

    expect(calls[0]?.text).toContain("from gideon_usage_events");
    expect(calls[0]?.values).toEqual(["workspace-1", "project-1", 200]);
    expect(calls[1]?.text).toContain("from gideon_audit_events");
    expect(calls[1]?.values).toEqual(["workspace-1", 2]);
  });

  it("adds usage/audit migration to the migration runner", async () => {
    const migrationPath = path.join(process.cwd(), "migrations/0002_usage_audit_events.sql");
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists gideon_usage_events");
    expect(migration).toContain("create table if not exists gideon_audit_events");
    expect(migration).toContain("record_json jsonb not null");

    const result = await execFileAsync(process.execPath, ["scripts/migrate-postgres.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(result.stdout).toContain("DRY_RUN 0001_hosted_jobs_artifacts.sql");
    expect(result.stdout).toContain("DRY_RUN 0002_usage_audit_events.sql");
  });
});

function createQuery<T>(
  calls: Array<{ text: string; values?: readonly unknown[] }>,
  record: T
): PostgresQuery {
  return async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_json: record }] };
  };
}

function usageEvent(): UsageEvent {
  return {
    id: "usage-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    metric: "llm_runs",
    quantity: 1,
    unit: "count",
    source: "analysis",
    idempotencyKey: "analysis:project-1:job-1",
    createdAt: "2026-06-29T13:00:00.000Z"
  };
}

function auditEvent(): AuditEvent {
  return {
    id: "audit-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    actorUserId: "user-1",
    actorType: "local_user",
    action: "usage.record",
    targetType: "usage",
    targetId: "usage-1",
    summary: "Recorded analysis usage.",
    metadata: { metric: "llm_runs", quantity: 1 },
    createdAt: "2026-06-29T13:00:00.000Z"
  };
}
