import { createHmac } from "node:crypto";
import type { HostedJobQueueService } from "./hostedApi";
import type { JobKind, QueueRuntimeStats } from "../shared/types";

export interface WorkerQueueTask<T> {
  id: string;
  projectId: string;
  kind: JobKind;
  run: () => Promise<T>;
}

export interface WorkerQueueOptions {
  concurrency?: number;
  concurrencyByKind?: Partial<Record<JobKind, number>>;
}

export interface HostedJobQueueConfig {
  provider: "none" | "http";
  httpEndpointUrl: string | null;
  signingSecret: string | null;
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
    if (this.activeTasks.has(task.id) || this.pending.some((candidate) => candidate.id === task.id)) {
      return Promise.reject(new Error(`Job ${task.id} is already queued or running.`));
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
  return {
    provider: endpoint && signingSecret ? "http" : "none",
    httpEndpointUrl: endpoint,
    signingSecret
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

function sanitizeQueueError(value: string): string {
  return value.replace(/(sk|whsec|secret|token|key)_[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300) || "Worker queue error.";
}
