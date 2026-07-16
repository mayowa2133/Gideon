import { parseProductFlowRevision, type AssertionSpec, type LocatorSpec, type ProductFlowRevision } from "../shared/productFlowCapture";
import { assessLocatorAgainstInventory, type LocatorControlEvidence } from "./captureLocators";

export interface FlowRepairProposal {
  stepId: string;
  replacementLocator?: LocatorSpec;
  replacementWaitAssertion?: AssertionSpec;
  evidenceIds: string[];
  rationale: string;
}

export interface RepairPageFingerprint {
  path: string;
  accessibleTreeHash: string;
  domStructureHash: string;
  screenshotHash: string;
}

export interface FlowRepairPageComparison {
  failureCode: "locator_ambiguous" | "locator_not_found" | "locator_not_visible";
  approved: RepairPageFingerprint;
  current: RepairPageFingerprint;
  accessibilitySimilarity: number;
  screenshotSimilarity: number;
}

export interface FlowRepairReceipt {
  schemaVersion: "1";
  flowId: string;
  fromRevision: number;
  toRevision: number;
  attempt: number;
  maxAttempts: number;
  decision: "locator_repair_draft" | "material_change_review_required" | "blocked";
  blockerCode?: string;
  changeClassification: "locator_drift" | "material_change";
  evidence: {
    failureCode: FlowRepairPageComparison["failureCode"];
    approvedAccessibleTreeHash: string;
    currentAccessibleTreeHash: string;
    approvedDomStructureHash: string;
    currentDomStructureHash: string;
    approvedScreenshotHash: string;
    currentScreenshotHash: string;
    accessibilitySimilarity: number;
    screenshotSimilarity: number;
  };
  provider?: string;
  model?: string;
  proposalCount: number;
}

export interface FlowRepairProvider {
  provider: string;
  model: string;
  propose(input: {
    trustedInstructions: { schemaVersion: "1"; allowedChanges: ["locator", "wait_assertion"]; maxRepairs: number; attempt: number; maxAttempts: number; timeoutMs: number };
    untrustedFailureEvidence: { flowId: string; revision: number; failedStepIds: string[]; visibleControls: LocatorControlEvidence[]; currentPath: string; failureCode: FlowRepairPageComparison["failureCode"]; fingerprintComparison: { accessibilitySimilarity: number; screenshotSimilarity: number } };
  }): Promise<unknown[]>;
}

export class FlowRepairCircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  constructor(private readonly threshold = 3, private readonly cooldownMs = 60_000) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20 || !Number.isInteger(cooldownMs) || cooldownMs < 1_000 || cooldownMs > 3_600_000) throw new Error("Flow repair circuit-breaker configuration is invalid.");
  }
  assertAvailable(nowMs: number): void {
    if (this.openedAt === null) return;
    if (nowMs - this.openedAt >= this.cooldownMs) { this.failures = 0; this.openedAt = null; return; }
    throw new RepairValidationError("repair_circuit_open", "Flow repair provider circuit is open.");
  }
  success(): void { this.failures = 0; this.openedAt = null; }
  failure(nowMs: number): void { this.failures += 1; if (this.failures >= this.threshold) this.openedAt = nowMs; }
}

export class FlowRepairRejectedError extends Error {
  constructor(message: string, readonly receipt: FlowRepairReceipt) { super(message); }
}

export async function proposeBoundedFlowRepair(input: {
  flow: ProductFlowRevision;
  failedStepIds: string[];
  visibleControls: LocatorControlEvidence[];
  currentPath: string;
  pageComparison: FlowRepairPageComparison;
  provider: FlowRepairProvider;
  maxRepairs?: number;
  attempt?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  circuitBreaker?: FlowRepairCircuitBreaker;
  nowMs?: () => number;
}): Promise<{ repairedDraft: ProductFlowRevision; proposals: FlowRepairProposal[]; provider?: string; model?: string; receipt: FlowRepairReceipt }> {
  if (input.flow.approval.status !== "approved" || input.flow.approval.approvedRevision !== input.flow.revision) throw new Error("Only a current approved flow can be repaired.");
  const comparison = validateComparison(input.pageComparison);
  const controls = sanitizeControls(input.visibleControls);
  const failedStepIds = uniqueIds(input.failedStepIds, 10, "failed step IDs");
  if (failedStepIds.length < 1 || failedStepIds.some((id) => !input.flow.steps.some((step) => step.id === id))) throw new Error("Flow repair failed step IDs are invalid.");
  const currentPath = bounded(input.currentPath, 2_000, "current path");
  if (normalizedPath(currentPath) !== normalizedPath(comparison.current.path)) throw new Error("Flow repair current path does not match the page comparison.");
  const maxRepairs = integer(input.maxRepairs ?? 2, 1, 5, "max repairs");
  const maxAttempts = integer(input.maxAttempts ?? 2, 1, 5, "max attempts");
  const attempt = integer(input.attempt ?? 1, 1, 100, "attempt");
  const timeoutMs = integer(input.timeoutMs ?? 8_000, 250, 30_000, "provider timeout");
  const classification = classifyRepairChange(comparison);
  const next = structuredClone(input.flow);
  next.revision += 1;
  next.approval = { status: "draft" };
  const receiptBase = (): Omit<FlowRepairReceipt, "decision" | "proposalCount"> => ({
    schemaVersion: "1", flowId: input.flow.id, fromRevision: input.flow.revision, toRevision: next.revision, attempt, maxAttempts, changeClassification: classification, evidence: receiptEvidence(comparison)
  });
  if (classification === "material_change") {
    return { repairedDraft: parseProductFlowRevision(next), proposals: [], receipt: { ...receiptBase(), decision: "material_change_review_required", blockerCode: "material_application_change", proposalCount: 0 } };
  }
  if (attempt > maxAttempts) throw new FlowRepairRejectedError("Flow repair attempt budget is exhausted.", { ...receiptBase(), decision: "blocked", blockerCode: "repair_attempt_budget_exhausted", proposalCount: 0 });
  const providerName = bounded(input.provider.provider, 100, "provider");
  const model = bounded(input.provider.model, 200, "model");
  const nowMs = input.nowMs ?? Date.now;
  try {
    input.circuitBreaker?.assertAvailable(nowMs());
    const raw = await withTimeout(input.provider.propose({
      trustedInstructions: { schemaVersion: "1", allowedChanges: ["locator", "wait_assertion"], maxRepairs, attempt, maxAttempts, timeoutMs },
      untrustedFailureEvidence: { flowId: input.flow.id, revision: input.flow.revision, failedStepIds, visibleControls: controls, currentPath, failureCode: comparison.failureCode, fingerprintComparison: { accessibilitySimilarity: comparison.accessibilitySimilarity, screenshotSimilarity: comparison.screenshotSimilarity } }
    }), timeoutMs);
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > maxRepairs) throw new RepairValidationError("repair_provider_output_invalid", "Flow repair provider returned an invalid proposal count.");
    const proposals = raw.map(parseProposal);
    if (new Set(proposals.map((proposal) => proposal.stepId)).size !== proposals.length) throw new RepairValidationError("repair_duplicate_proposal", "Flow repair provider returned duplicate step proposals.");
    for (const proposal of proposals) {
      if (!failedStepIds.includes(proposal.stepId)) throw new RepairValidationError("repair_scope_expanded", "Flow repair targeted a step that did not fail.");
      const step = next.steps.find((candidate) => candidate.id === proposal.stepId);
      if (!step) throw new RepairValidationError("repair_scope_expanded", "Flow repair targeted an unknown step.");
      if (proposal.replacementLocator) {
        if (!("target" in step.action) || !step.action.target) throw new RepairValidationError("repair_action_changed", "Flow repair cannot add a locator to this action.");
        const assessment = assessLocatorAgainstInventory(proposal.replacementLocator, controls);
        if (assessment.status !== "unique") throw new RepairValidationError(assessment.status === "ambiguous" ? "repair_locator_ambiguous" : "repair_locator_missing", "Flow repair replacement locator is not uniquely supported by current evidence.");
        step.action.target = proposal.replacementLocator;
      }
      if (proposal.replacementWaitAssertion) {
        if (step.action.type !== "wait_for") throw new RepairValidationError("repair_action_changed", "Flow repair can change wait assertions only on wait steps.");
        step.action.assertion = proposal.replacementWaitAssertion;
      }
      next.sourceEvidenceIds = [...new Set([...next.sourceEvidenceIds, ...proposal.evidenceIds])];
    }
    const repairedDraft = parseProductFlowRevision(next);
    input.circuitBreaker?.success();
    return { repairedDraft, proposals, provider: providerName, model, receipt: { ...receiptBase(), decision: "locator_repair_draft", provider: providerName, model, proposalCount: proposals.length } };
  } catch (error) {
    input.circuitBreaker?.failure(nowMs());
    const code = error instanceof RepairValidationError ? error.code : "repair_provider_failed";
    const message = error instanceof Error ? error.message : "Flow repair provider failed.";
    throw new FlowRepairRejectedError(message, { ...receiptBase(), decision: "blocked", blockerCode: code, provider: providerName, model, proposalCount: 0 });
  }
}

export function classifyRepairChange(input: FlowRepairPageComparison): "locator_drift" | "material_change" {
  const value = validateComparison(input);
  if (normalizedPath(value.approved.path) !== normalizedPath(value.current.path)) return "material_change";
  if (value.approved.domStructureHash !== value.current.domStructureHash) return "material_change";
  if (value.accessibilitySimilarity < 0.7 || value.screenshotSimilarity < 0.65) return "material_change";
  return "locator_drift";
}

function parseProposal(value: unknown): FlowRepairProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RepairValidationError("repair_provider_output_invalid", "Flow repair proposal must be an object.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["stepId", "replacementLocator", "replacementWaitAssertion", "evidenceIds", "rationale"]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new RepairValidationError("repair_provider_output_invalid", `Flow repair proposal.${unknown} is not allowed.`);
  const stepId = bounded(record.stepId, 200, "proposal step ID");
  const rationale = bounded(record.rationale, 500, "proposal rationale");
  const evidenceIds = uniqueIds(record.evidenceIds, 20, "evidence IDs");
  const changes = Number(record.replacementLocator !== undefined) + Number(record.replacementWaitAssertion !== undefined);
  if (changes !== 1) throw new RepairValidationError("repair_provider_output_invalid", "Flow repair proposal must contain exactly one bounded change.");
  return { stepId, replacementLocator: record.replacementLocator as LocatorSpec | undefined, replacementWaitAssertion: record.replacementWaitAssertion as AssertionSpec | undefined, evidenceIds, rationale };
}

function validateComparison(input: FlowRepairPageComparison): FlowRepairPageComparison {
  if (!input || !["locator_ambiguous", "locator_not_found", "locator_not_visible"].includes(input.failureCode)) throw new Error("Flow repair failure comparison is invalid.");
  for (const page of [input.approved, input.current]) {
    bounded(page.path, 2_000, "fingerprint path");
    for (const value of [page.accessibleTreeHash, page.domStructureHash, page.screenshotHash]) if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Flow repair page fingerprint is invalid.");
  }
  for (const value of [input.accessibilitySimilarity, input.screenshotSimilarity]) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Flow repair similarity score is invalid.");
  return structuredClone(input);
}

function receiptEvidence(input: FlowRepairPageComparison): FlowRepairReceipt["evidence"] { return { failureCode: input.failureCode, approvedAccessibleTreeHash: input.approved.accessibleTreeHash, currentAccessibleTreeHash: input.current.accessibleTreeHash, approvedDomStructureHash: input.approved.domStructureHash, currentDomStructureHash: input.current.domStructureHash, approvedScreenshotHash: input.approved.screenshotHash, currentScreenshotHash: input.current.screenshotHash, accessibilitySimilarity: input.accessibilitySimilarity, screenshotSimilarity: input.screenshotSimilarity }; }
function sanitizeControls(values: LocatorControlEvidence[]): LocatorControlEvidence[] {
  if (!Array.isArray(values) || values.length > 500) throw new Error("Flow repair control evidence is invalid.");
  const roles = new Set(["button", "link", "textbox", "combobox", "checkbox", "radio", "tab", "menuitem", "heading"]);
  const scopeRoles = new Set(["navigation", "region", "dialog", "form", "main"]);
  return values.map((control) => {
    if (!control || !roles.has(control.role) || (control.scopeRole !== undefined && !scopeRoles.has(control.scopeRole)) || ((control.scopeRole === undefined) !== (control.scopeName === undefined))) throw new Error("Flow repair control evidence is invalid.");
    return { role: control.role, name: bounded(control.name, 300, "control name"), label: optional(control.label, 300), testId: optional(control.testId, 200), placeholder: optional(control.placeholder, 300), destinationPath: optional(control.destinationPath, 2_000), scopeRole: control.scopeRole, scopeName: optional(control.scopeName, 160) };
  });
}
function uniqueIds(value: unknown, maximum: number, label: string): string[] { if (!Array.isArray(value) || value.length > maximum) throw new RepairValidationError("repair_provider_output_invalid", `Flow repair ${label} are invalid.`); const output = value.map((id) => bounded(id, 300, label)); if (new Set(output).size !== output.length) throw new RepairValidationError("repair_provider_output_invalid", `Flow repair ${label} contain duplicates.`); return output; }
function optional(value: string | undefined, maximum: number): string | undefined { return value === undefined ? undefined : bounded(value, maximum, "optional evidence"); }
function bounded(value: unknown, maximum: number, label: string): string { if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new RepairValidationError("repair_provider_output_invalid", `Flow repair ${label} is invalid.`); return value.trim(); }
function integer(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Flow repair ${label} is invalid.`); return value; }
function normalizedPath(value: string): string { return new URL(value, "https://capture.invalid").pathname; }
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> { return new Promise<T>((resolve, reject) => { const timeout = setTimeout(() => reject(new RepairValidationError("repair_provider_timeout", "Flow repair provider timed out.")), timeoutMs); promise.then((value) => { clearTimeout(timeout); resolve(value); }, (error) => { clearTimeout(timeout); reject(error); }); }); }

class RepairValidationError extends Error { constructor(readonly code: string, message: string) { super(message); } }
