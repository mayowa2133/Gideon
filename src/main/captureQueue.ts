import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { CaptureRunQueue } from "./captureRunCoordinator";
import type { EnvironmentValidationQueue } from "./environmentValidationCoordinator";
import type { DiscoveryRunQueue } from "./discoveryRunCoordinator";
import type { CaptureAssemblyQueue } from "./captureAssemblyCoordinator";

export interface CaptureQueueJob {
  workspaceId: string;
  projectId: string;
  captureRunId: string;
  jobId: string;
}

interface QueueLike {
  add(name: string, data: unknown, options: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
}

export class BullMqEnvironmentValidationQueue implements EnvironmentValidationQueue {
  constructor(private readonly queue: QueueLike, private readonly defaultJobOptions: JobsOptions = {}) {}

  async enqueue(input: { workspaceId: string; projectId: string; environmentId: string; jobId: string }): Promise<void> {
    validateIdentifiers(input);
    await this.queue.add("environment_validation", { ...input }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
      ...this.defaultJobOptions,
      jobId: input.jobId
    });
  }

  close(): Promise<void> { return this.queue.close(); }
}

export class BullMqDiscoveryRunQueue implements DiscoveryRunQueue {
  constructor(private readonly queue: QueueLike, private readonly defaultJobOptions: JobsOptions = {}) {}

  async enqueue(input: { workspaceId: string; projectId: string; discoveryRunId: string; jobId: string }): Promise<void> {
    validateIdentifiers(input);
    await this.queue.add("flow_discovery", { ...input }, {
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
      ...this.defaultJobOptions,
      jobId: input.jobId
    });
  }

  close(): Promise<void> { return this.queue.close(); }
}

export class BullMqCaptureAssemblyQueue implements CaptureAssemblyQueue {
  constructor(private readonly queue: QueueLike, private readonly defaultJobOptions: JobsOptions = {}) {}
  async enqueue(input: { workspaceId: string; projectId: string; captureRunId: string; jobId: string }): Promise<void> {
    validateIdentifiers(input);
    await this.queue.add("capture_assembly", { ...input }, { attempts: 2, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 5_000 }, ...this.defaultJobOptions, jobId: input.jobId });
  }
  close(): Promise<void> { return this.queue.close(); }
}

interface WorkerLike {
  on(event: "failed", listener: (job: unknown, error: Error) => void): WorkerLike;
  close(): Promise<void>;
}

export class BullMqCaptureRunQueue implements CaptureRunQueue {
  constructor(private readonly queue: QueueLike, private readonly defaultJobOptions: JobsOptions = {}) {}

  async enqueue(input: CaptureQueueJob): Promise<void> {
    validateJob(input);
    await this.queue.add("flow_capture", { ...input }, {
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
      ...this.defaultJobOptions,
      jobId: input.jobId
    });
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

export function createBullMqCaptureRunQueue(input: {
  connection: ConnectionOptions;
  queueName?: string;
  prefix?: string;
  defaultJobOptions?: JobsOptions;
}): BullMqCaptureRunQueue {
  const queue = new Queue(input.queueName?.trim() || "gideon-capture-runs", {
    connection: input.connection,
    prefix: input.prefix,
    defaultJobOptions: input.defaultJobOptions
  });
  return new BullMqCaptureRunQueue(queue, input.defaultJobOptions);
}

export function createBullMqCaptureRunWorker(input: {
  connection: ConnectionOptions;
  execute(job: CaptureQueueJob): Promise<void>;
  queueName?: string;
  prefix?: string;
  concurrency?: number;
  onError?: (error: Error, job?: CaptureQueueJob) => void;
}): { close(): Promise<void> } {
  const worker = new Worker(
    input.queueName?.trim() || "gideon-capture-runs",
    async (job) => {
      const payload = parseJob(job.data);
      await input.execute(payload);
    },
    { connection: input.connection, prefix: input.prefix, concurrency: Math.max(1, Math.min(10, input.concurrency ?? 1)) }
  ) as unknown as WorkerLike;
  worker.on("failed", (job, error) => input.onError?.(error, maybeJob(job)));
  return { close: () => worker.close() };
}

function parseJob(value: unknown): CaptureQueueJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capture queue payload is invalid.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["workspaceId", "projectId", "captureRunId", "jobId"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) throw new Error("Capture queue payload contains an unknown field.");
  const job = { workspaceId: stringValue(record.workspaceId), projectId: stringValue(record.projectId), captureRunId: stringValue(record.captureRunId), jobId: stringValue(record.jobId) };
  validateJob(job);
  return job;
}

function validateJob(job: CaptureQueueJob): void {
  validateIdentifiers(job);
}

function validateIdentifiers(job: object): void {
  for (const [key, value] of Object.entries(job)) {
    if (!value || value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(`Capture queue ${key} is invalid.`);
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maybeJob(value: unknown): CaptureQueueJob | undefined {
  try {
    if (value && typeof value === "object" && "data" in value) return parseJob((value as { data: unknown }).data);
  } catch {
    return undefined;
  }
  return undefined;
}
