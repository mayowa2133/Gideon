import { createHash, randomUUID } from "node:crypto";
import { parseProductFlowRevision, type BrowserActionRisk, type CapturePersona, type ProductFlowRevision } from "../shared/productFlowCapture";
import { stableSerialize } from "./productFlowCompiler";

export interface AccessibleControlEvidence {
  role: "link" | "button" | "tab" | "textbox" | "combobox";
  name: string;
  destinationPath?: string;
}

export interface RenderedPageEvidence {
  id: string;
  url: string;
  title: string;
  controls: AccessibleControlEvidence[];
  accessibleTreeHash: string;
  domStructureHash: string;
  screenshotHash?: string;
}

export interface RepositoryEvidence {
  routePaths: Array<{ path: string; label?: string; requiredRole?: string }>;
  tests: Array<{ id: string; title: string; routePaths: string[] }>;
  featureFlagIds: string[];
}

export interface UsageSequenceEvidence {
  id: string;
  personaKey?: string;
  eventKeys: string[];
  approximateSessions: number;
  completionRate?: number;
}

export interface DiscoveryEvidenceBundle {
  schemaVersion: "1";
  environmentVersionId: string;
  projectId: string;
  goals: Array<{ id: string; text: string; priority: number }>;
  personas: Array<Pick<CapturePersona, "id" | "key" | "displayName" | "roleDescription">>;
  renderedPages: RenderedPageEvidence[];
  repository?: RepositoryEvidence;
  usageSequences?: UsageSequenceEvidence[];
  allowedRisks: BrowserActionRisk[];
  maxCandidates: number;
  evidenceHash: string;
}

export interface DiscoveredFlowCandidate {
  id: string;
  flow: ProductFlowRevision;
  sourceSignals: Array<"user_goal" | "rendered_ui" | "repository_route" | "repository_test" | "usage_sequence" | "model">;
  ranking: {
    userPriority: number;
    repositorySupport: number;
    usageFrequency: number;
    marketingProofPotential: number;
    riskPenalty: number;
    total: number;
  };
  confidence: number;
  assumptions: string[];
}

export function createDiscoveryEvidenceBundle(input: Omit<DiscoveryEvidenceBundle, "schemaVersion" | "evidenceHash">): DiscoveryEvidenceBundle {
  if (input.goals.length < 1 || input.goals.length > 50) throw new Error("Discovery requires 1–50 goals.");
  if (input.personas.length < 1 || input.personas.length > 20) throw new Error("Discovery requires 1–20 personas.");
  if (input.renderedPages.length > 500 || input.maxCandidates < 1 || input.maxCandidates > 100) throw new Error("Discovery budget is invalid.");
  const sanitized = {
    ...input,
    goals: input.goals.map((goal) => ({ id: bounded(goal.id, 200), text: bounded(goal.text, 600), priority: clamp(goal.priority, 0, 100) })),
    renderedPages: input.renderedPages.map(sanitizePage),
    repository: input.repository ? sanitizeRepository(input.repository) : undefined,
    usageSequences: input.usageSequences?.filter((sequence) => sequence.approximateSessions >= 10).slice(0, 200).map(sanitizeSequence)
  };
  const withoutHash = { ...sanitized, schemaVersion: "1" as const };
  return { ...withoutHash, evidenceHash: sha256(stableSerialize(withoutHash)) };
}

export function discoverDeterministicFlows(bundle: DiscoveryEvidenceBundle, makeId: () => string = randomUUID): DiscoveredFlowCandidate[] {
  verifyEvidenceHash(bundle);
  const persona = bundle.personas[0]!;
  const routeEvidence = routeInventory(bundle);
  const candidates = routeEvidence.map((route) => {
    const goal = bestGoalForRoute(bundle.goals, route.label || route.path);
    const repositorySupport = route.sources.has("repository_route") ? 25 : 0;
    const testSupport = route.sources.has("repository_test") ? 15 : 0;
    const usageFrequency = usageScore(bundle.usageSequences, route.path);
    const userPriority = goal?.priority ?? 0;
    const ranking = {
      userPriority,
      repositorySupport: repositorySupport + testSupport,
      usageFrequency,
      marketingProofPotential: goal ? 20 : 8,
      riskPenalty: 0,
      total: userPriority + repositorySupport + testSupport + usageFrequency + (goal ? 20 : 8)
    };
    const id = makeId();
    const sourceSignals: DiscoveredFlowCandidate["sourceSignals"] = [];
    if (goal) sourceSignals.push("user_goal");
    for (const source of route.sources) sourceSignals.push(source);
    if (usageFrequency > 0) sourceSignals.push("usage_sequence");
    const evidenceIds = [...new Set([goal?.id, ...route.evidenceIds].filter((value): value is string => Boolean(value)))];
    const flow: ProductFlowRevision = {
      schemaVersion: "1",
      id,
      revision: 1,
      projectId: bundle.projectId,
      environmentVersionId: bundle.environmentVersionId,
      personaId: persona.id,
      title: bounded(route.label || humanizeRoute(route.path), 160),
      goal: bounded(goal?.text ?? `Show the product state at ${route.path}.`, 600),
      startingState: { entryPath: "/" },
      steps: [{ id: "navigate", intent: `Open ${route.path}.`, action: { type: "navigate", path: route.path }, riskClass: "navigate" }],
      finalAssertions: [{ type: "url", path: route.path }],
      approval: { status: "draft" },
      sourceEvidenceIds: evidenceIds.length ? evidenceIds : [`route:${route.path}`]
    };
    return {
      id,
      flow: parseProductFlowRevision(flow),
      sourceSignals: [...new Set(sourceSignals)],
      ranking,
      confidence: Math.min(0.95, 0.45 + sourceSignals.length * 0.12),
      assumptions: route.sources.has("rendered_ui") ? [] : ["Route was not observed in the rendered navigation and must be dry-run verified."]
    };
  });
  return candidates.sort((left, right) => right.ranking.total - left.ranking.total || left.flow.title.localeCompare(right.flow.title)).slice(0, bundle.maxCandidates);
}

export interface FlowReasoningProvider {
  provider: string;
  model: string;
  propose(input: {
    trustedInstructions: { schemaVersion: "1"; allowedActionTypes: string[]; allowedRisks: BrowserActionRisk[]; maxCandidates: number };
    untrustedEvidence: DiscoveryEvidenceBundle;
  }): Promise<unknown[]>;
}

export class FlowDiscoveryRejectedError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class FlowDiscoveryCircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  constructor(private readonly threshold = 3, private readonly cooldownMs = 60_000) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20 || !Number.isInteger(cooldownMs) || cooldownMs < 1_000 || cooldownMs > 3_600_000) throw new Error("Discovery circuit-breaker configuration is invalid.");
  }
  assertAvailable(nowMs: number): void {
    if (this.openedAt === null) return;
    if (nowMs - this.openedAt >= this.cooldownMs) { this.failures = 0; this.openedAt = null; return; }
    throw new FlowDiscoveryRejectedError("discovery_circuit_open", "Discovery provider circuit is open.");
  }
  success(): void { this.failures = 0; this.openedAt = null; }
  failure(nowMs: number): void { this.failures += 1; if (this.failures >= this.threshold) this.openedAt = nowMs; }
}

export async function discoverModelGuidedFlows(input: {
  bundle: DiscoveryEvidenceBundle;
  provider: FlowReasoningProvider;
  promptVersion: string;
  attempt?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  circuitBreaker?: FlowDiscoveryCircuitBreaker;
  nowMs?: () => number;
}): Promise<{ candidates: DiscoveredFlowCandidate[]; receipt: { provider: string; model: string; promptVersion: string; evidenceHash: string; promptInjectionSignalIds: string[]; attempt: number; maxAttempts: number; timeoutMs: number; candidateCount: number } }> {
  verifyEvidenceHash(input.bundle);
  const attempt = whole(input.attempt ?? 1, 1, 100, "attempt");
  const maxAttempts = whole(input.maxAttempts ?? 2, 1, 5, "maximum attempts");
  const timeoutMs = whole(input.timeoutMs ?? 8_000, 250, 30_000, "provider timeout");
  if (attempt > maxAttempts) throw new FlowDiscoveryRejectedError("discovery_attempt_budget_exhausted", "Discovery provider attempt budget is exhausted.");
  const provider = bounded(input.provider.provider, 100);
  const model = bounded(input.provider.model, 200);
  const promptVersion = bounded(input.promptVersion, 100);
  const nowMs = input.nowMs ?? Date.now;
  try {
    input.circuitBreaker?.assertAvailable(nowMs());
    const proposals = await timeout(input.provider.propose({
      trustedInstructions: { schemaVersion: "1", allowedActionTypes: ["navigate", "click", "fill", "select", "key", "wait_for"], allowedRisks: input.bundle.allowedRisks, maxCandidates: input.bundle.maxCandidates },
      untrustedEvidence: structuredClone(input.bundle)
    }), timeoutMs);
    if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > input.bundle.maxCandidates) throw new FlowDiscoveryRejectedError("discovery_invalid_output", "Reasoning provider returned an invalid candidate count.");
    const candidates = proposals.map((proposal, index) => {
      let flow: ProductFlowRevision;
      try { flow = parseProductFlowRevision(proposal); } catch { throw new FlowDiscoveryRejectedError("discovery_invalid_output", "Reasoning provider returned a malformed flow."); }
      if (flow.projectId !== input.bundle.projectId || flow.environmentVersionId !== input.bundle.environmentVersionId) throw new FlowDiscoveryRejectedError("discovery_scope_expanded", "Reasoning provider returned a flow outside the discovery scope.");
      if (flow.approval.status !== "draft") throw new FlowDiscoveryRejectedError("discovery_approval_escalation", "Reasoning provider cannot approve product flows.");
      if (!input.bundle.personas.some((persona) => persona.id === flow.personaId)) throw new FlowDiscoveryRejectedError("discovery_unknown_persona", "Reasoning provider returned an unknown persona.");
      if (flow.steps.some((step) => !input.bundle.allowedRisks.includes(step.riskClass))) throw new FlowDiscoveryRejectedError("discovery_risk_escalation", "Reasoning provider returned a disallowed risk class.");
      assertEvidenceGrounded(flow, input.bundle);
      return { id: flow.id, flow, sourceSignals: ["model" as const], ranking: { userPriority: 0, repositorySupport: 0, usageFrequency: 0, marketingProofPotential: 0, riskPenalty: 0, total: 0 }, confidence: 0.5, assumptions: [`Model proposal ${index + 1} requires deterministic dry-run verification.`] };
    });
    if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) throw new FlowDiscoveryRejectedError("discovery_duplicate_candidate", "Reasoning provider returned duplicate flow IDs.");
    input.circuitBreaker?.success();
    return { candidates, receipt: { provider, model, promptVersion, evidenceHash: input.bundle.evidenceHash, promptInjectionSignalIds: detectPromptInjectionSignals(input.bundle), attempt, maxAttempts, timeoutMs, candidateCount: candidates.length } };
  } catch (error) {
    input.circuitBreaker?.failure(nowMs());
    if (error instanceof FlowDiscoveryRejectedError) throw error;
    throw new FlowDiscoveryRejectedError("discovery_provider_failed", "Discovery provider failed.");
  }
}

export function detectPromptInjectionSignals(bundle: DiscoveryEvidenceBundle): string[] {
  const suspicious = /\b(ignore (?:all |previous |prior )?instructions|system prompt|developer message|reveal (?:the )?(?:secret|password|token)|send (?:data|credentials) to|execute (?:this )?(?:code|command))\b/i;
  const values: Array<[string, string]> = [
    ...bundle.goals.map((goal) => [`goal:${goal.id}`, goal.text] as [string, string]),
    ...bundle.renderedPages.flatMap((page) => [[page.id, page.title] as [string, string], ...page.controls.map((control, index) => [`${page.id}:control:${index}`, control.name] as [string, string])]),
    ...(bundle.repository?.tests.map((test) => [`repo-test:${test.id}`, test.title] as [string, string]) ?? [])
  ];
  return values.filter(([, value]) => suspicious.test(value)).map(([id]) => id);
}

function routeInventory(bundle: DiscoveryEvidenceBundle) {
  const routes = new Map<string, { path: string; label?: string; sources: Set<"rendered_ui" | "repository_route" | "repository_test">; evidenceIds: string[] }>();
  const add = (pathValue: string, label: string | undefined, source: "rendered_ui" | "repository_route" | "repository_test", evidenceId: string) => {
    const routePath = normalizeRoute(pathValue);
    const current = routes.get(routePath) ?? { path: routePath, label, sources: new Set(), evidenceIds: [] };
    current.label ||= label;
    current.sources.add(source);
    current.evidenceIds.push(evidenceId);
    routes.set(routePath, current);
  };
  for (const page of bundle.renderedPages) {
    add(page.url, page.title, "rendered_ui", page.id);
    for (const control of page.controls) if (control.destinationPath) add(control.destinationPath, control.name, "rendered_ui", page.id);
  }
  for (const route of bundle.repository?.routePaths ?? []) add(route.path, route.label, "repository_route", `repo-route:${route.path}`);
  for (const test of bundle.repository?.tests ?? []) for (const route of test.routePaths) add(route, test.title, "repository_test", `repo-test:${test.id}`);
  return [...routes.values()].filter((route) => route.path !== "/");
}

function sanitizePage(page: RenderedPageEvidence): RenderedPageEvidence {
  if (!/^[a-f0-9]{64}$/.test(page.accessibleTreeHash) || !/^[a-f0-9]{64}$/.test(page.domStructureHash) || (page.screenshotHash !== undefined && !/^[a-f0-9]{64}$/.test(page.screenshotHash))) throw new Error("Rendered page fingerprints are invalid.");
  return { id: bounded(page.id, 200), url: normalizeRoute(page.url), title: bounded(page.title, 160), controls: page.controls.slice(0, 500).map((control) => ({ role: control.role, name: bounded(control.name, 160), destinationPath: control.destinationPath ? normalizeRoute(control.destinationPath) : undefined })), accessibleTreeHash: page.accessibleTreeHash, domStructureHash: page.domStructureHash, screenshotHash: page.screenshotHash };
}

function sanitizeRepository(value: RepositoryEvidence): RepositoryEvidence {
  return { routePaths: value.routePaths.slice(0, 500).map((route) => ({ path: normalizeRoute(route.path), label: route.label ? bounded(route.label, 160) : undefined, requiredRole: route.requiredRole ? bounded(route.requiredRole, 120) : undefined })), tests: value.tests.slice(0, 200).map((test) => ({ id: bounded(test.id, 200), title: bounded(test.title, 200), routePaths: test.routePaths.slice(0, 50).map(normalizeRoute) })), featureFlagIds: value.featureFlagIds.slice(0, 200).map((id) => bounded(id, 200)) };
}

function sanitizeSequence(value: UsageSequenceEvidence): UsageSequenceEvidence {
  return { id: bounded(value.id, 200), personaKey: value.personaKey ? bounded(value.personaKey, 120) : undefined, eventKeys: value.eventKeys.slice(0, 50).map((key) => bounded(key, 160)), approximateSessions: Math.trunc(value.approximateSessions), completionRate: value.completionRate === undefined ? undefined : Math.max(0, Math.min(1, value.completionRate)) };
}

function normalizeRoute(value: string): string {
  const url = new URL(value, "https://capture.invalid");
  const path = url.pathname.split("/").map((part) => (/^[0-9a-f]{8,}$/i.test(part) || /^\d+$/.test(part) ? ":id" : part)).join("/");
  return path.startsWith("/") ? path.slice(0, 2000) : `/${path}`;
}

function assertEvidenceGrounded(flow: ProductFlowRevision, bundle: DiscoveryEvidenceBundle): void {
  const evidenceIds = new Set([
    ...bundle.goals.map((goal) => goal.id),
    ...bundle.renderedPages.map((page) => page.id),
    ...(bundle.repository?.routePaths.map((route) => `repo-route:${normalizeRoute(route.path)}`) ?? []),
    ...(bundle.repository?.tests.map((test) => `repo-test:${test.id}`) ?? []),
    ...(bundle.usageSequences?.map((sequence) => sequence.id) ?? [])
  ]);
  if (flow.sourceEvidenceIds.some((id) => !evidenceIds.has(id))) throw new FlowDiscoveryRejectedError("discovery_ungrounded_evidence", "Reasoning provider cited evidence outside the bounded bundle.");
  const routes = new Set(routeInventory(bundle).map((route) => route.path));
  const controls = new Set(bundle.renderedPages.flatMap((page) => page.controls.map((control) => normalizedText(control.name))));
  for (const step of flow.steps) {
    const action = step.action;
    if (action.type === "navigate" && !routes.has(normalizeRoute(action.path))) throw new FlowDiscoveryRejectedError("discovery_route_drift", "Reasoning provider proposed a route absent from bounded evidence.");
    if ((action.type === "click" || action.type === "fill" || action.type === "select") && (!action.target || !controls.has(normalizedText(action.target.value)))) throw new FlowDiscoveryRejectedError("discovery_control_drift", "Reasoning provider proposed a control absent from bounded evidence.");
  }
}

function bestGoalForRoute(goals: DiscoveryEvidenceBundle["goals"], text: string) {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  return [...goals].sort((left, right) => scoreGoal(right, words) - scoreGoal(left, words))[0];
}
function scoreGoal(goal: DiscoveryEvidenceBundle["goals"][number], words: Set<string>) { return goal.priority + goal.text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => words.has(word)).length * 20; }
function usageScore(sequences: UsageSequenceEvidence[] | undefined, route: string) { const token = route.split("/").filter(Boolean).at(-1)?.replace(":id", "") ?? ""; return Math.min(30, Math.round((sequences ?? []).filter((item) => item.eventKeys.some((event) => event.toLowerCase().includes(token))).reduce((sum, item) => sum + item.approximateSessions, 0) / 10)); }
function humanizeRoute(route: string) { return route.split("/").filter(Boolean).map((part) => part === ":id" ? "detail" : part.replace(/[-_]/g, " ")).join(" → ") || "Home"; }
function verifyEvidenceHash(bundle: DiscoveryEvidenceBundle) { const { evidenceHash, ...withoutHash } = bundle; if (sha256(stableSerialize(withoutHash)) !== evidenceHash) throw new Error("Discovery evidence hash does not match its contents."); }
function bounded(value: string, max: number) { const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, " "); if (!normalized || normalized.length > max) throw new Error("Discovery evidence field is invalid."); return normalized; }
function clamp(value: number, min: number, max: number) { if (!Number.isFinite(value)) return min; return Math.max(min, Math.min(max, Math.trunc(value))); }
function whole(value: number, min: number, max: number, label: string) { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Discovery ${label} is invalid.`); return value; }
function normalizedText(value: string) { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new FlowDiscoveryRejectedError("discovery_provider_timeout", "Discovery provider timed out.")), timeoutMs); promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
