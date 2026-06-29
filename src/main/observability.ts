import type { GideonJobExecutorMetricEvent } from "./jobExecutor";
import type { JobObservabilitySnapshot } from "./store";

export type ObservabilityAlertSeverity = "warning" | "critical";

export type ObservabilityAlertMetric =
  | "queue_oldest_queued_age_ms"
  | "queue_expired_running_leases"
  | "queue_recovered_lease_failures"
  | "queue_terminal_failure_rate_per_hour"
  | "provider_tts_latency_ms"
  | "provider_tts_failures"
  | "storage_latency_ms"
  | "storage_failures";

export interface ObservabilityAlertRule {
  id: string;
  metric: ObservabilityAlertMetric;
  severity: ObservabilityAlertSeverity;
  threshold: number;
  comparison: "gte";
  windowMs: number;
  summary: string;
  dashboardPanel: string;
  runbook: string;
}

export interface ObservabilityMetricRecord {
  receivedAt: string;
  event: GideonJobExecutorMetricEvent;
}

export interface ObservabilityAlertEvaluation {
  rule: ObservabilityAlertRule;
  status: "ok" | "firing" | "no_data";
  value: number | null;
  observedAt: string;
  evidence: string;
}

export const DEFAULT_OBSERVABILITY_ALERT_RULES: ObservabilityAlertRule[] = [
  {
    id: "queue-oldest-queued-age-warning",
    metric: "queue_oldest_queued_age_ms",
    severity: "warning",
    threshold: 5 * 60 * 1000,
    comparison: "gte",
    windowMs: 5 * 60 * 1000,
    summary: "Oldest queued job has waited at least 5 minutes.",
    dashboardPanel: "Queue health",
    runbook: "Check worker replica count, Redis connectivity, queue depth, provider outages, and whether leases are expiring."
  },
  {
    id: "queue-oldest-queued-age-critical",
    metric: "queue_oldest_queued_age_ms",
    severity: "critical",
    threshold: 15 * 60 * 1000,
    comparison: "gte",
    windowMs: 5 * 60 * 1000,
    summary: "Oldest queued job has waited at least 15 minutes.",
    dashboardPanel: "Queue health",
    runbook: "Page the operator, scale workers, inspect Redis/BullMQ, and pause expensive enqueue sources if backlog keeps growing."
  },
  {
    id: "queue-expired-running-leases-critical",
    metric: "queue_expired_running_leases",
    severity: "critical",
    threshold: 1,
    comparison: "gte",
    windowMs: 5 * 60 * 1000,
    summary: "At least one running job has an expired worker lease.",
    dashboardPanel: "Lease recovery",
    runbook: "Inspect worker crashes, heartbeat intervals, stalled FFmpeg/provider calls, and Redis/store latency."
  },
  {
    id: "queue-recovered-lease-failures-warning",
    metric: "queue_recovered_lease_failures",
    severity: "warning",
    threshold: 1,
    comparison: "gte",
    windowMs: 60 * 60 * 1000,
    summary: "Expired worker leases were recovered in the last hour.",
    dashboardPanel: "Lease recovery",
    runbook: "Review worker restart history and job-stage logs. Confirm recovered jobs are retryable and not double-metered."
  },
  {
    id: "queue-terminal-failure-rate-warning",
    metric: "queue_terminal_failure_rate_per_hour",
    severity: "warning",
    threshold: 3,
    comparison: "gte",
    windowMs: 60 * 60 * 1000,
    summary: "Terminal job failures are elevated.",
    dashboardPanel: "Failure rate",
    runbook: "Group terminal failures by stage/provider, inspect safe error summaries, and confirm retries are not exhausted too early."
  },
  {
    id: "queue-terminal-failure-rate-critical",
    metric: "queue_terminal_failure_rate_per_hour",
    severity: "critical",
    threshold: 10,
    comparison: "gte",
    windowMs: 60 * 60 * 1000,
    summary: "Terminal job failures are spiking.",
    dashboardPanel: "Failure rate",
    runbook: "Page the operator, check recent deploys/provider incidents/storage failures, and consider disabling new expensive work."
  },
  {
    id: "provider-tts-latency-warning",
    metric: "provider_tts_latency_ms",
    severity: "warning",
    threshold: 15_000,
    comparison: "gte",
    windowMs: 15 * 60 * 1000,
    summary: "Provider TTS latency p95 is above 15 seconds.",
    dashboardPanel: "Provider latency",
    runbook: "Check provider status, model selection, text length distribution, and fallback behavior."
  },
  {
    id: "provider-tts-failures-warning",
    metric: "provider_tts_failures",
    severity: "warning",
    threshold: 1,
    comparison: "gte",
    windowMs: 15 * 60 * 1000,
    summary: "Provider TTS failures occurred recently.",
    dashboardPanel: "Provider failures",
    runbook: "Inspect sanitized provider errors, credentials, rate limits, and fallback artifact generation."
  },
  {
    id: "storage-latency-warning",
    metric: "storage_latency_ms",
    severity: "warning",
    threshold: 5_000,
    comparison: "gte",
    windowMs: 15 * 60 * 1000,
    summary: "Private artifact storage p95 latency is above 5 seconds.",
    dashboardPanel: "Storage health",
    runbook: "Check object-store region, credentials, network path, artifact size, and retry behavior."
  },
  {
    id: "storage-failures-critical",
    metric: "storage_failures",
    severity: "critical",
    threshold: 1,
    comparison: "gte",
    windowMs: 15 * 60 * 1000,
    summary: "Private artifact storage failures occurred recently.",
    dashboardPanel: "Storage health",
    runbook: "Page the operator, verify private bucket credentials/policy, and pause exports/renders if artifact writes are failing."
  }
];

export function evaluateObservabilityAlerts(input: {
  snapshots?: JobObservabilitySnapshot[];
  events?: ObservabilityMetricRecord[];
  now?: string;
  rules?: ObservabilityAlertRule[];
}): ObservabilityAlertEvaluation[] {
  const now = input.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const snapshots = input.snapshots ?? [];
  const events = input.events ?? [];
  return (input.rules ?? DEFAULT_OBSERVABILITY_ALERT_RULES).map((rule) => {
    const value = valueForRule(rule, snapshots, events, nowMs);
    return {
      rule,
      status: value === null ? "no_data" : value >= rule.threshold ? "firing" : "ok",
      value,
      observedAt: now,
      evidence: evidenceForRule(rule, value)
    };
  });
}

function valueForRule(
  rule: ObservabilityAlertRule,
  snapshots: JobObservabilitySnapshot[],
  events: ObservabilityMetricRecord[],
  nowMs: number
): number | null {
  if (isSnapshotMetric(rule.metric)) {
    const snapshot = latestSnapshotInWindow(snapshots, nowMs, rule.windowMs);
    if (!snapshot) {
      return null;
    }
    switch (rule.metric) {
      case "queue_oldest_queued_age_ms":
        return snapshot.oldestQueuedAgeMs;
      case "queue_expired_running_leases":
        return snapshot.expiredRunningLeases;
      case "queue_recovered_lease_failures":
        return snapshot.recoveredLeaseFailuresInWindow;
      case "queue_terminal_failure_rate_per_hour":
        return snapshot.terminalFailureRatePerHour;
    }
  }

  const matchingEvents = eventsInWindow(events, nowMs, rule.windowMs);
  switch (rule.metric) {
    case "provider_tts_latency_ms":
      return percentile(
        matchingEvents
          .filter(isTtsProviderFinishedRecord)
          .map((record) => record.event.durationMs),
        0.95
      );
    case "provider_tts_failures":
      if (!matchingEvents.length) {
        return null;
      }
      return matchingEvents.filter((record) => record.event.name === "tts_provider_failed").length;
    case "storage_latency_ms":
      return percentile(
        matchingEvents
          .filter(isArtifactStorageFinishedRecord)
          .map((record) => record.event.durationMs),
        0.95
      );
    case "storage_failures":
      if (!matchingEvents.length) {
        return null;
      }
      return matchingEvents.filter((record) => record.event.name === "artifact_storage_failed").length;
    default:
      return null;
  }
}

function isSnapshotMetric(metric: ObservabilityAlertMetric): boolean {
  return metric.startsWith("queue_");
}

function latestSnapshotInWindow(
  snapshots: JobObservabilitySnapshot[],
  nowMs: number,
  windowMs: number
): JobObservabilitySnapshot | null {
  return snapshots
    .filter((snapshot) => timestampInWindow(snapshot.generatedAt, nowMs, windowMs))
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt))[0] ?? null;
}

function eventsInWindow(events: ObservabilityMetricRecord[], nowMs: number, windowMs: number): ObservabilityMetricRecord[] {
  return events.filter((record) => timestampInWindow(record.receivedAt, nowMs, windowMs));
}

function isTtsProviderFinishedRecord(
  record: ObservabilityMetricRecord
): record is ObservabilityMetricRecord & { event: Extract<GideonJobExecutorMetricEvent, { name: "tts_provider_finished" }> } {
  return record.event.name === "tts_provider_finished";
}

function isArtifactStorageFinishedRecord(
  record: ObservabilityMetricRecord
): record is ObservabilityMetricRecord & { event: Extract<GideonJobExecutorMetricEvent, { name: "artifact_storage_finished" }> } {
  return record.event.name === "artifact_storage_finished";
}

function timestampInWindow(value: string, nowMs: number, windowMs: number): boolean {
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) && timestampMs >= nowMs - windowMs && timestampMs <= nowMs;
}

function percentile(values: number[], percentileValue: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index] ?? null;
}

function evidenceForRule(rule: ObservabilityAlertRule, value: number | null): string {
  if (value === null) {
    return `No ${rule.metric} data in the last ${formatDuration(rule.windowMs)}.`;
  }
  return `${rule.metric}=${value} ${rule.comparison} ${rule.threshold} over ${formatDuration(rule.windowMs)}.`;
}

function formatDuration(windowMs: number): string {
  if (windowMs % (60 * 60 * 1000) === 0) {
    return `${windowMs / (60 * 60 * 1000)}h`;
  }
  if (windowMs % (60 * 1000) === 0) {
    return `${windowMs / (60 * 1000)}m`;
  }
  return `${windowMs}ms`;
}
