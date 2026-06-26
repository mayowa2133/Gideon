import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir
  }
}));

import { GideonStore } from "./store";
import { DEFAULT_LOCAL_WORKSPACE_ID } from "../shared/usage";

describe("GideonStore billing reconciliation", () => {
  beforeEach(async () => {
    electronMock.userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-store-test-"));
  });

  it("applies provider subscription updates idempotently to workspace billing state", async () => {
    const store = new GideonStore();
    await store.load();

    const first = await store.applyBillingSubscriptionUpdate({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      provider: "stripe",
      providerEventId: "evt_1",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      plan: "team",
      billingStatus: "active",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      appliedAt: "2026-06-25T12:00:00.000Z"
    });
    const workspace = first.workspaces.find((candidate) => candidate.id === DEFAULT_LOCAL_WORKSPACE_ID);

    expect(workspace).toMatchObject({
      plan: "team",
      billingStatus: "active",
      billingProvider: "stripe",
      billingCustomerId: "cus_1",
      billingSubscriptionId: "sub_1",
      billingCurrentPeriodEnd: "2026-07-01T00:00:00.000Z",
      billingCancelAtPeriodEnd: false,
      billingLastEventId: "evt_1"
    });
    expect(workspace?.entitlements.exportsMonthly).toBeGreaterThan(500);
    expect(first.auditEvents.filter((event) => event.action === "billing.webhook.apply")).toHaveLength(1);

    const duplicate = await store.applyBillingSubscriptionUpdate({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      provider: "stripe",
      providerEventId: "evt_1",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      plan: "starter",
      billingStatus: "past_due"
    });

    expect(duplicate.workspaces.find((candidate) => candidate.id === DEFAULT_LOCAL_WORKSPACE_ID)?.plan).toBe("team");
    expect(duplicate.auditEvents.filter((event) => event.action === "billing.webhook.apply")).toHaveLength(1);
  });
});
