import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { ArtifactRecord, JobRecord } from "../shared/types";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";
import type { PostgresQuery } from "./persistence";

const execFileAsync = promisify(execFile);

describe("PostgresJobArtifactRepository", () => {
  it("upserts jobs into normalized relational columns while preserving the full record", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const job = createJob();
    const repository = new PostgresJobArtifactRepository(createQuery(calls, job));

    const saved = await repository.upsertJob({
      workspaceId: "workspace-1",
      job,
      queueName: "gideon-prod-workers",
      stage: "semantic_analysis",
      idempotencyKey: "analysis-project-1"
    });

    expect(saved.id).toBe(job.id);
    expect(calls[0]?.text).toContain("insert into gideon_jobs");
    expect(calls[0]?.text).toContain("on conflict (id) do update");
    expect(calls[0]?.values?.slice(0, 7)).toEqual([
      "job-1",
      "workspace-1",
      "project-1",
      "analysis",
      "gideon-prod-workers",
      "running",
      "semantic_analysis"
    ]);
  });

  it("lists project jobs by workspace and project", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const job = createJob();
    const repository = new PostgresJobArtifactRepository(createQuery(calls, job));

    const jobs = await repository.listProjectJobs({ workspaceId: "workspace-1", projectId: "project-1", limit: 500 });

    expect(jobs).toEqual([job]);
    expect(calls[0]?.text).toContain("where workspace_id = $1 and project_id = $2");
    expect(calls[0]?.values).toEqual(["workspace-1", "project-1", 200]);
  });

  it("upserts artifacts into queryable object-storage columns", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const artifact = createArtifact();
    const repository = new PostgresJobArtifactRepository(createQuery(calls, artifact));

    const saved = await repository.upsertArtifact(artifact);

    expect(saved.storageKey).toBe("private/workspace-1/project-1/render.mp4");
    expect(calls[0]?.text).toContain("insert into gideon_artifacts");
    expect(calls[0]?.values?.slice(0, 7)).toEqual([
      "artifact-1",
      "workspace-1",
      "project-1",
      "render",
      "s3",
      "private/workspace-1/project-1/render.mp4",
      "video/mp4"
    ]);
  });

  it("keeps the migration focused on jobs and artifacts", async () => {
    const migrationPath = path.join(process.cwd(), "migrations/0001_hosted_jobs_artifacts.sql");
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists gideon_jobs");
    expect(migration).toContain("create table if not exists gideon_artifacts");
    expect(migration).toContain("record_json jsonb not null");

    const result = await execFileAsync(process.execPath, ["scripts/migrate-postgres.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(result.stdout).toContain("DRY_RUN 0001_hosted_jobs_artifacts.sql");
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

function createJob(): JobRecord {
  return {
    id: "job-1",
    projectId: "project-1",
    kind: "analysis",
    status: "running",
    attempt: 1,
    maxAttempts: 3,
    progress: { current: 1, total: 4, unit: "stage" },
    userMessage: "Analyzing walkthrough.",
    cancelable: true,
    retryable: false,
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:01:00.000Z",
    startedAt: "2026-06-29T12:00:30.000Z",
    workerId: "worker-1",
    heartbeatAt: "2026-06-29T12:00:45.000Z",
    leaseExpiresAt: "2026-06-29T12:05:45.000Z"
  };
}

function createArtifact(): ArtifactRecord {
  return {
    id: "artifact-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    kind: "render",
    provider: "s3",
    storageKey: "private/workspace-1/project-1/render.mp4",
    contentType: "video/mp4",
    byteSize: 1024,
    sha256: "a".repeat(64),
    originalFileName: "render.mp4",
    createdAt: "2026-06-29T12:02:00.000Z"
  };
}
