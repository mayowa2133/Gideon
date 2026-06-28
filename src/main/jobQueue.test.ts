import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  connectHostedWorkerRuntimeToBroker,
  createBrokeredHostedJobQueueService,
  createHostedWorkerIntakeService,
  createHttpHostedJobQueueService,
  createStoreBackedWorkerLeaseCoordinator,
  handleHostedWorkerIntakeRequest,
  HostedWorkerRuntime,
  InMemoryHostedWorkerJobBroker,
  isWorkerQueueCanceledError,
  loadHostedJobQueueConfig,
  loadLocalWorkerQueueOptions,
  LocalWorkerQueue,
  verifyHostedWorkerQueueRequest
} from "./jobQueue";

describe("local worker queue", () => {
  it("runs queued jobs serially by default", async () => {
    const queue = new LocalWorkerQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue({
      id: "job-1",
      projectId: "project-1",
      kind: "analysis",
      run: async () => {
        events.push("first:start");
        await firstGate;
        events.push("first:end");
        return "first";
      }
    });
    const second = queue.enqueue({
      id: "job-2",
      projectId: "project-1",
      kind: "render",
      run: async () => {
        events.push("second:start");
        return "second";
      }
    });

    expect(queue.stats()).toMatchObject({ active: 1, pending: 1, concurrency: 1 });
    expect(queue.stats().activeByKind).toEqual({ analysis: 1 });
    expect(queue.stats().pendingByKind).toEqual({ render: 1 });
    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(queue.stats()).toMatchObject({ active: 0, pending: 0 });
  });

  it("rejects duplicate active or pending job ids", async () => {
    const queue = new LocalWorkerQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.enqueue({
      id: "job-1",
      projectId: "project-1",
      kind: "analysis",
      run: async () => {
        await gate;
        return "done";
      }
    });

    await expect(
      queue.enqueue({
        id: "job-1",
        projectId: "project-1",
        kind: "analysis",
        run: async () => "duplicate"
      })
    ).rejects.toThrow("already queued or running");
    release();
    await first;
  });

  it("runs detached worker jobs and reports background errors", async () => {
    const queue = new LocalWorkerQueue();
    const events: string[] = [];
    const errors: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    queue.enqueueDetached(
      {
        id: "job-1",
        projectId: "project-1",
        kind: "analysis",
        run: async () => {
          events.push("first:start");
          await gate;
          events.push("first:end");
        }
      },
      {
        onError(error, task) {
          errors.push(`${task.id}:${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    );
    expect(() =>
      queue.enqueueDetached({
        id: "job-1",
        projectId: "project-1",
        kind: "analysis",
        run: async () => undefined
      })
    ).toThrow("already queued or running");

    release();
    await flushQueue();

    queue.enqueueDetached(
      {
        id: "job-2",
        projectId: "project-1",
        kind: "render",
        run: async () => {
          throw new Error("detached boom");
        }
      },
      {
        onError(error, task) {
          errors.push(`${task.id}:${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    );
    await flushQueue();

    expect(events).toEqual(["first:start", "first:end"]);
    expect(errors).toEqual(["job-2:detached boom"]);
    expect(queue.stats()).toMatchObject({ active: 0, pending: 0 });
  });

  it("continues draining after a failed job", async () => {
    const queue = new LocalWorkerQueue();
    const failed = queue.enqueue({
      id: "job-1",
      projectId: "project-1",
      kind: "analysis",
      run: async () => {
        throw new Error("boom");
      }
    });
    const succeeded = queue.enqueue({
      id: "job-2",
      projectId: "project-1",
      kind: "render",
      run: async () => "rendered"
    });

    await expect(failed).rejects.toThrow("boom");
    await expect(succeeded).resolves.toBe("rendered");
  });

  it("cancels pending jobs before they run", async () => {
    const queue = new LocalWorkerQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.enqueue({
      id: "job-1",
      projectId: "project-1",
      kind: "analysis",
      run: async () => {
        events.push("first:start");
        await firstGate;
        events.push("first:end");
        return "first";
      }
    });
    const second = queue.enqueue({
      id: "job-2",
      projectId: "project-1",
      kind: "render",
      run: async () => {
        events.push("second:start");
        return "second";
      }
    });
    const third = queue.enqueue({
      id: "job-3",
      projectId: "project-1",
      kind: "render",
      run: async () => {
        events.push("third:start");
        return "third";
      }
    });

    expect(queue.cancel("job-2")).toBe(true);
    expect(queue.cancel("missing")).toBe(false);
    expect(queue.stats()).toMatchObject({ active: 1, pending: 1 });
    await expect(second.catch((error) => isWorkerQueueCanceledError(error))).resolves.toBe(true);
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(third).resolves.toBe("third");
    expect(events).toEqual(["first:start", "first:end", "third:start"]);
  });

  it("enforces per-kind concurrency lanes under the global limit", async () => {
    const queue = new LocalWorkerQueue({ concurrency: 2, concurrencyByKind: { render: 1, analysis: 1 } });
    const events: string[] = [];
    let releaseAnalysis!: () => void;
    let releaseRender!: () => void;
    const analysisGate = new Promise<void>((resolve) => {
      releaseAnalysis = resolve;
    });
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });

    const analysis = queue.enqueue({
      id: "analysis-1",
      projectId: "project-1",
      kind: "analysis",
      run: async () => {
        events.push("analysis:start");
        await analysisGate;
        return "analysis";
      }
    });
    const firstRender = queue.enqueue({
      id: "render-1",
      projectId: "project-1",
      kind: "render",
      run: async () => {
        events.push("render-1:start");
        await renderGate;
        return "render-1";
      }
    });
    const secondRender = queue.enqueue({
      id: "render-2",
      projectId: "project-1",
      kind: "render",
      run: async () => {
        events.push("render-2:start");
        return "render-2";
      }
    });

    expect(events).toEqual(["analysis:start", "render-1:start"]);
    expect(queue.stats()).toMatchObject({ active: 2, pending: 1, concurrency: 2 });
    expect(queue.stats().activeByKind).toEqual({ analysis: 1, render: 1 });
    expect(queue.stats().pendingByKind).toEqual({ render: 1 });
    expect(queue.stats().concurrencyByKind).toEqual({ analysis: 1, render: 1 });

    releaseAnalysis();
    await expect(analysis).resolves.toBe("analysis");
    expect(events).toEqual(["analysis:start", "render-1:start"]);

    releaseRender();
    await expect(firstRender).resolves.toBe("render-1");
    await expect(secondRender).resolves.toBe("render-2");
    expect(events).toEqual(["analysis:start", "render-1:start", "render-2:start"]);
  });

  it("loads local worker queue options from environment", () => {
    expect(
      loadLocalWorkerQueueOptions({
        GIDEON_QUEUE_CONCURRENCY: "3",
        GIDEON_RENDER_QUEUE_CONCURRENCY: "1",
        GIDEON_ANALYSIS_QUEUE_CONCURRENCY: "2",
        GIDEON_TTS_QUEUE_CONCURRENCY: "0"
      })
    ).toEqual({
      concurrency: 3,
      concurrencyByKind: {
        analysis: 2,
        render: 1
      }
    });
  });

  it("loads hosted worker queue options only when endpoint and secret are configured", () => {
    expect(
      loadHostedJobQueueConfig({
        GIDEON_HOSTED_QUEUE_URL: "https://workers.example.test/enqueue",
        GIDEON_HOSTED_QUEUE_SECRET: "queue-secret"
      })
    ).toEqual({
      provider: "http",
      httpEndpointUrl: "https://workers.example.test/enqueue",
      signingSecret: "queue-secret"
    });
    expect(
      loadHostedJobQueueConfig({
        GIDEON_HOSTED_QUEUE_URL: "https://workers.example.test/enqueue"
      })
    ).toEqual({
      provider: "none",
      httpEndpointUrl: "https://workers.example.test/enqueue",
      signingSecret: null
    });
    expect(
      loadHostedJobQueueConfig({
        GIDEON_HOSTED_QUEUE_URL: "file:///tmp/queue",
        GIDEON_HOSTED_QUEUE_SECRET: "queue-secret"
      })
    ).toEqual({
      provider: "none",
      httpEndpointUrl: null,
      signingSecret: "queue-secret"
    });
  });

  it("enqueues hosted jobs through a signed HTTP worker queue request", async () => {
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const service = createHttpHostedJobQueueService(
      {
        provider: "http",
        httpEndpointUrl: "https://workers.example.test/enqueue",
        signingSecret: "queue-secret"
      },
      async (url, init) => {
        requests.push({ url, headers: init.headers, body: init.body });
        return {
          ok: true,
          status: 202,
          async text() {
            return "";
          }
        };
      },
      () => 1_777_000_000_000
    );

    await service.enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });

    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });
    const signature = createHmac("sha256", "queue-secret").update(`1777000000.${body}`).digest("hex");
    expect(requests).toEqual([
      {
        url: "https://workers.example.test/enqueue",
        headers: {
          "Content-Type": "application/json",
          "X-Gideon-Queue-Timestamp": "1777000000",
          "X-Gideon-Queue-Signature": `sha256=${signature}`
        },
        body
      }
    ]);
  });

  it("sanitizes hosted worker queue failures", async () => {
    const service = createHttpHostedJobQueueService(
      {
        provider: "http",
        httpEndpointUrl: "https://workers.example.test/enqueue",
        signingSecret: "queue-secret"
      },
      async () => ({
        ok: false,
        status: 500,
        async text() {
          return "failed with token_abc123";
        }
      })
    );

    await expect(service.enqueueRenderJob({ projectId: "project-1", jobId: "job-1" })).rejects.toThrow(
      "failed with [redacted]"
    );
  });

  it("enqueues hosted jobs through a brokered queue service", async () => {
    const broker = new InMemoryHostedWorkerJobBroker();
    const service = createBrokeredHostedJobQueueService(broker);
    const processed: string[] = [];

    await service.enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await service.enqueueRenderJob({ projectId: "project-2", jobId: "job-2" });

    expect(broker.stats()).toMatchObject({ active: 0, pending: 2 });
    expect(broker.stats().pendingByKind).toEqual({ analysis: 1, render: 1 });

    broker.subscribe((job) => {
      processed.push(`${job.kind}:${job.projectId}:${job.jobId}`);
    });
    await flushQueue();

    expect(processed).toEqual(["analysis:project-1:job-1", "render:project-2:job-2"]);
    expect(broker.stats()).toMatchObject({ active: 0, pending: 0 });
    expect(() => service.enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" })).not.toThrow();
    expect(() => service.enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" })).toThrow("already queued or running");
  });

  it("connects brokered hosted jobs to the worker runtime", async () => {
    const events: string[] = [];
    const broker = new InMemoryHostedWorkerJobBroker({
      onError(error, job) {
        events.push(`broker-error:${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });
    const runtime = new HostedWorkerRuntime({
      workerId: "worker-1",
      leaseSeconds: 60,
      heartbeatIntervalMs: 0,
      nowMs: () => 1_777_000_000_000,
      leaseCoordinator: {
        recoverExpiredJobLeases(input) {
          events.push(`recover:${input.now}`);
        },
        claimJobLease(input) {
          events.push(`claim:${input.workerId}:${input.job.jobId}:${input.now}`);
        },
        heartbeatJobLease(input) {
          events.push(`heartbeat:${input.workerId}:${input.job.jobId}:${input.now}`);
        },
        failJobLease(input) {
          events.push(`fail:${input.workerId}:${input.job.jobId}:${input.safeError}`);
        }
      },
      executor: {
        runAnalysisJob(input) {
          events.push(`run-analysis:${input.projectId}:${input.jobId}`);
        },
        runRenderJob(input) {
          events.push(`run-render:${input.projectId}:${input.jobId}`);
        }
      },
      onError(error, job) {
        events.push(`runtime-error:${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });
    connectHostedWorkerRuntimeToBroker(broker, runtime);

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(events).toEqual([
      "recover:2026-04-24T03:06:40.000Z",
      "claim:worker-1:job-1:2026-04-24T03:06:40.000Z",
      "heartbeat:worker-1:job-1:2026-04-24T03:06:40.000Z",
      "run-analysis:project-1:job-1",
      "heartbeat:worker-1:job-1:2026-04-24T03:06:40.000Z"
    ]);
  });

  it("routes brokered worker runtime failures through lease failure and broker errors", async () => {
    const events: string[] = [];
    const broker = new InMemoryHostedWorkerJobBroker({
      onError(error, job) {
        events.push(`broker-error:${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });
    const runtime = new HostedWorkerRuntime({
      workerId: "worker-1",
      leaseSeconds: 60,
      heartbeatIntervalMs: 0,
      nowMs: () => 1_777_000_000_000,
      leaseCoordinator: {
        claimJobLease(input) {
          events.push(`claim:${input.job.jobId}`);
        },
        heartbeatJobLease(input) {
          events.push(`heartbeat:${input.job.jobId}`);
        },
        failJobLease(input) {
          events.push(`fail:${input.job.jobId}:${input.safeError}`);
        }
      },
      executor: {
        runAnalysisJob() {
          throw new Error("worker secret_token_123 exploded");
        },
        runRenderJob() {
          throw new Error("Unexpected render.");
        }
      }
    });
    connectHostedWorkerRuntimeToBroker(broker, runtime);

    await createBrokeredHostedJobQueueService(broker).enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(events).toEqual([
      "claim:job-1",
      "heartbeat:job-1",
      "fail:job-1:worker [redacted] exploded",
      "broker-error:job-1:worker secret_token_123 exploded"
    ]);
  });

  it("verifies signed hosted worker queue intake requests", () => {
    const body = JSON.stringify({ kind: "render", projectId: "project-1", jobId: "job-1" });
    const signature = createHmac("sha256", "queue-secret").update(`1777000000.${body}`).digest("hex");

    expect(
      verifyHostedWorkerQueueRequest({
        signingSecret: "queue-secret",
        headers: {
          "x-gideon-queue-timestamp": "1777000000",
          "x-gideon-queue-signature": `sha256=${signature}`
        },
        body,
        nowMs: 1_777_000_000_000
      })
    ).toEqual({
      kind: "render",
      projectId: "project-1",
      jobId: "job-1"
    });
  });

  it("rejects stale or incorrectly signed hosted worker queue intake requests", () => {
    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });
    const signature = createHmac("sha256", "queue-secret").update(`1777000000.${body}`).digest("hex");

    expect(() =>
      verifyHostedWorkerQueueRequest({
        signingSecret: "queue-secret",
        headers: {
          "x-gideon-queue-timestamp": "1776999000",
          "x-gideon-queue-signature": `sha256=${signature}`
        },
        body,
        nowMs: 1_777_000_000_000
      })
    ).toThrow("outside the allowed tolerance");
    expect(() =>
      verifyHostedWorkerQueueRequest({
        signingSecret: "queue-secret",
        headers: {
          "x-gideon-queue-timestamp": "1777000000",
          "x-gideon-queue-signature": `sha256=${"0".repeat(64)}`
        },
        body,
        nowMs: 1_777_000_000_000
      })
    ).toThrow("verification failed");
  });

  it("rejects malformed hosted worker queue jobs after signature verification", () => {
    const body = JSON.stringify({ kind: "export", projectId: "project-1", jobId: "job-1" });
    const signature = createHmac("sha256", "queue-secret").update(`1777000000.${body}`).digest("hex");

    expect(() =>
      verifyHostedWorkerQueueRequest({
        signingSecret: "queue-secret",
        headers: {
          "x-gideon-queue-timestamp": "1777000000",
          "x-gideon-queue-signature": `sha256=${signature}`
        },
        body,
        nowMs: 1_777_000_000_000
      })
    ).toThrow("job kind is invalid");
  });

  it("accepts verified worker intake requests and dispatches by job kind", async () => {
    const dispatched: string[] = [];
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      dispatcher: {
        dispatchAnalysisJob(input) {
          dispatched.push(`analysis:${input.projectId}:${input.jobId}`);
        },
        dispatchRenderJob(input) {
          dispatched.push(`render:${input.projectId}:${input.jobId}`);
        }
      }
    });
    const analysisBody = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });
    const renderBody = JSON.stringify({ kind: "render", projectId: "project-2", jobId: "job-2" });

    await expect(
      service.accept({
        headers: signedQueueHeaders(analysisBody),
        body: analysisBody
      })
    ).resolves.toEqual({
      accepted: true,
      job: { kind: "analysis", projectId: "project-1", jobId: "job-1" }
    });
    await expect(
      service.accept({
        headers: signedQueueHeaders(renderBody),
        body: renderBody
      })
    ).resolves.toEqual({
      accepted: true,
      job: { kind: "render", projectId: "project-2", jobId: "job-2" }
    });

    expect(dispatched).toEqual(["analysis:project-1:job-1", "render:project-2:job-2"]);
  });

  it("coordinates worker leases around verified dispatch", async () => {
    const events: string[] = [];
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      workerId: "worker-1",
      leaseSeconds: 45,
      leaseCoordinator: {
        recoverExpiredJobLeases(input) {
          events.push(`recover:${input.now}`);
        },
        claimJobLease(input) {
          events.push(`claim:${input.workerId}:${input.leaseSeconds}:${input.job.kind}:${input.job.jobId}:${input.now}`);
        },
        heartbeatJobLease(input) {
          events.push(`heartbeat:${input.workerId}:${input.leaseSeconds}:${input.job.jobId}:${input.now}`);
        }
      },
      dispatcher: {
        dispatchAnalysisJob(input) {
          events.push(`dispatch:${input.projectId}:${input.jobId}`);
        },
        dispatchRenderJob() {
          throw new Error("Unexpected render dispatch.");
        }
      }
    });
    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });

    await service.accept({ headers: signedQueueHeaders(body), body });

    expect(events).toEqual([
      "recover:2026-04-24T03:06:40.000Z",
      "claim:worker-1:45:analysis:job-1:2026-04-24T03:06:40.000Z",
      "dispatch:project-1:job-1",
      "heartbeat:worker-1:45:job-1:2026-04-24T03:06:40.000Z"
    ]);
  });

  it("marks leased jobs failed when hosted dispatch fails", async () => {
    const failures: string[] = [];
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      workerId: "worker-1",
      leaseCoordinator: {
        claimJobLease(input) {
          failures.push(`claim:${input.job.jobId}`);
        },
        heartbeatJobLease(input) {
          failures.push(`heartbeat:${input.job.jobId}`);
        },
        failJobLease(input) {
          failures.push(`fail:${input.workerId}:${input.job.jobId}:${input.safeError}`);
        }
      },
      dispatcher: {
        dispatchAnalysisJob() {
          throw new Error("worker secret_token_123 backend failed");
        },
        dispatchRenderJob() {
          throw new Error("Unexpected render dispatch.");
        }
      }
    });
    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });

    await expect(service.accept({ headers: signedQueueHeaders(body), body })).rejects.toThrow("secret_token_123");

    expect(failures).toEqual(["claim:job-1", "fail:worker-1:job-1:worker [redacted] backend failed"]);
  });

  it("runs hosted worker runtime jobs through detached execution with lease heartbeats", async () => {
    const events: string[] = [];
    const runtime = new HostedWorkerRuntime({
      workerId: "worker-1",
      leaseSeconds: 60,
      heartbeatIntervalMs: 0,
      nowMs: () => 1_777_000_000_000,
      leaseCoordinator: {
        claimJobLease(input) {
          events.push(`claim:${input.job.jobId}`);
        },
        heartbeatJobLease(input) {
          events.push(`heartbeat:${input.workerId}:${input.job.jobId}:${input.now}`);
        },
        failJobLease(input) {
          events.push(`fail:${input.job.jobId}:${input.safeError}`);
        }
      },
      executor: {
        runAnalysisJob(input) {
          events.push(`run-analysis:${input.projectId}:${input.jobId}`);
        },
        runRenderJob(input) {
          events.push(`run-render:${input.projectId}:${input.jobId}`);
        }
      },
      onError(error, job) {
        events.push(`error:${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });

    runtime.dispatchAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(events).toEqual([
      "heartbeat:worker-1:job-1:2026-04-24T03:06:40.000Z",
      "run-analysis:project-1:job-1",
      "heartbeat:worker-1:job-1:2026-04-24T03:06:40.000Z"
    ]);
    expect(runtime.stats()).toMatchObject({ active: 0, pending: 0 });
  });

  it("marks hosted worker runtime execution failures against the lease", async () => {
    const events: string[] = [];
    const runtime = new HostedWorkerRuntime({
      workerId: "worker-1",
      leaseSeconds: 60,
      heartbeatIntervalMs: 0,
      nowMs: () => 1_777_000_000_000,
      leaseCoordinator: {
        claimJobLease() {
          events.push("claim");
        },
        heartbeatJobLease(input) {
          events.push(`heartbeat:${input.job.jobId}`);
        },
        failJobLease(input) {
          events.push(`fail:${input.workerId}:${input.job.jobId}:${input.safeError}`);
        }
      },
      executor: {
        runAnalysisJob() {
          throw new Error("worker secret_token_123 failed");
        },
        runRenderJob() {
          throw new Error("Unexpected render.");
        }
      },
      onError(error, job) {
        events.push(`error:${job.jobId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    });

    runtime.dispatchAnalysisJob({ projectId: "project-1", jobId: "job-1" });
    await flushQueue();

    expect(events).toEqual([
      "heartbeat:job-1",
      "fail:worker-1:job-1:worker [redacted] failed",
      "error:job-1:worker secret_token_123 failed"
    ]);
  });

  it("maps the store-backed hosted worker lease coordinator to store methods", async () => {
    const calls: string[] = [];
    const coordinator = createStoreBackedWorkerLeaseCoordinator({
      claimWorkerJobLease(input) {
        calls.push(`claim:${input.projectId}:${input.jobId}:${input.workerId}:${input.leaseSeconds}:${input.now}:${input.userMessage}`);
      },
      heartbeatWorkerJobLease(input) {
        calls.push(`heartbeat:${input.projectId}:${input.jobId}:${input.workerId}:${input.leaseSeconds}:${input.now}`);
      },
      failWorkerJobLease(input) {
        calls.push(`fail:${input.projectId}:${input.jobId}:${input.workerId}:${input.now}:${input.safeError}`);
      },
      recoverExpiredWorkerJobLeases(now) {
        calls.push(`recover:${now}`);
      }
    });
    const job = { kind: "render" as const, projectId: "project-1", jobId: "job-1" };

    await coordinator.recoverExpiredJobLeases?.({ now: "2026-06-25T12:00:00.000Z" });
    await coordinator.claimJobLease({
      job,
      workerId: "worker-1",
      leaseSeconds: 60,
      now: "2026-06-25T12:01:00.000Z"
    });
    await coordinator.heartbeatJobLease({
      job,
      workerId: "worker-1",
      leaseSeconds: 60,
      now: "2026-06-25T12:02:00.000Z"
    });
    await coordinator.failJobLease?.({
      job,
      workerId: "worker-1",
      leaseSeconds: 60,
      now: "2026-06-25T12:03:00.000Z",
      safeError: "Worker failed."
    });

    expect(calls).toEqual([
      "recover:2026-06-25T12:00:00.000Z",
      "claim:project-1:job-1:worker-1:60:2026-06-25T12:01:00.000Z:Worker worker-1 claimed render job.",
      "heartbeat:project-1:job-1:worker-1:60:2026-06-25T12:02:00.000Z",
      "fail:project-1:job-1:worker-1:2026-06-25T12:03:00.000Z:Worker failed."
    ]);
  });

  it("does not dispatch worker intake requests that fail verification", async () => {
    const dispatched: string[] = [];
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      dispatcher: {
        dispatchAnalysisJob(input) {
          dispatched.push(`analysis:${input.projectId}:${input.jobId}`);
        },
        dispatchRenderJob(input) {
          dispatched.push(`render:${input.projectId}:${input.jobId}`);
        }
      }
    });

    await expect(
      service.accept({
        headers: {
          "x-gideon-queue-timestamp": "1777000000",
          "x-gideon-queue-signature": `sha256=${"0".repeat(64)}`
        },
        body: JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" })
      })
    ).rejects.toThrow("verification failed");
    expect(dispatched).toEqual([]);
  });

  it("handles hosted worker intake HTTP requests", async () => {
    const dispatched: string[] = [];
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      dispatcher: {
        dispatchAnalysisJob(input) {
          dispatched.push(`analysis:${input.projectId}:${input.jobId}`);
        },
        dispatchRenderJob(input) {
          dispatched.push(`render:${input.projectId}:${input.jobId}`);
        }
      }
    });
    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });

    await expect(
      handleHostedWorkerIntakeRequest(
        {
          method: "POST",
          headers: signedQueueHeaders(body),
          body
        },
        service
      )
    ).resolves.toEqual({
      status: 202,
      headers: { "Content-Type": "application/json" },
      body: {
        accepted: true,
        job: { kind: "analysis", projectId: "project-1", jobId: "job-1" }
      }
    });
    expect(dispatched).toEqual(["analysis:project-1:job-1"]);
  });

  it("maps hosted worker intake HTTP failures to safe responses", async () => {
    const service = createHostedWorkerIntakeService({
      signingSecret: "queue-secret",
      nowMs: () => 1_777_000_000_000,
      dispatcher: {
        dispatchAnalysisJob() {
          throw new Error("worker secret_token_123 backend failed");
        },
        dispatchRenderJob() {
          throw new Error("should not dispatch render");
        }
      }
    });
    const body = JSON.stringify({ kind: "analysis", projectId: "project-1", jobId: "job-1" });

    await expect(handleHostedWorkerIntakeRequest({ method: "GET" }, service)).resolves.toMatchObject({
      status: 405,
      body: { error: { code: "method_not_allowed" } }
    });
    await expect(
      handleHostedWorkerIntakeRequest(
        {
          method: "POST",
          headers: {
            "x-gideon-queue-timestamp": "1777000000",
            "x-gideon-queue-signature": `sha256=${"0".repeat(64)}`
          },
          body
        },
        service
      )
    ).resolves.toMatchObject({
      status: 401,
      body: { error: { code: "invalid_queue_signature" } }
    });
    await expect(
      handleHostedWorkerIntakeRequest(
        {
          method: "POST",
          headers: signedQueueHeaders(body),
          body
        },
        service
      )
    ).resolves.toEqual({
      status: 503,
      headers: { "Content-Type": "application/json" },
      body: {
        error: {
          code: "worker_dispatch_failed",
          message: "worker [redacted] backend failed"
        }
      }
    });
  });
});

function signedQueueHeaders(body: string): Record<string, string> {
  const signature = createHmac("sha256", "queue-secret").update(`1777000000.${body}`).digest("hex");
  return {
    "x-gideon-queue-timestamp": "1777000000",
    "x-gideon-queue-signature": `sha256=${signature}`
  };
}

async function flushQueue(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
