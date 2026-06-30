import { describe, expect, it } from "vitest";
import { createBrokeredHostedJobQueueService, InMemoryHostedWorkerJobBroker } from "./jobQueue";
import { createHostedWorkerBrokerFromEnv, createHostedWorkerProcess, storeOptionsFromEnv } from "./hostedWorkerProcess";
import { GideonStore, type JobObservabilitySnapshot } from "./store";

describe("hosted worker process", () => {
  it("loads store path options from environment", () => {
    expect(
      storeOptionsFromEnv({
        GIDEON_USER_DATA_DIR: "/tmp/gideon-user-data",
        GIDEON_STORE_PATH: "/tmp/gideon-store.json",
        GIDEON_PROJECTS_DIR: "/tmp/gideon-projects",
        GIDEON_STORAGE_ROOT: "/tmp/gideon-storage"
      })
    ).toEqual({
      userDataDir: "/tmp/gideon-user-data",
      storePath: "/tmp/gideon-store.json",
      projectsDir: "/tmp/gideon-projects",
      storageRoot: "/tmp/gideon-storage",
      persistence: undefined
    });
  });

  it("loads PostgreSQL snapshot persistence from environment", async () => {
    const options = storeOptionsFromEnv({
      GIDEON_STORE_PROVIDER: "postgres_snapshot",
      GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
      GIDEON_POSTGRES_SNAPSHOT_ID: "hosted-prod",
      GIDEON_POSTGRES_SNAPSHOT_TABLE: "gideon_app_state_snapshots"
    });

    expect(options.persistence?.metadata).toEqual({
      provider: "postgres_snapshot",
      location: '"gideon_app_state_snapshots":hosted-prod'
    });
    expect(options.relationalMirror).toBeDefined();
    expect(options.relationalMirror?.upsertUser).toBeDefined();
    expect(options.relationalMirror?.upsertWorkspace).toBeDefined();
    expect(options.relationalMirror?.upsertProject).toBeDefined();
    expect(options.relationalMirror?.upsertUsageEvent).toBeDefined();
    expect(options.relationalMirror?.upsertAuditEvent).toBeDefined();
    expect(options.relationalReads).toBeDefined();
    expect(options.relationalReads?.listWorkspaceProjects).toBeDefined();
    expect(options.relationalReads?.getProject).toBeDefined();
    expect(options.relationalReads?.getJob).toBeDefined();
    expect(options.relationalReads?.getArtifact).toBeDefined();
    await options.persistence?.close?.();
    await options.relationalMirror?.close?.();
  });

  it("can disable the PostgreSQL relational mirror during controlled migrations", async () => {
    const options = storeOptionsFromEnv({
      GIDEON_STORE_PROVIDER: "postgres_snapshot",
      GIDEON_RELATIONAL_MIRROR: "false",
      GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require"
    });

    expect(options.persistence?.metadata.provider).toBe("postgres_snapshot");
    expect(options.relationalMirror).toBeUndefined();
    expect(options.relationalReads).toBeUndefined();
    await options.persistence?.close?.();
  });

  it("rejects PostgreSQL snapshot persistence without a database URL", () => {
    expect(() => storeOptionsFromEnv({ GIDEON_STORE_PROVIDER: "postgres_snapshot" })).toThrow(
      "GIDEON_STORE_PROVIDER=postgres_snapshot requires GIDEON_DATABASE_URL or DATABASE_URL."
    );
  });

  it("creates a configured local-test broker from environment", () => {
    expect(createHostedWorkerBrokerFromEnv({ GIDEON_HOSTED_QUEUE_PROVIDER: "memory" })).toBeInstanceOf(
      InMemoryHostedWorkerJobBroker
    );
    expect(() => createHostedWorkerBrokerFromEnv({})).toThrow("requires GIDEON_HOSTED_QUEUE_PROVIDER");
  });

  it("composes broker, store leases, executor, metrics, and safe logs", async () => {
    const broker = new InMemoryHostedWorkerJobBroker();
    const calls: string[] = [];
    const metrics: string[] = [];
    const logs: unknown[] = [];
    const errors: unknown[] = [];
    const handle = createHostedWorkerProcess({
      broker,
      store: new FakeProcessStore(calls),
      executor: {
        async runAnalysisJob(projectId, jobId) {
          calls.push(`analysis:${projectId}:${jobId}`);
        },
        async runRenderJob() {
          throw new Error("render token_abc123 failed");
        }
      },
      config: {
        workerId: "worker-process",
        leaseSeconds: 60,
        heartbeatIntervalMs: 0
      },
      nowMs: sequenceClock([
        1_777_000_000_000,
        1_777_000_000_010,
        1_777_000_000_020,
        1_777_000_000_030,
        1_777_000_000_040,
        1_777_000_000_050
      ]),
      logger: {
        info(input) {
          logs.push(input);
        },
        error(input) {
          errors.push(input);
        }
      },
      onMetric(event) {
        metrics.push(event.name);
      }
    });

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await createBrokeredHostedJobQueueService(broker).enqueueRenderJob({ projectId: "project-1", jobId: "job-2" });
    await flushQueue();
    await handle.stop();
    await flushQueue();

    expect(handle.workerId).toBe("worker-process");
    expect(calls).toEqual([
      "recover:2026-04-24T03:06:40.030Z",
      "claim:job-1:worker-process",
      "heartbeat:job-1:worker-process",
      "analysis:project-1:job-1",
      "heartbeat:job-1:worker-process",
      "recover:2026-04-24T03:06:40.050Z",
      "claim:job-2:worker-process",
      "heartbeat:job-2:worker-process",
      "fail:job-2:render [redacted] failed"
    ]);
    expect(metrics.filter((name) => name !== "job_observability_snapshot")).toEqual([
      "hosted_worker_started",
      "hosted_worker_job_started",
      "hosted_worker_job_succeeded",
      "hosted_worker_job_started",
      "hosted_worker_job_failed",
      "hosted_worker_stopped"
    ]);
    expect(metrics.filter((name) => name === "job_observability_snapshot").length).toBeGreaterThanOrEqual(1);
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ event: "hosted_worker_started" })]));
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "job_observability_snapshot",
          snapshot: expect.objectContaining({ totalJobs: 2, activeJobs: 1 })
        })
      ])
    );
    expect(errors).toEqual([
      expect.objectContaining({
        event: "hosted_worker_job_error",
        message: "render [redacted] failed"
      })
    ]);
  });
});

class FakeProcessStore extends GideonStore {
  constructor(private readonly calls: string[]) {
    super({ userDataDir: "/tmp/gideon-worker-test" });
  }

  override claimWorkerJobLease(input: {
    jobId: string;
    workerId: string;
  }): void {
    this.calls.push(`claim:${input.jobId}:${input.workerId}`);
  }

  override heartbeatWorkerJobLease(input: {
    jobId: string;
    workerId: string;
  }): void {
    this.calls.push(`heartbeat:${input.jobId}:${input.workerId}`);
  }

  override failWorkerJobLease(input: {
    jobId: string;
    safeError: string;
  }): void {
    this.calls.push(`fail:${input.jobId}:${input.safeError}`);
  }

  override recoverExpiredWorkerJobLeases(now?: string): [] {
    this.calls.push(`recover:${now}`);
    return [];
  }

  override async getJobObservabilitySnapshot(): Promise<JobObservabilitySnapshot> {
    return {
      generatedAt: "2026-04-24T03:06:40.000Z",
      windowMs: 3_600_000,
      totalJobs: 2,
      activeJobs: 1,
      queuedJobs: 1,
      runningJobs: 0,
      cancelingJobs: 0,
      terminalJobs: 1,
      failedJobs: 1,
      retryableFailedJobs: 1,
      terminalFailuresInWindow: 1,
      recoveredLeaseFailuresInWindow: 1,
      expiredRunningLeases: 0,
      oldestQueuedAgeMs: 1_000,
      oldestRunningAgeMs: null,
      terminalFailureRatePerHour: 1,
      byStatus: { queued: 1, failed: 1 },
      byKind: { analysis: 1, render: 1 }
    };
  }
}

async function flushQueue(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function sequenceClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values[values.length - 1] ?? Date.now();
}
