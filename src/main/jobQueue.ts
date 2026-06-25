import type { JobKind } from "../shared/types";

export interface WorkerQueueTask<T> {
  id: string;
  projectId: string;
  kind: JobKind;
  run: () => Promise<T>;
}

export interface WorkerQueueStats {
  active: number;
  pending: number;
}

interface PendingTask<T> extends WorkerQueueTask<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
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
  private readonly pending: Array<PendingTask<unknown>> = [];
  private readonly activeIds = new Set<string>();

  constructor(options: { concurrency?: number } = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 1);
  }

  enqueue<T>(task: WorkerQueueTask<T>): Promise<T> {
    if (this.activeIds.has(task.id) || this.pending.some((candidate) => candidate.id === task.id)) {
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

  stats(): WorkerQueueStats {
    return {
      active: this.activeIds.size,
      pending: this.pending.length
    };
  }

  private drain(): void {
    while (this.activeIds.size < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) {
        return;
      }
      this.activeIds.add(task.id);
      void this.runTask(task);
    }
  }

  private async runTask<T>(task: PendingTask<T>): Promise<void> {
    try {
      task.resolve(await task.run());
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeIds.delete(task.id);
      this.drain();
    }
  }
}
