import type { ArtifactRecord, JobRecord } from "../shared/types";
import type { CaptureEnvironment, CaptureRun, DiscoveryRun, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import type { PostgresQuery } from "./persistence";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";

export class PostgresCaptureWorkerRepository {
  private readonly captures: PostgresCaptureRepository;
  private readonly jobs: PostgresJobArtifactRepository;
  constructor(query: PostgresQuery) { this.captures = new PostgresCaptureRepository(query); this.jobs = new PostgresJobArtifactRepository(query); }
  getCaptureRun(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRun | null> { return this.captures.getCaptureRun(input); }
  upsertCaptureRun(run: CaptureRun): Promise<CaptureRun> { return this.captures.upsertCaptureRun(run); }
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }) { return this.captures.getEnvironmentVersion(input); }
  getEnvironment(input: { workspaceId: string; environmentId: string }) { return this.captures.getEnvironment(input); }
  upsertEnvironment(environment: CaptureEnvironment) { return this.captures.upsertEnvironment(environment); }
  getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null> { return this.captures.getFlow(input); }
  getPersona(input: { workspaceId: string; personaId: string }) { return this.captures.getPersona(input); }
  upsertFlowExecution(execution: FlowExecutionRecord) { return this.captures.upsertFlowExecution(execution); }
  getFlowExecution(input: { workspaceId: string; executionId: string }) { return this.captures.getFlowExecution(input); }
  getDiscoveryRun(input: { workspaceId: string; discoveryRunId: string }): Promise<DiscoveryRun | null> { return this.captures.getDiscoveryRun(input); }
  upsertDiscoveryRun(run: DiscoveryRun) { return this.captures.upsertDiscoveryRun(run); }
  upsertArtifact(artifact: ArtifactRecord) { return this.jobs.upsertArtifact(artifact); }
  getArtifact(input: { workspaceId: string; artifactId: string }) { return this.jobs.getArtifact(input); }
  getJob(input: { workspaceId: string; jobId: string }) { return this.jobs.getJob(input); }
  getJobRequest(input: { workspaceId: string; jobId: string }) { return this.jobs.getJobRequest(input); }
  upsertJob(input: { workspaceId: string; job: JobRecord; stage: string; resultJson?: Record<string, unknown> }) { return this.jobs.upsertJob({ ...input, queueName: "capture" }); }
}
