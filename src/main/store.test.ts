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
import { DEFAULT_LOCAL_USER_ID, DEFAULT_LOCAL_WORKSPACE_ID } from "../shared/usage";

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

  it("syncs provider-authenticated users into owned workspaces", async () => {
    const store = new GideonStore();
    await store.load();

    const first = await store.syncAuthenticatedUser({
      authSubject: "oidc|founder-1",
      email: "Founder@Example.com",
      displayName: "Founder",
      identityProvider: "google",
      defaultWorkspaceName: "Founder workspace",
      now: "2026-06-25T13:00:00.000Z"
    });
    const user = first.users.find((candidate) => candidate.authSubject === "oidc|founder-1");
    const membership = first.workspaceMembers.find((candidate) => candidate.userId === user?.id);
    const workspace = first.workspaces.find((candidate) => candidate.id === membership?.workspaceId);

    expect(user).toMatchObject({
      email: "founder@example.com",
      displayName: "Founder",
      identityProvider: "google",
      lastSignedInAt: "2026-06-25T13:00:00.000Z"
    });
    expect(user?.id).not.toBe(DEFAULT_LOCAL_USER_ID);
    expect(membership).toMatchObject({ role: "owner" });
    expect(workspace).toMatchObject({ name: "Founder workspace", plan: "local_mvp", billingProvider: "manual" });
    expect(first.activeUserId).toBe(user?.id);
    expect(first.activeWorkspaceId).toBe(workspace?.id);
    expect(first.auditEvents.some((event) => event.action === "auth.user.sync" && event.targetId === user?.id)).toBe(true);

    const second = await store.syncAuthenticatedUser({
      authSubject: "oidc|founder-1",
      email: "founder@example.com",
      displayName: "Founder Updated",
      identityProvider: "google",
      now: "2026-06-25T14:00:00.000Z"
    });

    expect(second.users.filter((candidate) => candidate.authSubject === "oidc|founder-1")).toHaveLength(1);
    expect(second.workspaceMembers.filter((candidate) => candidate.userId === user?.id)).toHaveLength(1);
    expect(second.users.find((candidate) => candidate.id === user?.id)).toMatchObject({
      displayName: "Founder Updated",
      lastSignedInAt: "2026-06-25T14:00:00.000Z"
    });
  });
});
