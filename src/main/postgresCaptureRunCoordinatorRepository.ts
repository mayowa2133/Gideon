import { Pool, type PoolClient } from "pg";
import type { CaptureRunCoordinatorRepository } from "./captureRunCoordinator";
import { PostgresCaptureRepository } from "./postgresCaptureRepository";
import { PostgresJobArtifactRepository } from "./postgresJobArtifactRepository";

/**
 * Transactional adapter used by capture-run creation. Reads remain workspace-scoped;
 * creation commits the generic job and capture run together or rolls both back.
 */
export class PostgresCaptureRunCoordinatorRepository implements CaptureRunCoordinatorRepository {
  private readonly captures: PostgresCaptureRepository;

  constructor(private readonly pool: Pool) {
    this.captures = new PostgresCaptureRepository(queryFrom(pool));
  }

  getEnvironment(input: Parameters<CaptureRunCoordinatorRepository["getEnvironment"]>[0]) {
    return this.captures.getEnvironment(input);
  }

  getEnvironmentVersion(input: Parameters<CaptureRunCoordinatorRepository["getEnvironmentVersion"]>[0]) {
    return this.captures.getEnvironmentVersion(input);
  }

  getFlow(input: Parameters<CaptureRunCoordinatorRepository["getFlow"]>[0]) {
    return this.captures.getFlow(input);
  }

  getCaptureRunByIdempotency(input: Parameters<CaptureRunCoordinatorRepository["getCaptureRunByIdempotency"]>[0]) {
    return this.captures.getCaptureRunByIdempotency(input);
  }

  async persistCaptureRunAndJob(input: Parameters<CaptureRunCoordinatorRepository["persistCaptureRunAndJob"]>[0]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const query = queryFrom(client);
      const captures = new PostgresCaptureRepository(query);
      const jobs = new PostgresJobArtifactRepository(query);
      await jobs.upsertJob({
        workspaceId: input.workspaceId,
        job: input.job,
        queueName: "capture",
        stage: "queued",
        idempotencyKey: input.captureRun.idempotencyKey,
        inputJson: input.safeInput
      });
      await captures.upsertCaptureRun(input.captureRun);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresCaptureRunCoordinatorRepositoryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PostgresCaptureRunCoordinatorRepository {
  const connectionString = env.GIDEON_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("PostgreSQL capture coordinator requires GIDEON_DATABASE_URL or DATABASE_URL.");
  return new PostgresCaptureRunCoordinatorRepository(
    new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
  );
}

function queryFrom(source: Pool | PoolClient) {
  return async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
    const result = await source.query(text, values ? [...values] : undefined);
    return { rows: result.rows as Row[] };
  };
}
