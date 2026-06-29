import { describe, expect, it } from "vitest";
import { InMemoryHostedWorkerJobBroker, createBrokeredHostedJobQueueService } from "./jobQueue";
import { createHostedWorkerRuntimeBootstrap, loadHostedWorkerRuntimeConfig } from "./hostedWorker";

describe("hosted worker bootstrap", () => {
  it("loads worker runtime config from environment with safe defaults", () => {
    expect(
      loadHostedWorkerRuntimeConfig({
        GIDEON_WORKER_ID: "worker-a",
        GIDEON_WORKER_LEASE_SECONDS: "120",
        GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "5000"
      })
    ).toEqual({
      workerId: "worker-a",
      leaseSeconds: 120,
      heartbeatIntervalMs: 5_000
    });
    expect(loadHostedWorkerRuntimeConfig({ GIDEON_WORKER_LEASE_SECONDS: "nope" })).toMatchObject({
      leaseSeconds: 300,
      heartbeatIntervalMs: 150_000
    });
  });

  it("subscribes a store-backed runtime to brokered hosted jobs", async () => {
    const broker = new InMemoryHostedWorkerJobBroker();
    const calls: string[] = [];
    const handle = createHostedWorkerRuntimeBootstrap({
      broker,
      store: leaseStoreFixture(calls),
      executor: {
        runAnalysisJob(input) {
          calls.push(`run-analysis:${input.projectId}:${input.jobId}`);
        },
        runRenderJob(input) {
          calls.push(`run-render:${input.projectId}:${input.jobId}`);
        }
      },
      config: {
        workerId: "worker-1",
        leaseSeconds: 60,
        heartbeatIntervalMs: 0
      },
      nowMs: () => 1_777_000_000_000
    });

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(handle.workerId).toBe("worker-1");
    expect(handle.stats()).toMatchObject({ active: 0, pending: 0 });
    expect(calls).toEqual([
      "recover:2026-04-24T03:06:40.000Z",
      "claim:project-1:job-1:worker-1:60:2026-04-24T03:06:40.000Z:Worker worker-1 claimed analysis job.",
      "heartbeat:project-1:job-1:worker-1:60:2026-04-24T03:06:40.000Z",
      "run-analysis:project-1:job-1",
      "heartbeat:project-1:job-1:worker-1:60:2026-04-24T03:06:40.000Z"
    ]);

    handle.stop();
    await createBrokeredHostedJobQueueService(broker).enqueueRenderJob({ projectId: "project-1", jobId: "job-2" });
    await flushQueue();

    expect(handle.stats()).toMatchObject({ active: 0, pending: 1 });
    expect(calls).not.toContain("run-render:project-1:job-2");
  });

  it("reports brokered worker execution failures through lease failure and error hooks", async () => {
    const broker = new InMemoryHostedWorkerJobBroker();
    const calls: string[] = [];
    const errors: string[] = [];
    createHostedWorkerRuntimeBootstrap({
      broker,
      store: leaseStoreFixture(calls),
      executor: {
        runAnalysisJob() {
          throw new Error("worker secret_token_123 failed");
        },
        runRenderJob() {
          throw new Error("Unexpected render.");
        }
      },
      config: {
        workerId: "worker-1",
        leaseSeconds: 60,
        heartbeatIntervalMs: 0
      },
      nowMs: () => 1_777_000_000_000,
      onError(error, job) {
        errors.push(`${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(calls).toEqual([
      "recover:2026-04-24T03:06:40.000Z",
      "claim:project-1:job-1:worker-1:60:2026-04-24T03:06:40.000Z:Worker worker-1 claimed analysis job.",
      "heartbeat:project-1:job-1:worker-1:60:2026-04-24T03:06:40.000Z",
      "fail:project-1:job-1:worker-1:2026-04-24T03:06:40.000Z:worker [redacted] failed"
    ]);
    expect(errors).toEqual(["job-1:worker secret_token_123 failed"]);
  });

  it("emits worker lifecycle and job metrics with safe failure messages", async () => {
    const broker = new InMemoryHostedWorkerJobBroker();
    const metrics: string[] = [];
    const handle = createHostedWorkerRuntimeBootstrap({
      broker,
      store: leaseStoreFixture([]),
      executor: {
        runAnalysisJob() {
          throw new Error("provider token_abc123 failed");
        },
        runRenderJob() {
          metrics.push("render");
        }
      },
      config: {
        workerId: "worker-metrics",
        leaseSeconds: 60,
        heartbeatIntervalMs: 0
      },
      nowMs: sequenceClock([1_777_000_000_000, 1_777_000_000_010, 1_777_000_000_100, 1_777_000_000_110]),
      onMetric(event) {
        metrics.push(`${event.name}:${event.workerId}:${"job" in event ? event.job.jobId : "none"}:${"safeError" in event ? event.safeError : "ok"}`);
      }
    });

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();
    handle.stop();

    expect(metrics).toEqual([
      "hosted_worker_started:worker-metrics:none:ok",
      "hosted_worker_job_started:worker-metrics:job-1:ok",
      "hosted_worker_job_failed:worker-metrics:job-1:provider [redacted] failed",
      "hosted_worker_stopped:worker-metrics:none:ok"
    ]);
  });
});

function leaseStoreFixture(calls: string[]) {
  return {
    claimWorkerJobLease(input: {
      projectId: string;
      jobId: string;
      workerId: string;
      leaseSeconds: number;
      now?: string;
      userMessage?: string;
    }) {
      calls.push(
        `claim:${input.projectId}:${input.jobId}:${input.workerId}:${input.leaseSeconds}:${input.now}:${input.userMessage}`
      );
    },
    heartbeatWorkerJobLease(input: {
      projectId: string;
      jobId: string;
      workerId: string;
      leaseSeconds: number;
      now?: string;
    }) {
      calls.push(`heartbeat:${input.projectId}:${input.jobId}:${input.workerId}:${input.leaseSeconds}:${input.now}`);
    },
    failWorkerJobLease(input: { projectId: string; jobId: string; workerId: string; safeError: string; now?: string }) {
      calls.push(`fail:${input.projectId}:${input.jobId}:${input.workerId}:${input.now}:${input.safeError}`);
    },
    recoverExpiredWorkerJobLeases(now?: string) {
      calls.push(`recover:${now}`);
    }
  };
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
