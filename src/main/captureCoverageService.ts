import type { CoverageRevisionBasis, CoverageSnapshot } from "../shared/productFlowCapture";
import { assessCoverageFreshness } from "./captureCoverageInventory";

export interface CaptureCoverageRepository {
  getLatestCoverageSnapshot(input: { workspaceId: string; projectId: string }): Promise<CoverageSnapshot | null>;
  upsertCoverageSnapshot(snapshot: CoverageSnapshot): Promise<CoverageSnapshot>;
}

export interface CaptureCoverageRevisionSource {
  getCurrentCoverageBasis(input: { workspaceId: string; projectId: string }): Promise<CoverageRevisionBasis | null>;
}

export function createCaptureCoverageService(repository: CaptureCoverageRepository, options: { revisionSource?: CaptureCoverageRevisionSource; now?: () => string } = {}) {
  return {
    async latest(input: { workspaceId: string; projectId: string }): Promise<CoverageSnapshot | null> {
      const snapshot = await repository.getLatestCoverageSnapshot(input);
      if (snapshot && (snapshot.workspaceId !== input.workspaceId || snapshot.projectId !== input.projectId)) throw new Error("Coverage snapshot was not found.");
      if (!snapshot) return null;
      const current = options.revisionSource ? await options.revisionSource.getCurrentCoverageBasis(input) : null;
      return { ...snapshot, freshness: assessCoverageFreshness(snapshot, current, options.now) };
    },
    async persist(input: { workspaceId: string; projectId: string; snapshot: CoverageSnapshot }): Promise<CoverageSnapshot> {
      if (input.snapshot.workspaceId !== input.workspaceId || input.snapshot.projectId !== input.projectId) throw new Error("Coverage snapshot was not found.");
      if (input.snapshot.calculationVersion === "capture-coverage-v2" && (!input.snapshot.basis || input.snapshot.basis.environmentVersionId !== input.snapshot.environmentVersionId)) throw new Error("Coverage snapshot revision basis is invalid.");
      return repository.upsertCoverageSnapshot(input.snapshot);
    }
  };
}

export type CaptureCoverageService = ReturnType<typeof createCaptureCoverageService>;
