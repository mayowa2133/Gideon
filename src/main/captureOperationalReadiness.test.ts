import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTURE_OPERATION_ALERT_RULES,
  CAPTURE_OPERATION_SLOS,
  createCaptureOperationMetric,
  createCaptureOperationalReport,
  estimateCaptureCost,
  evaluateCaptureOperationAlerts,
  evaluateCaptureSlos,
  observeCaptureOperation,
  runSyntheticCaptureLoad,
  simulateCaptureIncident,
  type CaptureIncidentKind,
  type CaptureOperationMetric,
  type CaptureOperationStage
} from "./captureOperationalReadiness";

const observedAt = "2026-07-16T12:00:00.000Z";

describe("capture operational readiness", () => {
  it("accepts safe metric dimensions and rejects secret-shaped dimensions", () => {
    expect(metric("capture", "succeeded", { durationMs: 10 })).toMatchObject({ schemaVersion: "1", name: "capture_operation", stage: "capture" });
    expect(() => metric("capture", "failed")).toThrow("safe error code");
    expect(() => createCaptureOperationMetric({ correlationId: "api_key-private", workspaceId: "workspace-1", projectId: "project-1", stage: "capture", outcome: "succeeded", observedAt })).toThrow("correlationId");
    expect(() => createCaptureOperationMetric({ correlationId: "correlation-1", workspaceId: "token-private", projectId: "project-1", stage: "capture", outcome: "succeeded", observedAt })).toThrow("workspaceId");
    expect(() => metric("capture", "failed", { safeErrorCode: "password_leaked" })).toThrow("safe error code");
  });

  it("emits bounded start and terminal telemetry without exposing thrown error text", async () => {
    const recorded: CaptureOperationMetric[] = [];
    const clock = times(Date.parse(observedAt), Date.parse(observedAt) + 125);
    const secret = "private password from browser";
    await expect(observeCaptureOperation({ correlationId: "correlation-1", workspaceId: "workspace-1", projectId: "project-1", stage: "discovery", failureCode: "discovery_failed", attempt: 1 }, { record: (item) => recorded.push(item) }, async () => { throw new Error(secret); }, clock)).rejects.toThrow(secret);
    expect(recorded.map((item) => item.outcome)).toEqual(["started", "failed"]);
    expect(recorded[1]).toMatchObject({ durationMs: 125, safeErrorCode: "discovery_failed" });
    expect(JSON.stringify(recorded)).not.toContain(secret);
  });

  it("does not let a telemetry export outage change capture operation behavior", async () => {
    const result = await observeCaptureOperation({ correlationId: "correlation-1", workspaceId: "workspace-1", projectId: "project-1", stage: "storage", failureCode: "storage_failed" }, { record: () => { throw new Error("telemetry unavailable"); } }, async () => "stored", times(Date.parse(observedAt), Date.parse(observedAt) + 5));
    expect(result).toBe("stored");
  });

  it("evaluates met, missed, and no-data SLOs", () => {
    const evaluations = evaluateCaptureSlos([
      metric("capture", "succeeded", { durationMs: 179_000 }),
      metric("deletion", "failed", { durationMs: 10, safeErrorCode: "cleanup_failed" })
    ]);
    expect(evaluations.find((item) => item.stage === "capture")?.status).toBe("met");
    expect(evaluations.find((item) => item.stage === "deletion")?.status).toBe("missed");
    expect(evaluations.find((item) => item.stage === "render")?.status).toBe("no_data");
    expect(CAPTURE_OPERATION_SLOS).toHaveLength(9);
  });

  it("fires alert rules at their threshold and reports no data safely", () => {
    const failures = Array.from({ length: 3 }, (_, index) => metric("capture", "failed", { correlationId: `correlation-${index}`, safeErrorCode: "worker_failed" }));
    const alerts = evaluateCaptureOperationAlerts(failures, observedAt);
    expect(alerts.find((item) => item.rule.id === "capture-run-failures")).toMatchObject({ status: "firing", value: 3 });
    expect(alerts.find((item) => item.rule.id === "capture-storage-failures")?.status).toBe("no_data");
    expect(CAPTURE_OPERATION_ALERT_RULES).toHaveLength(9);
  });

  it("keeps every alert linked to the safe dashboard-as-data contract", async () => {
    const dashboard = JSON.parse(await fs.readFile(path.resolve("config/capture-observability-dashboard-v1.json"), "utf8")) as { panels: Array<{ title: string }>; safeDimensions: string[]; forbiddenDimensions: string[] };
    const panelTitles = new Set(dashboard.panels.map((panel) => panel.title));
    expect(dashboard.panels).toHaveLength(9);
    expect(CAPTURE_OPERATION_ALERT_RULES.every((rule) => panelTitles.has(rule.dashboardPanel))).toBe(true);
    expect(dashboard.safeDimensions).toEqual(expect.arrayContaining(["stage", "outcome", "correlation_id"]));
    expect(dashboard.forbiddenDimensions).toEqual(expect.arrayContaining(["transcript", "selector", "object_key", "credential", "token"]));
  });

  it("produces deterministic cost estimates without provider calls", () => {
    const input = { browserSeconds: 100, renderSeconds: 50, retainedStorageBytes: 1024 ** 3, egressBytes: 1024 ** 3 };
    expect(estimateCaptureCost(input)).toEqual(estimateCaptureCost(input));
    expect(estimateCaptureCost(input)).toMatchObject({ providerCallsMade: 0, estimatedUsd: 0.144 });
    expect(() => estimateCaptureCost({ ...input, browserSeconds: -1 })).toThrow("browserSeconds");
  });

  it("enforces concurrency, FIFO fairness, and runaway termination in synthetic load", async () => {
    const result = await runSyntheticCaptureLoad({ projects: 8, concurrency: 2, taskDurationMs: 2, wallClockLimitMs: 10, runawayProjectIndexes: [7] });
    expect(result).toMatchObject({ classification: "local_synthetic_exercise_not_capacity_benchmark", projects: 8, concurrencyLimit: 2, completed: 7, terminatedRunaways: 1, fairness: { preserved: true } });
    expect(result.maximumObservedConcurrency).toBeLessThanOrEqual(2);
  });

  it("contains every simulated incident without duplicate usage or unsafe publication", async () => {
    const kinds: CaptureIncidentKind[] = ["worker_failure", "queue_loss", "database_outage", "storage_outage", "deletion_failure", "runtime_teardown_failure"];
    const incidents = kinds.map((kind) => simulateCaptureIncident(kind, `correlation-${kind}`));
    expect(incidents.every((item) => item.detected && item.contained && item.duplicateUsageRecords === 0)).toBe(true);
    expect(incidents.filter((item) => !["worker_failure", "queue_loss"].includes(item.kind)).every((item) => !item.readyArtifactPublished)).toBe(true);
    expect(JSON.stringify(incidents)).not.toContain("correlation-runtime_teardown_failure");

    const stages: CaptureOperationStage[] = ["environment_validation", "discovery", "capture", "retry", "queue", "render", "storage", "deletion", "runtime_teardown"];
    const metrics = stages.map((stage) => metric(stage, "succeeded", { durationMs: 1, queueDelayMs: stage === "queue" ? 1 : undefined }));
    const load = await runSyntheticCaptureLoad({ projects: 4, concurrency: 2, taskDurationMs: 1, wallClockLimitMs: 5, runawayProjectIndexes: [3] });
    const report = createCaptureOperationalReport({ metrics, load, cost: estimateCaptureCost({ browserSeconds: 1, renderSeconds: 1, retainedStorageBytes: 1, egressBytes: 1 }), incidents, generatedAt: observedAt });
    expect(Object.values(report.gates).every(Boolean)).toBe(true);
    expect(report.alerts).toHaveLength(9);
    const incomplete = createCaptureOperationalReport({ metrics: metrics.slice(1), load, cost: report.cost, incidents: incidents.slice(1), generatedAt: observedAt });
    expect(incomplete.gates).toMatchObject({ allStagesObserved: false, alertRulesHealthy: false, allIncidentModelsExercised: false });
  });
});

function metric(stage: CaptureOperationStage, outcome: CaptureOperationMetric["outcome"], overrides: Partial<Omit<CaptureOperationMetric, "schemaVersion" | "name" | "stage" | "outcome">> = {}) {
  return createCaptureOperationMetric({ correlationId: "correlation-1", workspaceId: "workspace-1", projectId: "project-1", stage, outcome, observedAt, ...overrides });
}

function times(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}
