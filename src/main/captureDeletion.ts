import type { CaptureSecretStore } from "./captureCredentials";
import { createHash } from "node:crypto";

export interface CaptureDeletionObjectReference { provider: string; storageKey: string; }
export interface CaptureCleanupTask { id: string; kind: "secret" | "object"; reference: string; provider?: string; }

export interface CaptureProjectDeletionRepository {
  revokeAndDeleteProjectCaptureData(input: { workspaceId: string; projectId: string; deletedAt: string }): Promise<{ cleanupTasks: CaptureCleanupTask[]; deletedRows: number }>;
  markCleanupTask(input: { workspaceId: string; projectId: string; taskId: string; status: "completed" | "failed"; updatedAt: string; safeErrorCode?: "provider_unavailable" }): Promise<void>;
}

export function createCaptureProjectDeletionService(options: {
  repository: CaptureProjectDeletionRepository;
  secrets: Pick<CaptureSecretStore, "delete">;
  objects: { delete(input: CaptureDeletionObjectReference & { workspaceId: string; projectId: string }): Promise<void> };
  onCleanupFailure?: (input: { kind: "secret"; reference: string } | { kind: "object"; reference: CaptureDeletionObjectReference }) => Promise<void> | void;
  now?: () => string;
}) {
  return {
    async delete(input: { workspaceId: string; projectId: string }): Promise<{ schemaVersion: "1"; deletedRows: number; deletedSecrets: number; deletedObjects: number; cleanupFailures: Array<{ kind: "secret" | "object"; referenceHash: string }> }> {
      const result = await options.repository.revokeAndDeleteProjectCaptureData({ ...input, deletedAt: options.now?.() ?? new Date().toISOString() });
      let deletedSecrets = 0;
      let deletedObjects = 0;
      const cleanupFailures: Array<{ kind: "secret" | "object"; referenceHash: string }> = [];
      for (const task of result.cleanupTasks) {
        if (task.kind === "secret") {
          try { await options.secrets.delete(task.reference); deletedSecrets += 1; await mark(options.repository, input, task.id, "completed", options.now); }
          catch { cleanupFailures.push({ kind: "secret", referenceHash: hashReference(task.reference) }); await mark(options.repository, input, task.id, "failed", options.now); await options.onCleanupFailure?.({ kind: "secret", reference: task.reference }); }
        } else {
          const reference = { provider: task.provider ?? "unknown", storageKey: task.reference };
          try { await options.objects.delete({ ...input, ...reference }); deletedObjects += 1; await mark(options.repository, input, task.id, "completed", options.now); }
          catch { cleanupFailures.push({ kind: "object", referenceHash: hashReference(`${reference.provider}:${reference.storageKey}`) }); await mark(options.repository, input, task.id, "failed", options.now); await options.onCleanupFailure?.({ kind: "object", reference }); }
        }
      }
      return { schemaVersion: "1", deletedRows: result.deletedRows, deletedSecrets, deletedObjects, cleanupFailures };
    }
  };
}

function hashReference(value: string): string { return createHash("sha256").update(value).digest("hex"); }
async function mark(repository: CaptureProjectDeletionRepository, scope: { workspaceId: string; projectId: string }, taskId: string, status: "completed" | "failed", now?: () => string): Promise<void> { await repository.markCleanupTask({ ...scope, taskId, status, updatedAt: now?.() ?? new Date().toISOString(), safeErrorCode: status === "failed" ? "provider_unavailable" : undefined }); }

export type CaptureProjectDeletionService = ReturnType<typeof createCaptureProjectDeletionService>;
