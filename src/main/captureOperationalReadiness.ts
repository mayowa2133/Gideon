import { createHash, randomUUID } from "node:crypto";

export type CaptureOperationStage = "environment_validation" | "discovery" | "capture" | "retry" | "queue" | "render" | "storage" | "deletion" | "runtime_teardown";
export type CaptureOperationOutcome = "started" | "succeeded" | "failed" | "canceled" | "contained";

export interface CaptureOperationMetric {
  schemaVersion: "1";
  name: "capture_operation";
  correlationId: string;
  workspaceId: string;
  projectId: string;
  stage: CaptureOperationStage;
  outcome: CaptureOperationOutcome;
  observedAt: string;
  durationMs?: number;
  queueDelayMs?: number;
  attempt?: number;
  safeErrorCode?: string;
}

export interface CaptureOperationMetricSink {
  record(metric: CaptureOperationMetric): void | Promise<void>;
}

export interface ObservedCaptureOperation {
  correlationId: string;
  workspaceId: string;
  projectId: string;
  stage: CaptureOperationStage;
  failureCode: string;
  queueDelayMs?: number;
  attempt?: number;
}

export interface CaptureOperationSlo {
  id: string;
  stage: CaptureOperationStage;
  indicator: "duration_ms" | "queue_delay_ms" | "success_rate";
  objective: number;
  threshold: number;
  window: "rolling_30d";
}

export const CAPTURE_OPERATION_SLOS: readonly CaptureOperationSlo[] = [
  { id: "capture-environment-validation-p95", stage: "environment_validation", indicator: "duration_ms", objective: 0.95, threshold: 120_000, window: "rolling_30d" },
  { id: "capture-discovery-p95", stage: "discovery", indicator: "duration_ms", objective: 0.95, threshold: 300_000, window: "rolling_30d" },
  { id: "capture-queue-delay-p99", stage: "queue", indicator: "queue_delay_ms", objective: 0.99, threshold: 60_000, window: "rolling_30d" },
  { id: "capture-flow-p95", stage: "capture", indicator: "duration_ms", objective: 0.95, threshold: 180_000, window: "rolling_30d" },
  { id: "capture-retry-p95", stage: "retry", indicator: "duration_ms", objective: 0.95, threshold: 300_000, window: "rolling_30d" },
  { id: "capture-render-p95", stage: "render", indicator: "duration_ms", objective: 0.95, threshold: 240_000, window: "rolling_30d" },
  { id: "capture-storage-p95", stage: "storage", indicator: "duration_ms", objective: 0.95, threshold: 10_000, window: "rolling_30d" },
  { id: "capture-deletion-success", stage: "deletion", indicator: "success_rate", objective: 0.99, threshold: 0.99, window: "rolling_30d" },
  { id: "capture-runtime-teardown-success", stage: "runtime_teardown", indicator: "success_rate", objective: 1, threshold: 1, window: "rolling_30d" }
] as const;

export interface CaptureOperationAlertRule { id: string; stage: CaptureOperationStage; indicator: "failure_count" | "p95_duration_ms" | "p95_queue_delay_ms"; threshold: number; severity: "warning" | "critical"; windowMs: number; dashboardPanel: string; runbookSection: string }
export const CAPTURE_OPERATION_ALERT_RULES: readonly CaptureOperationAlertRule[] = [
  { id: "capture-environment-validation-failures", stage: "environment_validation", indicator: "failure_count", threshold: 3, severity: "warning", windowMs: 900_000, dashboardPanel: "Environment validation", runbookSection: "validation-failures" },
  { id: "capture-discovery-failures", stage: "discovery", indicator: "failure_count", threshold: 3, severity: "warning", windowMs: 900_000, dashboardPanel: "Discovery", runbookSection: "discovery-failures" },
  { id: "capture-queue-delay-critical", stage: "queue", indicator: "p95_queue_delay_ms", threshold: 60_000, severity: "critical", windowMs: 300_000, dashboardPanel: "Queue and concurrency", runbookSection: "queue-loss-or-backlog" },
  { id: "capture-run-failures", stage: "capture", indicator: "failure_count", threshold: 3, severity: "critical", windowMs: 900_000, dashboardPanel: "Capture runs", runbookSection: "worker-failure" },
  { id: "capture-retry-failures", stage: "retry", indicator: "failure_count", threshold: 2, severity: "warning", windowMs: 900_000, dashboardPanel: "Retries", runbookSection: "retry-exhaustion" },
  { id: "capture-render-latency", stage: "render", indicator: "p95_duration_ms", threshold: 240_000, severity: "warning", windowMs: 900_000, dashboardPanel: "Rendering", runbookSection: "render-degradation" },
  { id: "capture-storage-failures", stage: "storage", indicator: "failure_count", threshold: 1, severity: "critical", windowMs: 900_000, dashboardPanel: "Private storage", runbookSection: "storage-outage" },
  { id: "capture-deletion-failures", stage: "deletion", indicator: "failure_count", threshold: 1, severity: "critical", windowMs: 3_600_000, dashboardPanel: "Deletion and retention", runbookSection: "deletion-failure" },
  { id: "capture-runtime-teardown-failures", stage: "runtime_teardown", indicator: "failure_count", threshold: 1, severity: "critical", windowMs: 300_000, dashboardPanel: "Runtime isolation", runbookSection: "runtime-teardown-failure" }
] as const;

export function evaluateCaptureOperationAlerts(metrics: CaptureOperationMetric[], now = new Date().toISOString(), rules: readonly CaptureOperationAlertRule[] = CAPTURE_OPERATION_ALERT_RULES) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Capture alert evaluation time is invalid.");
  return rules.map((rule) => {
    const samples = metrics.filter((metric) => metric.stage === rule.stage && nowMs - Date.parse(metric.observedAt) >= 0 && nowMs - Date.parse(metric.observedAt) <= rule.windowMs && metric.outcome !== "started");
    let value: number | null = null;
    if (samples.length) {
      if (rule.indicator === "failure_count") value = samples.filter((metric) => metric.outcome === "failed").length;
      else {
        const values = samples.map((metric) => rule.indicator === "p95_duration_ms" ? metric.durationMs : metric.queueDelayMs).filter((item): item is number => item !== undefined);
        value = values.length ? percentile(values, 0.95) : null;
      }
    }
    return { rule, status: value === null ? "no_data" as const : value >= rule.threshold ? "firing" as const : "ok" as const, value, observedAt: now };
  });
}

export interface CaptureSloEvaluation {
  id: string;
  stage: CaptureOperationStage;
  status: "met" | "missed" | "no_data";
  value: number | null;
  threshold: number;
  sampleCount: number;
}

export function createCaptureOperationMetric(input: Omit<CaptureOperationMetric, "schemaVersion" | "name">): CaptureOperationMetric {
  for (const [field, value] of [["correlationId", input.correlationId], ["workspaceId", input.workspaceId], ["projectId", input.projectId]] as const) requireSafeIdentifier(value, field);
  if (input.safeErrorCode !== undefined && !safeDimension(input.safeErrorCode)) throw new Error("Capture operation safe error code is invalid.");
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error("Capture operation observedAt is invalid.");
  for (const [field, value] of [["durationMs", input.durationMs], ["queueDelayMs", input.queueDelayMs], ["attempt", input.attempt]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || (field === "attempt" && value < 1))) throw new Error(`Capture operation ${field} is invalid.`);
  }
  if (input.outcome === "failed" && !input.safeErrorCode) throw new Error("Failed capture operation metrics require a safe error code.");
  return { schemaVersion: "1", name: "capture_operation", ...input };
}

export async function observeCaptureOperation<T>(
  input: ObservedCaptureOperation,
  sink: CaptureOperationMetricSink,
  operation: () => Promise<T>,
  clock: () => number = Date.now
): Promise<T> {
  const startedAt = clock();
  const common = {
    correlationId: input.correlationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    stage: input.stage,
    queueDelayMs: input.queueDelayMs,
    attempt: input.attempt
  };
  await recordCaptureMetric(sink, createCaptureOperationMetric({ ...common, outcome: "started", observedAt: new Date(startedAt).toISOString() }));
  try {
    const result = await operation();
    const finishedAt = clock();
    await recordCaptureMetric(sink, createCaptureOperationMetric({ ...common, outcome: "succeeded", observedAt: new Date(finishedAt).toISOString(), durationMs: Math.max(0, finishedAt - startedAt) }));
    return result;
  } catch (error) {
    const finishedAt = clock();
    await recordCaptureMetric(sink, createCaptureOperationMetric({ ...common, outcome: "failed", observedAt: new Date(finishedAt).toISOString(), durationMs: Math.max(0, finishedAt - startedAt), safeErrorCode: input.failureCode }));
    throw error;
  }
}

export function evaluateCaptureSlos(metrics: CaptureOperationMetric[], slos: readonly CaptureOperationSlo[] = CAPTURE_OPERATION_SLOS): CaptureSloEvaluation[] {
  return slos.map((slo) => {
    const samples = metrics.filter((metric) => metric.stage === slo.stage && metric.outcome !== "started");
    if (!samples.length) return { id: slo.id, stage: slo.stage, status: "no_data", value: null, threshold: slo.threshold, sampleCount: 0 };
    if (slo.indicator === "success_rate") {
      const value = samples.filter((metric) => metric.outcome === "succeeded").length / samples.length;
      return { id: slo.id, stage: slo.stage, status: value >= slo.objective ? "met" : "missed", value, threshold: slo.objective, sampleCount: samples.length };
    }
    const values = samples.map((metric) => slo.indicator === "duration_ms" ? metric.durationMs : metric.queueDelayMs).filter((value): value is number => value !== undefined);
    if (!values.length) return { id: slo.id, stage: slo.stage, status: "no_data", value: null, threshold: slo.threshold, sampleCount: 0 };
    const value = percentile(values, slo.objective);
    return { id: slo.id, stage: slo.stage, status: value <= slo.threshold ? "met" : "missed", value, threshold: slo.threshold, sampleCount: values.length };
  });
}

export interface CaptureCostEstimateInput { browserSeconds: number; renderSeconds: number; retainedStorageBytes: number; egressBytes: number; modelInputTokens?: number; modelOutputTokens?: number }
export interface CaptureCostRates { browserMicrousdPerSecond: number; renderMicrousdPerSecond: number; storageMicrousdPerGbMonth: number; egressMicrousdPerGb: number; modelInputMicrousdPerThousandTokens: number; modelOutputMicrousdPerThousandTokens: number }
export const LOCAL_CAPTURE_COST_RATES_V1: CaptureCostRates = { browserMicrousdPerSecond: 250, renderMicrousdPerSecond: 120, storageMicrousdPerGbMonth: 23_000, egressMicrousdPerGb: 90_000, modelInputMicrousdPerThousandTokens: 0, modelOutputMicrousdPerThousandTokens: 0 };

export function estimateCaptureCost(input: CaptureCostEstimateInput, rates: CaptureCostRates = LOCAL_CAPTURE_COST_RATES_V1) {
  for (const [field, value] of Object.entries(input)) if (!Number.isFinite(value) || value < 0) throw new Error(`Capture cost input ${field} is invalid.`);
  for (const [field, value] of Object.entries(rates)) if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Capture cost rate ${field} is invalid.`);
  const gigabyte = 1024 ** 3;
  const componentsMicrousd = {
    browser: Math.ceil(input.browserSeconds * rates.browserMicrousdPerSecond),
    render: Math.ceil(input.renderSeconds * rates.renderMicrousdPerSecond),
    storageFirstMonth: Math.ceil(input.retainedStorageBytes / gigabyte * rates.storageMicrousdPerGbMonth),
    egress: Math.ceil(input.egressBytes / gigabyte * rates.egressMicrousdPerGb),
    modelInput: Math.ceil((input.modelInputTokens ?? 0) / 1000 * rates.modelInputMicrousdPerThousandTokens),
    modelOutput: Math.ceil((input.modelOutputTokens ?? 0) / 1000 * rates.modelOutputMicrousdPerThousandTokens)
  };
  const totalMicrousd = Object.values(componentsMicrousd).reduce((sum, value) => sum + value, 0);
  return { schemaVersion: "1" as const, rateCard: "local-capture-cost-v1", currency: "USD" as const, componentsMicrousd, totalMicrousd, estimatedUsd: totalMicrousd / 1_000_000, providerCallsMade: 0, caveat: "Planning estimate only; production vendor rates and reserved-capacity discounts are not measured locally." };
}

export interface SyntheticCaptureLoadResult {
  schemaVersion: "1";
  classification: "local_synthetic_exercise_not_capacity_benchmark";
  projects: number;
  concurrencyLimit: number;
  maximumObservedConcurrency: number;
  completed: number;
  terminatedRunaways: number;
  fairness: { maximumStartPositionGap: number; preserved: boolean };
  elapsedMs: number;
}

export async function runSyntheticCaptureLoad(input: { projects: number; concurrency: number; taskDurationMs?: number; wallClockLimitMs?: number; runawayProjectIndexes?: number[] }): Promise<SyntheticCaptureLoadResult> {
  const projects = integer(input.projects, 1, 500, "projects");
  const concurrency = integer(input.concurrency, 1, 50, "concurrency");
  const taskDurationMs = integer(input.taskDurationMs ?? 4, 1, 1_000, "taskDurationMs");
  const wallClockLimitMs = integer(input.wallClockLimitMs ?? 50, 2, 10_000, "wallClockLimitMs");
  const runaway = new Set(input.runawayProjectIndexes ?? []);
  if ([...runaway].some((value) => !Number.isInteger(value) || value < 0 || value >= projects)) throw new Error("Runaway project indexes are invalid.");
  const queue = Array.from({ length: projects }, (_, index) => index);
  const started: number[] = [];
  let active = 0;
  let maximumObservedConcurrency = 0;
  let completed = 0;
  let terminatedRunaways = 0;
  const before = Date.now();
  async function worker() {
    while (queue.length) {
      const project = queue.shift();
      if (project === undefined) return;
      started.push(project);
      active += 1;
      maximumObservedConcurrency = Math.max(maximumObservedConcurrency, active);
      const outcome = await boundedTask(runaway.has(project) ? wallClockLimitMs * 2 : taskDurationMs, wallClockLimitMs);
      active -= 1;
      if (outcome === "completed") completed += 1; else terminatedRunaways += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, projects) }, worker));
  const maximumStartPositionGap = Math.max(...started.map((project, position) => Math.abs(project - position)), 0);
  return { schemaVersion: "1", classification: "local_synthetic_exercise_not_capacity_benchmark", projects, concurrencyLimit: concurrency, maximumObservedConcurrency, completed, terminatedRunaways, fairness: { maximumStartPositionGap, preserved: maximumStartPositionGap === 0 }, elapsedMs: Date.now() - before };
}

export type CaptureIncidentKind = "worker_failure" | "queue_loss" | "database_outage" | "storage_outage" | "deletion_failure" | "runtime_teardown_failure";
export interface CaptureIncidentReceipt { schemaVersion: "1"; incidentId: string; kind: CaptureIncidentKind; correlationHash: string; detected: true; contained: boolean; recovery: "automatic" | "operator_required"; transitions: string[]; readyArtifactPublished: boolean; duplicateUsageRecords: number; privateDetails: "omitted" }

export function simulateCaptureIncident(kind: CaptureIncidentKind, correlationId: string = randomUUID()): CaptureIncidentReceipt {
  requireSafeIdentifier(correlationId, "correlationId");
  const definitions: Record<CaptureIncidentKind, Omit<CaptureIncidentReceipt, "schemaVersion" | "incidentId" | "kind" | "correlationHash" | "detected" | "privateDetails">> = {
    worker_failure: { contained: true, recovery: "automatic", transitions: ["running", "lease_expired", "retryable_failed", "requeued", "succeeded"], readyArtifactPublished: true, duplicateUsageRecords: 0 },
    queue_loss: { contained: true, recovery: "automatic", transitions: ["durable_job_queued", "broker_unavailable", "enqueue_reconciled", "succeeded"], readyArtifactPublished: true, duplicateUsageRecords: 0 },
    database_outage: { contained: true, recovery: "operator_required", transitions: ["transaction_rejected", "enqueue_suppressed", "incident_open"], readyArtifactPublished: false, duplicateUsageRecords: 0 },
    storage_outage: { contained: true, recovery: "automatic", transitions: ["processing", "storage_failed", "ready_suppressed", "retry_scheduled"], readyArtifactPublished: false, duplicateUsageRecords: 0 },
    deletion_failure: { contained: true, recovery: "automatic", transitions: ["rows_revoked", "provider_cleanup_failed", "outbox_pending", "retry_scheduled"], readyArtifactPublished: false, duplicateUsageRecords: 0 },
    runtime_teardown_failure: { contained: true, recovery: "operator_required", transitions: ["artifact_extracted", "teardown_failed", "attestation_rejected", "artifacts_quarantined", "incident_open"], readyArtifactPublished: false, duplicateUsageRecords: 0 }
  };
  return { schemaVersion: "1", incidentId: `incident-${kind}`, kind, correlationHash: createHash("sha256").update(correlationId).digest("hex"), detected: true, ...definitions[kind], privateDetails: "omitted" };
}

export function createCaptureOperationalReport(input: { metrics: CaptureOperationMetric[]; load: SyntheticCaptureLoadResult; cost: ReturnType<typeof estimateCaptureCost>; incidents: CaptureIncidentReceipt[]; generatedAt?: string }) {
  const slos = evaluateCaptureSlos(input.metrics);
  const alerts = evaluateCaptureOperationAlerts(input.metrics, input.generatedAt);
  return {
    schemaVersion: "1" as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    classification: "local_simulation_and_synthetic_load_evidence_not_production_capacity",
    metrics: { samples: input.metrics.length, stages: Object.fromEntries([...new Set(input.metrics.map((metric) => metric.stage))].sort().map((stage) => [stage, input.metrics.filter((metric) => metric.stage === stage).length])) },
    slos,
    alerts,
    load: input.load,
    cost: input.cost,
    incidents: input.incidents,
    gates: {
      allStagesObserved: new Set(input.metrics.map((metric) => metric.stage)).size === 9,
      concurrencyEnforced: input.load.maximumObservedConcurrency <= input.load.concurrencyLimit,
      runawaysTerminated: input.load.terminatedRunaways >= 1,
      fairnessPreserved: input.load.fairness.preserved,
      alertRulesHealthy: alerts.every((alert) => alert.status === "ok"),
      providerFreeEstimate: input.cost.providerCallsMade === 0,
      allIncidentModelsExercised: new Set(input.incidents.map((incident) => incident.kind)).size === 6,
      incidentsContained: input.incidents.every((incident) => incident.detected && incident.contained && incident.duplicateUsageRecords === 0),
      unsafeArtifactsSuppressed: input.incidents.filter((incident) => incident.kind !== "worker_failure" && incident.kind !== "queue_loss").every((incident) => !incident.readyArtifactPublished)
    }
  };
}

function requireSafeIdentifier(value: string, field: string) { if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(value) || /(?:secret|token|password|credential|cookie|api[_-]?key|signed[_-]?url|object[_-]?key)/i.test(value)) throw new Error(`Capture operation ${field} is invalid.`); }
async function recordCaptureMetric(sink: CaptureOperationMetricSink, metric: CaptureOperationMetric) { try { await sink.record(metric); } catch { /* Telemetry delivery must not change capture state or replace the operation error. */ } }
function safeDimension(value: string) { return /^[a-z][a-z0-9_]{0,79}$/.test(value) && !/(?:secret|token|password|credential|cookie|api_key)/.test(value); }
function percentile(values: number[], quantile: number) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]!; }
function integer(value: number, minimum: number, maximum: number, field: string) { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Synthetic capture load ${field} is invalid.`); return value; }
function boundedTask(durationMs: number, limitMs: number): Promise<"completed" | "terminated"> { return new Promise((resolve) => { const work = setTimeout(() => { clearTimeout(limit); resolve("completed"); }, durationMs); const limit = setTimeout(() => { clearTimeout(work); resolve("terminated"); }, limitMs); }); }
