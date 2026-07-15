import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { failJob, startJob, succeedJob } from "../shared/jobState";
import type { FlowExecutionRecord } from "../shared/productFlowCapture";
import type { ArtifactRecord, JobRecord, RecordingMetadata } from "../shared/types";
import type { PrivateObjectStorage } from "./storage";
import { assembleNormalizedCaptures } from "./captureMedia";
import type { CaptureAuditSink } from "./captureAudit";

export interface CaptureAssemblyWorkerRepository {
  getJobRequest(input: { workspaceId: string; jobId: string }): Promise<{ job: JobRecord; inputJson: Record<string, unknown> } | null>;
  upsertJob(input: { workspaceId: string; job: JobRecord; stage: string; resultJson?: Record<string, unknown> }): Promise<JobRecord>;
  getFlowExecution(input: { workspaceId: string; executionId: string }): Promise<FlowExecutionRecord | null>;
  getArtifact(input: { workspaceId: string; artifactId: string }): Promise<ArtifactRecord | null>;
  upsertArtifact(artifact: ArtifactRecord): Promise<ArtifactRecord>;
}
export interface AssemblyArtifactMaterializer { materialize(input: { artifact: ArtifactRecord; workDir: string }): Promise<{ path: string; durationMs: number }> }
export interface CaptureAssemblyActivator { activate(input: { workspaceId: string; projectId: string; actorUserId: string; captureRunId: string; sourceArtifact: ArtifactRecord; manifestArtifact: ArtifactRecord; recording: RecordingMetadata }): Promise<void> }

export function createCaptureAssemblyWorker(options: { repository: CaptureAssemblyWorkerRepository; materializer: AssemblyArtifactMaterializer; storage: PrivateObjectStorage; activator: CaptureAssemblyActivator; audit?: CaptureAuditSink; assemble?: typeof assembleNormalizedCaptures; ffmpegPath?: string; workRoot?: string; now?: () => string }) {
  const now = options.now ?? (() => new Date().toISOString());
  const assemble = options.assemble ?? assembleNormalizedCaptures;
  return {
    async execute(input: { workspaceId: string; projectId: string; captureRunId: string; jobId: string }) {
      const request = await options.repository.getJobRequest({ workspaceId: input.workspaceId, jobId: input.jobId });
      if (!request || request.job.kind !== "capture_assembly" || request.job.projectId !== input.projectId || request.inputJson.captureRunId !== input.captureRunId) throw new Error("Capture assembly job was not found.");
      if (request.job.status === "succeeded") return request.job;
      const executionIds = parseIds(request.inputJson.executionIds);
      const actorUserId = parseId(request.inputJson.actorUserId, "assembly actor");
      const running = request.job.status === "queued" ? startJob(request.job, now(), "Assembling selected product clips.") : request.job;
      await options.repository.upsertJob({ workspaceId: input.workspaceId, job: running, stage: "assembly" });
      const root = await fs.mkdtemp(path.join(options.workRoot ?? os.tmpdir(), `gideon-assembly-${input.jobId}-`));
      try {
        const clips = [];
        for (const executionId of executionIds) {
          const execution = await options.repository.getFlowExecution({ workspaceId: input.workspaceId, executionId });
          if (!execution || execution.projectId !== input.projectId || execution.captureRunId !== input.captureRunId || execution.status !== "verified" || !execution.normalizedClipArtifactId) throw new Error("Verified capture clip was not found.");
          const artifact = await options.repository.getArtifact({ workspaceId: input.workspaceId, artifactId: execution.normalizedClipArtifactId });
          if (!artifact || artifact.projectId !== input.projectId || artifact.kind !== "normalized_flow_clip") throw new Error("Verified capture clip was not found.");
          const materialized = await options.materializer.materialize({ artifact, workDir: root });
          clips.push({ path: materialized.path, executionId, artifactId: artifact.id, sha256: artifact.sha256, durationMs: materialized.durationMs });
        }
        const assembled = await assemble({ captureRunId: input.captureRunId, clips, outputPath: path.join(root, "assembled-source.mp4"), ffmpegPath: options.ffmpegPath, now });
        const sourceArtifact = (await options.storage.putFile({ workspaceId: input.workspaceId, projectId: input.projectId, kind: "source_recording", sourcePath: assembled.outputPath, originalFileName: `gideon-capture-${input.captureRunId}.mp4`, contentType: "video/mp4" })).artifact;
        await options.repository.upsertArtifact(sourceArtifact);
        const manifestPath = path.join(root, "assembly-manifest.json");
        await fs.writeFile(manifestPath, JSON.stringify(assembled.manifest), { encoding: "utf8", mode: 0o600 });
        const manifestArtifact = (await options.storage.putFile({ workspaceId: input.workspaceId, projectId: input.projectId, kind: "capture_assembly_manifest", sourcePath: manifestPath, originalFileName: `${input.jobId}-assembly.json`, contentType: "application/json" })).artifact;
        await options.repository.upsertArtifact(manifestArtifact);
        await options.activator.activate({ workspaceId: input.workspaceId, projectId: input.projectId, actorUserId, captureRunId: input.captureRunId, sourceArtifact, manifestArtifact, recording: assembled.recording });
        const succeeded = succeedJob(running, now(), "Selected product clips are now the active source recording.");
        await options.repository.upsertJob({ workspaceId: input.workspaceId, job: succeeded, stage: "finalize", resultJson: { captureRunId: input.captureRunId, sourceArtifactId: sourceArtifact.id, manifestArtifactId: manifestArtifact.id, clipCount: clips.length } });
        await options.audit?.record({ workspaceId: input.workspaceId, projectId: input.projectId, actorUserId, actorType: "local_user", action: "capture_assembly.activate", targetType: "recording", targetId: sourceArtifact.id, metadata: { capture_run_id: input.captureRunId, clip_count: clips.length, manifest_artifact_id: manifestArtifact.id } });
        return succeeded;
      } catch {
        const failed = failJob(running, now(), "Selected product clips could not be assembled safely.");
        await options.repository.upsertJob({ workspaceId: input.workspaceId, job: failed, stage: "assembly" });
        throw new Error("Selected product clips could not be assembled safely.");
      } finally { await fs.rm(root, { recursive: true, force: true }).catch(() => undefined); }
    }
  };
}

function parseIds(value: unknown) { if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Stored assembly selection is invalid."); const ids = value.map((item) => parseId(item, "execution")); if (new Set(ids).size !== ids.length) throw new Error("Stored assembly selection is invalid."); return ids; }
function parseId(value: unknown, label: string) { if (typeof value !== "string" || !/^[A-Za-z0-9._:@-]{1,200}$/.test(value)) throw new Error(`Stored ${label} identifier is invalid.`); return value; }
