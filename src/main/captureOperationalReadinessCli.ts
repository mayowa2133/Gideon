import fs from "node:fs/promises";
import path from "node:path";
import { CAPTURE_OPERATION_SLOS, createCaptureOperationMetric, createCaptureOperationalReport, estimateCaptureCost, runSyntheticCaptureLoad, simulateCaptureIncident, type CaptureIncidentKind, type CaptureOperationStage } from "./captureOperationalReadiness";

export async function runCaptureOperationalReadiness(outputPath = path.resolve("tmp/capture-operations/readiness-report.json")) {
  const generatedAt = "2026-07-16T12:00:00.000Z";
  const stages: CaptureOperationStage[] = ["environment_validation", "discovery", "capture", "retry", "queue", "render", "storage", "deletion", "runtime_teardown"];
  const duration: Record<CaptureOperationStage, number> = { environment_validation: 18_000, discovery: 75_000, capture: 62_000, retry: 70_000, queue: 5_000, render: 48_000, storage: 1_200, deletion: 4_000, runtime_teardown: 2_000 };
  const metrics = stages.map((stage, index) => createCaptureOperationMetric({ correlationId: `correlation-${index + 1}`, workspaceId: `workspace-${index + 1}`, projectId: `project-${index + 1}`, stage, outcome: "succeeded", observedAt: generatedAt, durationMs: duration[stage], queueDelayMs: stage === "queue" ? duration[stage] : undefined, attempt: 1 }));
  const load = await runSyntheticCaptureLoad({ projects: 32, concurrency: 4, taskDurationMs: 3, wallClockLimitMs: 20, runawayProjectIndexes: [31] });
  const cost = estimateCaptureCost({ browserSeconds: 32 * 62, renderSeconds: 32 * 48, retainedStorageBytes: 32 * 25 * 1024 * 1024, egressBytes: 32 * 10 * 1024 * 1024 });
  const kinds: CaptureIncidentKind[] = ["worker_failure", "queue_loss", "database_outage", "storage_outage", "deletion_failure", "runtime_teardown_failure"];
  const incidents = kinds.map((kind, index) => simulateCaptureIncident(kind, `correlation-incident-${index + 1}`));
  const report = createCaptureOperationalReport({ metrics, load, cost, incidents, generatedAt });
  const failedGates = Object.entries(report.gates).filter(([, passed]) => !passed).map(([name]) => name);
  const unmetSlos = report.slos.filter((slo) => slo.status !== "met");
  if (failedGates.length || unmetSlos.length || CAPTURE_OPERATION_SLOS.length !== 9) throw new Error(`Capture operational readiness failed: ${[...failedGates, ...unmetSlos.map((slo) => slo.id)].join(", ")}.`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { outputPath, report };
}

if (require.main === module) {
  void runCaptureOperationalReadiness(process.argv[2]).then(({ outputPath, report }) => {
    process.stdout.write(`Capture operational readiness passed: ${report.load.completed} completed, ${report.load.terminatedRunaways} runaway terminated, ${report.incidents.length} incidents contained.\nReport: ${outputPath}\n`);
  }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Capture operational readiness failed."}\n`); process.exitCode = 1; });
}
