import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeQueueError(value: string): string {
  return value.replace(/(sk|whsec|secret|token|key)_[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300) || "Worker queue error.";
}
