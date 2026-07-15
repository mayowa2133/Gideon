import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { PostgresQuery } from "./persistence";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CapturePersona,
  CaptureRun,
  CoverageSnapshot,
  FlowExecutionRecord,
  ProductFlowRevision
} from "../shared/productFlowCapture";

const execFileAsync = promisify(execFile);

describe("PostgresCaptureRepository", () => {
  it("persists and reads workspace-scoped capture environments", async () => {
    const calls: QueryCall[] = [];
    const environment = environmentFixture();
    const repository = new PostgresCaptureRepository(createQuery(calls, environment));

    await repository.upsertEnvironment(environment);
    await repository.getEnvironment({ workspaceId: "workspace-1", environmentId: "environment-1" });
    await repository.listProjectEnvironments({ workspaceId: "workspace-1", projectId: "project-1", limit: 999 });

    expect(calls[0]?.text).toContain("insert into gideon_capture_environments");
    expect(calls[0]?.values?.slice(0, 8)).toEqual([
      "environment-1",
      "workspace-1",
      "project-1",
      "Demo",
      "staging",
      "ready",
      1,
      "environment-version-1"
    ]);
    expect(calls[1]?.text).toContain("where workspace_id=$1 and id=$2");
    expect(calls[1]?.values).toEqual(["workspace-1", "environment-1"]);
    expect(calls[2]?.values).toEqual(["workspace-1", "project-1", 200]);
  });

  it("persists immutable environment versions and project personas", async () => {
    const calls: QueryCall[] = [];
    const version = environmentVersionFixture();
    const persona = personaFixture();
    await new PostgresCaptureRepository(createQuery(calls, version)).upsertEnvironmentVersion(version);
    await new PostgresCaptureRepository(createQuery(calls, version)).getEnvironmentVersion({
      workspaceId: "workspace-1",
      versionId: "environment-version-1"
    });
    await new PostgresCaptureRepository(createQuery(calls, persona)).upsertPersona(persona);
    await new PostgresCaptureRepository(createQuery(calls, persona)).listProjectPersonas({
      workspaceId: "workspace-1",
      projectId: "project-1"
    });

    expect(calls[0]?.text).toContain("gideon_capture_environment_versions");
    expect(calls[0]?.values?.slice(0, 7)).toEqual([
      "environment-version-1",
      "workspace-1",
      "project-1",
      "environment-1",
      1,
      "a".repeat(64),
      "b".repeat(64)
    ]);
    expect(calls[1]?.text).toContain("where workspace_id=$1 and id=$2");
    expect(calls[2]?.text).toContain("gideon_capture_personas");
    expect(calls[3]?.values).toEqual(["workspace-1", "project-1", 50]);
  });

  it("writes an immutable flow revision before updating the current projection", async () => {
    const calls: QueryCall[] = [];
    const flow = flowFixture();
    const repository = new PostgresCaptureRepository(createQuery(calls, flow));

    const saved = await repository.upsertFlowRevision({
      workspaceId: "workspace-1",
      environmentId: "environment-1",
      flow,
      createdAt: "2026-07-14T10:00:00.000Z"
    });

    expect(saved).toEqual(flow);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain("insert into gideon_product_flow_revisions");
    expect(calls[0]?.values?.slice(0, 5)).toEqual([
      "flow-1:revision:1",
      "workspace-1",
      "project-1",
      "flow-1",
      1
    ]);
    expect(calls[1]?.text).toContain("insert into gideon_product_flows");
    expect(calls[1]?.values?.slice(0, 6)).toEqual([
      "flow-1",
      "workspace-1",
      "project-1",
      "environment-1",
      "persona-1",
      1
    ]);
  });

  it("persists capture runs, executions, and coverage without unscoped reads", async () => {
    const calls: QueryCall[] = [];
    const captureRun = captureRunFixture();
    const execution = executionFixture();
    const coverage = coverageFixture();
    await new PostgresCaptureRepository(createQuery(calls, captureRun)).upsertCaptureRun(captureRun);
    await new PostgresCaptureRepository(createQuery(calls, captureRun)).getCaptureRun({
      workspaceId: "workspace-1",
      captureRunId: "capture-run-1"
    });
    await new PostgresCaptureRepository(createQuery(calls, execution)).upsertFlowExecution(execution);
    await new PostgresCaptureRepository(createQuery(calls, execution)).listCaptureRunExecutions({
      workspaceId: "workspace-1",
      captureRunId: "capture-run-1"
    });
    await new PostgresCaptureRepository(createQuery(calls, coverage)).upsertCoverageSnapshot(coverage);
    await new PostgresCaptureRepository(createQuery(calls, coverage)).getLatestCoverageSnapshot({
      workspaceId: "workspace-1",
      projectId: "project-1"
    });

    expect(calls[1]?.text).toContain("where workspace_id=$1 and id=$2");
    expect(calls[3]?.text).toContain("where workspace_id=$1 and capture_run_id=$2");
    expect(calls[5]?.text).toContain("where workspace_id=$1 and project_id=$2");
    expect(calls[5]?.values).toEqual(["workspace-1", "project-1"]);
  });

  it("adds every capture-domain table to the migration runner", async () => {
    const migrationPath = path.join(process.cwd(), "migrations/0004_product_flow_capture.sql");
    const migration = readFileSync(migrationPath, "utf8");
    for (const table of [
      "gideon_capture_environments",
      "gideon_capture_environment_versions",
      "gideon_capture_personas",
      "gideon_capture_credential_grants",
      "gideon_discovery_runs",
      "gideon_ui_states",
      "gideon_ui_transitions",
      "gideon_product_flows",
      "gideon_product_flow_revisions",
      "gideon_capture_runs",
      "gideon_flow_executions",
      "gideon_coverage_snapshots"
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
    }
    expect(migration).not.toMatch(/\b(secret|password|session_cookie)\b\s+(text|jsonb)/i);

    const result = await execFileAsync(process.execPath, ["scripts/migrate-postgres.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(result.stdout).toContain("DRY_RUN 0004_product_flow_capture.sql");
  });
});

interface QueryCall {
  text: string;
  values?: readonly unknown[];
}

function createQuery<T>(calls: QueryCall[], record: T): PostgresQuery {
  return async (text, values) => {
    calls.push({ text, values });
    return { rows: [{ record_json: record }] };
  };
}

function environmentFixture(): CaptureEnvironment {
  return {
    id: "environment-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    name: "Demo",
    type: "staging",
    baseUrl: "https://demo.example.test",
    allowedDomains: ["demo.example.test"],
    status: "ready",
    resetAdapter: "fixture_api",
    revision: 1,
    currentVersionId: "environment-version-1",
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z"
  };
}

function environmentVersionFixture(): CaptureEnvironmentVersion {
  return {
    id: "environment-version-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentId: "environment-1",
    revision: 1,
    applicationFingerprint: "a".repeat(64),
    browserPolicyFingerprint: "b".repeat(64),
    validatedAt: "2026-07-14T10:00:00.000Z",
    createdAt: "2026-07-14T10:00:00.000Z"
  };
}

function personaFixture(): CapturePersona {
  return {
    id: "persona-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentId: "environment-1",
    key: "founder",
    displayName: "Founder",
    roleDescription: "Workspace owner using synthetic data.",
    fixtureProfileId: "fresh-account",
    status: "active",
    revision: 1,
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z"
  };
}

function flowFixture(): ProductFlowRevision {
  return {
    schemaVersion: "1",
    id: "flow-1",
    revision: 1,
    projectId: "project-1",
    environmentVersionId: "environment-version-1",
    personaId: "persona-1",
    title: "Create project",
    goal: "Create a project and observe the result.",
    startingState: { entryPath: "/app" },
    steps: [
      {
        id: "step-1",
        intent: "Open project creation.",
        action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } },
        riskClass: "navigate"
      }
    ],
    finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Create project" } }],
    approval: { status: "draft" },
    sourceEvidenceIds: ["user-goal:1"]
  };
}

function captureRunFixture(): CaptureRun {
  return {
    id: "capture-run-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentVersionId: "environment-version-1",
    jobId: "job-1",
    status: "dry_running",
    flowRevisionIds: ["flow-1:revision:1"],
    compiledPlanHashes: ["c".repeat(64)],
    policyFingerprint: "b".repeat(64),
    idempotencyKey: "capture-key-1",
    requestHash: "d".repeat(64),
    estimatedBrowserSeconds: 48,
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:01:00.000Z"
  };
}

function executionFixture(): FlowExecutionRecord {
  return {
    id: "execution-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    captureRunId: "capture-run-1",
    flowId: "flow-1",
    flowRevision: 1,
    environmentVersionId: "environment-version-1",
    status: "running",
    attempt: 1,
    compiledPlanHash: "c".repeat(64),
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:01:00.000Z"
  };
}

function coverageFixture(): CoverageSnapshot {
  return {
    schemaVersion: "1",
    id: "coverage-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    environmentVersionId: "environment-version-1",
    calculationVersion: "coverage-v1",
    dimensions: [],
    createdAt: "2026-07-14T10:00:00.000Z"
  };
}
