import { describe, expect, it } from "vitest";
import { LocalWorkerQueue } from "./jobQueue";

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

    expect(queue.stats()).toEqual({ active: 1, pending: 1 });
    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
    expect(queue.stats()).toEqual({ active: 0, pending: 0 });
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
});
