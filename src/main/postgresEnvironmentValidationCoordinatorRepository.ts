import { Pool, type PoolClient } from "pg";
import type { EnvironmentValidationCoordinatorRepository } from "./environmentValidationCoordinator";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";
import type { PostgresQuery } from "./persistence";

export class PostgresEnvironmentValidationCoordinatorRepository implements EnvironmentValidationCoordinatorRepository {
  private readonly captures: PostgresCaptureRepository;
  private readonly jobs: PostgresJobArtifactRepository;

  constructor(private readonly pool: Pool) {
    const query = queryFrom(pool);
    this.captures = new PostgresCaptureRepository(query);
    this.jobs = new PostgresJobArtifactRepository(query);
  }

  getEnvironment(input: Parameters<EnvironmentValidationCoordinatorRepository["getEnvironment"]>[0]) { return this.captures.getEnvironment(input); }

  async getIdempotentEnvironmentValidation(input: Parameters<EnvironmentValidationCoordinatorRepository["getIdempotentEnvironmentValidation"]>[0]) {
    const result = await this.jobs.getJobByIdempotency({ ...input, kind: "environment_validation" });
    const requestHash = result?.inputJson.requestHash;
    return result && typeof requestHash === "string" ? { job: result.job, requestHash } : null;
  }

  async persistEnvironmentValidationJob(input: Parameters<EnvironmentValidationCoordinatorRepository["persistEnvironmentValidationJob"]>[0]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const query = queryFrom(client);
      await new PostgresCaptureRepository(query).upsertEnvironment(input.environment);
      await new PostgresJobArtifactRepository(query).upsertJob({ workspaceId: input.workspaceId, job: input.job, queueName: "capture", stage: "queued", idempotencyKey: input.idempotencyKey, inputJson: { environmentId: input.environment.id, requestHash: input.requestHash } });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

function queryFrom(source: Pool | PoolClient): PostgresQuery {
  return async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
    const result = await source.query(text, values ? [...values] : undefined);
    return { rows: result.rows as Row[] };
  };
}
