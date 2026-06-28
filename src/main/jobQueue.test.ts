import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createHttpHostedJobQueueService,
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
});
