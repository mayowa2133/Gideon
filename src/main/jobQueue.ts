import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { HostedJobQueueService } from "./hostedApi";
import type { JobKind, QueueRuntimeStats } from "../shared/types";

export interface WorkerQueueTask<T> {
  id: string;
  projectId: string;
  kind: JobKind;
  run: () => Promise<T>;
}

export interface DetachedWorkerQueueOptions {
  onError?: (error: unknown, task: Pick<WorkerQueueTask<unknown>, "id" | "projectId" | "kind">) => void;
  onComplete?: (task: Pick<WorkerQueueTask<unknown>, "id" | "projectId" | "kind">) => void;
}

export interface WorkerQueueOptions {
  concurrency?: number;
  concurrencyByKind?: Partial<Record<JobKind, number>>;
}

export interface HostedJobQueueConfig {
  provider: "none" | "http" | "memory" | "bullmq";
  httpEndpointUrl: string | null;
  signingSecret: string | null;
  redisUrl: string | null;
  bullMqQueueName: string;
  bullMqPrefix: string | null;
  bullMqConcurrency: number;
  bullMqDefaultJobOptions: JobsOptions;
}

export interface HostedWorkerQueueJob {
  kind: Extract<JobKind, "analysis" | "render">;
  projectId: string;
  jobId: string;
}

export interface HostedWorkerQueueRequest {
  headers: Record<string, string | string[] | undefined>;
  body: string | Buffer;
  nowMs?: number;
  toleranceSeconds?: number;
}

export interface HostedWorkerJobDispatcher {
  dispatchAnalysisJob(input: { projectId: string; jobId: string }): Promise<void> | void;
  dispatchRenderJob(input: { projectId: string; jobId: string }): Promise<void> | void;
}

export interface HostedWorkerJobLeaseCoordinator {
  claimJobLease(input: HostedWorkerJobLeaseInput): Promise<void> | void;
  heartbeatJobLease(input: HostedWorkerJobLeaseInput): Promise<void> | void;
  failJobLease?(input: HostedWorkerJobLeaseFailureInput): Promise<void> | void;
  recoverExpiredJobLeases?(input: { now: string }): Promise<void> | void;
}

export interface HostedWorkerJobLeaseInput {
  job: HostedWorkerQueueJob;
  workerId: string;
  leaseSeconds: number;
  now: string;
}

export interface HostedWorkerJobLeaseFailureInput extends HostedWorkerJobLeaseInput {
  safeError: string;
}

export interface HostedWorkerJobExecutor {
  runAnalysisJob(input: { projectId: string; jobId: string }): Promise<void> | void;
  runRenderJob(input: { projectId: string; jobId: string }): Promise<void> | void;
}

export interface HostedWorkerJobBroker {
  enqueue(job: HostedWorkerQueueJob): Promise<void> | void;
  subscribe(processor: HostedWorkerJobProcessor): () => void;
  cancel?(jobId: string): boolean | Promise<boolean>;
  stats(): QueueRuntimeStats;
}

export type HostedWorkerJobProcessor = (job: HostedWorkerQueueJob) => Promise<void> | void;

export interface HostedWorkerRuntimeOptions {
  workerId: string;
  leaseSeconds: number;
  queue?: LocalWorkerQueue;
  queueOptions?: WorkerQueueOptions;
  heartbeatIntervalMs?: number;
  nowMs?: () => number;
  leaseCoordinator: HostedWorkerJobLeaseCoordinator;
  executor: HostedWorkerJobExecutor;
  onError?: (error: unknown, job: HostedWorkerQueueJob) => void;
}

export interface StoreBackedWorkerLeaseStore {
  claimWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    leaseSeconds: number;
    now?: string;
    userMessage?: string;
  }): Promise<unknown> | unknown;
  heartbeatWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    leaseSeconds: number;
    now?: string;
  }): Promise<unknown> | unknown;
  failWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    safeError: string;
    now?: string;
  }): Promise<unknown> | unknown;
  recoverExpiredWorkerJobLeases(now?: string): Promise<unknown> | unknown;
}

export interface HostedWorkerIntakeResult {
  accepted: true;
  job: HostedWorkerQueueJob;
}

export interface HostedWorkerIntakeService {
  accept(request: HostedWorkerQueueRequest): Promise<HostedWorkerIntakeResult>;
}

export interface HostedWorkerIntakeHttpRequest {
  method: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Buffer;
  nowMs?: number;
}

export interface HostedWorkerIntakeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

type QueueFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

interface PendingTask<T> extends WorkerQueueTask<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface ActiveTask {
  id: string;
  projectId: string;
  kind: JobKind;
  startedAt: string;
}

interface BullMqJobLike {
  id?: string;
  name?: string;
  data?: unknown;
  getState?(): Promise<string> | string;
  remove?(): Promise<void> | void;
}

interface BullMqQueueLike {
  add(name: string, data: HostedWorkerQueueJob, options: JobsOptions): Promise<BullMqJobLike>;
  getJob(jobId: string): Promise<BullMqJobLike | null>;
  getJobs(types: string[], start?: number, end?: number): Promise<BullMqJobLike[]>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  close?(): Promise<void> | void;
}

interface BullMqWorkerLike {
  on(event: "completed" | "failed" | "error", listener: (...args: unknown[]) => void): BullMqWorkerLike;
  close?(): Promise<void> | void;
}

interface BullMqModuleLike {
  Queue: new (name: string, options: Record<string, unknown>) => BullMqQueueLike;
  Worker: new (
    name: string,
    processor: (job: BullMqJobLike) => Promise<void>,
    options: Record<string, unknown>
  ) => BullMqWorkerLike;
}

export interface BullMqHostedWorkerJobBrokerOptions {
  connection: ConnectionOptions;
  queueName?: string;
  prefix?: string;
  concurrency?: number;
  defaultJobOptions?: JobsOptions;
  bullmq?: BullMqModuleLike;
  onError?: (error: unknown, job: HostedWorkerQueueJob) => void;
}

export class WorkerQueueCanceledError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was canceled before it started.`);
    this.name = "WorkerQueueCanceledError";
  }
}

export function isWorkerQueueCanceledError(error: unknown): error is WorkerQueueCanceledError {
  return error instanceof WorkerQueueCanceledError;
}

export class LocalWorkerQueue {
  private readonly concurrency: number;
  private readonly concurrencyByKind: Partial<Record<JobKind, number>>;
  private readonly pending: Array<PendingTask<unknown>> = [];
  private readonly activeTasks = new Map<string, ActiveTask>();

  constructor(options: WorkerQueueOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.concurrencyByKind = normalizeConcurrencyByKind(options.concurrencyByKind);
  }

  enqueue<T>(task: WorkerQueueTask<T>): Promise<T> {
    try {
      this.assertNotQueuedOrRunning(task.id);
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        ...task,
        resolve: resolve as (value: unknown) => void,
        reject
      });
      this.drain();
    });
  }

  enqueueDetached<T>(task: WorkerQueueTask<T>, options: DetachedWorkerQueueOptions = {}): void {
    this.assertNotQueuedOrRunning(task.id);
    this.pending.push({
      ...task,
      resolve: () => {
        options.onComplete?.(task);
      },
      reject: (error) => {
        options.onError?.(error, task);
      }
    });
    this.drain();
  }

  cancel(jobId: string): boolean {
    const index = this.pending.findIndex((candidate) => candidate.id === jobId);
    if (index === -1) {
      return false;
    }
    const [task] = this.pending.splice(index, 1);
    task?.reject(new WorkerQueueCanceledError(jobId));
    return true;
  }

  stats(): QueueRuntimeStats {
    return {
      active: this.activeTasks.size,
      pending: this.pending.length,
      concurrency: this.concurrency,
      activeByKind: countKinds([...this.activeTasks.values()]),
      pendingByKind: countKinds(this.pending),
      concurrencyByKind: { ...this.concurrencyByKind }
    };
  }

  private drain(): void {
    while (this.activeTasks.size < this.concurrency && this.pending.length > 0) {
      const taskIndex = this.pending.findIndex((candidate) => this.canRun(candidate));
      if (taskIndex === -1) {
        return;
      }
      const [task] = this.pending.splice(taskIndex, 1);
      if (!task) {
        return;
      }
      this.activeTasks.set(task.id, {
        id: task.id,
        projectId: task.projectId,
        kind: task.kind,
        startedAt: new Date().toISOString()
      });
      void this.runTask(task);
    }
  }

  private canRun(task: WorkerQueueTask<unknown>): boolean {
    const kindLimit = this.concurrencyByKind[task.kind] ?? this.concurrency;
    return (countKinds([...this.activeTasks.values()])[task.kind] ?? 0) < kindLimit;
  }

  private assertNotQueuedOrRunning(jobId: string): void {
    if (this.activeTasks.has(jobId) || this.pending.some((candidate) => candidate.id === jobId)) {
      throw new Error(`Job ${jobId} is already queued or running.`);
    }
  }

  private async runTask<T>(task: PendingTask<T>): Promise<void> {
    try {
      task.resolve(await task.run());
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeTasks.delete(task.id);
      this.drain();
    }
  }
}

export function loadLocalWorkerQueueOptions(env: NodeJS.ProcessEnv = process.env): WorkerQueueOptions {
  const concurrency = parsePositiveInteger(env.GIDEON_QUEUE_CONCURRENCY) ?? 1;
  return {
    concurrency,
    concurrencyByKind: normalizeConcurrencyByKind({
      analysis: parsePositiveInteger(env.GIDEON_ANALYSIS_QUEUE_CONCURRENCY),
      render: parsePositiveInteger(env.GIDEON_RENDER_QUEUE_CONCURRENCY),
      transcription: parsePositiveInteger(env.GIDEON_TRANSCRIPTION_QUEUE_CONCURRENCY),
      ocr: parsePositiveInteger(env.GIDEON_OCR_QUEUE_CONCURRENCY),
      tts: parsePositiveInteger(env.GIDEON_TTS_QUEUE_CONCURRENCY),
      semantic_analysis: parsePositiveInteger(env.GIDEON_SEMANTIC_ANALYSIS_QUEUE_CONCURRENCY),
      export: parsePositiveInteger(env.GIDEON_EXPORT_QUEUE_CONCURRENCY)
    })
  };
}

export function loadHostedJobQueueConfig(env: NodeJS.ProcessEnv = process.env): HostedJobQueueConfig {
  const endpoint = normalizeHttpUrl(env.GIDEON_HOSTED_QUEUE_URL ?? env.GIDEON_WORKER_QUEUE_URL);
  const signingSecret = nonEmpty(env.GIDEON_HOSTED_QUEUE_SECRET ?? env.GIDEON_WORKER_QUEUE_SECRET);
  const requestedProvider = nonEmpty(env.GIDEON_HOSTED_QUEUE_PROVIDER ?? env.GIDEON_WORKER_QUEUE_PROVIDER)?.toLowerCase();
  const redisUrl = normalizeRedisUrl(env.GIDEON_REDIS_URL ?? env.REDIS_URL);
  const bullMqQueueName = nonEmpty(env.GIDEON_BULLMQ_QUEUE_NAME ?? env.GIDEON_WORKER_QUEUE_NAME) ?? "gideon-hosted-worker-jobs";
  const bullMqPrefix = nonEmpty(env.GIDEON_BULLMQ_PREFIX);
  const bullMqConcurrency = parsePositiveInteger(env.GIDEON_BULLMQ_CONCURRENCY) ?? parsePositiveInteger(env.GIDEON_QUEUE_CONCURRENCY) ?? 1;
  const bullMqAttempts = parsePositiveInteger(env.GIDEON_BULLMQ_ATTEMPTS) ?? 1;
  const bullMqBackoffDelay = parsePositiveInteger(env.GIDEON_BULLMQ_BACKOFF_DELAY_MS);
  const bullMqBackoffType = nonEmpty(env.GIDEON_BULLMQ_BACKOFF_TYPE);
  const bullMqDefaultJobOptions: JobsOptions = {
    attempts: bullMqAttempts,
    removeOnComplete: { count: parsePositiveInteger(env.GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT) ?? 1_000 },
    removeOnFail: { count: parsePositiveInteger(env.GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT) ?? 5_000 },
    ...(bullMqAttempts > 1 && bullMqBackoffDelay
      ? {
          backoff: {
            type: bullMqBackoffType === "fixed" ? "fixed" : "exponential",
            delay: bullMqBackoffDelay
          }
        }
      : {})
  };
  const provider =
    requestedProvider === "memory" || requestedProvider === "in_memory"
      ? "memory"
      : requestedProvider === "bullmq" || requestedProvider === "redis"
        ? redisUrl
          ? "bullmq"
          : "none"
        : endpoint && signingSecret
          ? "http"
          : "none";
  return {
    provider,
    httpEndpointUrl: endpoint,
    signingSecret,
    redisUrl,
    bullMqQueueName,
    bullMqPrefix,
    bullMqConcurrency,
    bullMqDefaultJobOptions
  };
}

export function createHttpHostedJobQueueService(
  config: Pick<HostedJobQueueConfig, "provider" | "httpEndpointUrl" | "signingSecret">,
  fetcher: QueueFetch = fetch,
  nowMs: () => number = Date.now
): HostedJobQueueService {
  if (config.provider !== "http" || !config.httpEndpointUrl) {
    throw new Error("Hosted HTTP worker queue endpoint is not configured.");
  }
  if (!config.signingSecret) {
    throw new Error("Hosted HTTP worker queue signing secret is not configured.");
  }
  const endpointUrl = config.httpEndpointUrl;
  const signingSecret = config.signingSecret;
  return {
    enqueueAnalysisJob(input) {
      return enqueueHostedJob({
        endpointUrl,
        signingSecret,
        fetcher,
        nowMs,
        kind: "analysis",
        projectId: input.projectId,
        jobId: input.jobId
      });
    },
    enqueueRenderJob(input) {
      return enqueueHostedJob({
        endpointUrl,
        signingSecret,
        fetcher,
        nowMs,
        kind: "render",
        projectId: input.projectId,
        jobId: input.jobId
      });
    }
  };
}

export function createBrokeredHostedJobQueueService(broker: HostedWorkerJobBroker): HostedJobQueueService {
  return {
    enqueueAnalysisJob(input) {
      return broker.enqueue({ kind: "analysis", projectId: input.projectId, jobId: input.jobId });
    },
    enqueueRenderJob(input) {
      return broker.enqueue({ kind: "render", projectId: input.projectId, jobId: input.jobId });
    }
  };
}

export class InMemoryHostedWorkerJobBroker implements HostedWorkerJobBroker {
  private readonly queue: LocalWorkerQueue;
  private readonly pendingJobs: HostedWorkerQueueJob[] = [];
  private readonly inFlightJobIds = new Set<string>();
  private processor: HostedWorkerJobProcessor | null = null;
  private readonly onError?: (error: unknown, job: HostedWorkerQueueJob) => void;

  constructor(options: WorkerQueueOptions & { onError?: (error: unknown, job: HostedWorkerQueueJob) => void } = {}) {
    this.queue = new LocalWorkerQueue(options);
    this.onError = options.onError;
  }

  enqueue(job: HostedWorkerQueueJob): void {
    if (this.inFlightJobIds.has(job.jobId) || this.pendingJobs.some((candidate) => candidate.jobId === job.jobId)) {
      throw new Error(`Hosted worker job ${job.jobId} is already queued or running.`);
    }
    this.pendingJobs.push(job);
    this.drain();
  }

  subscribe(processor: HostedWorkerJobProcessor): () => void {
    if (this.processor) {
      throw new Error("Hosted worker broker already has a processor.");
    }
    this.processor = processor;
    this.drain();
    return () => {
      if (this.processor === processor) {
        this.processor = null;
      }
    };
  }

  cancel(jobId: string): boolean {
    const pendingIndex = this.pendingJobs.findIndex((candidate) => candidate.jobId === jobId);
    if (pendingIndex !== -1) {
      this.pendingJobs.splice(pendingIndex, 1);
      return true;
    }
    return this.queue.cancel(jobId);
  }

  stats(): QueueRuntimeStats {
    const queueStats = this.queue.stats();
    return {
      ...queueStats,
      pending: queueStats.pending + this.pendingJobs.length,
      pendingByKind: addKindCounts(queueStats.pendingByKind, countKinds(this.pendingJobs)),
      concurrencyByKind: queueStats.concurrencyByKind
    };
  }

  private drain(): void {
    if (!this.processor) {
      return;
    }
    const processor = this.processor;
    while (this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift();
      if (!job) {
        return;
      }
      this.inFlightJobIds.add(job.jobId);
      this.queue.enqueueDetached(
        {
          id: job.jobId,
          projectId: job.projectId,
          kind: job.kind,
          run: async () => {
            await processor(job);
          }
        },
        {
          onComplete: () => {
            this.inFlightJobIds.delete(job.jobId);
            this.drain();
          },
          onError: (error) => {
            this.inFlightJobIds.delete(job.jobId);
            this.onError?.(error, job);
            this.drain();
          }
        }
      );
    }
  }
}

export class BullMqHostedWorkerJobBroker implements HostedWorkerJobBroker {
  private readonly queue: BullMqQueueLike;
  private readonly workerOptions: Record<string, unknown>;
  private readonly defaultJobOptions: JobsOptions;
  private readonly onError?: (error: unknown, job: HostedWorkerQueueJob) => void;
  private readonly bullmq: BullMqModuleLike;
  private readonly pendingJobs = new Map<string, HostedWorkerQueueJob>();
  private readonly activeJobs = new Map<string, HostedWorkerQueueJob>();
  private readonly queueName: string;
  private processor: HostedWorkerJobProcessor | null = null;
  private worker: BullMqWorkerLike | null = null;
  private cachedStats: QueueRuntimeStats;

  constructor(options: BullMqHostedWorkerJobBrokerOptions) {
    this.queueName = options.queueName?.trim() || "gideon-hosted-worker-jobs";
    this.bullmq = options.bullmq ?? {
      Queue: Queue as unknown as BullMqModuleLike["Queue"],
      Worker: Worker as unknown as BullMqModuleLike["Worker"]
    };
    const concurrency = Math.max(1, options.concurrency ?? 1);
    const sharedOptions = compactObject({
      connection: options.connection,
      prefix: options.prefix
    });
    this.queue = new this.bullmq.Queue(this.queueName, {
      ...sharedOptions,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
        ...options.defaultJobOptions
      }
    });
    this.workerOptions = {
      ...sharedOptions,
      concurrency
    };
    this.defaultJobOptions = {
      attempts: 1,
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
      ...options.defaultJobOptions
    };
    this.onError = options.onError;
    this.cachedStats = emptyQueueStats(concurrency);
  }

  async enqueue(job: HostedWorkerQueueJob): Promise<void> {
    const existing = await this.queue.getJob(job.jobId);
    if (existing) {
      const state = await bullMqJobState(existing);
      if (isActiveBullMqState(state)) {
        throw new Error(`Hosted worker job ${job.jobId} is already queued or running.`);
      }
      await existing.remove?.();
    }
    await this.queue.add(job.kind, job, {
      ...this.defaultJobOptions,
      jobId: job.jobId
    });
    this.pendingJobs.set(job.jobId, job);
    this.updateCachedLocalStats();
  }

  subscribe(processor: HostedWorkerJobProcessor): () => void {
    if (this.processor || this.worker) {
      throw new Error("Hosted worker broker already has a processor.");
    }
    this.processor = processor;
    this.worker = new this.bullmq.Worker(
      this.queueName,
      async (bullJob) => {
        const job = hostedWorkerQueueJobFromBullMqJob(bullJob);
        this.pendingJobs.delete(job.jobId);
        this.activeJobs.set(job.jobId, job);
        this.updateCachedLocalStats();
        try {
          await processor(job);
        } finally {
          this.activeJobs.delete(job.jobId);
          this.updateCachedLocalStats();
        }
      },
      this.workerOptions
    );
    this.worker
      .on("completed", (bullJob) => {
        const job = maybeHostedWorkerQueueJobFromBullMqJob(bullJob);
        if (job) {
          this.pendingJobs.delete(job.jobId);
          this.activeJobs.delete(job.jobId);
          this.updateCachedLocalStats();
        }
      })
      .on("failed", (bullJob, error) => {
        const job = maybeHostedWorkerQueueJobFromBullMqJob(bullJob);
        if (job) {
          this.pendingJobs.delete(job.jobId);
          this.activeJobs.delete(job.jobId);
          this.onError?.(error, job);
          this.updateCachedLocalStats();
        }
      })
      .on("error", (error) => {
        this.onError?.(error, {
          kind: "analysis",
          projectId: "unknown",
          jobId: "unknown"
        });
      });
    return () => {
      this.processor = null;
      const worker = this.worker;
      this.worker = null;
      void Promise.resolve(worker?.close?.());
    };
  }

  async cancel(jobId: string): Promise<boolean> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) {
      this.pendingJobs.delete(jobId);
      this.updateCachedLocalStats();
      return false;
    }
    const state = await bullMqJobState(existing);
    if (!state || state === "active") {
      return false;
    }
    await existing.remove?.();
    this.pendingJobs.delete(jobId);
    this.updateCachedLocalStats();
    return true;
  }

  stats(): QueueRuntimeStats {
    return this.cachedStats;
  }

  async refreshStats(limit = 1_000): Promise<QueueRuntimeStats> {
    const counts = await this.queue.getJobCounts("active", "waiting", "delayed", "prioritized", "paused", "waiting-children");
    const jobs = await this.queue.getJobs(["active", "waiting", "delayed", "prioritized", "paused", "waiting-children"], 0, Math.max(0, limit - 1));
    const activeJobs: HostedWorkerQueueJob[] = [];
    const pendingJobs: HostedWorkerQueueJob[] = [];
    for (const bullJob of jobs) {
      const job = maybeHostedWorkerQueueJobFromBullMqJob(bullJob);
      if (!job) {
        continue;
      }
      const state = await bullMqJobState(bullJob);
      if (state === "active") {
        activeJobs.push(job);
      } else {
        pendingJobs.push(job);
      }
    }
    this.cachedStats = {
      active: counts.active ?? activeJobs.length,
      pending:
        (counts.waiting ?? 0) +
        (counts.delayed ?? 0) +
        (counts.prioritized ?? 0) +
        (counts.paused ?? 0) +
        (counts["waiting-children"] ?? 0),
      concurrency: Number(this.workerOptions.concurrency ?? 1),
      activeByKind: countKinds(activeJobs),
      pendingByKind: countKinds(pendingJobs),
      concurrencyByKind: {}
    };
    return this.cachedStats;
  }

  async close(): Promise<void> {
    await Promise.resolve(this.worker?.close?.());
    await Promise.resolve(this.queue.close?.());
  }

  private updateCachedLocalStats(): void {
    const active = [...this.activeJobs.values()];
    const pending = [...this.pendingJobs.values()];
    this.cachedStats = {
      active: active.length,
      pending: pending.length,
      concurrency: Number(this.workerOptions.concurrency ?? 1),
      activeByKind: countKinds(active),
      pendingByKind: countKinds(pending),
      concurrencyByKind: {}
    };
  }
}

export class HostedWorkerRuntime implements HostedWorkerJobDispatcher, HostedWorkerJobLeaseCoordinator {
  private readonly workerId: string;
  private readonly leaseSeconds: number;
  private readonly heartbeatIntervalMs: number;
  private readonly nowMs: () => number;
  private readonly queue: LocalWorkerQueue;
  private readonly leaseCoordinator: HostedWorkerJobLeaseCoordinator;
  private readonly executor: HostedWorkerJobExecutor;
  private readonly onError?: (error: unknown, job: HostedWorkerQueueJob) => void;

  constructor(options: HostedWorkerRuntimeOptions) {
    this.workerId = options.workerId.trim();
    if (!this.workerId) {
      throw new Error("Hosted worker runtime requires a workerId.");
    }
    if (!Number.isInteger(options.leaseSeconds) || options.leaseSeconds < 1) {
      throw new Error("Hosted worker runtime leaseSeconds must be a positive integer.");
    }
    this.leaseSeconds = options.leaseSeconds;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(1_000, Math.floor(options.leaseSeconds * 500));
    this.nowMs = options.nowMs ?? Date.now;
    this.queue = options.queue ?? new LocalWorkerQueue(options.queueOptions);
    this.leaseCoordinator = options.leaseCoordinator;
    this.executor = options.executor;
    this.onError = options.onError;
  }

  stats(): QueueRuntimeStats {
    return this.queue.stats();
  }

  dispatchAnalysisJob(input: { projectId: string; jobId: string }): void {
    this.enqueueRuntimeJob({ kind: "analysis", projectId: input.projectId, jobId: input.jobId });
  }

  dispatchRenderJob(input: { projectId: string; jobId: string }): void {
    this.enqueueRuntimeJob({ kind: "render", projectId: input.projectId, jobId: input.jobId });
  }

  async runBrokeredJob(job: HostedWorkerQueueJob): Promise<void> {
    const now = currentIsoTimestamp(this.nowMs());
    await this.recoverExpiredJobLeases({ now });
    await this.claimJobLease({
      job,
      workerId: this.workerId,
      leaseSeconds: this.leaseSeconds,
      now
    });
    await this.runLeasedJob(job);
  }

  claimJobLease(input: HostedWorkerJobLeaseInput): Promise<void> | void {
    return this.leaseCoordinator.claimJobLease(input);
  }

  heartbeatJobLease(input: HostedWorkerJobLeaseInput): Promise<void> | void {
    return this.leaseCoordinator.heartbeatJobLease(input);
  }

  failJobLease(input: HostedWorkerJobLeaseFailureInput): Promise<void> | void {
    return this.leaseCoordinator.failJobLease?.(input);
  }

  recoverExpiredJobLeases(input: { now: string }): Promise<void> | void {
    return this.leaseCoordinator.recoverExpiredJobLeases?.(input);
  }

  private enqueueRuntimeJob(job: HostedWorkerQueueJob): void {
    this.queue.enqueueDetached(
      {
        id: job.jobId,
        projectId: job.projectId,
        kind: job.kind,
        run: () => this.runLeasedJob(job)
      },
      {
        onError: (error) => {
          this.onError?.(error, job);
        }
      }
    );
  }

  private async runLeasedJob(job: HostedWorkerQueueJob): Promise<void> {
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    if (this.heartbeatIntervalMs > 0) {
      heartbeatTimer = setInterval(() => {
        void Promise.resolve(this.heartbeatRuntimeJob(job)).catch((error: unknown) => {
          this.onError?.(error, job);
        });
      }, this.heartbeatIntervalMs);
    }
    try {
      await this.heartbeatRuntimeJob(job);
      if (job.kind === "analysis") {
        await this.executor.runAnalysisJob({ projectId: job.projectId, jobId: job.jobId });
      } else {
        await this.executor.runRenderJob({ projectId: job.projectId, jobId: job.jobId });
      }
      await this.heartbeatRuntimeJob(job);
    } catch (error) {
      try {
        await this.leaseCoordinator.failJobLease?.({
          job,
          workerId: this.workerId,
          leaseSeconds: this.leaseSeconds,
          now: currentIsoTimestamp(this.nowMs()),
          safeError: sanitizeQueueError(error instanceof Error ? error.message : "Worker execution failed.")
        });
      } catch {
        // Expired-lease recovery can reconcile failed failure recording later.
      }
      throw error;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  private heartbeatRuntimeJob(job: HostedWorkerQueueJob): Promise<void> | void {
    return this.leaseCoordinator.heartbeatJobLease({
      job,
      workerId: this.workerId,
      leaseSeconds: this.leaseSeconds,
      now: currentIsoTimestamp(this.nowMs())
    });
  }
}

export function connectHostedWorkerRuntimeToBroker(
  broker: HostedWorkerJobBroker,
  runtime: Pick<HostedWorkerRuntime, "runBrokeredJob">
): () => void {
  return broker.subscribe((job) => runtime.runBrokeredJob(job));
}

export function createStoreBackedWorkerLeaseCoordinator(store: StoreBackedWorkerLeaseStore): HostedWorkerJobLeaseCoordinator {
  return {
    async claimJobLease(input) {
      await store.claimWorkerJobLease({
        projectId: input.job.projectId,
        jobId: input.job.jobId,
        workerId: input.workerId,
        leaseSeconds: input.leaseSeconds,
        now: input.now,
        userMessage: `Worker ${input.workerId} claimed ${input.job.kind} job.`
      });
    },
    async heartbeatJobLease(input) {
      await store.heartbeatWorkerJobLease({
        projectId: input.job.projectId,
        jobId: input.job.jobId,
        workerId: input.workerId,
        leaseSeconds: input.leaseSeconds,
        now: input.now
      });
    },
    async failJobLease(input) {
      await store.failWorkerJobLease({
        projectId: input.job.projectId,
        jobId: input.job.jobId,
        workerId: input.workerId,
        safeError: input.safeError,
        now: input.now
      });
    },
    async recoverExpiredJobLeases(input) {
      await store.recoverExpiredWorkerJobLeases(input.now);
    }
  };
}

export function verifyHostedWorkerQueueRequest(input: HostedWorkerQueueRequest & { signingSecret: string }): HostedWorkerQueueJob {
  const body = Buffer.isBuffer(input.body) ? input.body.toString("utf8") : input.body;
  const timestamp = requiredHeader(input.headers, "x-gideon-queue-timestamp");
  const signature = requiredHeader(input.headers, "x-gideon-queue-signature");
  assertFreshQueueTimestamp(timestamp, input.nowMs, input.toleranceSeconds);
  assertValidQueueSignature({
    timestamp,
    body,
    providedSignature: signature,
    signingSecret: input.signingSecret
  });
  return hostedWorkerQueueJobFromBody(body);
}

export function createHostedWorkerIntakeService(input: {
  signingSecret: string;
  dispatcher: HostedWorkerJobDispatcher;
  leaseCoordinator?: HostedWorkerJobLeaseCoordinator;
  workerId?: string;
  leaseSeconds?: number;
  nowMs?: () => number;
  toleranceSeconds?: number;
}): HostedWorkerIntakeService {
  return {
    async accept(request: HostedWorkerQueueRequest): Promise<HostedWorkerIntakeResult> {
      const requestNowMs = request.nowMs ?? input.nowMs?.();
      const job = verifyHostedWorkerQueueRequest({
        ...request,
        signingSecret: input.signingSecret,
        nowMs: requestNowMs,
        toleranceSeconds: request.toleranceSeconds ?? input.toleranceSeconds
      });
      const lease = createHostedWorkerLeaseInput({
        job,
        requestNowMs,
        workerId: input.workerId,
        leaseSeconds: input.leaseSeconds
      });
      if (input.leaseCoordinator) {
        await input.leaseCoordinator.recoverExpiredJobLeases?.({ now: lease.now });
        await input.leaseCoordinator.claimJobLease(lease);
      }
      try {
        if (job.kind === "analysis") {
          await input.dispatcher.dispatchAnalysisJob({ projectId: job.projectId, jobId: job.jobId });
        } else {
          await input.dispatcher.dispatchRenderJob({ projectId: job.projectId, jobId: job.jobId });
        }
      } catch (error) {
        try {
          await input.leaseCoordinator?.failJobLease?.({
            ...lease,
            now: currentIsoTimestamp(requestNowMs),
            safeError: sanitizeQueueError(error instanceof Error ? error.message : "Worker dispatch failed.")
          });
        } catch {
          // Preserve the original dispatch failure for the caller; failed lease recording is recoverable via expiry.
        }
        throw error;
      }
      if (input.leaseCoordinator) {
        await input.leaseCoordinator.heartbeatJobLease({
          ...lease,
          now: currentIsoTimestamp(requestNowMs)
        });
      }
      return { accepted: true, job };
    }
  };
}

export async function handleHostedWorkerIntakeRequest(
  request: HostedWorkerIntakeHttpRequest,
  service: HostedWorkerIntakeService
): Promise<HostedWorkerIntakeHttpResponse> {
  if (request.method.toUpperCase() !== "POST") {
    return workerJsonResponse(405, { error: { code: "method_not_allowed", message: "POST is required." } });
  }
  try {
    const accepted = await service.accept({
      headers: request.headers ?? {},
      body: request.body ?? "",
      nowMs: request.nowMs
    });
    return workerJsonResponse(202, { accepted: true, job: accepted.job });
  } catch (error) {
    return workerIntakeErrorResponse(error);
  }
}

export function createHostedWorkerIntakeNodeHandler(service: HostedWorkerIntakeService) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const result = await handleHostedWorkerIntakeRequest(
      {
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: request.headers,
        body: await readRawBody(request)
      },
      service
    );
    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.statusCode = result.status;
    response.end(JSON.stringify(result.body));
  };
}

async function enqueueHostedJob(input: {
  endpointUrl: string;
  signingSecret: string;
  fetcher: QueueFetch;
  nowMs: () => number;
  kind: Extract<JobKind, "analysis" | "render">;
  projectId: string;
  jobId: string;
}): Promise<void> {
  const body = JSON.stringify({
    kind: input.kind,
    projectId: input.projectId,
    jobId: input.jobId
  });
  const timestamp = Math.floor(input.nowMs() / 1000).toString();
  const signature = createHmac("sha256", input.signingSecret).update(`${timestamp}.${body}`).digest("hex");
  const response = await input.fetcher(input.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gideon-Queue-Timestamp": timestamp,
      "X-Gideon-Queue-Signature": `sha256=${signature}`
    },
    body
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hosted worker queue enqueue failed with ${response.status}: ${sanitizeQueueError(text)}`);
  }
}

function hostedWorkerQueueJobFromBody(body: string): HostedWorkerQueueJob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Hosted worker queue body must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Hosted worker queue body must be a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const kind = stringValue(record.kind);
  if (kind !== "analysis" && kind !== "render") {
    throw new Error("Hosted worker queue job kind is invalid.");
  }
  const projectId = stringValue(record.projectId);
  const jobId = stringValue(record.jobId);
  if (!projectId || !jobId) {
    throw new Error("Hosted worker queue job requires projectId and jobId.");
  }
  return { kind, projectId, jobId };
}

function assertFreshQueueTimestamp(timestamp: string, nowMs = Date.now(), toleranceSeconds = 300): void {
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds) || timestampSeconds < 0) {
    throw new Error("Hosted worker queue timestamp is invalid.");
  }
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > toleranceSeconds) {
    throw new Error("Hosted worker queue timestamp is outside the allowed tolerance.");
  }
}

function assertValidQueueSignature(input: {
  timestamp: string;
  body: string;
  providedSignature: string;
  signingSecret: string;
}): void {
  const signature = input.providedSignature.startsWith("sha256=")
    ? input.providedSignature.slice("sha256=".length)
    : input.providedSignature;
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    throw new Error("Hosted worker queue signature is invalid.");
  }
  const expected = createHmac("sha256", input.signingSecret).update(`${input.timestamp}.${input.body}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Hosted worker queue signature verification failed.");
  }
}

function requiredHeader(headers: HostedWorkerQueueRequest["headers"], name: string): string {
  const expected = name.toLowerCase();
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() !== expected) {
      continue;
    }
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized?.trim()) {
      return normalized.trim();
    }
  }
  throw new Error(`Hosted worker queue ${name} header is required.`);
}

function workerIntakeErrorResponse(error: unknown): HostedWorkerIntakeHttpResponse {
  const message = error instanceof Error ? error.message : "Worker queue intake failed.";
  if (/signature|timestamp|header/i.test(message)) {
    return workerJsonResponse(401, { error: { code: "invalid_queue_signature", message } });
  }
  if (/json|body|kind|requires/i.test(message)) {
    return workerJsonResponse(400, { error: { code: "invalid_queue_job", message } });
  }
  return workerJsonResponse(503, {
    error: {
      code: "worker_dispatch_failed",
      message: sanitizeQueueError(message)
    }
  });
}

function workerJsonResponse(status: number, body: unknown): HostedWorkerIntakeHttpResponse {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body
  };
}

function createHostedWorkerLeaseInput(input: {
  job: HostedWorkerQueueJob;
  requestNowMs?: number;
  workerId?: string;
  leaseSeconds?: number;
}): HostedWorkerJobLeaseInput {
  return {
    job: input.job,
    workerId: input.workerId?.trim() || `hosted-worker-${process.pid}`,
    leaseSeconds: input.leaseSeconds ?? 300,
    now: currentIsoTimestamp(input.requestNowMs)
  };
}

function currentIsoTimestamp(nowMs?: number): string {
  return new Date(nowMs ?? Date.now()).toISOString();
}

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normalizeConcurrencyByKind(input: WorkerQueueOptions["concurrencyByKind"]): Partial<Record<JobKind, number>> {
  const normalized: Partial<Record<JobKind, number>> = {};
  for (const [kind, value] of Object.entries(input ?? {}) as Array<[JobKind, number | undefined]>) {
    if (value && Number.isInteger(value) && value > 0) {
      normalized[kind] = value;
    }
  }
  return normalized;
}

function countKinds(tasks: Array<Pick<WorkerQueueTask<unknown>, "kind">>): Partial<Record<JobKind, number>> {
  return tasks.reduce<Partial<Record<JobKind, number>>>((counts, task) => {
    counts[task.kind] = (counts[task.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function addKindCounts(
  left: Partial<Record<JobKind, number>>,
  right: Partial<Record<JobKind, number>>
): Partial<Record<JobKind, number>> {
  const combined: Partial<Record<JobKind, number>> = { ...left };
  for (const [kind, count] of Object.entries(right) as Array<[JobKind, number | undefined]>) {
    if (count) {
      combined[kind] = (combined[kind] ?? 0) + count;
    }
  }
  return combined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

export function redisConnectionFromUrl(value: string): ConnectionOptions {
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("Redis URL must use redis:// or rediss://.");
  }
  const database = url.pathname.replace("/", "");
  return compactObject({
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    username: decodeURIComponent(url.username || "") || undefined,
    password: decodeURIComponent(url.password || "") || undefined,
    db: database ? Number(database) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined
  }) as ConnectionOptions;
}

function normalizeHttpUrl(value: string | undefined): string | null {
  const trimmed = nonEmpty(value);
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRedisUrl(value: string | undefined): string | null {
  const trimmed = nonEmpty(value);
  if (!trimmed) {
    return null;
  }
  try {
    redisConnectionFromUrl(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emptyQueueStats(concurrency: number): QueueRuntimeStats {
  return {
    active: 0,
    pending: 0,
    concurrency,
    activeByKind: {},
    pendingByKind: {},
    concurrencyByKind: {}
  };
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

async function bullMqJobState(job: BullMqJobLike): Promise<string | undefined> {
  return typeof job.getState === "function" ? await job.getState() : undefined;
}

function isActiveBullMqState(state: string | undefined): boolean {
  return !state || ["active", "waiting", "delayed", "prioritized", "paused", "waiting-children"].includes(state);
}

function hostedWorkerQueueJobFromBullMqJob(job: BullMqJobLike): HostedWorkerQueueJob {
  const parsed = maybeHostedWorkerQueueJobFromBullMqJob(job);
  if (!parsed) {
    throw new Error("BullMQ hosted worker job payload is invalid.");
  }
  return parsed;
}

function maybeHostedWorkerQueueJobFromBullMqJob(job: BullMqJobLike | unknown): HostedWorkerQueueJob | null {
  if (typeof job !== "object" || job === null) {
    return null;
  }
  const data = (job as BullMqJobLike).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const kind = stringValue(record.kind);
  const projectId = stringValue(record.projectId);
  const jobId = stringValue(record.jobId);
  return (kind === "analysis" || kind === "render") && projectId && jobId
    ? { kind, projectId, jobId }
    : null;
}

function sanitizeQueueError(value: string): string {
  return value.replace(/(sk|whsec|secret|token|key)_[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300) || "Worker queue error.";
}
