import { describe, expect, it } from "vitest";
import type { UsageEvent } from "./types";
import {
  assertWithinEntitlement,
  defaultLocalEntitlements,
  DEFAULT_LOCAL_WORKSPACE_ID,
  mergeUsageEvent,
  summarizeUsage
} from "./usage";

const event: UsageEvent = {
  id: "usage-1",
  workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
  projectId: "project-1",
  metric: "llm_runs",
  quantity: 1,
  unit: "count",
  source: "analysis",
  idempotencyKey: "analysis:project-1:run-1",
  createdAt: "2026-06-25T00:00:00.000Z"
};

describe("usage metering", () => {
  it("summarizes monthly usage for one workspace", () => {
    const summary = summarizeUsage(
      [
        event,
        {
          ...event,
          id: "usage-2",
          metric: "render_minutes",
          quantity: 3,
          unit: "minute",
          source: "render",
          idempotencyKey: "render:project-1:video-1"
        },
        {
          ...event,
          id: "usage-3",
          workspaceId: "other-workspace",
          quantity: 99,
          idempotencyKey: "analysis:other"
        }
      ],
      DEFAULT_LOCAL_WORKSPACE_ID,
      "2026-06-01T00:00:00.000Z"
    );

    expect(summary.llm_runs).toBe(1);
    expect(summary.render_minutes).toBe(3);
  });

  it("rejects usage that would exceed a workspace entitlement", () => {
    const summary = {
      ...summarizeUsage([], DEFAULT_LOCAL_WORKSPACE_ID),
      llm_runs: defaultLocalEntitlements.llmRunsMonthly
    };

    expect(() =>
      assertWithinEntitlement({
        entitlements: defaultLocalEntitlements,
        summary,
        metric: "llm_runs",
        additionalQuantity: 1
      })
    ).toThrow("AI runs quota exceeded");
  });

  it("deduplicates usage events by idempotency key", () => {
    expect(mergeUsageEvent([event], { ...event, id: "usage-duplicate" })).toHaveLength(1);
    expect(mergeUsageEvent([event], { ...event, id: "usage-2", idempotencyKey: "analysis:project-1:run-2" })).toHaveLength(2);
  });
});
