import { describe, expect, it } from "vitest";
import { DEFAULT_OBSERVABILITY_ALERT_RULES, evaluateObservabilityAlerts, type ObservabilityMetricRecord } from "./observability";
import type { JobObservabilitySnapshot } from "./store";

describe("observability alert evaluation", () => {
  it("fires queue alerts from the latest job observability snapshot", () => {
    const evaluations = evaluateObservabilityAlerts({
      now: "2026-06-29T12:00:00.000Z",
      snapshots: [
        snapshot({
          generatedAt: "2026-06-29T11:59:00.000Z",
          oldestQueuedAgeMs: 16 * 60 * 1000,
          expiredRunningLeases: 1,
          recoveredLeaseFailuresInWindow: 2,
          terminalFailureRatePerHour: 12
        })
      ]
    });

    expect(statusById(evaluations)).toMatchObject({
      "queue-oldest-queued-age-warning": "firing",
      "queue-oldest-queued-age-critical": "firing",
      "queue-expired-running-leases-critical": "firing",
      "queue-recovered-lease-failures-warning": "firing",
      "queue-terminal-failure-rate-warning": "firing",
      "queue-terminal-failure-rate-critical": "firing"
    });
  });

  it("fires provider and storage alerts from recent executor metrics", () => {
    const now = "2026-06-29T12:00:00.000Z";
    const events: ObservabilityMetricRecord[] = [
      {
        receivedAt: "2026-06-29T11:58:00.000Z",
        event: {
          name: "tts_provider_finished",
          projectId: "project-1",
          scriptId: "script-1",
          durationMs: 18_000,
          characters: 900,
          model: "tts-test"
        }
      },
      {
        receivedAt: "2026-06-29T11:59:00.000Z",
        event: {
          name: "tts_provider_failed",
          projectId: "project-1",
          scriptId: "script-2",
          durationMs: 4_000,
          safeError: "provider failed"
        }
      },
      {
        receivedAt: "2026-06-29T11:59:30.000Z",
        event: {
          name: "artifact_storage_finished",
          projectId: "project-1",
          kind: "render",
          durationMs: 6_500,
          artifactId: "artifact-1",
          byteSize: 1024
        }
      },
      {
        receivedAt: "2026-06-29T11:59:45.000Z",
        event: {
          name: "artifact_storage_failed",
          projectId: "project-1",
          kind: "voiceover",
          durationMs: 2_000,
          safeError: "storage failed"
        }
      }
    ];

    const evaluations = evaluateObservabilityAlerts({
      now,
      snapshots: [snapshot({ generatedAt: now })],
      events
    });

    expect(statusById(evaluations)).toMatchObject({
      "provider-tts-latency-warning": "firing",
      "provider-tts-failures-warning": "firing",
      "storage-latency-warning": "firing",
      "storage-failures-critical": "firing"
    });
  });

  it("marks missing metric windows as no data without firing", () => {
    const evaluations = evaluateObservabilityAlerts({
      now: "2026-06-29T12:00:00.000Z",
      snapshots: [],
      events: []
    });

    expect(evaluations).toHaveLength(DEFAULT_OBSERVABILITY_ALERT_RULES.length);
    expect(new Set(evaluations.map((evaluation) => evaluation.status))).toEqual(new Set(["no_data"]));
  });
});

function statusById(evaluations: ReturnType<typeof evaluateObservabilityAlerts>): Record<string, string> {
  return Object.fromEntries(evaluations.map((evaluation) => [evaluation.rule.id, evaluation.status]));
}

function snapshot(input: Partial<JobObservabilitySnapshot>): JobObservabilitySnapshot {
  return {
    generatedAt: "2026-06-29T12:00:00.000Z",
    windowMs: 60 * 60 * 1000,
    totalJobs: 0,
    activeJobs: 0,
    queuedJobs: 0,
    runningJobs: 0,
    cancelingJobs: 0,
    terminalJobs: 0,
    failedJobs: 0,
    retryableFailedJobs: 0,
    terminalFailuresInWindow: 0,
    recoveredLeaseFailuresInWindow: 0,
    expiredRunningLeases: 0,
    oldestQueuedAgeMs: null,
    oldestRunningAgeMs: null,
    terminalFailureRatePerHour: 0,
    byStatus: {},
    byKind: {},
    ...input
  };
}
