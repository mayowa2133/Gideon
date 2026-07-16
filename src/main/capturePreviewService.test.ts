import { describe, expect, it } from "vitest";
import { createCapturePreviewService } from "./capturePreviewService";

describe("capture preview service", () => {
  it("mints a short-lived URL only for an authorized verified normalized clip", async () => {
    const now = "2026-07-14T10:00:00.000Z";
    const service = createCapturePreviewService({ repository: { async getFlowExecution() { return { id: "execution-1", workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", flowId: "flow-1", flowRevision: 1, environmentVersionId: "version-1", status: "verified", attempt: 1, compiledPlanHash: "a".repeat(64), normalizedClipArtifactId: "artifact-1", createdAt: now, updatedAt: now }; }, async getArtifact() { return { id: "artifact-1", workspaceId: "workspace-1", projectId: "project-1", kind: "normalized_flow_clip", provider: "s3", storageKey: "private/key.mp4", contentType: "video/mp4", byteSize: 100, sha256: "b".repeat(64), originalFileName: "clip.mp4", createdAt: now }; } }, signer: { async sign(input) { expect(input.expiresInSeconds).toBe(300); return { url: "https://signed.example.test/clip", expiresAt: "2026-07-14T10:05:00.000Z" }; } } });
    await expect(service.create({ workspaceId: "workspace-1", projectId: "wrong-project", executionId: "execution-1" })).rejects.toThrow("not found");
    await expect(service.create({ workspaceId: "workspace-1", projectId: "project-1", executionId: "execution-1" })).resolves.toMatchObject({ artifactId: "artifact-1", url: "https://signed.example.test/clip" });
  });

  it("rejects repository records that do not match the authorized workspace", async () => {
    const now = "2026-07-14T10:00:00.000Z";
    const execution = { id: "execution-1", workspaceId: "workspace-other", projectId: "project-1", captureRunId: "capture-1", flowId: "flow-1", flowRevision: 1, environmentVersionId: "version-1", status: "verified" as const, attempt: 1, compiledPlanHash: "a".repeat(64), normalizedClipArtifactId: "artifact-1", createdAt: now, updatedAt: now };
    const service = createCapturePreviewService({ repository: { async getFlowExecution() { return execution; }, async getArtifact() { throw new Error("must not read artifact"); } }, signer: { async sign() { throw new Error("must not sign"); } } });
    await expect(service.create({ workspaceId: "workspace-1", projectId: "project-1", executionId: "execution-1" })).rejects.toThrow("not found");
  });
});
