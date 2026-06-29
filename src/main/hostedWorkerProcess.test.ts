import { describe, expect, it } from "vitest";
import { createBrokeredHostedJobQueueService, InMemoryHostedWorkerJobBroker } from "./jobQueue";
import { createHostedWorkerBrokerFromEnv, createHostedWorkerProcess, storeOptionsFromEnv } from "./hostedWorkerProcess";
import { GideonStore } from "./store";

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
      storageRoot: "/tmp/gideon-storage"
    });
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
    expect(metrics).toEqual([
      "hosted_worker_started",
      "hosted_worker_job_started",
      "hosted_worker_job_succeeded",
      "hosted_worker_job_started",
      "hosted_worker_job_failed",
      "hosted_worker_stopped"
    ]);
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ event: "hosted_worker_started" })]));
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
