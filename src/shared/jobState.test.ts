import { describe, expect, it } from "vitest";
import {
  createJobEvent,
  createJob,
  failJob,
  findActiveJob,
  finishJobCancel,
  heartbeatJobLease,
  isActiveJob,
  recoverExpiredJobLease,
  recoverInterruptedJob,
  requestJobCancel,
  retryJob,
  startJob,
  startJobLease,
  succeedJob,
  updateJobStage,
  updateJobProgress
} from "./jobState";

const t0 = "2026-06-25T00:00:00.000Z";
const t1 = "2026-06-25T00:01:00.000Z";
const t2 = "2026-06-25T00:02:00.000Z";
const t3 = "2026-06-25T00:03:00.000Z";

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

  it("creates durable job events and stage progress updates", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const running = startJob(queued, t1, "Analyzing recording.");
    const staged = updateJobStage(
      running,
      "transcription",
      { current: 2, total: 5, unit: "stage" },
      t1,
      "Transcribing source audio."
    );
    const event = createJobEvent({
      id: "event-1",
      projectId: "project-1",
      jobId: "job-1",
      kind: "stage",
      stage: "transcription",
      message: "Transcribing source audio.",
      progress: staged.progress,
      now: t1
    });

    expect(staged.userMessage).toBe("transcription: Transcribing source audio.");
    expect(event).toMatchObject({
      projectId: "project-1",
      jobId: "job-1",
      kind: "stage",
      stage: "transcription",
      progress: { current: 2, total: 5, unit: "stage" }
    });
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

  it("tracks worker leases and heartbeats for running jobs", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const leased = startJobLease(queued, {
      now: t1,
      workerId: "worker-1",
      leaseSeconds: 60,
      userMessage: "Worker claimed job."
    });
    const heartbeat = heartbeatJobLease(leased, {
      now: t2,
      workerId: "worker-1",
      leaseSeconds: 120
    });

    expect(leased).toMatchObject({
      status: "running",
      workerId: "worker-1",
      heartbeatAt: t1,
      leaseExpiresAt: "2026-06-25T00:02:00.000Z",
      userMessage: "Worker claimed job."
    });
    expect(heartbeat).toMatchObject({
      workerId: "worker-1",
      heartbeatAt: t2,
      leaseExpiresAt: "2026-06-25T00:04:00.000Z"
    });
    expect(() =>
      heartbeatJobLease(leased, {
        now: t2,
        workerId: "worker-2",
        leaseSeconds: 120
      })
    ).toThrow("does not belong");
  });

  it("clears worker lease metadata when jobs finish or retry", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "render", now: t0 });
    const leased = startJobLease(queued, { now: t1, workerId: "worker-1", leaseSeconds: 60 });
    const failed = failJob(leased, t2, "Render failed.");
    const retried = retryJob(failed, t3);
    const succeeded = succeedJob(startJobLease(retried, { now: t3, workerId: "worker-2", leaseSeconds: 60 }), t3);

    expect(failed.workerId).toBeUndefined();
    expect(failed.heartbeatAt).toBeUndefined();
    expect(failed.leaseExpiresAt).toBeUndefined();
    expect(retried.workerId).toBeUndefined();
    expect(succeeded.workerId).toBeUndefined();
  });

  it("recovers expired worker leases as retryable failures", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const leased = startJobLease(queued, { now: t1, workerId: "worker-1", leaseSeconds: 30 });

    expect(recoverExpiredJobLease(leased, "2026-06-25T00:01:20.000Z")).toBeNull();
    const recovered = recoverExpiredJobLease(leased, t2);

    expect(recovered?.job).toMatchObject({
      status: "failed",
      retryable: true,
      safeError: "Worker lease expired before this job finished."
    });
    expect(recovered?.job.workerId).toBeUndefined();
    expect(recovered?.event).toMatchObject({
      kind: "failed",
      metadata: {
        recoveredFromStatus: "running",
        recoveredFromWorkerId: "worker-1",
        leaseExpiredAt: "2026-06-25T00:01:30.000Z",
        retryable: true
      }
    });
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

  it("recovers interrupted local jobs on app restart", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const recoveredQueued = recoverInterruptedJob(queued, t1);
    expect(recoveredQueued?.job.status).toBe("queued");
    expect(recoveredQueued?.event).toMatchObject({ kind: "queued", metadata: { recoveredFromStatus: "queued" } });

    const running = startJob(createJob({ id: "job-2", projectId: "project-1", kind: "render", now: t0 }), t1);
    const recoveredRunning = recoverInterruptedJob(running, t2);
    expect(recoveredRunning?.job.status).toBe("failed");
    expect(recoveredRunning?.job.retryable).toBe(true);
    expect(recoveredRunning?.event).toMatchObject({
      kind: "failed",
      metadata: { recoveredFromStatus: "running", retryable: true }
    });

    const canceling = requestJobCancel(running, t2);
    const recoveredCanceling = recoverInterruptedJob(canceling, t2);
    expect(recoveredCanceling?.job.status).toBe("canceled");
    expect(recoveredCanceling?.event).toMatchObject({ kind: "canceled", metadata: { recoveredFromStatus: "canceling" } });

    expect(recoverInterruptedJob(recoveredCanceling!.job, t2)).toBeNull();
  });

  it("detects active jobs by kind", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    const running = startJob(createJob({ id: "job-2", projectId: "project-1", kind: "render", now: t0 }), t1);
    const failed = failJob(startJob(createJob({ id: "job-3", projectId: "project-1", kind: "analysis", now: t0 }), t1), t2, "Nope.");

    expect(isActiveJob(queued)).toBe(true);
    expect(isActiveJob(running)).toBe(true);
    expect(isActiveJob(failed)).toBe(false);
    expect(findActiveJob([failed, queued, running], "analysis")?.id).toBe("job-1");
    expect(findActiveJob([failed], "analysis")).toBeNull();
  });

  it("rejects invalid transitions", () => {
    const queued = createJob({ id: "job-1", projectId: "project-1", kind: "analysis", now: t0 });
    expect(() => succeedJob(queued, t1)).toThrow("Cannot succeed queued job.");
  });
});
