import { Pool, type PoolClient } from "pg";
import type { CaptureAssemblyCoordinatorRepository } from "./captureAssemblyCoordinator";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";
import type { PostgresQuery } from "./persistence";

export class PostgresCaptureAssemblyCoordinatorRepository implements CaptureAssemblyCoordinatorRepository {
  private readonly captures: PostgresCaptureRepository; private readonly jobs: PostgresJobArtifactRepository;
  constructor(private readonly pool: Pool) { const query = queryFrom(pool); this.captures = new PostgresCaptureRepository(query); this.jobs = new PostgresJobArtifactRepository(query); }
  getCaptureRun(input: Parameters<CaptureAssemblyCoordinatorRepository["getCaptureRun"]>[0]) { return this.captures.getCaptureRun(input); }
  listCaptureRunExecutions(input: Parameters<CaptureAssemblyCoordinatorRepository["listCaptureRunExecutions"]>[0]) { return this.captures.listCaptureRunExecutions(input); }
  async getIdempotentAssembly(input: Parameters<CaptureAssemblyCoordinatorRepository["getIdempotentAssembly"]>[0]) { const found = await this.jobs.getJobByIdempotency({ ...input, kind: "capture_assembly" }); const requestHash = found?.inputJson.requestHash; return found && typeof requestHash === "string" ? { job: found.job, requestHash } : null; }
  async persistAssemblyJob(input: Parameters<CaptureAssemblyCoordinatorRepository["persistAssemblyJob"]>[0]) { const client = await this.pool.connect(); try { await client.query("begin"); await new PostgresJobArtifactRepository(queryFrom(client)).upsertJob({ workspaceId: input.workspaceId, job: input.job, queueName: "capture", stage: "queued", idempotencyKey: input.idempotencyKey, inputJson: { captureRunId: input.captureRunId, executionIds: input.executionIds, actorUserId: input.actorUserId, requestHash: input.requestHash } }); await client.query("commit"); } catch (error) { await client.query("rollback").catch(() => undefined); throw error; } finally { client.release(); } }
}
function queryFrom(source: Pool | PoolClient): PostgresQuery { return async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => { const result = await source.query(text, values ? [...values] : undefined); return { rows: result.rows as Row[] }; }; }
