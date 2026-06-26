import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJob } from "../shared/jobState";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir
  }
}));

import { GideonStore } from "./store";
import type { ProductProfile } from "../shared/types";
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

  it("creates and lists projects with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();

    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    const projects = await store.listProjectsForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID
    });

    expect(project).toMatchObject({
      name: "Hosted project",
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      status: "draft"
    });
    expect(projects.map((candidate) => candidate.id)).toContain(project.id);
    const state = await store.load();
    expect(state.activeProjectId).toBeNull();
    expect(state.auditEvents.some((event) => event.action === "project.create" && event.actorUserId === DEFAULT_LOCAL_USER_ID)).toBe(true);
  });

  it("gets and updates project profiles with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });

    const updated = await store.updateProfileForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      profile: profileFixture({
        productName: "Gideon Cloud",
        targetCustomer: "Product teams"
      })
    });
    const fetched = await store.getProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });

    expect(updated.profile).toMatchObject({
      productName: "Gideon Cloud",
      targetCustomer: "Product teams"
    });
    expect(fetched.profile.productName).toBe("Gideon Cloud");
    const state = await store.load();
    expect(state.activeProjectId).toBeNull();
    expect(
      state.auditEvents.some(
        (event) => event.action === "project.update_profile" && event.actorUserId === DEFAULT_LOCAL_USER_ID
      )
    ).toBe(true);
  });

  it("gets, cancels, and retries jobs with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    await store.appendJob(
      project.id,
      createJob({
        id: "job-1",
        projectId: project.id,
        kind: "analysis",
        now: "2026-06-25T12:00:00.000Z"
      })
    );

    const fetched = await store.getJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      jobId: "job-1"
    });
    const canceled = await store.requestJobCancelForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      jobId: "job-1"
    });
    const retried = await store.retryJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      jobId: "job-1"
    });

    expect(fetched.project.id).toBe(project.id);
    expect(fetched.job.status).toBe("queued");
    expect(canceled.job).toMatchObject({ id: "job-1", status: "canceled", retryable: true });
    expect(retried.job).toMatchObject({ id: "job-1", status: "queued", retryable: false });
    const state = await store.load();
    expect(
      state.auditEvents.some((event) => event.action === "job.cancel" && event.actorUserId === DEFAULT_LOCAL_USER_ID)
    ).toBe(true);
    expect(
      state.auditEvents.some((event) => event.action === "job.retry" && event.actorUserId === DEFAULT_LOCAL_USER_ID)
    ).toBe(true);
  });
});

function profileFixture(overrides: Partial<ProductProfile> = {}): ProductProfile {
  return {
    productName: "Gideon",
    targetCustomer: "SaaS founders",
    productDescription: "Turns product walkthroughs into short-form marketing videos.",
    preferredTone: "founder",
    toneGuidance: "specific and direct",
    platforms: ["tiktok", "youtube_shorts"],
    walkthroughNotes: "Focus on the upload-to-export workflow.",
    ...overrides
  };
}
