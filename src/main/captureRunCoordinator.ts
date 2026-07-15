import { createHash, randomUUID } from "node:crypto";
import { createJob } from "../shared/jobState";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CaptureRun,
  ProductFlowRevision
} from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import { browserPolicyForEnvironment } from "./captureService";
import { compileProductFlow, stableSerialize, type CompiledFlowPlan } from "./productFlowCompiler";

export interface CaptureRunCoordinatorRepository {
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
  getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null>;
  getCaptureRunByIdempotency(input: { workspaceId: string; idempotencyKey: string }): Promise<CaptureRun | null>;
  persistCaptureRunAndJob(input: {
    workspaceId: string;
    captureRun: CaptureRun;
    job: JobRecord;
    safeInput: Record<string, unknown>;
  }): Promise<void>;
}

export interface CaptureRunQueue {
  enqueue(input: { workspaceId: string; projectId: string; captureRunId: string; jobId: string }): Promise<void>;
}

export interface CreateCaptureRunInput {
  workspaceId: string;
  projectId: string;
  environmentId: string;
  flowIds: string[];
  idempotencyKey: string;
}

export interface CaptureRunCoordinator {
  create(input: CreateCaptureRunInput): Promise<{ captureRun: CaptureRun; job: JobRecord; reused: boolean }>;
}

export interface CaptureQuotaGate {
  authorize(input: { workspaceId: string; projectId: string; flowCount: number; estimatedBrowserSeconds: number; idempotencyKey: string }): Promise<void>;
}

export function createCaptureRunCoordinator(options: {
  repository: CaptureRunCoordinatorRepository;
  queue: CaptureRunQueue;
  makeId?: () => string;
  now?: () => string;
  quota?: CaptureQuotaGate;
}): CaptureRunCoordinator {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async create(input) {
      const normalized = normalizeRequest(input);
      const requestHash = sha256(stableSerialize(normalized));
      const existing = await options.repository.getCaptureRunByIdempotency({
        workspaceId: normalized.workspaceId,
        idempotencyKey: normalized.idempotencyKey
      });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("Idempotency key was already used for a different capture request.");
        if (existing.status === "queued") await enqueueCapture(options.queue, existing);
        return {
          captureRun: existing,
          job: captureJobForRun(existing),
          reused: true
        };
      }

      const environment = await options.repository.getEnvironment({
        workspaceId: normalized.workspaceId,
        environmentId: normalized.environmentId
      });
      if (!environment || environment.projectId !== normalized.projectId) throw new Error("Capture environment was not found.");
      if (environment.status !== "ready" || !environment.currentVersionId) {
        throw new Error("Capture environment is not current and ready.");
      }
      const environmentVersion = await options.repository.getEnvironmentVersion({
        workspaceId: normalized.workspaceId,
        versionId: environment.currentVersionId
      });
      if (!environmentVersion || environmentVersion.projectId !== normalized.projectId || environmentVersion.environmentId !== environment.id) {
        throw new Error("Capture environment version was not found.");
      }

      const policy = browserPolicyForEnvironment(environment);
      const flows = await Promise.all(
        normalized.flowIds.map((flowId) => options.repository.getFlow({ workspaceId: normalized.workspaceId, flowId }))
      );
      const plans = flows.map((flow, index) =>
        requireAndCompileFlow(flow, normalized.flowIds[index]!, normalized.projectId, environmentVersion, policy)
      );
      const estimatedBrowserSeconds = Math.min(3_600, plans.reduce((sum, plan) => sum + 20 + plan.steps.length * 4, 0) * 2);
      await options.quota?.authorize({ workspaceId: normalized.workspaceId, projectId: normalized.projectId, flowCount: plans.length, estimatedBrowserSeconds, idempotencyKey: normalized.idempotencyKey });
      const createdAt = now();
      const jobId = makeId();
      const captureRun: CaptureRun = {
        id: makeId(),
        workspaceId: normalized.workspaceId,
        projectId: normalized.projectId,
        environmentVersionId: environmentVersion.id,
        jobId,
        status: "queued",
        flowRevisionIds: plans.map((plan) => `${plan.flowId}:revision:${plan.flowRevision}`),
        compiledPlanHashes: plans.map((plan) => plan.compiledPlanHash),
        policyFingerprint: plans[0]!.policyFingerprint,
        idempotencyKey: normalized.idempotencyKey,
        requestHash,
        estimatedBrowserSeconds,
        createdAt,
        updatedAt: createdAt
      };
      const job = createJob({
        id: jobId,
        projectId: normalized.projectId,
        kind: "flow_capture",
        now: createdAt,
        maxAttempts: 2,
        userMessage: "Waiting to capture approved product flows."
      });
      try {
        await options.repository.persistCaptureRunAndJob({
          workspaceId: normalized.workspaceId,
          captureRun,
          job,
          safeInput: {
            captureRunId: captureRun.id,
            environmentVersionId: captureRun.environmentVersionId,
            flowRevisionIds: captureRun.flowRevisionIds,
            compiledPlanHashes: captureRun.compiledPlanHashes,
            policyFingerprint: captureRun.policyFingerprint
          }
        });
      } catch (error) {
        const raced = await options.repository.getCaptureRunByIdempotency({ workspaceId: normalized.workspaceId, idempotencyKey: normalized.idempotencyKey });
        if (raced?.requestHash === requestHash) {
          if (raced.status === "queued") await enqueueCapture(options.queue, raced);
          return { captureRun: raced, job: captureJobForRun(raced), reused: true };
        }
        throw error;
      }
      await enqueueCapture(options.queue, captureRun);
      return { captureRun, job, reused: false };
    }
  };
}

async function enqueueCapture(queue: CaptureRunQueue, run: CaptureRun): Promise<void> {
  try {
    await queue.enqueue({ workspaceId: run.workspaceId, projectId: run.projectId, captureRunId: run.id, jobId: run.jobId });
  } catch {
    throw new Error("Capture was saved but could not be queued. It can be retried safely.");
  }
}

function normalizeRequest(input: CreateCaptureRunInput): CreateCaptureRunInput {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new Error("Idempotency key is invalid.");
  }
  const flowIds = [...new Set(input.flowIds.map((value) => value.trim()).filter(Boolean))].sort();
  if (flowIds.length < 1 || flowIds.length > 50) throw new Error("Capture run requires 1–50 unique flows.");
  return { ...input, idempotencyKey, flowIds };
}

function requireAndCompileFlow(
  flow: ProductFlowRevision | null,
  requestedFlowId: string,
  projectId: string,
  version: CaptureEnvironmentVersion,
  policy: ReturnType<typeof browserPolicyForEnvironment>
): CompiledFlowPlan {
  if (!flow || flow.id !== requestedFlowId || flow.projectId !== projectId) throw new Error("Product flow was not found.");
  if (flow.environmentVersionId !== version.id) throw new Error("Product flow is stale for this capture environment.");
  return compileProductFlow(flow, policy);
}

function captureJobForRun(run: CaptureRun): JobRecord {
  const job = createJob({ id: run.jobId, projectId: run.projectId, kind: "flow_capture", now: run.createdAt, maxAttempts: 2 });
  return { ...job, status: jobStatusForRun(run.status), updatedAt: run.updatedAt };
}

function jobStatusForRun(status: CaptureRun["status"]): JobRecord["status"] {
  if (status === "completed") return "succeeded";
  if (status === "failed" || status === "needs_review") return "failed";
  if (status === "canceled") return "canceled";
  if (status === "queued") return "queued";
  return "running";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
