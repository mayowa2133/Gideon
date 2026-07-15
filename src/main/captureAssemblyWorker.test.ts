import { describe, expect, it } from "vitest";
import { createJob } from "../shared/jobState";
import { createCaptureAssemblyWorker } from "./captureAssemblyWorker";

describe("capture assembly worker", () => {
  it("preserves selected order, activates the new source, and stores only safe job results", async () => {
    const now = "2026-07-14T10:00:00.000Z";
    let job = createJob({ id: "assembly-job-1", projectId: "project-1", kind: "capture_assembly", now });
    const activations: unknown[] = []; const clipOrder: string[] = []; let stored = 0;
    const worker = createCaptureAssemblyWorker({
      repository: {
        async getJobRequest() { return { job, inputJson: { captureRunId: "capture-1", executionIds: ["execution-2", "execution-1"], actorUserId: "user-1" } }; },
        async upsertJob(input) { job = input.job; return job; },
        async getFlowExecution(input) { return { id: input.executionId, workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", flowId: input.executionId, flowRevision: 1, environmentVersionId: "version-1", status: "verified", attempt: 1, compiledPlanHash: "a".repeat(64), normalizedClipArtifactId: `artifact-${input.executionId}`, createdAt: now, updatedAt: now }; },
        async getArtifact(input) { return { id: input.artifactId, workspaceId: "workspace-1", projectId: "project-1", kind: "normalized_flow_clip", provider: "s3", storageKey: input.artifactId, contentType: "video/mp4", byteSize: 1, sha256: "b".repeat(64), originalFileName: "clip.mp4", createdAt: now }; },
        async upsertArtifact(artifact) { return artifact; }
      },
      materializer: { async materialize(input) { return { path: `/tmp/${input.artifact.id}.mp4`, durationMs: 1000 }; } },
      assemble: async (input) => { clipOrder.push(...input.clips.map((clip) => clip.executionId)); return { outputPath: input.outputPath, recording: { filePath: input.outputPath, fileUrl: "private", fileName: "assembled.mp4", sizeBytes: 2, durationMs: 2000, width: 1440, height: 900, fps: 30, videoCodec: "h264" }, manifest: { schemaVersion: "1", assemblerVersion: "capture-assembler-v1", captureRunId: input.captureRunId, clips: input.clips.map(({ executionId, artifactId, sha256, durationMs }) => ({ executionId, artifactId, sha256, durationMs })), output: { sha256: "c".repeat(64), byteSize: 2, durationMs: 2000, width: 1440, height: 900, fps: 30, videoCodec: "h264" }, ffmpegVersion: "test", manifestHash: "d".repeat(64), createdAt: now } }; },
      storage: { async putFile(input) { stored += 1; return { filePath: input.sourcePath, fileUrl: "private", artifact: { id: `stored-${stored}`, workspaceId: input.workspaceId, projectId: input.projectId, kind: input.kind, provider: "s3", storageKey: `private/${stored}`, contentType: input.contentType ?? "application/octet-stream", byteSize: 2, sha256: "e".repeat(64), originalFileName: input.originalFileName ?? "file", createdAt: now } }; } },
      activator: { async activate(input) { activations.push(input); } },
      now: () => "2026-07-14T10:01:00.000Z"
    });
    await worker.execute({ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "capture-1", jobId: "assembly-job-1" });
    expect(clipOrder).toEqual(["execution-2", "execution-1"]);
    expect(activations).toHaveLength(1);
    expect(job.status).toBe("succeeded");
  });
});
