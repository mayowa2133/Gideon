import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaptureEnvironment, CaptureEnvironmentVersion, CapturePersona, ProductFlowRevision } from "../shared/productFlowCapture";
import type { UsageEvent } from "../shared/types";
import { createCaptureProjectDeletionService } from "./captureDeletion";
import { createBullMqCaptureRunQueue, createBullMqCaptureRunWorker } from "./captureQueue";
import { createCaptureRunCoordinator } from "./captureRunCoordinator";
import { BullMqHostedWorkerJobBroker, HostedWorkerRuntime, connectHostedWorkerRuntimeToBroker, redisConnectionFromUrl } from "./jobQueue";
import type { PostgresQuery } from "./persistence";
import { PostgresCaptureDeletionRepository } from "./postgresCaptureDeletionRepository";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresCaptureRunCoordinatorRepository } from "./postgresCaptureRunCoordinatorRepository";
import { PostgresUsageAuditRepository } from "./postgresUsageAuditRepository";

const databaseUrl = process.env.GIDEON_TEST_DATABASE_URL;
const redisUrl = process.env.GIDEON_TEST_REDIS_URL;
const describeInfrastructure = databaseUrl && redisUrl ? describe : describe.skip;

describeInfrastructure("disposable capture infrastructure", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  const query: PostgresQuery = async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => ({ rows: (await pool.query(text, values ? [...values] : undefined)).rows as Row[] });

  beforeAll(async () => { await pool.query("select 1"); });
  afterAll(async () => { await pool.end(); });

  it("applies every migration and enforces workspace isolation on real PostgreSQL", async () => {
    const migrations = await pool.query<{ id: string }>("select id from gideon_schema_migrations order by id");
    expect(migrations.rows.map((row) => row.id)).toEqual(["0001_hosted_jobs_artifacts.sql", "0002_usage_audit_events.sql", "0003_core_identity_projects.sql", "0004_product_flow_capture.sql", "0005_capture_cleanup_tasks.sql"]);
    const scope = uniqueScope();
    const repository = new PostgresCaptureRepository(query);
    await repository.upsertEnvironment(environment(scope));
    await expect(repository.getEnvironment({ workspaceId: `${scope.workspaceId}-other`, environmentId: scope.environmentId })).resolves.toBeNull();
    await expect(repository.listProjectEnvironments({ workspaceId: `${scope.workspaceId}-other`, projectId: scope.projectId })).resolves.toEqual([]);
  });

  it("converges concurrent capture creation to one run and one durable job", async () => {
    const scope = uniqueScope();
    const repository = new PostgresCaptureRepository(query);
    await repository.upsertEnvironment(environment(scope));
    await repository.upsertEnvironmentVersion(environmentVersion(scope));
    await repository.upsertPersona(persona(scope));
    await repository.upsertFlowRevision({ workspaceId: scope.workspaceId, environmentId: scope.environmentId, flow: flow(scope), createdAt: scope.now });
    const coordinatorRepository = new PostgresCaptureRunCoordinatorRepository(pool);
    const queued: string[] = [];
    const coordinator = createCaptureRunCoordinator({ repository: coordinatorRepository, queue: { async enqueue(input) { queued.push(input.jobId); } } });
    const request = { workspaceId: scope.workspaceId, projectId: scope.projectId, environmentId: scope.environmentId, flowIds: [scope.flowId], idempotencyKey: `capture:${scope.suffix}` };
    const [first, second] = await Promise.all([coordinator.create(request), coordinator.create(request)]);
    expect(first.captureRun.id).toBe(second.captureRun.id);
    expect([first.reused, second.reused].sort()).toEqual([false, true]);
    expect(queued).toHaveLength(2);
    const runCount = await pool.query("select count(*)::int as count from gideon_capture_runs where workspace_id=$1 and idempotency_key=$2", [scope.workspaceId, request.idempotencyKey]);
    const jobCount = await pool.query("select count(*)::int as count from gideon_jobs where workspace_id=$1 and idempotency_key=$2", [scope.workspaceId, request.idempotencyKey]);
    expect(runCount.rows[0]?.count).toBe(1);
    expect(jobCount.rows[0]?.count).toBe(1);
  });

  it("deduplicates usage retries without allowing one workspace to suppress another", async () => {
    const scope = uniqueScope();
    const repository = new PostgresUsageAuditRepository(query);
    const first = usage(scope, `usage-a-${scope.suffix}`);
    const retry = usage(scope, `usage-b-${scope.suffix}`);
    const saved = await repository.upsertUsageEvent(first);
    const reused = await repository.upsertUsageEvent(retry);
    expect(reused.id).toBe(saved.id);
    await repository.upsertUsageEvent({ ...retry, id: `usage-c-${scope.suffix}`, workspaceId: `${scope.workspaceId}-other` });
    const count = await pool.query("select count(*)::int as count from gideon_usage_events where idempotency_key=$1", [first.idempotencyKey]);
    expect(count.rows[0]?.count).toBe(2);
  });

  it("rolls back partial database failures and deletes only the authorized project graph", async () => {
    const scope = uniqueScope();
    const repository = new PostgresCaptureRepository(query);
    await repository.upsertEnvironment(environment(scope));
    const other = { ...scope, workspaceId: `${scope.workspaceId}-other`, projectId: `${scope.projectId}-other`, environmentId: `${scope.environmentId}-other` };
    await repository.upsertEnvironment(environment(other));
    const storageKey = `workspaces/${scope.workspaceId}/projects/${scope.projectId}/render/private.mp4`;
    await pool.query("insert into gideon_artifacts(id,workspace_id,project_id,kind,provider,storage_key,content_type,byte_size,sha256,original_file_name,record_json,created_at) values($1,$2,$3,'render','s3',$4,'video/mp4',1,$5,'private.mp4','{}',$6)", [`artifact-${scope.suffix}`, scope.workspaceId, scope.projectId, storageKey, "a".repeat(64), scope.now]);
    await pool.query("insert into gideon_capture_credential_grants(id,workspace_id,project_id,environment_id,persona_id,vault_reference,credential_kind,purpose,expires_at,record_json,created_at) values($1,$2,$3,$4,$5,$6,'username_password','capture_login',$7,'{}',$8)", [`grant-${scope.suffix}`, scope.workspaceId, scope.projectId, scope.environmentId, scope.personaId, `vault/${scope.suffix}`, "2026-07-17T00:00:00.000Z", scope.now]);
    const deleted: string[] = [];
    const service = createCaptureProjectDeletionService({ repository: new PostgresCaptureDeletionRepository(pool), secrets: { async delete(reference) { deleted.push(reference); } }, objects: { async delete(reference) { deleted.push(reference.storageKey); } }, now: () => scope.now });
    const receipt = await service.delete({ workspaceId: scope.workspaceId, projectId: scope.projectId });
    expect(receipt).toMatchObject({ deletedSecrets: 1, deletedObjects: 1, cleanupFailures: [] });
    expect(deleted).toEqual(expect.arrayContaining([`vault/${scope.suffix}`, storageKey]));
    expect((await pool.query("select count(*)::int as count from gideon_capture_cleanup_tasks where workspace_id=$1 and status='completed'", [scope.workspaceId])).rows[0]?.count).toBe(2);
    expect((await repository.getEnvironment({ workspaceId: scope.workspaceId, environmentId: scope.environmentId }))).toBeNull();
    expect((await repository.getEnvironment({ workspaceId: other.workspaceId, environmentId: other.environmentId }))).not.toBeNull();

    const coordinatorRepository = new PostgresCaptureRunCoordinatorRepository(pool);
    await expect(coordinatorRepository.persistCaptureRunAndJob({ workspaceId: scope.workspaceId, captureRun: { id: `bad-${scope.suffix}`, workspaceId: scope.workspaceId, projectId: scope.projectId, environmentVersionId: "missing", jobId: `bad-job-${scope.suffix}`, status: "queued", flowRevisionIds: [], compiledPlanHashes: [], policyFingerprint: "b".repeat(64), idempotencyKey: `bad:${scope.suffix}`, requestHash: "c".repeat(64), estimatedBrowserSeconds: 0, createdAt: scope.now, updatedAt: scope.now }, job: { id: `bad-job-${scope.suffix}`, projectId: scope.projectId, kind: "flow_capture", status: "queued", attempt: 0, maxAttempts: 2, progress: { current: 0, total: 1, unit: "step" }, userMessage: "queued", cancelable: true, retryable: false, createdAt: scope.now, updatedAt: scope.now }, safeInput: {} })).rejects.toThrow();
    expect((await pool.query("select count(*)::int as count from gideon_jobs where id=$1", [`bad-job-${scope.suffix}`])).rows[0]?.count).toBe(0);
  });

  it("uses real Redis/BullMQ for duplicate suppression, retry, and queue draining", async () => {
    const suffix = randomUUID();
    const connection = redisConnectionFromUrl(redisUrl!);
    const queueName = `gideon-capture-infra-${suffix}`;
    const prefix = `gideon-capture-infra:${suffix}`;
    const queue = createBullMqCaptureRunQueue({ connection, queueName, prefix, defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 25 }, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } } });
    const attempts = new Map<string, number>();
    let resolve!: () => void;
    const completed = new Promise<void>((value) => { resolve = value; });
    const worker = createBullMqCaptureRunWorker({ connection, queueName, prefix, concurrency: 1, async execute(job) { const count = (attempts.get(job.jobId) ?? 0) + 1; attempts.set(job.jobId, count); if (job.jobId.endsWith("retry") && count === 1) throw new Error("synthetic worker crash"); if (attempts.get(`${suffix}-once`) === 1 && attempts.get(`${suffix}-retry`) === 2) resolve(); } });
    try {
      const once = { workspaceId: "workspace-a", projectId: "project-a", captureRunId: `run-${suffix}-once`, jobId: `${suffix}-once` };
      const retry = { workspaceId: "workspace-b", projectId: "project-b", captureRunId: `run-${suffix}-retry`, jobId: `${suffix}-retry` };
      await Promise.all([queue.enqueue(once), queue.enqueue(once), queue.enqueue(retry)]);
      await Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for BullMQ recovery.")), 10_000))]);
      expect(attempts.get(once.jobId)).toBe(1);
      expect(attempts.get(retry.jobId)).toBe(2);
    } finally {
      await worker.close();
      await queue.close();
    }
  }, 20_000);

  it("recovers a durable queued job after broker interruption and cancels pending work", async () => {
    const suffix = randomUUID();
    const connection = redisConnectionFromUrl(redisUrl!);
    const options = { connection, queueName: `gideon-durable-${suffix}`, prefix: `gideon-durable:${suffix}`, concurrency: 1, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } };
    const first = new BullMqHostedWorkerJobBroker(options);
    await first.enqueue({ kind: "analysis", projectId: "project-a", jobId: `${suffix}-cancel` });
    await expect(first.cancel(`${suffix}-cancel`)).resolves.toBe(true);
    await first.enqueue({ kind: "analysis", projectId: "project-a", jobId: `${suffix}-durable` });
    await first.close();

    const second = new BullMqHostedWorkerJobBroker(options);
    const processed: string[] = [];
    let resolve!: () => void;
    const completed = new Promise<void>((value) => { resolve = value; });
    const unsubscribe = second.subscribe(async (job) => { processed.push(job.jobId); resolve(); });
    try {
      await Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for durable BullMQ recovery.")), 10_000))]);
      expect(processed).toEqual([`${suffix}-durable`]);
      expect(processed).not.toContain(`${suffix}-cancel`);
    } finally { unsubscribe(); await second.close(); }
  }, 20_000);

  it("exercises lease recovery, claims, heartbeats, and safe failure recording through real BullMQ", async () => {
    const suffix = randomUUID();
    const broker = new BullMqHostedWorkerJobBroker({ connection: redisConnectionFromUrl(redisUrl!), queueName: `gideon-lease-${suffix}`, prefix: `gideon-lease:${suffix}`, concurrency: 1, defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 25 }, removeOnComplete: true, removeOnFail: true } });
    const events: string[] = [];
    let attempts = 0;
    let resolve!: () => void;
    const completed = new Promise<void>((value) => { resolve = value; });
    const runtime = new HostedWorkerRuntime({ workerId: `worker-${suffix}`, leaseSeconds: 5, heartbeatIntervalMs: 20, leaseCoordinator: { async recoverExpiredJobLeases() { events.push("recover"); }, async claimJobLease() { events.push("claim"); }, async heartbeatJobLease() { events.push("heartbeat"); }, async failJobLease(input) { events.push(`fail:${input.safeError}`); } }, executor: { async runAnalysisJob() { attempts += 1; if (attempts === 1) throw new Error("synthetic database password=private"); resolve(); }, async runRenderJob() {} } });
    const disconnect = connectHostedWorkerRuntimeToBroker(broker, runtime);
    try {
      await broker.enqueue({ kind: "analysis", projectId: "project-lease", jobId: `${suffix}-lease` });
      await Promise.race([completed, new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for leased BullMQ recovery.")), 10_000))]);
      expect(attempts).toBe(2);
      expect(events.filter((event) => event === "recover")).toHaveLength(2);
      expect(events.filter((event) => event === "claim")).toHaveLength(2);
      expect(events.filter((event) => event === "heartbeat").length).toBeGreaterThanOrEqual(2);
      expect(events.find((event) => event.startsWith("fail:"))).not.toContain("private");
    } finally { disconnect(); await broker.close(); }
  }, 20_000);
});

interface Scope { suffix: string; workspaceId: string; projectId: string; environmentId: string; versionId: string; personaId: string; flowId: string; now: string; }
function uniqueScope(): Scope { const suffix = randomUUID().replaceAll("-", ""); return { suffix, workspaceId: `workspace-${suffix}`, projectId: `project-${suffix}`, environmentId: `environment-${suffix}`, versionId: `version-${suffix}`, personaId: `persona-${suffix}`, flowId: `flow-${suffix}`, now: "2026-07-16T18:00:00.000Z" }; }
function environment(scope: Scope): CaptureEnvironment { return { id: scope.environmentId, workspaceId: scope.workspaceId, projectId: scope.projectId, name: "Synthetic", type: "local_preview", baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: scope.versionId, createdAt: scope.now, updatedAt: scope.now }; }
function environmentVersion(scope: Scope): CaptureEnvironmentVersion { return { id: scope.versionId, workspaceId: scope.workspaceId, projectId: scope.projectId, environmentId: scope.environmentId, revision: 1, applicationFingerprint: "a".repeat(64), browserPolicyFingerprint: "b".repeat(64), validatedAt: scope.now, createdAt: scope.now }; }
function persona(scope: Scope): CapturePersona { return { id: scope.personaId, workspaceId: scope.workspaceId, projectId: scope.projectId, environmentId: scope.environmentId, key: "member", displayName: "Synthetic member", roleDescription: "Synthetic", fixtureProfileId: "empty", status: "active", revision: 1, createdAt: scope.now, updatedAt: scope.now }; }
function flow(scope: Scope): ProductFlowRevision { return { schemaVersion: "1", id: scope.flowId, revision: 1, projectId: scope.projectId, environmentVersionId: scope.versionId, personaId: scope.personaId, title: "Open dashboard", goal: "Open the dashboard.", startingState: { entryPath: "/" }, steps: [{ id: "step-1", intent: "Open dashboard.", action: { type: "navigate", path: "/dashboard" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/dashboard" }], approval: { status: "approved", approvedBy: "user-synthetic", approvedAt: scope.now, approvedRevision: 1 }, sourceEvidenceIds: ["goal-synthetic"] }; }
function usage(scope: Scope, id: string): UsageEvent { return { id, workspaceId: scope.workspaceId, projectId: scope.projectId, metric: "browser_seconds", quantity: 48, unit: "seconds", source: "capture", idempotencyKey: `capture:${scope.suffix}:usage`, createdAt: scope.now }; }
