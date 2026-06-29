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

export interface HostedWorkerBootstrapInput {
  broker: HostedWorkerJobBroker;
  store: StoreBackedWorkerLeaseStore;
  executor: HostedWorkerJobExecutor;
  config?: Partial<HostedWorkerRuntimeConfig>;
  env?: NodeJS.ProcessEnv;
  nowMs?: () => number;
  onError?: (error: unknown, job: HostedWorkerQueueJob) => void;
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
  const runtime = new HostedWorkerRuntime({
    workerId: config.workerId,
    leaseSeconds: config.leaseSeconds,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    nowMs: input.nowMs,
    leaseCoordinator: createStoreBackedWorkerLeaseCoordinator(input.store),
    executor: input.executor,
    onError: input.onError
  });
  const unsubscribe = input.broker.subscribe(async (job) => {
    try {
      await runtime.runBrokeredJob(job);
    } catch (error) {
      input.onError?.(error, job);
      throw error;
    }
  });
  return {
    workerId: config.workerId,
    runtime,
    stats() {
      return input.broker.stats();
    },
    stop() {
      unsubscribe();
    }
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
