import type { CaptureSecretStore } from "./captureCredentials";

export interface CaptureProjectDeletionRepository {
  revokeAndDeleteProjectCaptureData(input: { workspaceId: string; projectId: string; deletedAt: string }): Promise<{ vaultReferences: string[]; deletedRows: number }>;
}

export function createCaptureProjectDeletionService(options: {
  repository: CaptureProjectDeletionRepository;
  secrets: Pick<CaptureSecretStore, "delete">;
  now?: () => string;
}) {
  return {
    async delete(input: { workspaceId: string; projectId: string }): Promise<{ deletedRows: number; deletedSecrets: number; secretCleanupFailures: string[] }> {
      const result = await options.repository.revokeAndDeleteProjectCaptureData({ ...input, deletedAt: options.now?.() ?? new Date().toISOString() });
      let deletedSecrets = 0;
      const secretCleanupFailures: string[] = [];
      for (const reference of [...new Set(result.vaultReferences)]) {
        try { await options.secrets.delete(reference); deletedSecrets += 1; }
        catch { secretCleanupFailures.push(reference); }
      }
      return { deletedRows: result.deletedRows, deletedSecrets, secretCleanupFailures };
    }
  };
}

export type CaptureProjectDeletionService = ReturnType<typeof createCaptureProjectDeletionService>;
