export interface CaptureCapabilities {
  available: boolean;
  environmentValidation: boolean;
  credentialVault: boolean;
  isolatedRuntime: boolean;
  discovery: boolean;
  capture: boolean;
  assembly: boolean;
  clipPreview: boolean;
  coverage: boolean;
  audit: boolean;
}

export interface CaptureEnvironmentDto {
  id: string; projectId: string; name: string; type: "local_preview" | "staging" | "demo" | "production_sandbox";
  baseUrl: string; allowedDomains: string[]; status: "draft" | "validating" | "ready" | "failed" | "revoked";
  resetAdapter: string; revision: number; currentVersionId: string | null; safeErrorCode: string | null; updatedAt: string;
}
export interface CapturePersonaDto { id: string; projectId: string; environmentId: string; key: string; displayName: string; roleDescription: string; credentialGrantId?: string; status: "active" | "disabled"; revision: number }
export interface ProductFlowDto { schemaVersion: "1"; id: string; revision: number; projectId: string; environmentVersionId: string; personaId: string; title: string; goal: string; startingState: { entryPath: string }; steps: Array<{ id: string; intent: string; riskClass: string; action: Record<string, unknown> }>; finalAssertions: Array<Record<string, unknown>>; approval: { status: "draft" | "approved" | "rejected"; approvedRevision?: number }; sourceEvidenceIds: string[] }
export interface JobDto { id: string; projectId: string; kind: string; status: "queued" | "running" | "succeeded" | "failed" | "canceling" | "canceled"; userMessage: string; safeError?: string; updatedAt: string }
export interface DiscoveryRunDto { id: string; projectId: string; environmentVersionId: string; jobId: string; status: "draft" | "queued" | "inventory" | "exploring" | "synthesizing" | "validating" | "ready_for_review" | "failed" | "canceled"; safeErrorCode: string | null; updatedAt: string }
export interface CaptureRunDto { id: string; projectId: string; environmentVersionId: string; jobId: string; status: "queued" | "provisioning" | "resetting" | "authenticating" | "dry_running" | "repairing" | "recording" | "normalizing" | "verifying" | "needs_review" | "completed" | "failed" | "canceled"; flowRevisionIds: string[]; estimatedBrowserSeconds: number; updatedAt: string }
export interface FlowExecutionDto { id: string; captureRunId: string; flowId: string; flowRevision: number; status: "queued" | "running" | "verified" | "failed" | "blocked" | "canceled"; attempt: number; blockerCode: string | null; normalizedClipArtifactId: string | null; quality?: null | { status: "ready" | "warning" | "failed"; checks: Array<{ code: string; status: "pass" | "warning" | "fail" }> }; updatedAt: string }
export interface CoverageDimensionDto { key: string; denominator: number | "unknown"; denominatorSource?: string; denominatorSources?: string[]; inventoryRevision?: number; coveredIds: string[]; uncoveredIds: string[]; excluded: Array<{ id: string; reason: string }>; blocked: Array<{ id: string; code: string }> }
export interface CoverageSnapshotDto { id: string; projectId: string; environmentVersionId: string; calculationVersion: string; inventory?: null | { version: string; revision: number }; freshness?: { status: "current" | "stale" | "unknown"; reasons: string[]; evaluatedAt: string }; dimensions: CoverageDimensionDto[]; createdAt: string }
export interface ProjectSummaryDto { id: string; workspaceId: string; name: string; productName: string; status: string; updatedAt: string }

interface ApiEnvelope<T> { data?: T; error?: { code?: string; message?: string }; meta?: { requestId?: string } }

export class CaptureApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId?: string) { super(message); }
}

export class CaptureApi {
  private csrfToken: string | null = null;
  constructor(private readonly basePath = "/api/gideon/api/v1", private readonly fetcher?: typeof fetch) {}

  async session() {
    const data = await this.request<{ session: null | { user: { id: string; displayName: string }; workspace: { id: string; name: string }; role: string }; csrfToken?: string }>("GET", "/auth/session");
    this.csrfToken = data.csrfToken ?? null;
    return { authenticated: Boolean(data.session), csrfToken: data.csrfToken };
  }
  capabilities() { return this.request<{ capture: CaptureCapabilities }>("GET", "/capture-capabilities").then((data) => data.capture); }
  listProjects() { return this.request<{ projects: ProjectSummaryDto[] }>("GET", "/projects").then((data) => data.projects); }
  listEnvironments(projectId: string) { return this.request<{ environments: CaptureEnvironmentDto[] }>("GET", projectPath(projectId, "/capture-environments")).then((data) => data.environments); }
  createEnvironment(projectId: string, input: { name: string; type: CaptureEnvironmentDto["type"]; baseUrl: string; allowedDomains: string[]; resetAdapter: string }) { return this.request<{ environment: CaptureEnvironmentDto }>("POST", projectPath(projectId, "/capture-environments"), input).then((data) => data.environment); }
  validateEnvironment(projectId: string, environmentId: string) { return this.request<{ environment: CaptureEnvironmentDto; job: JobDto; reused: boolean }>("POST", projectPath(projectId, `/capture-environments/${encodeURIComponent(environmentId)}/validate`), {}, idempotency("environment-validation", environmentId)); }
  listPersonas(projectId: string) { return this.request<{ personas: CapturePersonaDto[] }>("GET", projectPath(projectId, "/capture-personas")).then((data) => data.personas); }
  createPersona(projectId: string, input: { environmentId: string; key: string; displayName: string; roleDescription: string }) { return this.request<{ persona: CapturePersonaDto }>("POST", projectPath(projectId, "/capture-personas"), input).then((data) => data.persona); }
  updatePersona(projectId: string, persona: CapturePersonaDto, input: { credentialGrantId?: string; status?: "active" | "disabled" }) { return this.request<{ persona: CapturePersonaDto }>("PATCH", projectPath(projectId, `/capture-personas/${encodeURIComponent(persona.id)}`), { environmentId: persona.environmentId, key: persona.key, displayName: persona.displayName, roleDescription: persona.roleDescription, credentialGrantId: input.credentialGrantId ?? persona.credentialGrantId, status: input.status ?? persona.status }).then((data) => data.persona); }
  createCredential(projectId: string, input: { environmentId: string; personaId: string; kind: "username_password"; secret: { username: string; password: string }; expiresAt: string }) { return this.request<{ credentialGrant: { id: string; expiresAt: string } }>("POST", projectPath(projectId, "/capture-credential-grants"), input).then((data) => data.credentialGrant); }
  startDiscovery(projectId: string, input: { environmentId: string; goals: Array<{ id: string; text: string; priority: number }>; maxCandidates?: number }) { return this.request<{ discoveryRun: DiscoveryRunDto; job: JobDto; reused: boolean }>("POST", projectPath(projectId, "/discovery-runs"), input, idempotency("discovery", `${input.environmentId}:${JSON.stringify(input.goals)}`)); }
  getDiscovery(projectId: string, runId: string) { return this.request<{ discoveryRun: DiscoveryRunDto }>("GET", projectPath(projectId, `/discovery-runs/${encodeURIComponent(runId)}`)).then((data) => data.discoveryRun); }
  cancelDiscovery(projectId: string, runId: string) { return this.request<{ discoveryRun: DiscoveryRunDto }>("POST", projectPath(projectId, `/discovery-runs/${encodeURIComponent(runId)}/cancel`), {}).then((data) => data.discoveryRun); }
  listFlows(projectId: string) { return this.request<{ flows: ProductFlowDto[] }>("GET", projectPath(projectId, "/product-flows")).then((data) => data.flows); }
  createFlow(projectId: string, flow: ProductFlowDto) { return this.request<{ flow: ProductFlowDto }>("POST", projectPath(projectId, "/product-flows"), { flow }).then((data) => data.flow); }
  reviseFlow(projectId: string, flow: ProductFlowDto) { return this.request<{ flow: ProductFlowDto }>("PATCH", projectPath(projectId, `/product-flows/${encodeURIComponent(flow.id)}`), { flow }).then((data) => data.flow); }
  setFlowApproval(projectId: string, flowId: string, revision: number, approval: "approve" | "reject") { return this.request<{ flow: ProductFlowDto }>("POST", projectPath(projectId, `/product-flows/${encodeURIComponent(flowId)}/${approval}`), { revision }).then((data) => data.flow); }
  startCapture(projectId: string, input: { environmentId: string; flowIds: string[] }) { return this.request<{ captureRun: CaptureRunDto; job: JobDto; reused: boolean }>("POST", projectPath(projectId, "/capture-runs"), input, idempotency("capture", `${input.environmentId}:${input.flowIds.join(",")}`)); }
  getCapture(projectId: string, runId: string) { return this.request<{ captureRun: CaptureRunDto; executions: FlowExecutionDto[] }>("GET", projectPath(projectId, `/capture-runs/${encodeURIComponent(runId)}`)); }
  cancelCapture(projectId: string, runId: string) { return this.request<{ captureRun: CaptureRunDto }>("POST", projectPath(projectId, `/capture-runs/${encodeURIComponent(runId)}/cancel`), {}).then((data) => data.captureRun); }
  createPreview(projectId: string, executionId: string) { return this.request<{ preview: { executionId: string; artifactId: string; contentType: string; url: string; expiresAt: string } }>("POST", projectPath(projectId, `/flow-executions/${encodeURIComponent(executionId)}/preview-url`), {}).then((data) => data.preview); }
  retryExecution(projectId: string, executionId: string) { return this.request<{ captureRun: CaptureRunDto; job: JobDto; reused: boolean }>("POST", projectPath(projectId, `/flow-executions/${encodeURIComponent(executionId)}/retry`), {}, idempotency("retry", executionId)); }
  createAssembly(projectId: string, runId: string, executionIds: string[]) { return this.request<{ job: JobDto; reused: boolean }>("POST", projectPath(projectId, `/capture-runs/${encodeURIComponent(runId)}/assemblies`), { executionIds }, idempotency("assembly", `${runId}:${executionIds.join(",")}`)); }
  getJob(jobId: string) { return this.request<{ job: JobDto }>("GET", `/jobs/${encodeURIComponent(jobId)}`).then((data) => data.job); }
  latestCoverage(projectId: string) { return this.request<{ coverageSnapshot: CoverageSnapshotDto }>("GET", projectPath(projectId, "/coverage-snapshots/latest")).then((data) => data.coverageSnapshot); }

  private async request<T>(method: "GET" | "POST" | "PATCH", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    if (method !== "GET" && !this.csrfToken) await this.session();
    const headers = new Headers({ accept: "application/json" });
    if (body) headers.set("content-type", "application/json");
    if (method !== "GET" && this.csrfToken) headers.set("x-csrf-token", this.csrfToken);
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
    const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
    const response = await fetcher(`${this.basePath}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin", cache: "no-store" });
    const envelope = await response.json().catch(() => ({})) as ApiEnvelope<T>;
    if (!response.ok || !envelope.data) throw new CaptureApiError(envelope.error?.message ?? "Gideon request failed.", response.status, envelope.error?.code ?? "request_failed", envelope.meta?.requestId);
    return envelope.data;
  }
}

function projectPath(projectId: string, suffix: string) { return `/projects/${encodeURIComponent(projectId)}${suffix}`; }
function idempotency(kind: string, identity: string) { return `${kind}:${stableHash(identity)}:${Date.now().toString(36)}`; }
export function stableHash(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
