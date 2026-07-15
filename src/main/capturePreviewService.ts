import type { FlowExecutionRecord } from "../shared/productFlowCapture";
import type { ArtifactRecord } from "../shared/types";

export interface CapturePreviewRepository {
  getFlowExecution(input: { workspaceId: string; executionId: string }): Promise<FlowExecutionRecord | null>;
  getArtifact(input: { workspaceId: string; artifactId: string }): Promise<ArtifactRecord | null>;
}
export interface CapturePreviewSigner { sign(input: { artifact: ArtifactRecord; expiresInSeconds: number }): Promise<{ url: string; expiresAt: string }> }

export function createCapturePreviewService(options: { repository: CapturePreviewRepository; signer: CapturePreviewSigner; expiresInSeconds?: number }) {
  const expiresInSeconds = Math.max(60, Math.min(600, options.expiresInSeconds ?? 300));
  return {
    async create(input: { workspaceId: string; projectId: string; executionId: string }) {
      const execution = await options.repository.getFlowExecution({ workspaceId: input.workspaceId, executionId: input.executionId });
      if (!execution || execution.projectId !== input.projectId || execution.status !== "verified" || !execution.normalizedClipArtifactId) throw new Error("Verified capture clip was not found.");
      const artifact = await options.repository.getArtifact({ workspaceId: input.workspaceId, artifactId: execution.normalizedClipArtifactId });
      if (!artifact || artifact.projectId !== input.projectId || artifact.kind !== "normalized_flow_clip") throw new Error("Verified capture clip was not found.");
      const signed = await options.signer.sign({ artifact, expiresInSeconds });
      return { executionId: execution.id, artifactId: artifact.id, contentType: artifact.contentType, ...signed };
    }
  };
}
export type CapturePreviewService = ReturnType<typeof createCapturePreviewService>;
