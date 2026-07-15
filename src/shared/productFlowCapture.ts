export type BrowserActionRisk =
  | "observe"
  | "navigate"
  | "synthetic_write"
  | "external_side_effect"
  | "financial"
  | "destructive"
  | "security_sensitive"
  | "publish_or_invite";

export type BrowserActionOrigin = "approved_plan" | "computer_provider" | "login_adapter";

export type AllowedBrowserKey =
  | "Enter"
  | "Escape"
  | "Tab"
  | "Shift+Tab"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Space";

export interface LocatorSpec {
  strategy: "role" | "label" | "test_id" | "placeholder" | "text";
  value: string;
  role?: "button" | "link" | "textbox" | "combobox" | "checkbox" | "radio" | "tab" | "menuitem";
  exact?: boolean;
}

export type AssertionSpec =
  | { type: "url"; path: string }
  | { type: "visible"; target: LocatorSpec }
  | { type: "hidden"; target: LocatorSpec }
  | { type: "text"; target: LocatorSpec; value: string }
  | { type: "value"; target: LocatorSpec; valueRef: string };

export type ProductFlowAction =
  | { type: "navigate"; path: string }
  | { type: "click"; target: LocatorSpec }
  | { type: "fill"; target: LocatorSpec; valueRef: string }
  | { type: "select"; target: LocatorSpec; optionRef: string }
  | { type: "key"; target?: LocatorSpec; key: AllowedBrowserKey }
  | { type: "wait_for"; assertion: AssertionSpec };

export interface ProductFlowStep {
  id: string;
  intent: string;
  action: ProductFlowAction;
  expectedState?: AssertionSpec[];
  riskClass: BrowserActionRisk;
}

export interface ProductFlowRevision {
  schemaVersion: "1";
  id: string;
  revision: number;
  projectId: string;
  environmentVersionId: string;
  personaId: string;
  title: string;
  goal: string;
  startingState: {
    entryPath: string;
    fixtureProfileId?: string;
    credentialGrantId?: string;
  };
  steps: ProductFlowStep[];
  finalAssertions: AssertionSpec[];
  approval: {
    status: "draft" | "approved" | "rejected";
    approvedBy?: string;
    approvedAt?: string;
    approvedRevision?: number;
  };
  sourceEvidenceIds: string[];
}

export interface BrowserExecutionPolicy {
  baseUrl: string;
  allowedDomains: string[];
  allowedRisks: BrowserActionRisk[];
  allowedKeys: AllowedBrowserKey[];
  allowHttpLocalhost: boolean;
  allowSubdomains: boolean;
  allowCredentialInjectionFromLoginAdapter: boolean;
  maxSteps: number;
}

export interface BrowserActionRequest {
  action: ProductFlowAction;
  declaredRisk: BrowserActionRisk;
  origin: BrowserActionOrigin;
}

export interface BrowserPolicyDecision {
  allowed: boolean;
  effectiveRisk: BrowserActionRisk;
  code:
    | "allowed"
    | "domain_not_allowed"
    | "scheme_not_allowed"
    | "url_credentials_not_allowed"
    | "private_network_not_allowed"
    | "risk_not_allowed"
    | "key_not_allowed"
    | "credential_injection_not_allowed"
    | "invalid_value_reference"
    | "sensitive_action_misclassified";
  reason: string;
}

export interface AssertionReceipt {
  assertion: AssertionSpec;
  passed: boolean;
  safeMessage: string;
}

export interface FlowStepReceipt {
  stepId: string;
  status: "succeeded" | "failed" | "blocked" | "skipped";
  policyDecision: BrowserPolicyDecision;
  assertions: AssertionReceipt[];
  startedAt: string;
  completedAt: string;
  safeErrorCode?: string;
}

export interface FlowExecutionReceipt {
  schemaVersion: "1";
  id: string;
  workspaceId: string;
  projectId: string;
  flowId: string;
  flowRevision: number;
  environmentVersionId: string;
  compiledPlanHash: string;
  status: "verified" | "failed" | "blocked";
  steps: FlowStepReceipt[];
  finalAssertions: AssertionReceipt[];
  startedAt: string;
  completedAt: string;
  blockerCode?: string;
}

export type CoverageDimensionKey =
  | "goal"
  | "approved_flow"
  | "persona"
  | "route"
  | "state"
  | "usage_sequence"
  | "feature_flag"
  | "outcome"
  | "failure_state";

export interface CoverageDimensionInput {
  key: CoverageDimensionKey;
  denominatorSource?: string;
  knownIds?: string[];
  coveredIds: string[];
  excluded?: Array<{ id: string; reason: string }>;
  blocked?: Array<{ id: string; code: string }>;
}

export interface CoverageDimensionSnapshot {
  key: CoverageDimensionKey;
  denominatorSource?: string;
  denominator: number | "unknown";
  coveredIds: string[];
  uncoveredIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  blocked: Array<{ id: string; code: string }>;
}

export interface CoverageSnapshot {
  schemaVersion: "1";
  id: string;
  workspaceId: string;
  projectId: string;
  environmentVersionId: string;
  calculationVersion: string;
  dimensions: CoverageDimensionSnapshot[];
  createdAt: string;
}

export type CaptureEnvironmentType = "local_preview" | "staging" | "demo" | "production_sandbox";
export type CaptureEnvironmentStatus = "draft" | "validating" | "ready" | "failed" | "revoked";

export interface CaptureEnvironment {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  type: CaptureEnvironmentType;
  baseUrl: string;
  allowedDomains: string[];
  status: CaptureEnvironmentStatus;
  resetAdapter: "none" | "http_endpoint" | "fixture_api" | "disposable_account" | "manual";
  revision: number;
  currentVersionId?: string;
  safeErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureEnvironmentVersion {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  revision: number;
  applicationFingerprint: string;
  browserPolicyFingerprint: string;
  networkReceiptArtifactId?: string;
  validatedAt: string;
  createdAt: string;
}

export interface CapturePersona {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
  key: string;
  displayName: string;
  roleDescription: string;
  fixtureProfileId?: string;
  credentialGrantId?: string;
  status: "active" | "disabled";
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryRun {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentVersionId: string;
  jobId: string;
  status:
    | "draft"
    | "queued"
    | "inventory"
    | "exploring"
    | "synthesizing"
    | "validating"
    | "ready_for_review"
    | "failed"
    | "canceled";
  promptVersion: string;
  provider?: string;
  model?: string;
  evidenceManifestArtifactId?: string;
  resultManifestArtifactId?: string;
  maxSteps: number;
  maxScreenshots: number;
  maxDurationMs: number;
  safeErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureRun {
  id: string;
  workspaceId: string;
  projectId: string;
  environmentVersionId: string;
  jobId: string;
  status:
    | "queued"
    | "provisioning"
    | "resetting"
    | "authenticating"
    | "dry_running"
    | "repairing"
    | "recording"
    | "normalizing"
    | "verifying"
    | "completed"
    | "needs_review"
    | "failed"
    | "canceled";
  flowRevisionIds: string[];
  compiledPlanHashes: string[];
  policyFingerprint: string;
  idempotencyKey: string;
  requestHash: string;
  estimatedBrowserSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowExecutionRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  captureRunId: string;
  flowId: string;
  flowRevision: number;
  environmentVersionId: string;
  status: "queued" | "running" | "verified" | "failed" | "blocked" | "canceled";
  attempt: number;
  compiledPlanHash: string;
  receiptArtifactId?: string;
  rawCaptureArtifactId?: string;
  normalizedClipArtifactId?: string;
  blockerCode?: string;
  createdAt: string;
  updatedAt: string;
}

const locatorStrategies = new Set<LocatorSpec["strategy"]>(["role", "label", "test_id", "placeholder", "text"]);
const locatorRoles = new Set<NonNullable<LocatorSpec["role"]>>([
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "tab",
  "menuitem"
]);
const actionRisks = new Set<BrowserActionRisk>([
  "observe",
  "navigate",
  "synthetic_write",
  "external_side_effect",
  "financial",
  "destructive",
  "security_sensitive",
  "publish_or_invite"
]);
const allowedBrowserKeys = new Set<AllowedBrowserKey>([
  "Enter",
  "Escape",
  "Tab",
  "Shift+Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space"
]);
const actionTypes = new Set<ProductFlowAction["type"]>(["navigate", "click", "fill", "select", "key", "wait_for"]);
const assertionTypes = new Set<AssertionSpec["type"]>(["url", "visible", "hidden", "text", "value"]);
const approvalStatuses = new Set<ProductFlowRevision["approval"]["status"]>(["draft", "approved", "rejected"]);

export function validateProductFlowRevision(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ["Flow must be an object."];
  }
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "id",
      "revision",
      "projectId",
      "environmentVersionId",
      "personaId",
      "title",
      "goal",
      "startingState",
      "steps",
      "finalAssertions",
      "approval",
      "sourceEvidenceIds"
    ],
    "flow",
    errors
  );
  if (value.schemaVersion !== "1") errors.push("schemaVersion must be 1.");
  validateBoundedString(value.id, "id", 1, 200, errors);
  validatePositiveInteger(value.revision, "revision", errors);
  validateBoundedString(value.projectId, "projectId", 1, 200, errors);
  validateBoundedString(value.environmentVersionId, "environmentVersionId", 1, 200, errors);
  validateBoundedString(value.personaId, "personaId", 1, 200, errors);
  validateBoundedString(value.title, "title", 1, 160, errors);
  validateBoundedString(value.goal, "goal", 3, 600, errors);
  validateStartingState(value.startingState, errors);
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 100) {
    errors.push("steps must contain 1–100 items.");
  } else {
    const stepIds = new Set<string>();
    value.steps.forEach((step, index) => {
      validateFlowStep(step, index, errors);
      if (isRecord(step) && typeof step.id === "string") {
        if (stepIds.has(step.id)) errors.push(`steps[${index}].id must be unique.`);
        stepIds.add(step.id);
      }
    });
  }
  validateAssertions(value.finalAssertions, "finalAssertions", true, errors);
  validateApproval(value.approval, value.revision, errors);
  validateStringArray(value.sourceEvidenceIds, "sourceEvidenceIds", 200, errors);
  return errors;
}

export function parseProductFlowRevision(value: unknown): ProductFlowRevision {
  const errors = validateProductFlowRevision(value);
  if (errors.length > 0) {
    throw new Error(`Invalid product flow revision: ${errors.join(" ")}`);
  }
  return value as ProductFlowRevision;
}

export function authorizeBrowserAction(
  request: BrowserActionRequest,
  policy: BrowserExecutionPolicy
): BrowserPolicyDecision {
  const inferredRisk = inferMinimumRisk(request.action);
  if (riskSeverity(inferredRisk) > riskSeverity(request.declaredRisk)) {
    return denied(
      inferredRisk,
      "sensitive_action_misclassified",
      `The action requires ${inferredRisk} approval but was declared as ${request.declaredRisk}.`
    );
  }
  const effectiveRisk = riskSeverity(inferredRisk) > riskSeverity(request.declaredRisk) ? inferredRisk : request.declaredRisk;
  if (!policy.allowedRisks.includes(effectiveRisk)) {
    return denied(effectiveRisk, "risk_not_allowed", `The ${effectiveRisk} action class is not allowed.`);
  }
  if (request.action.type === "navigate") {
    return authorizeNavigation(request.action.path, effectiveRisk, policy);
  }
  if (request.action.type === "key" && !policy.allowedKeys.includes(request.action.key)) {
    return denied(effectiveRisk, "key_not_allowed", `The ${request.action.key} key is not allowed.`);
  }
  if (request.action.type === "fill") {
    const valueKind = valueReferenceKind(request.action.valueRef);
    if (!valueKind) {
      return denied(effectiveRisk, "invalid_value_reference", "Fill actions must use fixture: or credential: references.");
    }
    if (valueKind === "credential") {
      if (request.origin !== "login_adapter" || !policy.allowCredentialInjectionFromLoginAdapter) {
        return denied(
          "security_sensitive",
          "credential_injection_not_allowed",
          "Only the approved login adapter may resolve credential references."
        );
      }
    }
  }
  if (request.action.type === "select" && valueReferenceKind(request.action.optionRef) !== "fixture") {
    return denied(effectiveRisk, "invalid_value_reference", "Select actions must use fixture: references.");
  }
  return allowed(effectiveRisk);
}

export function inferMinimumRisk(action: ProductFlowAction): BrowserActionRisk {
  if (action.type === "navigate" || action.type === "wait_for" || action.type === "key") {
    return action.type === "navigate" ? "navigate" : "observe";
  }
  const text = locatorText(action.target);
  if (/\b(pay|purchase|checkout|subscribe|billing|payout|bank|card)\b/i.test(text)) return "financial";
  if (/\b(delete|remove|purge|destroy|revoke|terminate)\b/i.test(text)) return "destructive";
  if (/\b(password|credential|security|permission|role|token|api key|mfa|two.factor)\b/i.test(text)) {
    return "security_sensitive";
  }
  if (/\b(publish|post|invite|share publicly|send invite)\b/i.test(text)) return "publish_or_invite";
  if (/\b(email|webhook|download|connect|integration|oauth|send)\b/i.test(text)) return "external_side_effect";
  return action.type === "click" ? "navigate" : "synthetic_write";
}

export function createFlowExecutionReceipt(input: Omit<FlowExecutionReceipt, "schemaVersion" | "status">): FlowExecutionReceipt {
  if (input.steps.length === 0) throw new Error("Execution receipts require at least one step.");
  if (!input.compiledPlanHash.match(/^[a-f0-9]{64}$/)) throw new Error("compiledPlanHash must be a SHA-256 hex digest.");
  assertChronology(input.startedAt, input.completedAt, "execution");
  for (const step of input.steps) {
    assertChronology(step.startedAt, step.completedAt, `step ${step.stepId}`);
  }
  const blockedStep = input.steps.find((step) => step.status === "blocked" || !step.policyDecision.allowed);
  const failedStep = input.steps.find(
    (step) => step.status === "failed" || step.assertions.some((assertion) => !assertion.passed)
  );
  const failedFinalAssertion = input.finalAssertions.some((assertion) => !assertion.passed);
  const status: FlowExecutionReceipt["status"] = blockedStep
    ? "blocked"
    : failedStep || failedFinalAssertion
      ? "failed"
      : "verified";
  if (status === "blocked" && !input.blockerCode) throw new Error("Blocked receipts require blockerCode.");
  if (status !== "blocked" && input.blockerCode) throw new Error("Only blocked receipts may include blockerCode.");
  return { ...input, schemaVersion: "1", status };
}

export function createCoverageSnapshot(input: Omit<CoverageSnapshot, "schemaVersion" | "dimensions"> & {
  dimensions: CoverageDimensionInput[];
}): CoverageSnapshot {
  const keys = new Set<CoverageDimensionKey>();
  const dimensions = input.dimensions.map((dimension) => {
    if (keys.has(dimension.key)) throw new Error(`Duplicate coverage dimension: ${dimension.key}.`);
    keys.add(dimension.key);
    const knownIds = dimension.knownIds ? uniqueNonEmpty(dimension.knownIds, `${dimension.key}.knownIds`) : undefined;
    const coveredIds = uniqueNonEmpty(dimension.coveredIds, `${dimension.key}.coveredIds`);
    const excluded = uniqueEntries(dimension.excluded ?? [], `${dimension.key}.excluded`);
    const blocked = uniqueEntries(dimension.blocked ?? [], `${dimension.key}.blocked`);
    if (!knownIds) {
      return {
        key: dimension.key,
        denominatorSource: dimension.denominatorSource,
        denominator: "unknown" as const,
        coveredIds,
        uncoveredIds: [],
        excluded,
        blocked
      };
    }
    const known = new Set(knownIds);
    for (const id of [...coveredIds, ...excluded.map((item) => item.id), ...blocked.map((item) => item.id)]) {
      if (!known.has(id)) throw new Error(`${dimension.key} references unknown coverage ID ${id}.`);
    }
    const accounted = new Set([...coveredIds, ...excluded.map((item) => item.id), ...blocked.map((item) => item.id)]);
    return {
      key: dimension.key,
      denominatorSource: dimension.denominatorSource,
      denominator: knownIds.length,
      coveredIds,
      uncoveredIds: knownIds.filter((id) => !accounted.has(id)),
      excluded,
      blocked
    };
  });
  return { ...input, schemaVersion: "1", dimensions };
}

function validateStartingState(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("startingState must be an object.");
    return;
  }
  rejectUnknownKeys(value, ["entryPath", "fixtureProfileId", "credentialGrantId"], "startingState", errors);
  validateBoundedString(value.entryPath, "startingState.entryPath", 1, 2_000, errors);
  validateOptionalBoundedString(value.fixtureProfileId, "startingState.fixtureProfileId", 1, 200, errors);
  validateOptionalBoundedString(value.credentialGrantId, "startingState.credentialGrantId", 1, 200, errors);
}

function validateFlowStep(value: unknown, index: number, errors: string[]): void {
  const path = `steps[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ["id", "intent", "action", "expectedState", "riskClass"], path, errors);
  validateBoundedString(value.id, `${path}.id`, 1, 200, errors);
  validateBoundedString(value.intent, `${path}.intent`, 1, 500, errors);
  validateAction(value.action, `${path}.action`, errors);
  if (value.expectedState !== undefined) validateAssertions(value.expectedState, `${path}.expectedState`, false, errors);
  if (!actionRisks.has(value.riskClass as BrowserActionRisk)) errors.push(`${path}.riskClass is invalid.`);
}

function validateAction(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !actionTypes.has(value.type as ProductFlowAction["type"])) {
    errors.push(`${path} has an invalid action type.`);
    return;
  }
  if (value.type === "navigate") {
    rejectUnknownKeys(value, ["type", "path"], path, errors);
    validateBoundedString(value.path, `${path}.path`, 1, 2_000, errors);
  } else if (value.type === "click") {
    rejectUnknownKeys(value, ["type", "target"], path, errors);
    validateLocator(value.target, `${path}.target`, errors);
  } else if (value.type === "fill") {
    rejectUnknownKeys(value, ["type", "target", "valueRef"], path, errors);
    validateLocator(value.target, `${path}.target`, errors);
    validateBoundedString(value.valueRef, `${path}.valueRef`, 1, 500, errors);
  } else if (value.type === "select") {
    rejectUnknownKeys(value, ["type", "target", "optionRef"], path, errors);
    validateLocator(value.target, `${path}.target`, errors);
    validateBoundedString(value.optionRef, `${path}.optionRef`, 1, 500, errors);
  } else if (value.type === "key") {
    rejectUnknownKeys(value, ["type", "target", "key"], path, errors);
    if (value.target !== undefined) validateLocator(value.target, `${path}.target`, errors);
    if (!allowedBrowserKeys.has(value.key as AllowedBrowserKey)) errors.push(`${path}.key is invalid.`);
  } else {
    rejectUnknownKeys(value, ["type", "assertion"], path, errors);
    validateAssertion(value.assertion, `${path}.assertion`, errors);
  }
}

function validateAssertions(value: unknown, path: string, required: boolean, errors: string[]): void {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > 50) {
    errors.push(`${path} must contain ${required ? "1–50" : "0–50"} assertions.`);
    return;
  }
  value.forEach((assertion, index) => validateAssertion(assertion, `${path}[${index}]`, errors));
}

function validateAssertion(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !assertionTypes.has(value.type as AssertionSpec["type"])) {
    errors.push(`${path} has an invalid assertion type.`);
    return;
  }
  if (value.type === "url") {
    rejectUnknownKeys(value, ["type", "path"], path, errors);
    validateBoundedString(value.path, `${path}.path`, 1, 2_000, errors);
    return;
  }
  if (value.type === "visible" || value.type === "hidden") {
    rejectUnknownKeys(value, ["type", "target"], path, errors);
    validateLocator(value.target, `${path}.target`, errors);
    return;
  }
  rejectUnknownKeys(value, ["type", "target", value.type === "text" ? "value" : "valueRef"], path, errors);
  validateLocator(value.target, `${path}.target`, errors);
  validateBoundedString(value.type === "text" ? value.value : value.valueRef, `${path}.${value.type === "text" ? "value" : "valueRef"}`, 1, 500, errors);
}

function validateLocator(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ["strategy", "value", "role", "exact"], path, errors);
  if (!locatorStrategies.has(value.strategy as LocatorSpec["strategy"])) errors.push(`${path}.strategy is invalid.`);
  validateBoundedString(value.value, `${path}.value`, 1, 300, errors);
  if (value.role !== undefined && !locatorRoles.has(value.role as NonNullable<LocatorSpec["role"]>)) {
    errors.push(`${path}.role is invalid.`);
  }
  if (value.strategy === "role" && value.role === undefined) errors.push(`${path}.role is required for role strategy.`);
  if (value.exact !== undefined && typeof value.exact !== "boolean") errors.push(`${path}.exact must be boolean.`);
}

function validateApproval(value: unknown, revision: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("approval must be an object.");
    return;
  }
  rejectUnknownKeys(value, ["status", "approvedBy", "approvedAt", "approvedRevision"], "approval", errors);
  if (!approvalStatuses.has(value.status as ProductFlowRevision["approval"]["status"])) errors.push("approval.status is invalid.");
  if (value.status === "approved") {
    validateBoundedString(value.approvedBy, "approval.approvedBy", 1, 200, errors);
    validateIsoDate(value.approvedAt, "approval.approvedAt", errors);
    if (value.approvedRevision !== revision) errors.push("approval.approvedRevision must match revision.");
  } else if (value.approvedBy !== undefined || value.approvedAt !== undefined || value.approvedRevision !== undefined) {
    errors.push("Only approved flows may include approval provenance.");
  }
}

function authorizeNavigation(path: string, risk: BrowserActionRisk, policy: BrowserExecutionPolicy): BrowserPolicyDecision {
  let url: URL;
  try {
    url = new URL(path, policy.baseUrl);
  } catch {
    return denied(risk, "domain_not_allowed", "Navigation URL is invalid.");
  }
  if (url.username || url.password) return denied(risk, "url_credentials_not_allowed", "URL credentials are forbidden.");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(policy.allowHttpLocalhost && local && url.protocol === "http:")) {
    return denied(risk, "scheme_not_allowed", "Navigation requires HTTPS except for approved localhost previews.");
  }
  const normalizedAllowed = policy.allowedDomains.map(normalizeHostname);
  const hostname = normalizeHostname(url.hostname);
  if (!local && isPrivateIpLiteral(hostname)) {
    return denied(risk, "private_network_not_allowed", "Private and link-local network destinations are forbidden.");
  }
  const domainAllowed = normalizedAllowed.some(
    (domain) => hostname === domain || (policy.allowSubdomains && hostname.endsWith(`.${domain}`))
  );
  if (!domainAllowed) return denied(risk, "domain_not_allowed", `Navigation to ${hostname} is not allowed.`);
  return allowed(risk);
}

function riskSeverity(risk: BrowserActionRisk): number {
  const rank: Record<BrowserActionRisk, number> = {
    observe: 0,
    navigate: 1,
    synthetic_write: 2,
    external_side_effect: 3,
    financial: 4,
    destructive: 4,
    security_sensitive: 4,
    publish_or_invite: 4
  };
  return rank[risk];
}

function valueReferenceKind(value: string): "fixture" | "credential" | null {
  if (/^fixture:[A-Za-z0-9._-]{1,200}$/.test(value)) return "fixture";
  if (/^credential:[A-Za-z0-9._-]{1,200}$/.test(value)) return "credential";
  return null;
}

function locatorText(locator: LocatorSpec): string {
  return `${locator.role ?? ""} ${locator.value}`.trim();
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

function isPrivateIpLiteral(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return true;
    const [first = 0, second = 0] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  const normalizedIpv6 = hostname.replace(/^\[|\]$/g, "");
  return normalizedIpv6.includes(":") && (
    normalizedIpv6 === "::" ||
    normalizedIpv6 === "::1" ||
    normalizedIpv6.startsWith("fc") ||
    normalizedIpv6.startsWith("fd") ||
    /^fe[89ab]/.test(normalizedIpv6.toLowerCase())
  );
}

function allowed(risk: BrowserActionRisk): BrowserPolicyDecision {
  return { allowed: true, effectiveRisk: risk, code: "allowed", reason: "Action is allowed by capture policy." };
}

function denied(
  risk: BrowserActionRisk,
  code: Exclude<BrowserPolicyDecision["code"], "allowed">,
  reason: string
): BrowserPolicyDecision {
  return { allowed: false, effectiveRisk: risk, code, reason };
}

function rejectUnknownKeys(value: Record<string, unknown>, allowedKeys: string[], path: string, errors: string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed.`);
  }
}

function validateBoundedString(value: unknown, path: string, min: number, max: number, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    errors.push(`${path} must be ${min}–${max} characters.`);
  }
}

function validateOptionalBoundedString(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[]
): void {
  if (value !== undefined) validateBoundedString(value, path, min, max, errors);
}

function validatePositiveInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < 1) errors.push(`${path} must be a positive integer.`);
}

function validateStringArray(value: unknown, path: string, max: number, errors: string[]): void {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || item.length < 1)) {
    errors.push(`${path} must contain at most ${max} non-empty strings.`);
  } else if (new Set(value).size !== value.length) {
    errors.push(`${path} must not contain duplicates.`);
  }
}

function validateIsoDate(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) errors.push(`${path} must be an ISO timestamp.`);
}

function assertChronology(startedAt: string, completedAt: string, label: string): void {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error(`${label} timestamps are invalid.`);
  }
}

function uniqueNonEmpty(values: string[], label: string): string[] {
  if (values.some((value) => !value.trim())) throw new Error(`${label} contains an empty ID.`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate IDs.`);
  return [...values];
}

function uniqueEntries<T extends { id: string }>(values: T[], label: string): T[] {
  uniqueNonEmpty(values.map((value) => value.id), label);
  return values.map((value) => ({ ...value }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
