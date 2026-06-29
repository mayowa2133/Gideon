import { BullMqHostedWorkerJobBroker, InMemoryHostedWorkerJobBroker, loadHostedJobQueueConfig, redisConnectionFromUrl, type HostedWorkerJobBroker } from "./jobQueue";
import {
  createHostedWorkerRuntimeBootstrap,
  type HostedWorkerBootstrapHandle,
  type HostedWorkerMetricEvent,
  type HostedWorkerRuntimeConfig
} from "./hostedWorker";
import { createGideonJobExecutor, type GideonJobExecutor, type GideonJobExecutorMetricEvent } from "./jobExecutor";
import { createHostedWorkerExecutorAdapter } from "./jobExecutorAdapter";
import { createPostgresSnapshotPoolPersistenceFromEnv } from "./persistence";
import { createPostgresCoreRepositoryFromEnv } from "./postgresCoreRepository";
import { createPostgresJobArtifactRepositoryFromEnv } from "./postgresJobArtifactRepository";
import { createPostgresUsageAuditRepositoryFromEnv } from "./postgresUsageAuditRepository";
import { GideonStore, type GideonRelationalMirror, type GideonStoreOptions, type JobObservabilitySnapshot } from "./store";

export interface HostedWorkerProcessLogger {
  info(input: unknown): void;
  error(input: unknown): void;
}

export interface HostedWorkerProcessOptions {
  env?: NodeJS.ProcessEnv;
  store?: GideonStore;
  broker?: HostedWorkerJobBroker;
  executor?: GideonJobExecutor;
  config?: Partial<HostedWorkerRuntimeConfig>;
  nowMs?: () => number;
  logger?: HostedWorkerProcessLogger;
  onMetric?: (event: HostedWorkerProcessMetricEvent) => void;
}

export type HostedWorkerJobObservabilityMetricEvent = {
  name: "job_observability_snapshot";
  trigger: string;
  snapshot: JobObservabilitySnapshot;
};

export type HostedWorkerProcessMetricEvent =
  | HostedWorkerMetricEvent
  | GideonJobExecutorMetricEvent
  | HostedWorkerJobObservabilityMetricEvent;

export interface HostedWorkerProcessHandle {
  workerId: string;
  bootstrap: HostedWorkerBootstrapHandle;
  broker: HostedWorkerJobBroker;
  store: GideonStore;
  stop(): Promise<void>;
}

export function createHostedWorkerProcess(input: HostedWorkerProcessOptions = {}): HostedWorkerProcessHandle {
  const env = input.env ?? process.env;
  const logger = input.logger ?? jsonConsoleLogger;
  const store = input.store ?? createHostedWorkerStoreFromEnv(env);
  const broker = input.broker ?? createHostedWorkerBrokerFromEnv(env);
  const emitMetric = (event: HostedWorkerProcessMetricEvent): void => {
    input.onMetric?.(event);
    logger.info({
      level: "info",
      event: event.name,
      ...event
    });
  };
  const emitJobObservabilitySnapshot = async (trigger: string): Promise<void> => {
    try {
      emitMetric({
        name: "job_observability_snapshot",
        trigger,
        snapshot: await store.getJobObservabilitySnapshot()
      });
    } catch (error) {
      logger.error({
        level: "error",
        event: "job_observability_snapshot_error",
        message: sanitizeHostedWorkerLogMessage(error instanceof Error ? error.message : "Could not read job observability snapshot.")
      });
    }
  };
  const emitMetricWithSnapshot = (event: HostedWorkerProcessMetricEvent): void => {
    emitMetric(event);
    if (event.name !== "job_observability_snapshot") {
      void emitJobObservabilitySnapshot(event.name);
    }
  };
  const gideonExecutor =
    input.executor ??
    createGideonJobExecutor({
      store,
      onMetric: emitMetricWithSnapshot
    });
  const bootstrap = createHostedWorkerRuntimeBootstrap({
    broker,
    store,
    executor: createHostedWorkerExecutorAdapter(gideonExecutor),
    config: input.config,
    env,
    nowMs: input.nowMs,
    onError(error, job) {
      logger.error({
        level: "error",
        event: "hosted_worker_job_error",
        workerId: bootstrapSafeWorkerId(input.config, env),
        job,
        message: sanitizeHostedWorkerLogMessage(error instanceof Error ? error.message : "Hosted worker job failed.")
      });
    },
    onMetric(event) {
      emitMetricWithSnapshot(event);
    }
  });
  return {
    workerId: bootstrap.workerId,
    bootstrap,
    broker,
    store,
    async stop() {
      bootstrap.stop();
      const closeable = broker as HostedWorkerJobBroker & { close?: () => Promise<void> | void };
      await Promise.resolve(closeable.close?.());
      await store.close();
    }
  };
}

export function createHostedWorkerBrokerFromEnv(env: NodeJS.ProcessEnv = process.env): HostedWorkerJobBroker {
  const config = loadHostedJobQueueConfig(env);
  if (config.provider === "bullmq" && config.redisUrl) {
    return new BullMqHostedWorkerJobBroker({
      connection: redisConnectionFromUrl(config.redisUrl),
      queueName: config.bullMqQueueName,
      prefix: config.bullMqPrefix ?? undefined
    });
  }
  if (config.provider === "memory") {
    return new InMemoryHostedWorkerJobBroker();
  }
  throw new Error(
    "Hosted worker process requires GIDEON_HOSTED_QUEUE_PROVIDER=bullmq with GIDEON_REDIS_URL/REDIS_URL, or GIDEON_HOSTED_QUEUE_PROVIDER=memory for local testing."
  );
}

export function storeOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): GideonStoreOptions {
  const storeProvider = trimEnv(env.GIDEON_STORE_PROVIDER);
  const relationalMirrorEnabled = trimEnv(env.GIDEON_RELATIONAL_MIRROR) !== "false";
  return {
    userDataDir: trimEnv(env.GIDEON_USER_DATA_DIR),
    storePath: trimEnv(env.GIDEON_STORE_PATH),
    projectsDir: trimEnv(env.GIDEON_PROJECTS_DIR),
    storageRoot: trimEnv(env.GIDEON_STORAGE_ROOT),
    persistence:
      storeProvider === "postgres_snapshot" ? createPostgresSnapshotPoolPersistenceFromEnv(env) : undefined,
    relationalMirror:
      storeProvider === "postgres_snapshot" && relationalMirrorEnabled
        ? createHostedPostgresRelationalMirrorFromEnv(env)
        : undefined,
    relationalQueueName: trimEnv(env.GIDEON_BULLMQ_QUEUE_NAME ?? env.GIDEON_WORKER_QUEUE_NAME)
  };
}

export function createHostedWorkerStoreFromEnv(env: NodeJS.ProcessEnv = process.env): GideonStore {
  return new GideonStore(storeOptionsFromEnv(env));
}

export function createHostedPostgresRelationalMirrorFromEnv(env: NodeJS.ProcessEnv = process.env): GideonRelationalMirror {
  const core = createPostgresCoreRepositoryFromEnv(env);
  const jobsArtifacts = createPostgresJobArtifactRepositoryFromEnv(env);
  const usageAudit = createPostgresUsageAuditRepositoryFromEnv(env);
  return {
    upsertUser: (user) => core.upsertUser(user),
    upsertWorkspace: (workspace) => core.upsertWorkspace(workspace),
    upsertWorkspaceMember: (member) => core.upsertWorkspaceMember(member),
    upsertProject: (project) => core.upsertProject(project),
    upsertRecordingUploadSession: (session) => core.upsertRecordingUploadSession(session),
    upsertJob: (input) => jobsArtifacts.upsertJob(input),
    upsertArtifact: (artifact) => jobsArtifacts.upsertArtifact(artifact),
    upsertUsageEvent: (event) => usageAudit.upsertUsageEvent(event),
    upsertAuditEvent: (event) => usageAudit.upsertAuditEvent(event),
    async close() {
      await core.close();
      await jobsArtifacts.close();
      await usageAudit.close();
    }
  };
}

async function runHostedWorkerCli(): Promise<void> {
  const handle = createHostedWorkerProcess();
  const stop = async (signal: NodeJS.Signals) => {
    jsonConsoleLogger.info({
      level: "info",
      event: "hosted_worker_signal",
      workerId: handle.workerId,
      signal
    });
    await handle.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    void stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    void stop("SIGTERM");
  });
}

function bootstrapSafeWorkerId(config: Partial<HostedWorkerRuntimeConfig> | undefined, env: NodeJS.ProcessEnv): string {
  return config?.workerId ?? env.GIDEON_WORKER_ID?.trim() ?? `hosted-worker-${process.pid}`;
}

function trimEnv(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function sanitizeHostedWorkerLogMessage(value: string): string {
  return value.replace(/(sk|whsec|secret|token|key)_[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300) || "Hosted worker error.";
}

const jsonConsoleLogger: HostedWorkerProcessLogger = {
  info(input) {
    console.log(JSON.stringify(input));
  },
  error(input) {
    console.error(JSON.stringify(input));
  }
};

if (require.main === module) {
  runHostedWorkerCli().catch((error: unknown) => {
    jsonConsoleLogger.error({
      level: "error",
      event: "hosted_worker_fatal",
      message: sanitizeHostedWorkerLogMessage(error instanceof Error ? error.message : "Hosted worker failed to start.")
    });
    process.exit(1);
  });
}
