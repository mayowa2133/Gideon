import { Pool } from "pg";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CapturePersona,
  CaptureRun,
  CoverageSnapshot,
  DiscoveryRun,
  FlowExecutionRecord,
  ProductFlowRevision
} from "../shared/productFlowCapture";
import type { PostgresQuery } from "./persistence";

interface JsonRecordRow<T> {
  record_json: T | string;
}

export class PostgresCaptureRepository {
  constructor(
    private readonly query: PostgresQuery,
    private readonly closeClient?: () => Promise<void> | void
  ) {}

  async upsertEnvironment(environment: CaptureEnvironment): Promise<CaptureEnvironment> {
    return this.upsertRecord<CaptureEnvironment>(
      `insert into gideon_capture_environments (
         id, workspace_id, project_id, name, environment_type, status, revision,
         current_version_id, record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       on conflict (id) do update set
         workspace_id=excluded.workspace_id, project_id=excluded.project_id, name=excluded.name,
         environment_type=excluded.environment_type, status=excluded.status, revision=excluded.revision,
         current_version_id=excluded.current_version_id, record_json=excluded.record_json,
         updated_at=excluded.updated_at
       where gideon_capture_environments.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        environment.id,
        environment.workspaceId,
        environment.projectId,
        environment.name,
        environment.type,
        environment.status,
        environment.revision,
        environment.currentVersionId ?? null,
        JSON.stringify(environment),
        environment.createdAt,
        environment.updatedAt
      ],
      "capture environment"
    );
  }

  async getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null> {
    return this.getRecord<CaptureEnvironment>(
      "select record_json from gideon_capture_environments where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.environmentId],
      "capture environment"
    );
  }

  async listProjectEnvironments(input: {
    workspaceId: string;
    projectId: string;
    limit?: number;
  }): Promise<CaptureEnvironment[]> {
    return this.listRecords<CaptureEnvironment>(
      `select record_json from gideon_capture_environments
       where workspace_id=$1 and project_id=$2 order by updated_at desc limit $3`,
      [input.workspaceId, input.projectId, clampLimit(input.limit)],
      "capture environment"
    );
  }

  async upsertEnvironmentVersion(version: CaptureEnvironmentVersion): Promise<CaptureEnvironmentVersion> {
    return this.upsertRecord<CaptureEnvironmentVersion>(
      `insert into gideon_capture_environment_versions (
         id, workspace_id, project_id, environment_id, revision, application_fingerprint,
         browser_policy_fingerprint, record_json, validated_at, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       on conflict (id) do update set record_json=excluded.record_json
       where gideon_capture_environment_versions.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        version.id,
        version.workspaceId,
        version.projectId,
        version.environmentId,
        version.revision,
        version.applicationFingerprint,
        version.browserPolicyFingerprint,
        JSON.stringify(version),
        version.validatedAt,
        version.createdAt
      ],
      "capture environment version"
    );
  }

  async getEnvironmentVersion(input: {
    workspaceId: string;
    versionId: string;
  }): Promise<CaptureEnvironmentVersion | null> {
    return this.getRecord<CaptureEnvironmentVersion>(
      "select record_json from gideon_capture_environment_versions where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.versionId],
      "capture environment version"
    );
  }

  async upsertPersona(persona: CapturePersona): Promise<CapturePersona> {
    return this.upsertRecord<CapturePersona>(
      `insert into gideon_capture_personas (
         id, workspace_id, project_id, environment_id, persona_key, status, revision,
         credential_grant_id, record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       on conflict (id) do update set
         workspace_id=excluded.workspace_id, project_id=excluded.project_id,
         environment_id=excluded.environment_id, persona_key=excluded.persona_key,
         status=excluded.status, revision=excluded.revision,
         credential_grant_id=excluded.credential_grant_id, record_json=excluded.record_json,
         updated_at=excluded.updated_at
       where gideon_capture_personas.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        persona.id,
        persona.workspaceId,
        persona.projectId,
        persona.environmentId,
        persona.key,
        persona.status,
        persona.revision,
        persona.credentialGrantId ?? null,
        JSON.stringify(persona),
        persona.createdAt,
        persona.updatedAt
      ],
      "capture persona"
    );
  }

  async listProjectPersonas(input: {
    workspaceId: string;
    projectId: string;
    limit?: number;
  }): Promise<CapturePersona[]> {
    return this.listRecords<CapturePersona>(
      `select record_json from gideon_capture_personas
       where workspace_id=$1 and project_id=$2 order by updated_at desc limit $3`,
      [input.workspaceId, input.projectId, clampLimit(input.limit)],
      "capture persona"
    );
  }

  async getPersona(input: { workspaceId: string; personaId: string }): Promise<CapturePersona | null> {
    return this.getRecord<CapturePersona>(
      "select record_json from gideon_capture_personas where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.personaId],
      "capture persona"
    );
  }

  async upsertDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun> {
    return this.upsertRecord<DiscoveryRun>(
      `insert into gideon_discovery_runs (
         id, workspace_id, project_id, environment_version_id, job_id, status,
         provider, model, prompt_version, record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
       on conflict (id) do update set
         status=excluded.status, provider=excluded.provider, model=excluded.model,
         prompt_version=excluded.prompt_version, record_json=excluded.record_json,
         updated_at=excluded.updated_at
       where gideon_discovery_runs.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        run.id,
        run.workspaceId,
        run.projectId,
        run.environmentVersionId,
        run.jobId,
        run.status,
        run.provider ?? null,
        run.model ?? null,
        run.promptVersion,
        JSON.stringify(run),
        run.createdAt,
        run.updatedAt
      ],
      "discovery run"
    );
  }

  async getDiscoveryRun(input: { workspaceId: string; discoveryRunId: string }): Promise<DiscoveryRun | null> {
    return this.getRecord<DiscoveryRun>(
      "select record_json from gideon_discovery_runs where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.discoveryRunId],
      "discovery run"
    );
  }

  async upsertFlowRevision(input: {
    workspaceId: string;
    environmentId: string;
    flow: ProductFlowRevision;
    createdAt: string;
  }): Promise<ProductFlowRevision> {
    if (input.flow.projectId.length < 1 || input.workspaceId.length < 1) throw new Error("Flow ownership is required.");
    const revisionId = `${input.flow.id}:revision:${input.flow.revision}`;
    const immutableRevision = await this.upsertRecord<ProductFlowRevision>(
      `insert into gideon_product_flow_revisions (
         id, workspace_id, project_id, flow_id, revision, environment_version_id,
         persona_id, approval_status, record_json, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       on conflict (workspace_id, flow_id, revision) do update
         set record_json=gideon_product_flow_revisions.record_json
       returning record_json`,
      [
        revisionId,
        input.workspaceId,
        input.flow.projectId,
        input.flow.id,
        input.flow.revision,
        input.flow.environmentVersionId,
        input.flow.personaId,
        input.flow.approval.status,
        JSON.stringify(input.flow),
        input.createdAt
      ],
      "product flow revision"
    );
    if (JSON.stringify(immutableRevision) !== JSON.stringify(input.flow)) {
      throw new Error("Product flow revision is immutable.");
    }
    return this.upsertRecord<ProductFlowRevision>(
      `insert into gideon_product_flows (
         id, workspace_id, project_id, environment_id, persona_id, current_revision,
         approval_status, title, record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$10)
       on conflict (id) do update set
         environment_id=excluded.environment_id, persona_id=excluded.persona_id,
         current_revision=excluded.current_revision, approval_status=excluded.approval_status,
         title=excluded.title, record_json=excluded.record_json, updated_at=excluded.updated_at
       where gideon_product_flows.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        input.flow.id,
        input.workspaceId,
        input.flow.projectId,
        input.environmentId,
        input.flow.personaId,
        input.flow.revision,
        input.flow.approval.status,
        input.flow.title,
        JSON.stringify(input.flow),
        input.createdAt
      ],
      "product flow"
    );
  }

  async getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null> {
    return this.getRecord<ProductFlowRevision>(
      "select record_json from gideon_product_flows where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.flowId],
      "product flow"
    );
  }

  async listProjectFlows(input: {
    workspaceId: string;
    projectId: string;
    limit?: number;
  }): Promise<ProductFlowRevision[]> {
    return this.listRecords<ProductFlowRevision>(
      `select record_json from gideon_product_flows
       where workspace_id=$1 and project_id=$2 order by updated_at desc limit $3`,
      [input.workspaceId, input.projectId, clampLimit(input.limit)],
      "product flow"
    );
  }

  async upsertCaptureRun(run: CaptureRun): Promise<CaptureRun> {
    return this.upsertRecord<CaptureRun>(
      `insert into gideon_capture_runs (
         id, workspace_id, project_id, environment_version_id, job_id, status,
         policy_fingerprint, idempotency_key, request_hash, estimated_browser_seconds, record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
       on conflict (id) do update set
         status=excluded.status, policy_fingerprint=excluded.policy_fingerprint,
         record_json=excluded.record_json, updated_at=excluded.updated_at
       where gideon_capture_runs.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        run.id,
        run.workspaceId,
        run.projectId,
        run.environmentVersionId,
        run.jobId,
        run.status,
        run.policyFingerprint,
        run.idempotencyKey,
        run.requestHash,
        run.estimatedBrowserSeconds,
        JSON.stringify(run),
        run.createdAt,
        run.updatedAt
      ],
      "capture run"
    );
  }

  async getCaptureRun(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRun | null> {
    return this.getRecord<CaptureRun>(
      "select record_json from gideon_capture_runs where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.captureRunId],
      "capture run"
    );
  }

  async getCaptureRunByIdempotency(input: {
    workspaceId: string;
    idempotencyKey: string;
  }): Promise<CaptureRun | null> {
    return this.getRecord<CaptureRun>(
      "select record_json from gideon_capture_runs where workspace_id=$1 and idempotency_key=$2 limit 1",
      [input.workspaceId, input.idempotencyKey],
      "capture run"
    );
  }

  async upsertFlowExecution(execution: FlowExecutionRecord): Promise<FlowExecutionRecord> {
    return this.upsertRecord<FlowExecutionRecord>(
      `insert into gideon_flow_executions (
         id, workspace_id, project_id, capture_run_id, flow_id, flow_revision,
         environment_version_id, status, attempt, compiled_plan_hash,
         record_json, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
       on conflict (id) do update set
         status=excluded.status, attempt=excluded.attempt, compiled_plan_hash=excluded.compiled_plan_hash,
         record_json=excluded.record_json, updated_at=excluded.updated_at
       where gideon_flow_executions.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        execution.id,
        execution.workspaceId,
        execution.projectId,
        execution.captureRunId,
        execution.flowId,
        execution.flowRevision,
        execution.environmentVersionId,
        execution.status,
        execution.attempt,
        execution.compiledPlanHash,
        JSON.stringify(execution),
        execution.createdAt,
        execution.updatedAt
      ],
      "flow execution"
    );
  }

  async listCaptureRunExecutions(input: {
    workspaceId: string;
    captureRunId: string;
    limit?: number;
  }): Promise<FlowExecutionRecord[]> {
    return this.listRecords<FlowExecutionRecord>(
      `select record_json from gideon_flow_executions
       where workspace_id=$1 and capture_run_id=$2 order by created_at asc limit $3`,
      [input.workspaceId, input.captureRunId, clampLimit(input.limit)],
      "flow execution"
    );
  }

  async getFlowExecution(input: { workspaceId: string; executionId: string }): Promise<FlowExecutionRecord | null> {
    return this.getRecord<FlowExecutionRecord>(
      "select record_json from gideon_flow_executions where workspace_id=$1 and id=$2 limit 1",
      [input.workspaceId, input.executionId],
      "flow execution"
    );
  }

  async upsertCoverageSnapshot(snapshot: CoverageSnapshot): Promise<CoverageSnapshot> {
    return this.upsertRecord<CoverageSnapshot>(
      `insert into gideon_coverage_snapshots (
         id, workspace_id, project_id, environment_version_id, calculation_version,
         record_json, created_at
       ) values ($1,$2,$3,$4,$5,$6::jsonb,$7)
       on conflict (id) do update set record_json=excluded.record_json
       where gideon_coverage_snapshots.workspace_id=excluded.workspace_id
       returning record_json`,
      [
        snapshot.id,
        snapshot.workspaceId,
        snapshot.projectId,
        snapshot.environmentVersionId,
        snapshot.calculationVersion,
        JSON.stringify(snapshot),
        snapshot.createdAt
      ],
      "coverage snapshot"
    );
  }

  async getLatestCoverageSnapshot(input: {
    workspaceId: string;
    projectId: string;
  }): Promise<CoverageSnapshot | null> {
    return this.getRecord<CoverageSnapshot>(
      `select record_json from gideon_coverage_snapshots
       where workspace_id=$1 and project_id=$2 order by created_at desc limit 1`,
      [input.workspaceId, input.projectId],
      "coverage snapshot"
    );
  }

  async close(): Promise<void> {
    await this.closeClient?.();
  }

  private async upsertRecord<T>(text: string, values: readonly unknown[], label: string): Promise<T> {
    const result = await this.query<JsonRecordRow<T>>(text, values);
    return parseRecordJson(result.rows[0]?.record_json, label);
  }

  private async getRecord<T>(text: string, values: readonly unknown[], label: string): Promise<T | null> {
    const result = await this.query<JsonRecordRow<T>>(text, values);
    return result.rows[0] ? parseRecordJson(result.rows[0].record_json, label) : null;
  }

  private async listRecords<T>(text: string, values: readonly unknown[], label: string): Promise<T[]> {
    const result = await this.query<JsonRecordRow<T>>(text, values);
    return result.rows.map((row) => parseRecordJson(row.record_json, label));
  }
}

export function createPostgresCaptureRepositoryFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PostgresCaptureRepository {
  const connectionString = env.GIDEON_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("PostgreSQL capture repository requires GIDEON_DATABASE_URL or DATABASE_URL.");
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });
  return new PostgresCaptureRepository(
    async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
      const result = await pool.query(text, values ? [...values] : undefined);
      return { rows: result.rows as Row[] };
    },
    async () => pool.end()
  );
}

function parseRecordJson<T>(value: T | string | undefined, label: string): T {
  if (!value) throw new Error(`PostgreSQL ${label} repository returned no record_json.`);
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(limit)));
}
