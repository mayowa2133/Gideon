import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ArtifactRecord, JobRecord } from "../shared/types";
import type { CaptureEnvironment, CaptureEnvironmentVersion, CapturePersona, CaptureRun, CoverageSnapshot, FlowExecutionRecord, ProductFlowRevision } from "../shared/productFlowCapture";
import { createCaptureApplicationService } from "./captureService";
import { createCaptureRunCoordinator } from "./captureRunCoordinator";
import { createCaptureRunWorker } from "./captureRunWorker";
import { createCaptureCoverageService } from "./captureCoverageService";
import { createPostRunCoverageHook } from "./postRunCoverage";
import { executePlaywrightCapture } from "./playwrightCaptureExecutor";
import { extractRepositoryEvidence } from "./repositoryEvidence";
import { importTestScenarioFlows } from "./testScenarioImport";
import { LocalPrivateObjectStorage } from "./storage";

const execFileAsync = promisify(execFile);
const WORKSPACE_ID = "local-workspace";
const PROJECT_ID = "nexusreach-pilot";
const REPOSITORY = "/Users/mayowaadesanya/Documents/Projects/NexusReach";
const BASE_URL = "http://127.0.0.1:5173";

interface PilotState {
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

class LocalPilotRepository {
  readonly state: PilotState = { environments: [], versions: [], personas: [], flows: [], captureRuns: [], executions: [], artifacts: [], jobs: [], coverage: [] };
  async upsertEnvironment(value: CaptureEnvironment) { return replace(this.state.environments, value); }
  async getEnvironment(input: { workspaceId: string; environmentId: string }) { return this.state.environments.find((item) => item.workspaceId === input.workspaceId && item.id === input.environmentId) ?? null; }
  async listProjectEnvironments(input: { workspaceId: string; projectId: string }) { return this.state.environments.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId); }
  async upsertEnvironmentVersion(value: CaptureEnvironmentVersion) { return replace(this.state.versions, value); }
  async getEnvironmentVersion(input: { workspaceId: string; versionId: string }) { return this.state.versions.find((item) => item.workspaceId === input.workspaceId && item.id === input.versionId) ?? null; }
  async upsertPersona(value: CapturePersona) { return replace(this.state.personas, value); }
  async getPersona(input: { workspaceId: string; personaId: string }) { return this.state.personas.find((item) => item.workspaceId === input.workspaceId && item.id === input.personaId) ?? null; }
  async listProjectPersonas(input: { workspaceId: string; projectId: string }) { return this.state.personas.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId); }
  async upsertFlowRevision(input: { workspaceId: string; environmentId: string; flow: ProductFlowRevision }) { return replace(this.state.flows, input.flow); }
  async getFlow(input: { workspaceId: string; flowId: string }) { return this.state.flows.find((item) => item.id === input.flowId && item.projectId === PROJECT_ID) ?? null; }
  async listProjectFlows(input: { workspaceId: string; projectId: string }) { return this.state.flows.filter((item) => item.projectId === input.projectId); }
  async getCaptureRun(input: { workspaceId: string; captureRunId: string }) { return this.state.captureRuns.find((item) => item.workspaceId === input.workspaceId && item.id === input.captureRunId) ?? null; }
  async getCaptureRunByIdempotency(input: { workspaceId: string; idempotencyKey: string }) { return this.state.captureRuns.find((item) => item.workspaceId === input.workspaceId && item.idempotencyKey === input.idempotencyKey) ?? null; }
  async upsertCaptureRun(value: CaptureRun) { return replace(this.state.captureRuns, value); }
  async persistCaptureRunAndJob(input: { captureRun: CaptureRun; job: JobRecord }) { replace(this.state.captureRuns, input.captureRun); replace(this.state.jobs, input.job); }
  async upsertFlowExecution(value: FlowExecutionRecord) { return replace(this.state.executions, value); }
  async listCaptureRunExecutions(input: { workspaceId: string; captureRunId: string }) { return this.state.executions.filter((item) => item.workspaceId === input.workspaceId && item.captureRunId === input.captureRunId); }
  async getFlowExecution(input: { workspaceId: string; executionId: string }) { return this.state.executions.find((item) => item.workspaceId === input.workspaceId && item.id === input.executionId) ?? null; }
  async upsertArtifact(value: ArtifactRecord) { return replace(this.state.artifacts, value); }
  async getArtifact(input: { workspaceId: string; artifactId: string }) { return this.state.artifacts.find((item) => item.workspaceId === input.workspaceId && item.id === input.artifactId) ?? null; }
  async upsertCoverageSnapshot(value: CoverageSnapshot) { return replace(this.state.coverage, value); }
  async getLatestCoverageSnapshot(input: { workspaceId: string; projectId: string }) { return this.state.coverage.filter((item) => item.workspaceId === input.workspaceId && item.projectId === input.projectId).at(-1) ?? null; }
}

export async function runNexusReachPilot(input: { outputRoot?: string; executablePath?: string } = {}) {
  assertNexusReachPilotTarget();
  await assertReachable(`${BASE_URL}/dashboard`);
  const outputRoot = path.resolve(input.outputRoot ?? path.join(process.cwd(), "tmp", "capture-pilot", "nexusreach"));
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const repository = new LocalPilotRepository();
  const service = createCaptureApplicationService({ repository });
  const environment = await service.createEnvironment({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, name: "NexusReach safe demo", type: "local_preview", baseUrl: BASE_URL, allowedDomains: ["127.0.0.1"], resetAdapter: "fixture_api" });
  const validated = await service.validateEnvironment({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, environmentId: environment.id });
  const persona = await service.createPersona({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, environmentId: environment.id, key: "jordan-demo", displayName: "Jordan Demo", roleDescription: "Synthetic early-career job seeker targeting Product Engineer and Frontend Engineer roles in Toronto and remote Canada.", fixtureProfileId: "nexusreach:onboarding" });
  const evidence = await extractRepositoryEvidence({ rootDir: REPOSITORY, maxFiles: 2_000, maxBytes: 10_000_000 });
  const [importedDraft] = importTestScenarioFlows({ projectId: PROJECT_ID, environmentVersionId: validated.version.id, personaId: persona.id, scenarios: [createNexusReachOnboardingScenario()], makeId: () => "nexusreach-complete-onboarding" });
  const draft = importedDraft ? { ...importedDraft, sourceEvidenceIds: [...importedDraft.sourceEvidenceIds, "goal:complete-onboarding"] } : undefined;
  if (!draft) throw new Error("NexusReach onboarding flow could not be imported.");
  await service.saveFlowRevision({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, flow: draft });
  const approved = await service.setFlowApproval({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, flowId: draft.id, status: "approved", actorUserId: "local-pilot-user" });
  let queued: Parameters<ReturnType<typeof createCaptureRunWorker>["execute"]>[0] | null = null;
  const coordinator = createCaptureRunCoordinator({ repository, queue: { async enqueue(value) { queued = { workspaceId: value.workspaceId, captureRunId: value.captureRunId }; } } });
  const runRequest = await coordinator.create({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, environmentId: environment.id, flowIds: [approved.id], idempotencyKey: "nexusreach-onboarding-pilot-v1" });
  const storage = new LocalPrivateObjectStorage(path.join(outputRoot, "private-artifacts"));
  await fs.mkdir(path.join(outputRoot, "work"), { recursive: true, mode: 0o700 });
  const coverageService = createCaptureCoverageService(repository);
  const persistCoverage = createPostRunCoverageHook({ repository, coverage: coverageService });
  const resetAdapter = { async reset() { await approvedReset("onboarding"); } };
  const chrome = input.executablePath ?? process.env.GIDEON_CAPTURE_CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const worker = createCaptureRunWorker({ repository, storage, runtime: { isolation: "local_test", execute: (value) => executePlaywrightCapture({ ...value, executablePath: chrome, capturePacing: value.recordVideo ? { initialHoldMs: 1_500, beforeActionMs: 450, afterActionMs: 900, finalHoldMs: 2_000 } : undefined, capturePresentation: value.recordVideo ? { showPointer: true, pointerMoveMs: 350, typingDelayMs: 45 } : undefined }) }, resetAdapters: { fixture_api: resetAdapter }, fixtureValuesForPersona: async () => fixtureValues(), persistCoverage: async (value) => { await persistCoverage(value); }, workRoot: path.join(outputRoot, "work") });
  const payload = queued;
  if (!payload) throw new Error("NexusReach capture was not queued.");
  const result = await worker.execute(payload);
  const executions = await repository.listCaptureRunExecutions({ workspaceId: WORKSPACE_ID, captureRunId: result.run.id });
  if (result.run.status !== "completed") {
    await fs.writeFile(path.join(outputRoot, "pilot-failure.json"), JSON.stringify({ run: result.run, executions }, null, 2), { encoding: "utf8", mode: 0o600 });
    throw new Error(`NexusReach capture finished in ${result.run.status}; see ${path.join(outputRoot, "pilot-failure.json")}.`);
  }
  const execution = executions[0];
  if (!execution || execution.status !== "verified" || !execution.normalizedClipArtifactId) throw new Error("NexusReach onboarding clip was not verified.");
  const normalizedClip = await repository.getArtifact({ workspaceId: WORKSPACE_ID, artifactId: execution.normalizedClipArtifactId });
  const coverage = await coverageService.latest({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID });
  const persisted = await verifyNexusReachOnboarding();
  const report = { schemaVersion: "1", target: "NexusReach", environment: validated.environment, environmentVersion: validated.version, repositoryEvidence: evidence.manifest, persona, flow: approved, captureRun: result.run, execution, normalizedClip, sourceArtifact: result.sourceArtifact, assemblyManifestArtifact: result.assemblyManifestArtifact, coverage, persisted, generatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(outputRoot, "pilot-report.json"), JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(path.join(outputRoot, "pilot-state.json"), JSON.stringify(repository.state, null, 2), { encoding: "utf8", mode: 0o600 });
  return { outputRoot, report };
}

export function createNexusReachOnboardingScenario() {
  const label = (value: string) => ({ strategy: "label" as const, value });
  const role = (value: string) => ({ strategy: "role" as const, role: "button" as const, value, exact: true });
  return { id: "complete-onboarding", framework: "playwright", title: "Complete onboarding", entryPath: "/dashboard", sourcePath: "e2e/tests-real/onboarding-happy-path.spec.ts", steps: [
    { intent: "Begin onboarding.", action: { type: "click", target: role("Get started") }, riskClass: "synthetic_write" },
    { intent: "Enter the synthetic profile name.", action: { type: "fill", target: label("Full name"), valueRef: "fixture:profile.full_name" }, riskClass: "synthetic_write" },
    { intent: "Enter a synthetic profile bio.", action: { type: "fill", target: label("Short bio (optional)"), valueRef: "fixture:profile.bio" }, riskClass: "synthetic_write" },
    { intent: "Continue to goals.", action: { type: "click", target: role("Continue") }, riskClass: "synthetic_write" },
    { intent: "Choose the local job-seeking goal.", action: { type: "click", target: { strategy: "text", value: "Find a Job", exact: true } }, riskClass: "synthetic_write" },
    { intent: "Enter target roles.", action: { type: "fill", target: label("Target roles"), valueRef: "fixture:profile.target_roles" }, riskClass: "synthetic_write" },
    { intent: "Enter target locations.", action: { type: "fill", target: label("Target locations (optional)"), valueRef: "fixture:profile.target_locations" }, riskClass: "synthetic_write" },
    { intent: "Enter target industries.", action: { type: "fill", target: label("Target industries (optional)"), valueRef: "fixture:profile.target_industries" }, riskClass: "synthetic_write" },
    { intent: "Continue without starting discovery.", action: { type: "click", target: role("Continue") }, riskClass: "synthetic_write" },
    { intent: "Skip resume upload.", action: { type: "click", target: role("Skip for now") }, riskClass: "synthetic_write" },
    { intent: "Skip network connection.", action: { type: "click", target: role("Skip for now") }, riskClass: "synthetic_write" },
    { intent: "Finish by reviewing the profile.", action: { type: "click", target: role("Review full profile") }, riskClass: "synthetic_write" },
    { intent: "Wait for the Profile route.", action: { type: "wait_for", assertion: { type: "url", path: "/profile" } }, riskClass: "observe" }
  ], finalAssertions: [{ type: "url", path: "/profile" }, { type: "visible", target: label("Full Name") }, { type: "value", target: label("Full Name"), valueRef: "fixture:profile.full_name" }] };
}

function fixtureValues() { return { "profile.full_name": "Jordan Demo", "profile.bio": "Early-career product engineer building accessible web products.", "profile.target_roles": "Product Engineer, Frontend Engineer", "profile.target_locations": "Toronto, Remote Canada", "profile.target_industries": "Developer tools, Climate tech" }; }
async function approvedReset(scenario: "onboarding" | "returning") { const script = path.join(REPOSITORY, "scripts", "demo_reset.sh"); await execFileAsync(script, [scenario], { cwd: REPOSITORY, env: process.env, timeout: 120_000, maxBuffer: 10_000_000 }); }
async function assertReachable(url: string) { const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) }).catch(() => null); if (!response?.ok) throw new Error(`NexusReach safe demo is not reachable at ${BASE_URL}. Start it with ./scripts/demo_start.sh --scenario onboarding.`); }
function assertNexusReachPilotTarget() { if (BASE_URL !== "http://127.0.0.1:5173" || path.resolve(REPOSITORY) !== "/Users/mayowaadesanya/Documents/Projects/NexusReach") throw new Error("NexusReach pilot target is not the approved loopback repository."); }
async function verifyNexusReachOnboarding() { const [profileResponse, guardrailsResponse] = await Promise.all([fetch("http://127.0.0.1:8000/api/profile"), fetch("http://127.0.0.1:8000/api/settings/guardrails")]); if (!profileResponse.ok || !guardrailsResponse.ok) throw new Error("NexusReach persistence verification failed."); const profile = await profileResponse.json() as Record<string, unknown>; const guardrails = await guardrailsResponse.json() as Record<string, unknown>; if (profile.full_name !== "Jordan Demo" || guardrails.onboarding_completed !== true) throw new Error("NexusReach onboarding state was not persisted."); return { profile: { full_name: profile.full_name, target_roles: profile.target_roles, target_locations: profile.target_locations }, guardrails: { onboarding_completed: guardrails.onboarding_completed } }; }
function replace<T extends { id: string }>(items: T[], value: T): T { const index = items.findIndex((item) => item.id === value.id); if (index >= 0) items[index] = structuredClone(value); else items.push(structuredClone(value)); return structuredClone(value); }

async function runCli() { const result = await runNexusReachPilot(); process.stdout.write(`${JSON.stringify({ ok: true, outputRoot: result.outputRoot, normalizedClip: result.report.normalizedClip?.localPath, sourceRecording: result.report.sourceArtifact?.localPath, coverage: result.report.coverage?.dimensions }, null, 2)}\n`); }
if (require.main === module) runCli().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "NexusReach pilot failed."}\n`); process.exitCode = 1; });
