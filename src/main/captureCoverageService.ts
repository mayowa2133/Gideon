import type { CoverageSnapshot } from "../shared/productFlowCapture";

export interface CaptureCoverageRepository {
  getLatestCoverageSnapshot(input: { workspaceId: string; projectId: string }): Promise<CoverageSnapshot | null>;
  upsertCoverageSnapshot(snapshot: CoverageSnapshot): Promise<CoverageSnapshot>;
}

export function createCaptureCoverageService(repository: CaptureCoverageRepository) {
  return {
    async latest(input: { workspaceId: string; projectId: string }): Promise<CoverageSnapshot | null> {
      const snapshot = await repository.getLatestCoverageSnapshot(input);
      if (snapshot && (snapshot.workspaceId !== input.workspaceId || snapshot.projectId !== input.projectId)) throw new Error("Coverage snapshot was not found.");
      return snapshot;
    },
    async persist(input: { workspaceId: string; projectId: string; snapshot: CoverageSnapshot }): Promise<CoverageSnapshot> {
      if (input.snapshot.workspaceId !== input.workspaceId || input.snapshot.projectId !== input.projectId) throw new Error("Coverage snapshot was not found.");
      return repository.upsertCoverageSnapshot(input.snapshot);
    }
  };
}

export type CaptureCoverageService = ReturnType<typeof createCaptureCoverageService>;
