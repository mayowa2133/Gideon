import {
  createStoreBackedWorkerLeaseCoordinator,
  HostedWorkerRuntime,
  type HostedWorkerJobBroker,
  type HostedWorkerJobExecutor,
  type HostedWorkerQueueJob,
  type StoreBackedWorkerLeaseStore
} from "./jobQueue";
import type { QueueRuntimeStats } from "../shared/types";

export interface HostedWorkerRuntimeConfig {
  workerId: string;
  leaseSeconds: number;
  heartbeatIntervalMs: number;
}

export type HostedWorkerMetricEvent =
  | {
      name: "hosted_worker_started";
      workerId: string;
      stats: QueueRuntimeStats;
      at: string;
    }
  | {
      name: "hosted_worker_stopped";
      workerId: string;
      stats: QueueRuntimeStats;
      at: string;
    }
  | {
      name: "hosted_worker_job_started";
      workerId: string;
      job: HostedWorkerQueueJob;
      stats: QueueRuntimeStats;
      at: string;
    }
  | {
      name: "hosted_worker_job_succeeded";
      workerId: string;
      job: HostedWorkerQueueJob;
      durationMs: number;
      stats: QueueRuntimeStats;
      at: string;
    }
  | {
      name: "hosted_worker_job_failed";
      workerId: string;
      job: HostedWorkerQueueJob;
      durationMs: number;
      safeError: string;
      stats: QueueRuntimeStats;
      at: string;
    };

type HostedWorkerMetricInput = HostedWorkerMetricEvent extends infer Event
  ? Event extends HostedWorkerMetricEvent
    ? Omit<Event, "workerId" | "at" | "stats"> & { stats?: QueueRuntimeStats }
    : never
  : never;

export interface HostedWorkerBootstrapInput {
  broker: HostedWorkerJobBroker;
  store: StoreBackedWorkerLeaseStore;
  executor: HostedWorkerJobExecutor;
  config?: Partial<HostedWorkerRuntimeConfig>;
  env?: NodeJS.ProcessEnv;
  nowMs?: () => number;
  onError?: (error: unknown, job: HostedWorkerQueueJob) => void;
  onMetric?: (event: HostedWorkerMetricEvent) => void;
}

export interface HostedWorkerBootstrapHandle {
  workerId: string;
  runtime: HostedWorkerRuntime;
  stats(): QueueRuntimeStats;
  stop(): void;
}

export function loadHostedWorkerRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HostedWorkerRuntimeConfig {
  const leaseSeconds = positiveInteger(env.GIDEON_WORKER_LEASE_SECONDS, 300);
  return {
    workerId: env.GIDEON_WORKER_ID?.trim() || `hosted-worker-${process.pid}`,
    leaseSeconds,
    heartbeatIntervalMs: positiveInteger(env.GIDEON_WORKER_HEARTBEAT_INTERVAL_MS, Math.max(1_000, Math.floor(leaseSeconds * 500)))
  };
}

export function createHostedWorkerRuntimeBootstrap(input: HostedWorkerBootstrapInput): HostedWorkerBootstrapHandle {
  const loaded = loadHostedWorkerRuntimeConfig(input.env);
  const config = {
    ...loaded,
    ...input.config
  };
  const nowMs = input.nowMs ?? Date.now;
  const runtime = new HostedWorkerRuntime({
    workerId: config.workerId,
    leaseSeconds: config.leaseSeconds,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    nowMs,
    leaseCoordinator: createStoreBackedWorkerLeaseCoordinator(input.store),
    executor: input.executor,
    onError: input.onError
  });
  const emitMetric = (event: HostedWorkerMetricInput): void => {
    input.onMetric?.({
      ...event,
      workerId: config.workerId,
      stats: event.stats ?? input.broker.stats(),
      at: new Date(nowMs()).toISOString()
    } as HostedWorkerMetricEvent);
  };
  const unsubscribe = input.broker.subscribe(async (job) => {
    const startedAtMs = nowMs();
    emitMetric({ name: "hosted_worker_job_started", job });
    try {
      await runtime.runBrokeredJob(job);
      emitMetric({
        name: "hosted_worker_job_succeeded",
        job,
        durationMs: Math.max(0, nowMs() - startedAtMs)
      });
    } catch (error) {
      input.onError?.(error, job);
      emitMetric({
        name: "hosted_worker_job_failed",
        job,
        durationMs: Math.max(0, nowMs() - startedAtMs),
        safeError: sanitizeWorkerMetricError(error instanceof Error ? error.message : "Hosted worker job failed.")
      });
      throw error;
    }
  });
  emitMetric({ name: "hosted_worker_started" });
  return {
    workerId: config.workerId,
    runtime,
    stats() {
      return input.broker.stats();
    },
    stop() {
      unsubscribe();
      emitMetric({ name: "hosted_worker_stopped" });
    }
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeWorkerMetricError(value: string): string {
  return value.replace(/(sk|whsec|secret|token|key)_[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300) || "Hosted worker error.";
}
