import { describe, expect, it } from "vitest";
import { isWorkerQueueCanceledError, loadLocalWorkerQueueOptions, LocalWorkerQueue } from "./jobQueue";

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
});
