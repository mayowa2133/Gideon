import { createHash, randomUUID } from "node:crypto";
import { createJob } from "../shared/jobState";
import type { CaptureEnvironment } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import { stableSerialize } from "./productFlowCompiler";

export interface EnvironmentValidationCoordinatorRepository {
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  getIdempotentEnvironmentValidation(input: { workspaceId: string; idempotencyKey: string }): Promise<{ job: JobRecord; requestHash: string } | null>;
  persistEnvironmentValidationJob(input: {
    workspaceId: string;
    environment: CaptureEnvironment;
    job: JobRecord;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<void>;
}

export interface EnvironmentValidationQueue {
  enqueue(input: { workspaceId: string; projectId: string; environmentId: string; jobId: string }): Promise<void>;
}

export function createEnvironmentValidationCoordinator(options: {
  repository: EnvironmentValidationCoordinatorRepository;
  queue: EnvironmentValidationQueue;
  makeId?: () => string;
  now?: () => string;
}) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async create(input: { workspaceId: string; projectId: string; environmentId: string; idempotencyKey: string }): Promise<{ job: JobRecord; environment: CaptureEnvironment; reused: boolean }> {
      const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
      const requestHash = sha256(stableSerialize({ workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId }));
      const existing = await options.repository.getIdempotentEnvironmentValidation({ workspaceId: input.workspaceId, idempotencyKey });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("Idempotency key was already used for a different environment validation request.");
        const environment = await requireEnvironment(options.repository, input);
        if (existing.job.status === "queued") await enqueue(options.queue, environment, existing.job.id);
        return { job: existing.job, environment, reused: true };
      }
      const environment = await requireEnvironment(options.repository, input);
      if (environment.status === "ready" && environment.currentVersionId) {
        throw new Error("Capture environment is already validated. Update it before validating a new revision.");
      }
      const createdAt = now();
      const job = createJob({ id: makeId(), projectId: input.projectId, kind: "environment_validation", now: createdAt, maxAttempts: 3, userMessage: "Waiting to validate the capture environment." });
      const validating: CaptureEnvironment = { ...environment, status: "validating", safeErrorCode: undefined, updatedAt: createdAt };
      try {
        await options.repository.persistEnvironmentValidationJob({ workspaceId: input.workspaceId, environment: validating, job, idempotencyKey, requestHash });
      } catch (error) {
        const raced = await options.repository.getIdempotentEnvironmentValidation({ workspaceId: input.workspaceId, idempotencyKey });
        if (raced?.requestHash === requestHash) {
          if (raced.job.status === "queued") await enqueue(options.queue, validating, raced.job.id);
          return { job: raced.job, environment: validating, reused: true };
        }
        throw error;
      }
      await enqueue(options.queue, validating, job.id);
      return { job, environment: validating, reused: false };
    }
  };
}

export type EnvironmentValidationCoordinator = ReturnType<typeof createEnvironmentValidationCoordinator>;

async function requireEnvironment(repository: EnvironmentValidationCoordinatorRepository, input: { workspaceId: string; projectId: string; environmentId: string }) {
  const environment = await repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: input.environmentId });
  if (!environment || environment.projectId !== input.projectId || environment.status === "revoked") throw new Error("Capture environment was not found.");
  return environment;
}

async function enqueue(queue: EnvironmentValidationQueue, environment: CaptureEnvironment, jobId: string) {
  try { await queue.enqueue({ workspaceId: environment.workspaceId, projectId: environment.projectId, environmentId: environment.id, jobId }); }
  catch { throw new Error("Environment validation was saved but could not be queued. It can be retried safely."); }
}

function validateIdempotencyKey(value: string) { const key = value.trim(); if (key.length < 8 || key.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new Error("Idempotency key is invalid."); return key; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
