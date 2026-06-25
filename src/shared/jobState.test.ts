import { describe, expect, it } from "vitest";
import {
  createJob,
  failJob,
  finishJobCancel,
  requestJobCancel,
  retryJob,
  startJob,
  succeedJob,
  updateJobProgress
} from "./jobState";

const t0 = "2026-06-25T00:00:00.000Z";
const t1 = "2026-06-25T00:01:00.000Z";
const t2 = "2026-06-25T00:02:00.000Z";

describe("job state machine", () => {
  it("runs a job through queued, running, progress, and succeeded states", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const running = startJob(queued, t1, "Analyzing recording.");
    const progressed = updateJobProgress(running, { current: 2, total: 4, unit: "stage" }, t1, "Transcribing.");
    const succeeded = succeedJob(progressed, t2);

    expect(queued.status).toBe("queued");
    expect(running.attempt).toBe(1);
    expect(progressed.progress.current).toBe(2);
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.cancelable).toBe(false);
  });

  it("marks failed jobs retryable until max attempts is reached", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "render", now: t0, maxAttempts: 2 });
    const failed = failJob(startJob(queued, t1), t2, "FFmpeg failed.");
    expect(failed.retryable).toBe(true);

    const retried = retryJob(failed, t2);
    const failedAgain = failJob(startJob(retried, t2), t2, "FFmpeg failed again.");
    expect(failedAgain.retryable).toBe(false);
    expect(() => retryJob(failedAgain, t2)).toThrow("Job is not retryable.");
  });

  it("cancels queued jobs immediately and running jobs through canceling", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "tts", now: t0 });
    const canceledQueued = requestJobCancel(queued, t1);
    expect(canceledQueued.status).toBe("canceled");
    expect(canceledQueued.retryable).toBe(true);

    const running = startJob(createJob({ id: "job-2", projectId: "project-1", kind: "analysis", now: t0 }), t1);
    const canceling = requestJobCancel(running, t2);
    expect(canceling.status).toBe("canceling");
    const canceled = finishJobCancel(canceling, t2);
    expect(canceled.status).toBe("canceled");
  });

  it("rejects invalid transitions", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    expect(() => succeedJob(queued, t1)).toThrow("Cannot succeed queued job.");
  });
});

