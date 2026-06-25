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
