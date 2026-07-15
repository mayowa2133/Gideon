import { Pool, type PoolClient } from "pg";
import type { DiscoveryRunCoordinatorRepository } from "./discoveryRunCoordinator";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";
import type { PostgresQuery } from "./persistence";

export class PostgresDiscoveryRunCoordinatorRepository implements DiscoveryRunCoordinatorRepository {
  private readonly captures: PostgresCaptureRepository;
  private readonly jobs: PostgresJobArtifactRepository;
  constructor(private readonly pool: Pool) { const query = queryFrom(pool); this.captures = new PostgresCaptureRepository(query); this.jobs = new PostgresJobArtifactRepository(query); }
  getEnvironment(input: Parameters<DiscoveryRunCoordinatorRepository["getEnvironment"]>[0]) { return this.captures.getEnvironment(input); }
  listProjectPersonas(input: Parameters<DiscoveryRunCoordinatorRepository["listProjectPersonas"]>[0]) { return this.captures.listProjectPersonas(input); }
  async getIdempotentDiscovery(input: Parameters<DiscoveryRunCoordinatorRepository["getIdempotentDiscovery"]>[0]) {
    const result = await this.jobs.getJobByIdempotency({ ...input, kind: "flow_discovery" });
    const requestHash = result?.inputJson.requestHash;
    const discoveryRunId = result?.inputJson.discoveryRunId;
    if (!result || typeof requestHash !== "string" || typeof discoveryRunId !== "string") return null;
    const run = await this.captures.getDiscoveryRun({ workspaceId: input.workspaceId, discoveryRunId });
    return run ? { run, job: result.job, requestHash } : null;
  }
  async persistDiscoveryJob(input: Parameters<DiscoveryRunCoordinatorRepository["persistDiscoveryJob"]>[0]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const query = queryFrom(client);
      await new PostgresCaptureRepository(query).upsertDiscoveryRun(input.run);
      await new PostgresJobArtifactRepository(query).upsertJob({ workspaceId: input.workspaceId, job: input.job, queueName: "capture", stage: "queued", idempotencyKey: input.idempotencyKey, inputJson: { discoveryRunId: input.run.id, environmentVersionId: input.run.environmentVersionId, goals: input.goals, maxCandidates: input.maxCandidates, requestHash: input.requestHash } });
      await client.query("commit");
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}

function queryFrom(source: Pool | PoolClient): PostgresQuery { return async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => { const result = await source.query(text, values ? [...values] : undefined); return { rows: result.rows as Row[] }; }; }
