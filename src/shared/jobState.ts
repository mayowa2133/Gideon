import type { JobEvent, JobEventKind, JobKind, JobRecord, JobStage } from "./types";

export interface CreateJobInput {
  id: string;
  projectId: string;
  kind: JobKind;
  now: string;
  maxAttempts?: number;
  userMessage?: string;
  cancelable?: boolean;
}

export interface CreateJobEventInput {
  id: string;
  projectId: string;
  jobId: string;
  kind: JobEventKind;
  stage: JobStage;
  message: string;
  now: string;
  progress?: JobEvent["progress"];
  metadata?: JobEvent["metadata"];
}

export function createJob(input: CreateJobInput): JobRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    kind: input.kind,
    status: "queued",
    attempt: 0,
    maxAttempts: input.maxAttempts ?? 3,
    progress: {
      current: 0,
      total: 1,
      unit: "step"
    },
    userMessage: input.userMessage ?? "Waiting to start.",
    cancelable: input.cancelable ?? true,
    retryable: false,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function createJobEvent(input: CreateJobEventInput): JobEvent {
  return {
    id: input.id,
    projectId: input.projectId,
    jobId: input.jobId,
    kind: input.kind,
    stage: input.stage,
    message: input.message,
    progress: input.progress,
    metadata: input.metadata,
    createdAt: input.now
  };
}

export function updateJobStage(
  job: JobRecord,
  stage: JobStage,
  progress: JobRecord["progress"],
  now: string,
  userMessage: string
): JobRecord {
  return updateJobProgress(job, progress, now, `${stage.replace(/_/g, " ")}: ${userMessage}`);
}

export function startJob(job: JobRecord, now: string, userMessage = "Running."): JobRecord {
  assertStatus(job, ["queued"], "start");
  return {
    ...job,
    status: "running",
    attempt: job.attempt + 1,
    userMessage,
    retryable: false,
    startedAt: now,
    updatedAt: now
  };
}

export function updateJobProgress(
  job: JobRecord,
  progress: JobRecord["progress"],
  now: string,
  userMessage = job.userMessage
): JobRecord {
  assertStatus(job, ["running"], "update progress");
  return {
    ...job,
    progress,
    userMessage,
    updatedAt: now
  };
}

export function succeedJob(job: JobRecord, now: string, userMessage = "Completed."): JobRecord {
  assertStatus(job, ["running"], "succeed");
  return {
    ...job,
    status: "succeeded",
    progress: {
      ...job.progress,
      current: job.progress.total
    },
    userMessage,
    cancelable: false,
    retryable: false,
    finishedAt: now,
    updatedAt: now
  };
}

export function failJob(job: JobRecord, now: string, safeError: string): JobRecord {
  assertStatus(job, ["running"], "fail");
  const retryable = job.attempt < job.maxAttempts;
  return {
    ...job,
    status: "failed",
    safeError,
    userMessage: retryable ? "This job failed and can be retried." : "This job failed.",
    cancelable: false,
    retryable,
    finishedAt: now,
    updatedAt: now
  };
}

export function requestJobCancel(job: JobRecord, now: string): JobRecord {
  if (!job.cancelable) {
    throw new Error(`Cannot cancel ${job.status} job.`);
  }
  assertStatus(job, ["queued", "running"], "cancel");
  return {
    ...job,
    status: job.status === "queued" ? "canceled" : "canceling",
    userMessage: job.status === "queued" ? "Canceled before it started." : "Cancel requested.",
    cancelable: job.status === "running",
    retryable: job.status === "queued",
    finishedAt: job.status === "queued" ? now : job.finishedAt,
    updatedAt: now
  };
}

export function finishJobCancel(job: JobRecord, now: string): JobRecord {
  assertStatus(job, ["canceling"], "finish cancel");
  return {
    ...job,
    status: "canceled",
    userMessage: "Canceled.",
    cancelable: false,
    retryable: true,
    finishedAt: now,
    updatedAt: now
  };
}

export function retryJob(job: JobRecord, now: string): JobRecord {
  assertStatus(job, ["failed", "canceled"], "retry");
  if (!job.retryable) {
    throw new Error("Job is not retryable.");
  }
  if (job.attempt >= job.maxAttempts) {
    throw new Error("Job has no attempts remaining.");
  }
  return {
    ...job,
    status: "queued",
    progress: {
      current: 0,
      total: job.progress.total,
      unit: job.progress.unit
    },
    safeError: undefined,
    userMessage: "Queued for retry.",
    cancelable: true,
    retryable: false,
    startedAt: undefined,
    finishedAt: undefined,
    updatedAt: now
  };
}

function assertStatus(job: JobRecord, allowed: JobRecord["status"][], action: string): void {
  if (!allowed.includes(job.status)) {
    throw new Error(`Cannot ${action} ${job.status} job.`);
  }
}
