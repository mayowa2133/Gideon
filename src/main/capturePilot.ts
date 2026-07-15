import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ArtifactRecord, JobRecord } from "../shared/types";
import type { CaptureEnvironment, CaptureEnvironmentVersion, CapturePersona, CaptureRun, CoverageSnapshot, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import { parseProductFlowRevision } from "../shared/productFlowCapture";
import { createCaptureCoverageService } from "./captureCoverageService";
import { assertCapturePilotAdapters, type CapturePilotAdapterRegistry, type CapturePilotManifest } from "./capturePilotManifest";
import { createCaptureRunCoordinator } from "./captureRunCoordinator";
import { createCaptureRunWorker } from "./captureRunWorker";
import { createCaptureApplicationService } from "./captureService";
import { executePlaywrightCapture } from "./playwrightCaptureExecutor";
import { createPostRunCoverageHook } from "./postRunCoverage";
import { extractRepositoryEvidence } from "./repositoryEvidence";
import { LocalPrivateObjectStorage } from "./storage";
import { importTestScenarioFlows } from "./testScenarioImport";

export interface CapturePilotState {
  environments: CaptureEnvironment[];
  versions: CaptureEnvironmentVersion[];
  personas: CapturePersona[];
  flows: ProductFlowRevision[];
  captureRuns: CaptureRun[];
  executions: FlowExecutionRecord[];
  artifacts: ArtifactRecord[];
  jobs: JobRecord[];
  coverage: CoverageSnapshot[];
}

export class LocalCapturePilotRepository {
  readonly state: CapturePilotState;
  constructor(initial?: CapturePilotState, private readonly onMutation?: (state: CapturePilotState) => Promise<void>) { this.state = structuredClone(initial ?? emptyState()); }
  private async changed<T>(value: T): Promise<T> { await this.onMutation?.(structuredClone(this.state)); return value; }
  async upsertEnvironment(value: CaptureEnvironment) { return this.changed(replace(this.state.environments, value)); }
  async getEnvironment(input: { workspaceId: string; environmentId: string }) { return this.state.environments.find((item) => item.workspaceId === input.workspaceId && item.id === input.environmentId) ?? null; }
  async listProjectEnvironments(input: { workspaceId: string; projectId: string }) { return this.state.environments.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId); }
  async upsertEnvironmentVersion(value: CaptureEnvironmentVersion) { return this.changed(replace(this.state.versions, value)); }
  async getEnvironmentVersion(input: { workspaceId: string; versionId: string }) { return this.state.versions.find((item) => item.workspaceId === input.workspaceId && item.id === input.versionId) ?? null; }
  async upsertPersona(value: CapturePersona) { return this.changed(replace(this.state.personas, value)); }
  async getPersona(input: { workspaceId: string; personaId: string }) { return this.state.personas.find((item) => item.workspaceId === input.workspaceId && item.id === input.personaId) ?? null; }
  async listProjectPersonas(input: { workspaceId: string; projectId: string }) { return this.state.personas.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId); }
  async upsertFlowRevision(input: { workspaceId: string; environmentId: string; flow: ProductFlowRevision }) { return this.changed(replace(this.state.flows, input.flow)); }
  async getFlow(input: { workspaceId: string; flowId: string }) { return this.state.flows.find((item) => item.id === input.flowId && item.projectId === this.state.environments.find((environment) => environment.workspaceId === input.workspaceId)?.projectId) ?? null; }
  async listProjectFlows(input: { workspaceId: string; projectId: string }) { return this.state.flows.filter((item) => item.projectId === input.projectId && this.state.environments.some((environment) => environment.workspaceId === input.workspaceId && environment.projectId === input.projectId)); }
  async getCaptureRun(input: { workspaceId: string; captureRunId: string }) { return this.state.captureRuns.find((item) => item.workspaceId === input.workspaceId && item.id === input.captureRunId) ?? null; }
  async getCaptureRunByIdempotency(input: { workspaceId: string; idempotencyKey: string }) { return this.state.captureRuns.find((item) => item.workspaceId === input.workspaceId && item.idempotencyKey === input.idempotencyKey) ?? null; }
  async upsertCaptureRun(value: CaptureRun) { return this.changed(replace(this.state.captureRuns, value)); }
  async persistCaptureRunAndJob(input: { captureRun: CaptureRun; job: JobRecord }) { replace(this.state.captureRuns, input.captureRun); replace(this.state.jobs, input.job); await this.changed(undefined); }
  async upsertFlowExecution(value: FlowExecutionRecord) { return this.changed(replace(this.state.executions, value)); }
  async listCaptureRunExecutions(input: { workspaceId: string; captureRunId: string }) { return this.state.executions.filter((item) => item.workspaceId === input.workspaceId && item.captureRunId === input.captureRunId); }
  async getFlowExecution(input: { workspaceId: string; executionId: string }) { return this.state.executions.find((item) => item.workspaceId === input.workspaceId && item.id === input.executionId) ?? null; }
  async upsertArtifact(value: ArtifactRecord) { return this.changed(replace(this.state.artifacts, value)); }
  async getArtifact(input: { workspaceId: string; artifactId: string }) { return this.state.artifacts.find((item) => item.workspaceId === input.workspaceId && item.id === input.artifactId) ?? null; }
  async upsertCoverageSnapshot(value: CoverageSnapshot) { return this.changed(replace(this.state.coverage, value)); }
  async getLatestCoverageSnapshot(input: { workspaceId: string; projectId: string }) { return this.state.coverage.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId).at(-1) ?? null; }
}

export async function runCapturePilot(input: {
  manifest: CapturePilotManifest;
  adapters: CapturePilotAdapterRegistry;
  outputRoot?: string;
  executablePath?: string;
  now?: () => Date;
}) {
  const { manifest, adapters } = input;
  const now = input.now?.() ?? new Date();
  const pilotRoot = path.resolve(input.outputRoot ?? path.join(process.cwd(), "tmp", "capture-pilot", manifest.artifactDirectoryName));
  assertCapturePilotAdapters(manifest, adapters);
  await adapters.startup[manifest.environment.startupAdapterId]!.assertReady({ manifest });
  const runId = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const runRoot = path.join(pilotRoot, "runs", runId);
  await fs.mkdir(runRoot, { recursive: true, mode: 0o700 });
  const repository = await openDurableRepository(path.join(pilotRoot, "pilot-repository.json"));
  const service = createCaptureApplicationService({ repository });
  const environment = await service.createEnvironment({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, name: manifest.environment.name, type: manifest.environment.type, baseUrl: manifest.environment.baseUrl, allowedDomains: manifest.environment.allowedDomains, resetAdapter: "fixture_api" });
  const validated = await service.validateEnvironment({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, environmentId: environment.id });
  const persona = await service.createPersona({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, environmentId: environment.id, key: manifest.persona.key, displayName: manifest.persona.displayName, roleDescription: manifest.persona.roleDescription, fixtureProfileId: manifest.persona.fixtureProfileId });
  const evidence = await extractRepositoryEvidence(manifest.repository);
  const approvedFlows: ProductFlowRevision[] = [];
  for (const workflow of manifest.workflows) {
    const [imported] = importTestScenarioFlows({ projectId: manifest.projectId, environmentVersionId: validated.version.id, personaId: persona.id, scenarios: [workflow.scenario], makeId: () => workflow.id });
    if (!imported) throw new Error(`Capture pilot workflow ${workflow.id} could not be imported.`);
    const current = await repository.getFlow({ workspaceId: manifest.workspaceId, flowId: workflow.id });
    const draft = { ...imported, revision: current ? current.revision + 1 : 1, sourceEvidenceIds: [...imported.sourceEvidenceIds, `goal:${workflow.goalId}`] };
    await service.saveFlowRevision({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, flow: draft });
    approvedFlows.push(await service.setFlowApproval({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, flowId: draft.id, status: "approved", actorUserId: "local-pilot-user" }));
  }
  const storage = new LocalPrivateObjectStorage(path.join(runRoot, "private-artifacts"));
  const coverageService = createCaptureCoverageService(repository);
  const persistCoverage = createPostRunCoverageHook({ repository, coverage: coverageService });
  const chrome = input.executablePath ?? process.env.GIDEON_CAPTURE_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const results: Array<{ workflowId: string; flow: ProductFlowRevision; run: CaptureRun; execution: FlowExecutionRecord; normalizedClip: ArtifactRecord; sourceArtifact?: ArtifactRecord; assemblyManifestArtifact?: ArtifactRecord; verification: unknown }> = [];
  const diagnostics: Array<{ workflowId: string; message: string }> = [];

  try {
    for (const workflow of manifest.workflows) {
      const flow = approvedFlows.find((candidate) => candidate.id === workflow.id)!;
      let queued: { workspaceId: string; captureRunId: string } | undefined;
      const coordinator = createCaptureRunCoordinator({ repository, queue: { async enqueue(value) { queued = { workspaceId: value.workspaceId, captureRunId: value.captureRunId }; } } });
      await coordinator.create({ workspaceId: manifest.workspaceId, projectId: manifest.projectId, environmentId: environment.id, flowIds: [flow.id], idempotencyKey: `${manifest.key}:${runId}:${workflow.id}` });
      if (!queued) throw new Error(`Capture pilot workflow ${workflow.id} was not queued.`);
      const reset = adapters.reset[workflow.resetAdapterId]!;
      const worker = createCaptureRunWorker({
        repository,
        storage,
        runtime: { isolation: "local_test", execute: (value) => executePlaywrightCapture({
          ...value,
          executablePath: chrome,
          viewport: manifest.presentation.viewport,
          capturePacing: value.recordVideo ? manifest.presentation : undefined,
          capturePresentation: value.recordVideo ? manifest.presentation : undefined
        }) },
        resetAdapters: { fixture_api: { async reset() { await reset.reset({ manifest, workflowId: workflow.id }); } } },
        fixtureValuesForPersona: async () => manifest.persona.fixtureValues,
        persistCoverage: async (value) => { await persistCoverage(value); },
        workRoot: path.join(runRoot, "work", workflow.id),
        onDiagnostic: (error) => diagnostics.push({ workflowId: workflow.id, message: error instanceof Error ? error.message : "Capture worker diagnostic was not an Error." })
      });
      await fs.mkdir(path.join(runRoot, "work", workflow.id), { recursive: true, mode: 0o700 });
      const result = await worker.execute(queued);
      const executions = await repository.listCaptureRunExecutions({ workspaceId: manifest.workspaceId, captureRunId: result.run.id });
      const execution = executions[0];
      if (result.run.status !== "completed" || !execution || execution.status !== "verified" || !execution.normalizedClipArtifactId) throw new Error(`Capture pilot workflow ${workflow.id} finished in ${result.run.status}.`);
      const normalizedClip = await repository.getArtifact({ workspaceId: manifest.workspaceId, artifactId: execution.normalizedClipArtifactId });
      if (!normalizedClip) throw new Error(`Capture pilot workflow ${workflow.id} normalized clip was not found.`);
      const verification = await adapters.verification[workflow.verificationAdapterId]!.verify({ manifest, workflowId: workflow.id });
      results.push({ workflowId: workflow.id, flow, run: result.run, execution, normalizedClip, sourceArtifact: result.sourceArtifact, assemblyManifestArtifact: result.assemblyManifestArtifact, verification });
    }
  } catch (error) {
    await writePrivateJson(path.join(runRoot, "pilot-failure.json"), { schemaVersion: "1", manifestKey: manifest.key, error: error instanceof Error ? error.message : "Capture pilot failed.", diagnostics, state: repository.state, generatedAt: new Date().toISOString() });
    throw error;
  }

  const lastResult = results.at(-1);
  if (lastResult) {
    await persistCoverage({
      workspaceId: manifest.workspaceId,
      projectId: manifest.projectId,
      captureRun: lastResult.run,
      executions: results.map((result) => result.execution)
    });
  }
  const coverage = await coverageService.latest({ workspaceId: manifest.workspaceId, projectId: manifest.projectId });
  const report = { schemaVersion: "1", runId, manifestKey: manifest.key, name: manifest.name, environment: validated.environment, environmentVersion: validated.version, repositoryEvidence: evidence.manifest, persona, results, coverage, generatedAt: new Date().toISOString() };
  await writePrivateJson(path.join(runRoot, "pilot-report.json"), report);
  await writePrivateJson(path.join(runRoot, "pilot-state.json"), repository.state);
  await writePrivateJson(path.join(pilotRoot, "latest.json"), { schemaVersion: "1", runId, runRoot, reportPath: path.join(runRoot, "pilot-report.json"), updatedAt: new Date().toISOString() });
  return { pilotRoot, runRoot, report };
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 }); await fs.writeFile(filePath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 }); }
async function openDurableRepository(filePath: string): Promise<LocalCapturePilotRepository> {
  let initial = emptyState();
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 25_000_000) throw new Error("Capture pilot repository exceeds the local state size limit.");
    const envelope = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    initial = parsePersistedState(envelope);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  return new LocalCapturePilotRepository(initial, async (state) => {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await writePrivateJson(temporary, { schemaVersion: "1", state });
    await fs.rename(temporary, filePath);
  });
}

function parsePersistedState(value: unknown): CapturePilotState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Capture pilot repository must be an object.");
  const envelope = value as Record<string, unknown>;
  if (envelope.schemaVersion !== "1" || !envelope.state || typeof envelope.state !== "object" || Array.isArray(envelope.state)) throw new Error("Capture pilot repository schema is invalid.");
  const state = envelope.state as Record<string, unknown>;
  const keys: Array<keyof CapturePilotState> = ["environments", "versions", "personas", "flows", "captureRuns", "executions", "artifacts", "jobs", "coverage"];
  if (Object.keys(state).some((key) => !keys.includes(key as keyof CapturePilotState)) || keys.some((key) => !Array.isArray(state[key]))) throw new Error("Capture pilot repository state is invalid.");
  for (const flow of state.flows as unknown[]) parseProductFlowRevision(flow);
  for (const key of keys) if ((state[key] as unknown[]).some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new Error(`Capture pilot repository ${key} entries are invalid.`);
  return structuredClone(state) as unknown as CapturePilotState;
}

function emptyState(): CapturePilotState { return { environments: [], versions: [], personas: [], flows: [], captureRuns: [], executions: [], artifacts: [], jobs: [], coverage: [] }; }
function replace<T extends { id: string }>(items: T[], value: T): T { const index = items.findIndex((item) => item.id === value.id); if (index >= 0) items[index] = structuredClone(value); else items.push(structuredClone(value)); return structuredClone(value); }
