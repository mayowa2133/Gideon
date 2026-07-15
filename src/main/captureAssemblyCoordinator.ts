import { createHash, randomUUID } from "node:crypto";
import { createJob } from "../shared/jobState";
import type { CaptureRun, FlowExecutionRecord } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import { stableSerialize } from "./productFlowCompiler";

export interface CaptureAssemblyCoordinatorRepository {
  getCaptureRun(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRun | null>;
  listCaptureRunExecutions(input: { workspaceId: string; captureRunId: string; limit?: number }): Promise<FlowExecutionRecord[]>;
  getIdempotentAssembly(input: { workspaceId: string; idempotencyKey: string }): Promise<{ job: JobRecord; requestHash: string } | null>;
  persistAssemblyJob(input: { workspaceId: string; job: JobRecord; idempotencyKey: string; requestHash: string; captureRunId: string; executionIds: string[]; actorUserId: string }): Promise<void>;
}
export interface CaptureAssemblyQueue { enqueue(input: { workspaceId: string; projectId: string; captureRunId: string; jobId: string }): Promise<void> }

export function createCaptureAssemblyCoordinator(options: { repository: CaptureAssemblyCoordinatorRepository; queue: CaptureAssemblyQueue; makeId?: () => string; now?: () => string }) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async create(input: { workspaceId: string; projectId: string; captureRunId: string; executionIds: string[]; actorUserId: string; idempotencyKey: string }) {
      const idempotencyKey = validKey(input.idempotencyKey);
      const executionIds = validIds(input.executionIds);
      const requestHash = createHash("sha256").update(stableSerialize({ workspaceId: input.workspaceId, projectId: input.projectId, captureRunId: input.captureRunId, executionIds })).digest("hex");
      const existing = await options.repository.getIdempotentAssembly({ workspaceId: input.workspaceId, idempotencyKey });
      if (existing) { if (existing.requestHash !== requestHash) throw new Error("Idempotency key was already used for a different assembly request."); if (existing.job.status === "queued") await enqueue(options.queue, input, existing.job.id); return { job: existing.job, reused: true }; }
      const run = await options.repository.getCaptureRun({ workspaceId: input.workspaceId, captureRunId: input.captureRunId });
      if (!run || run.projectId !== input.projectId || run.status !== "completed") throw new Error("Completed capture run was not found.");
      const executions = await options.repository.listCaptureRunExecutions({ workspaceId: input.workspaceId, captureRunId: run.id, limit: 100 });
      const byId = new Map(executions.map((execution) => [execution.id, execution]));
      if (executionIds.some((id) => { const execution = byId.get(id); return !execution || execution.projectId !== input.projectId || execution.status !== "verified" || !execution.normalizedClipArtifactId; })) throw new Error("Assembly requires verified captures from this run.");
      const job = createJob({ id: makeId(), projectId: input.projectId, kind: "capture_assembly", now: now(), maxAttempts: 2, userMessage: "Waiting to assemble selected product clips." });
      try {
        await options.repository.persistAssemblyJob({ workspaceId: input.workspaceId, job, idempotencyKey, requestHash, captureRunId: run.id, executionIds, actorUserId: input.actorUserId });
      } catch (error) {
        const raced = await options.repository.getIdempotentAssembly({ workspaceId: input.workspaceId, idempotencyKey });
        if (raced?.requestHash === requestHash) {
          if (raced.job.status === "queued") await enqueue(options.queue, input, raced.job.id);
          return { job: raced.job, reused: true };
        }
        throw error;
      }
      await enqueue(options.queue, input, job.id);
      return { job, reused: false };
    }
  };
}
export type CaptureAssemblyCoordinator = ReturnType<typeof createCaptureAssemblyCoordinator>;
async function enqueue(queue: CaptureAssemblyQueue, input: { workspaceId: string; projectId: string; captureRunId: string }, jobId: string) { try { await queue.enqueue({ workspaceId: input.workspaceId, projectId: input.projectId, captureRunId: input.captureRunId, jobId }); } catch { throw new Error("Assembly was saved but could not be queued. It can be retried safely."); } }
function validIds(value: string[]) { if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Assembly requires 1–50 execution IDs."); const ids = value.map((item) => item.trim()); if (ids.some((id) => !/^[A-Za-z0-9._:-]{1,200}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("Assembly execution IDs are invalid."); return ids; }
function validKey(value: string) { const key = value.trim(); if (key.length < 8 || key.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new Error("Idempotency key is invalid."); return key; }
