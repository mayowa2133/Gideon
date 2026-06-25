import type { UsageEvent, UsageMetric, WorkspaceEntitlements } from "./types";

export const DEFAULT_LOCAL_USER_ID = "local-user";
export const DEFAULT_LOCAL_WORKSPACE_ID = "local-workspace";
export const DEFAULT_LOCAL_MEMBER_ID = "local-owner";
export const DEFAULT_LOCAL_CREATED_AT = "2026-06-25T00:00:00.000Z";

export const defaultLocalEntitlements: WorkspaceEntitlements = {
  sourceMinutesMonthly: 600,
  transcriptionMinutesMonthly: 600,
  llmRunsMonthly: 1_000,
  ttsCharactersMonthly: 1_000_000,
  renderMinutesMonthly: 600,
  storageBytes: 50 * 1024 * 1024 * 1024,
  exportsMonthly: 500,
  maxProjects: 250
};

export const usageMetricLabels: Record<UsageMetric, string> = {
  source_minutes: "Source minutes",
  transcription_minutes: "Transcription minutes",
  llm_runs: "AI runs",
  tts_characters: "TTS characters",
  render_minutes: "Render minutes",
  storage_bytes: "Storage",
  exports: "Exports"
};

export type UsageSummary = Record<UsageMetric, number>;

export function emptyUsageSummary(): UsageSummary {
  return {
    source_minutes: 0,
    transcription_minutes: 0,
    llm_runs: 0,
    tts_characters: 0,
    render_minutes: 0,
    storage_bytes: 0,
    exports: 0
  };
}

export function createLocalUserWorkspace(now = DEFAULT_LOCAL_CREATED_AT) {
  return {
    users: [
      {
        id: DEFAULT_LOCAL_USER_ID,
        email: "local@gideon.app",
        displayName: "Local user",
        createdAt: now
      }
    ],
    workspaces: [
      {
        id: DEFAULT_LOCAL_WORKSPACE_ID,
        name: "Local workspace",
        slug: "local",
        plan: "local_mvp" as const,
        billingStatus: "not_configured" as const,
        entitlements: defaultLocalEntitlements,
        createdAt: now,
        updatedAt: now
      }
    ],
    workspaceMembers: [
      {
        id: DEFAULT_LOCAL_MEMBER_ID,
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        userId: DEFAULT_LOCAL_USER_ID,
        role: "owner" as const,
        createdAt: now
      }
    ],
    activeUserId: DEFAULT_LOCAL_USER_ID,
    activeWorkspaceId: DEFAULT_LOCAL_WORKSPACE_ID
  };
}

export function summarizeUsage(events: UsageEvent[], workspaceId: string, since = monthStartIso()): UsageSummary {
  const summary = emptyUsageSummary();
  for (const event of events) {
    if (event.workspaceId !== workspaceId || event.createdAt < since) {
      continue;
    }
    summary[event.metric] += event.quantity;
  }
  return summary;
}

export function assertWithinEntitlement(input: {
  entitlements: WorkspaceEntitlements;
  summary: UsageSummary;
  metric: UsageMetric;
  additionalQuantity: number;
}): void {
  const limit = entitlementLimit(input.entitlements, input.metric);
  const nextUsage = input.summary[input.metric] + input.additionalQuantity;
  if (nextUsage > limit) {
    throw new Error(
      `${usageMetricLabels[input.metric]} quota exceeded. Used ${formatQuantity(input.summary[input.metric], input.metric)} of ${formatQuantity(
        limit,
        input.metric
      )}; requested ${formatQuantity(input.additionalQuantity, input.metric)}.`
    );
  }
}

export function mergeUsageEvent(events: UsageEvent[], event: UsageEvent): UsageEvent[] {
  if (events.some((candidate) => candidate.idempotencyKey === event.idempotencyKey)) {
    return events;
  }
  return [...events, event];
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

export function entitlementLimit(entitlements: WorkspaceEntitlements, metric: UsageMetric): number {
  switch (metric) {
    case "source_minutes":
      return entitlements.sourceMinutesMonthly;
    case "transcription_minutes":
      return entitlements.transcriptionMinutesMonthly;
    case "llm_runs":
      return entitlements.llmRunsMonthly;
    case "tts_characters":
      return entitlements.ttsCharactersMonthly;
    case "render_minutes":
      return entitlements.renderMinutesMonthly;
    case "storage_bytes":
      return entitlements.storageBytes;
    case "exports":
      return entitlements.exportsMonthly;
  }
}

export function formatQuantity(quantity: number, metric: UsageMetric): string {
  if (metric === "storage_bytes") {
    return `${Math.round(quantity / (1024 * 1024))} MB`;
  }
  return `${quantity}`;
}
