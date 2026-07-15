import { createHash, randomUUID } from "node:crypto";
import { createJob } from "../shared/jobState";
import type { CaptureEnvironment, CapturePersona, DiscoveryRun } from "../shared/productFlowCapture";
import type { JobRecord } from "../shared/types";
import { stableSerialize } from "./productFlowCompiler";

export interface DiscoveryGoal { id: string; text: string; priority: number }

export interface DiscoveryRunCoordinatorRepository {
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  listProjectPersonas(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CapturePersona[]>;
  getIdempotentDiscovery(input: { workspaceId: string; idempotencyKey: string }): Promise<{ run: DiscoveryRun; job: JobRecord; requestHash: string } | null>;
  persistDiscoveryJob(input: { workspaceId: string; run: DiscoveryRun; job: JobRecord; idempotencyKey: string; requestHash: string; goals: DiscoveryGoal[]; maxCandidates: number }): Promise<void>;
}

export interface DiscoveryRunQueue {
  enqueue(input: { workspaceId: string; projectId: string; discoveryRunId: string; jobId: string }): Promise<void>;
}

export function createDiscoveryRunCoordinator(options: { repository: DiscoveryRunCoordinatorRepository; queue: DiscoveryRunQueue; makeId?: () => string; now?: () => string }) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async create(input: { workspaceId: string; projectId: string; environmentId: string; goals: DiscoveryGoal[]; maxCandidates?: number; idempotencyKey: string }): Promise<{ run: DiscoveryRun; job: JobRecord; reused: boolean }> {
      const idempotencyKey = validIdempotencyKey(input.idempotencyKey);
      const goals = validGoals(input.goals);
      const maxCandidates = validMaxCandidates(input.maxCandidates ?? 30);
      const requestHash = sha256(stableSerialize({ workspaceId: input.workspaceId, projectId: input.projectId, environmentId: input.environmentId, goals, maxCandidates }));
      const existing = await options.repository.getIdempotentDiscovery({ workspaceId: input.workspaceId, idempotencyKey });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("Idempotency key was already used for a different discovery request.");
        if (existing.job.status === "queued") await enqueue(options.queue, existing.run, existing.job.id);
        return { run: existing.run, job: existing.job, reused: true };
      }
      const environment = await options.repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: input.environmentId });
      if (!environment || environment.projectId !== input.projectId || environment.status !== "ready" || !environment.currentVersionId) throw new Error("Capture environment is not current and ready.");
      const personas = await options.repository.listProjectPersonas({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 20 });
      if (!personas.some((persona) => persona.environmentId === environment.id && persona.status === "active")) throw new Error("Discovery requires an active capture persona.");
      const createdAt = now();
      const job = createJob({ id: makeId(), projectId: input.projectId, kind: "flow_discovery", now: createdAt, maxAttempts: 2, userMessage: "Waiting to discover product flows." });
      const run: DiscoveryRun = { id: makeId(), workspaceId: input.workspaceId, projectId: input.projectId, environmentVersionId: environment.currentVersionId, jobId: job.id, status: "queued", promptVersion: "deterministic-v1", maxSteps: 500, maxScreenshots: 100, maxDurationMs: 300_000, createdAt, updatedAt: createdAt };
      try {
        await options.repository.persistDiscoveryJob({ workspaceId: input.workspaceId, run, job, idempotencyKey, requestHash, goals, maxCandidates });
      } catch (error) {
        const raced = await options.repository.getIdempotentDiscovery({ workspaceId: input.workspaceId, idempotencyKey });
        if (raced?.requestHash === requestHash) {
          if (raced.job.status === "queued") await enqueue(options.queue, raced.run, raced.job.id);
          return { run: raced.run, job: raced.job, reused: true };
        }
        throw error;
      }
      await enqueue(options.queue, run, job.id);
      return { run, job, reused: false };
    }
  };
}

export type DiscoveryRunCoordinator = ReturnType<typeof createDiscoveryRunCoordinator>;

async function enqueue(queue: DiscoveryRunQueue, run: DiscoveryRun, jobId: string) {
  try { await queue.enqueue({ workspaceId: run.workspaceId, projectId: run.projectId, discoveryRunId: run.id, jobId }); }
  catch { throw new Error("Discovery run was saved but could not be queued. It can be retried safely."); }
}
function validGoals(value: DiscoveryGoal[]) { if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Discovery requires 1–50 goals."); return value.map((goal) => { const id = bounded(goal.id, 200); const text = bounded(goal.text, 600); if (!Number.isFinite(goal.priority) || goal.priority < 0 || goal.priority > 100) throw new Error("Discovery goal priority is invalid."); return { id, text, priority: Math.trunc(goal.priority) }; }); }
function validMaxCandidates(value: number) { if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("Discovery candidate budget is invalid."); return value; }
function validIdempotencyKey(value: string) { const key = value.trim(); if (key.length < 8 || key.length > 191 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new Error("Idempotency key is invalid."); return key; }
function bounded(value: string, max: number) { const normalized = typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ") : ""; if (!normalized || normalized.length > max) throw new Error("Discovery goal is invalid."); return normalized; }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
