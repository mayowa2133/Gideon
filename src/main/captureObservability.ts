import type { CaptureRun, FlowExecutionRecord } from "../shared/productFlowCapture";

export interface CaptureObservabilitySnapshot {
  generatedAt: string;
  runs: { queued: number; active: number; completed: number; needsReview: number; failed: number; canceled: number };
  executions: { verified: number; failed: number; blocked: number; verificationRate: number | null };
  estimatedBrowserSeconds: number;
  blockerCounts: Record<string, number>;
}

export function createCaptureObservabilitySnapshot(input: {
  runs: CaptureRun[];
  executions: FlowExecutionRecord[];
  now?: string;
}): CaptureObservabilitySnapshot {
  const terminalExecutionCount = input.executions.filter((execution) => ["verified", "failed", "blocked"].includes(execution.status)).length;
  const verified = input.executions.filter((execution) => execution.status === "verified").length;
  const blockerCounts: Record<string, number> = {};
  for (const execution of input.executions) {
    if (execution.blockerCode) blockerCounts[sanitizeDimension(execution.blockerCode)] = (blockerCounts[sanitizeDimension(execution.blockerCode)] ?? 0) + 1;
  }
  return {
    generatedAt: input.now ?? new Date().toISOString(),
    runs: {
      queued: input.runs.filter((run) => run.status === "queued").length,
      active: input.runs.filter((run) => ["provisioning", "resetting", "authenticating", "dry_running", "repairing", "recording", "normalizing", "verifying"].includes(run.status)).length,
      completed: input.runs.filter((run) => run.status === "completed").length,
      needsReview: input.runs.filter((run) => run.status === "needs_review").length,
      failed: input.runs.filter((run) => run.status === "failed").length,
      canceled: input.runs.filter((run) => run.status === "canceled").length
    },
    executions: {
      verified,
      failed: input.executions.filter((execution) => execution.status === "failed").length,
      blocked: input.executions.filter((execution) => execution.status === "blocked").length,
      verificationRate: terminalExecutionCount ? verified / terminalExecutionCount : null
    },
    estimatedBrowserSeconds: input.runs.reduce((sum, run) => sum + run.estimatedBrowserSeconds, 0),
    blockerCounts
  };
}

function sanitizeDimension(value: string): string {
  return /^[a-z][a-z0-9_]{0,79}$/.test(value) && !/(?:secret|token|password|credential|cookie|api_key)/.test(value) ? value : "other";
}
