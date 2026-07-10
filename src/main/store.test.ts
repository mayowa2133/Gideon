import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createJob, failJob, startJob } from "../shared/jobState";

const electronMock = vi.hoisted(() => ({ userDataDir: "" }));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataDir
  }
}));

import { GideonStore } from "./store";
import type {
  AppState,
  ArtifactRecord,
  DetectedMoment,
  ProductProfile,
  Project,
  RecordingMetadata,
  RecordingUploadSessionRecord,
  RenderedVideo,
  ScriptDraft
} from "../shared/types";
import {
  createLocalUserWorkspace,
  DEFAULT_LOCAL_MEMBER_ID,
  DEFAULT_LOCAL_USER_ID,
  DEFAULT_LOCAL_WORKSPACE_ID
} from "../shared/usage";

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

  it("authorizes hosted billing sessions with explicit workspace scope", async () => {
    const store = new GideonStore();
    await store.load();

    const workspace = await store.getWorkspaceForBillingSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID
    });

    expect(workspace).toMatchObject({
      id: DEFAULT_LOCAL_WORKSPACE_ID,
      billingProvider: "manual"
    });
    await expect(
      store.getWorkspaceForBillingSession({
        userId: "missing-user",
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID
      })
    ).rejects.toThrow("not a member");
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
    expect(state.projects.find((candidate) => candidate.id === project.id)?.jobEvents.at(-1)?.metadata).toMatchObject({
      previousAttempt: 0,
      nextAttempt: 1,
      maxAttempts: 3
    });
  });

  it("records the next retry attempt after a failed attempt", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Retry metadata project",
      profile: profileFixture()
    });
    const failed = failJob(
      startJob(
        createJob({
          id: "job-1",
          projectId: project.id,
          kind: "render",
          now: "2026-06-25T12:00:00.000Z"
        }),
        "2026-06-25T12:01:00.000Z"
      ),
      "2026-06-25T12:02:00.000Z",
      "Render failed."
    );
    await store.appendJob(project.id, failed);

    const retried = await store.retryJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      jobId: "job-1"
    });
    const state = await store.load();
    const retryEvent = state.projects.find((candidate) => candidate.id === project.id)?.jobEvents.at(-1);
    const retryAudit = state.auditEvents.findLast((event) => event.action === "job.retry");

    expect(retried.job).toMatchObject({ attempt: 1, status: "queued" });
    expect(retryEvent).toMatchObject({
      kind: "retried",
      metadata: {
        previousAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 3
      }
    });
    expect(retryAudit?.metadata).toMatchObject({
      previousAttempt: 1,
      nextAttempt: 2,
      maxAttempts: 3
    });
  });

  it("persists worker job leases, heartbeats, and expired lease recovery", async () => {
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

    const leased = await store.claimWorkerJobLease({
      projectId: project.id,
      jobId: "job-1",
      workerId: "worker-1",
      leaseSeconds: 60,
      now: "2026-06-25T12:01:00.000Z",
      userMessage: "Worker claimed analysis."
    });
    const heartbeat = await store.heartbeatWorkerJobLease({
      projectId: project.id,
      jobId: "job-1",
      workerId: "worker-1",
      leaseSeconds: 120,
      now: "2026-06-25T12:02:00.000Z"
    });
    const earlyRecovery = await store.recoverExpiredWorkerJobLeases("2026-06-25T12:03:00.000Z");
    const recovered = await store.recoverExpiredWorkerJobLeases("2026-06-25T12:05:00.000Z");

    expect(leased).toMatchObject({
      status: "running",
      workerId: "worker-1",
      heartbeatAt: "2026-06-25T12:01:00.000Z",
      leaseExpiresAt: "2026-06-25T12:02:00.000Z"
    });
    expect(heartbeat).toMatchObject({
      status: "running",
      workerId: "worker-1",
      heartbeatAt: "2026-06-25T12:02:00.000Z",
      leaseExpiresAt: "2026-06-25T12:04:00.000Z"
    });
    expect(earlyRecovery).toEqual([]);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: "job-1",
      status: "failed",
      retryable: true,
      workerId: undefined,
      heartbeatAt: undefined,
      leaseExpiresAt: undefined
    });
    await expect(
      store.heartbeatWorkerJobLease({
        projectId: project.id,
        jobId: "job-1",
        workerId: "worker-2",
        leaseSeconds: 60,
        now: "2026-06-25T12:06:00.000Z"
      })
    ).rejects.toThrow("Cannot heartbeat failed job.");

    const state = await store.load();
    const storedJob = state.projects.find((candidate) => candidate.id === project.id)?.jobs.find((job) => job.id === "job-1");
    expect(storedJob).toMatchObject({ status: "failed", retryable: true });
    expect(state.projects.find((candidate) => candidate.id === project.id)?.jobEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: "job-1",
          kind: "started",
          metadata: expect.objectContaining({ workerId: "worker-1" })
        }),
        expect.objectContaining({
          jobId: "job-1",
          kind: "failed",
          metadata: expect.objectContaining({
            recoveredFromWorkerId: "worker-1",
            leaseExpiredAt: "2026-06-25T12:04:00.000Z"
          })
        })
      ])
    );

    await store.appendJob(
      project.id,
      createJob({
        id: "job-queued",
        projectId: project.id,
        kind: "render",
        now: "2026-06-25T12:01:00.000Z"
      })
    );
    const snapshot = await store.getJobObservabilitySnapshot({
      now: "2026-06-25T12:06:00.000Z",
      windowMs: 10 * 60 * 1000
    });

    expect(snapshot).toMatchObject({
      totalJobs: 2,
      activeJobs: 1,
      queuedJobs: 1,
      runningJobs: 0,
      terminalJobs: 1,
      failedJobs: 1,
      retryableFailedJobs: 1,
      terminalFailuresInWindow: 1,
      recoveredLeaseFailuresInWindow: 1,
      expiredRunningLeases: 0,
      oldestQueuedAgeMs: 5 * 60 * 1000,
      oldestRunningAgeMs: null,
      terminalFailureRatePerHour: 6,
      byStatus: { failed: 1, queued: 1 },
      byKind: { analysis: 1, render: 1 }
    });
  });

  it("creates recording upload sessions with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });

    const updated = await store.createRecordingUploadSessionRecordForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      session: uploadSessionFixture({
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: project.id
      })
    });

    expect(updated.uploadSessions).toHaveLength(1);
    expect(updated.uploadSessions[0]).toMatchObject({
      id: "upload-1",
      provider: "r2",
      status: "pending",
      originalFileName: "walkthrough.mov"
    });
    const state = await store.load();
    expect(
      state.auditEvents.some(
        (event) => event.action === "recording.upload_session.create" && event.actorUserId === DEFAULT_LOCAL_USER_ID
      )
    ).toBe(true);
  });

  it("completes recording uploads with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    const session = uploadSessionFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });
    await store.createRecordingUploadSessionRecordForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      session
    });

    const artifact = artifactFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      storageKey: session.storageKey,
      contentType: session.contentType,
      byteSize: session.byteSize,
      originalFileName: session.originalFileName
    });
    const recording = recordingFixture({
      artifactId: artifact.id,
      storageKey: artifact.storageKey,
      sha256: artifact.sha256,
      sizeBytes: artifact.byteSize,
      fileName: artifact.originalFileName
    });
    const completed = await store.completeRecordingUploadForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      sessionId: session.id,
      artifact,
      recording
    });

    expect(completed.status).toBe("recording_ready");
    expect(completed.uploadSessions[0]).toMatchObject({ id: "upload-1", status: "completed" });
    expect(completed.artifacts[0]).toMatchObject({ id: "upload-1", kind: "source_recording" });
    expect(completed.recording).toMatchObject({ artifactId: "upload-1", fileName: "walkthrough.mov" });
    const state = await store.load();
    expect(state.activeProjectId).toBeNull();
    expect(state.usageEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "source_minutes", quantity: 1, source: "recording" }),
        expect.objectContaining({ metric: "storage_bytes", quantity: 1024, source: "recording" })
      ])
    );
    expect(
      state.auditEvents.some(
        (event) => event.action === "recording.upload_session.complete" && event.actorUserId === DEFAULT_LOCAL_USER_ID
      )
    ).toBe(true);
    expect(
      state.auditEvents.some((event) => event.action === "recording.attach" && event.actorUserId === DEFAULT_LOCAL_USER_ID)
    ).toBe(true);
  });

  it("creates analysis jobs with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    const session = uploadSessionFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });
    await store.createRecordingUploadSessionRecordForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      session
    });
    const artifact = artifactFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      storageKey: session.storageKey,
      contentType: session.contentType,
      byteSize: session.byteSize,
      originalFileName: session.originalFileName
    });
    await store.completeRecordingUploadForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      sessionId: session.id,
      artifact,
      recording: recordingFixture({
        artifactId: artifact.id,
        storageKey: artifact.storageKey,
        sha256: artifact.sha256,
        sizeBytes: artifact.byteSize,
        fileName: artifact.originalFileName
      })
    });

    const created = await store.createAnalysisJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });
    const duplicate = await store.createAnalysisJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });

    expect(created.reused).toBe(false);
    expect(created.job).toMatchObject({ kind: "analysis", status: "queued" });
    expect(duplicate.reused).toBe(true);
    expect(duplicate.job.id).toBe(created.job.id);
    const state = await store.load();
    expect(state.activeProjectId).toBeNull();
    expect(state.projects.find((candidate) => candidate.id === project.id)?.jobs).toHaveLength(1);
    expect(
      state.auditEvents.some((event) => event.action === "job.create" && event.actorUserId === DEFAULT_LOCAL_USER_ID)
    ).toBe(true);
  });

  it("creates render jobs with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    const session = uploadSessionFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });
    await store.createRecordingUploadSessionRecordForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      session
    });
    const artifact = artifactFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      storageKey: session.storageKey,
      contentType: session.contentType,
      byteSize: session.byteSize,
      originalFileName: session.originalFileName
    });
    await store.completeRecordingUploadForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      sessionId: session.id,
      artifact,
      recording: recordingFixture({
        artifactId: artifact.id,
        storageKey: artifact.storageKey,
        sha256: artifact.sha256,
        sizeBytes: artifact.byteSize,
        fileName: artifact.originalFileName
      })
    });
    await store.updateMoments(project.id, [momentFixture()]);
    await store.updateConcepts(
      project.id,
      [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: ["moment-1"],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      "concept-1"
    );
    await store.updateScripts(project.id, [scriptFixture()]);

    const created = await store.createRenderJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });
    const duplicate = await store.createRenderJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });

    expect(created.reused).toBe(false);
    expect(created.job).toMatchObject({ kind: "render", status: "queued" });
    expect(duplicate.reused).toBe(true);
    expect(duplicate.job.id).toBe(created.job.id);
    const state = await store.load();
    expect(state.projects.find((candidate) => candidate.id === project.id)?.jobs).toHaveLength(1);
    expect(
      state.auditEvents.some(
        (event) =>
          event.action === "job.create" &&
          event.actorUserId === DEFAULT_LOCAL_USER_ID &&
          event.metadata?.jobKind === "render"
      )
    ).toBe(true);
  });

  it("requires approved selected scripts to be free of blocking warnings before creating render jobs", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    const session = uploadSessionFixture({
      id: "upload-blocked-1",
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      sha256: "sha-render-blocked"
    });
    await store.createRecordingUploadSessionRecordForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      session
    });
    const artifact = artifactFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      storageKey: session.storageKey,
      contentType: session.contentType,
      byteSize: session.byteSize,
      originalFileName: session.originalFileName
    });
    await store.completeRecordingUploadForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      sessionId: session.id,
      artifact,
      recording: recordingFixture({
        artifactId: artifact.id,
        storageKey: artifact.storageKey,
        sha256: artifact.sha256,
        sizeBytes: artifact.byteSize,
        fileName: artifact.originalFileName
      })
    });
    await store.updateConcepts(
      project.id,
      [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: [],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      "concept-1"
    );
    await store.updateScripts(project.id, [
      scriptFixture({
        qualityWarnings: [{ code: "caption_overflow_risk", message: "Caption may overflow safe areas." }]
      })
    ]);

    await expect(
      store.createRenderJobForSession({
        userId: DEFAULT_LOCAL_USER_ID,
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: project.id
      })
    ).rejects.toThrow("Approve at least one selected script without blocking warnings before rendering.");
  });

  it("applies hosted MCP script and moment edits through explicit session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted MCP project",
      profile: profileFixture()
    });
    await store.updateMoments(project.id, [
      {
        id: "moment-1",
        label: "Old proof",
        startMs: 0,
        endMs: 2_000,
        evidence: "Old evidence",
        confidence: 0.9,
        enabled: true
      }
    ]);

    const momentProject = await store.updateMomentForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      momentId: "moment-1",
      label: "Hosted proof",
      enabled: false
    });
    expect(momentProject.moments[0]).toMatchObject({ label: "Hosted proof", enabled: false });
    expect(momentProject.status).toBe("analyzed");

    await store.updateScripts(project.id, [scriptFixture({ id: "script-1", hook: "Old hook", cta: "Old CTA" })]);
    const scriptRevision = (await store.getProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    })).scripts[0]?.updatedAt;
    expect(scriptRevision).toBeDefined();
    const scriptProject = await store.updateScriptForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      scriptId: "script-1",
      expectedRevision: scriptRevision,
      hook: "Hosted hook",
      cta: "Hosted CTA"
    });
    expect(scriptProject.scripts[0]).toMatchObject({ hook: "Hosted hook", cta: "Hosted CTA" });
    expect(scriptProject.status).toBe("script_review");

    await expect(
      store.updateScriptForSession({
        userId: DEFAULT_LOCAL_USER_ID,
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: project.id,
        scriptId: "script-1",
        expectedRevision: "2026-06-25T12:00:00.000Z",
        hook: "Stale hook"
      })
    ).rejects.toThrow("Revision conflict.");

    const state = await store.load();
    expect(
      state.auditEvents.some(
        (event) =>
          event.actorType === "mcp_agent" &&
          event.action === "moments.update" &&
          event.targetId === "moment-1"
      )
    ).toBe(true);
    expect(
      state.auditEvents.some(
        (event) =>
          event.actorType === "mcp_agent" &&
          event.action === "scripts.update" &&
          event.targetId === "script-1"
      )
    ).toBe(true);
  });

  it("regenerates one script without replacing the whole script set", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProject({
      name: "Script regeneration",
      profile: profileFixture()
    });
    await store.updateMoments(project.id, [
      {
        id: "moment-1",
        label: "Upload proof",
        startMs: 0,
        endMs: 3_000,
        evidence: "The screen shows the upload proof.",
        confidence: 0.86,
        proofScore: 0.9,
        visualRole: "proof",
        focus: { x: 0.55, y: 0.5, scale: 1.22 },
        enabled: true
      },
      {
        id: "moment-2",
        label: "Export payoff",
        startMs: 3_000,
        endMs: 7_000,
        evidence: "The screen shows the final export.",
        confidence: 0.9,
        proofScore: 0.94,
        visualRole: "payoff",
        focus: { x: 0.5, y: 0.56, scale: 1.28 },
        enabled: true
      }
    ]);
    await store.generateConcepts(project.id);
    const scripted = await store.generateScripts(project.id);
    const firstScript = scripted.scripts[0]!;
    await store.updateScripts(project.id, [{ ...firstScript, hook: "Manual rewrite" }]);

    const regenerated = await store.regenerateScript(project.id, firstScript.id);

    expect(regenerated.scripts).toHaveLength(scripted.scripts.length);
    expect(regenerated.scripts[0]?.id).toBe(firstScript.id);
    expect(regenerated.scripts[0]?.hook).not.toBe("Manual rewrite");
    expect(regenerated.scripts[0]?.editDecisionList?.schemaVersion).toBe("2");
    expect(regenerated.renders).toEqual([]);
  });

  it("rebuilds captions and render plans from reviewed script edits", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProject({
      name: "Reviewed script edits",
      profile: profileFixture()
    });
    await store.updateMoments(project.id, [
      {
        id: "moment-1",
        label: "Upload proof",
        startMs: 0,
        endMs: 3_000,
        evidence: "The screen shows the upload proof.",
        confidence: 0.86,
        proofScore: 0.9,
        visualRole: "proof",
        focus: { x: 0.55, y: 0.5, scale: 1.22 },
        enabled: true
      },
      {
        id: "moment-2",
        label: "Export payoff",
        startMs: 3_000,
        endMs: 7_000,
        evidence: "The screen shows the final export.",
        confidence: 0.9,
        proofScore: 0.94,
        visualRole: "payoff",
        focus: { x: 0.5, y: 0.56, scale: 1.28 },
        enabled: true
      }
    ]);
    await store.generateConcepts(project.id);
    const scripted = await store.generateScripts(project.id);
    const firstScript = scripted.scripts[0]!;
    const reviewedVoiceover = `${firstScript.voiceoverText} ${Array(80).fill("reviewed proof line").join(" ")}.`;

    const updated = await store.updateScripts(project.id, [
      {
        ...firstScript,
        templateKey: "brand_presenter",
        voiceoverText: reviewedVoiceover
      }
    ]);
    const saved = updated.scripts[0]!;

    expect(saved.templateKey).toBe("brand_presenter");
    expect(saved.editDecisionList?.templateKey).toBe("brand_presenter");
    expect(saved.captions.map((caption) => caption.text).join(" ")).toContain("reviewed proof line");
    expect(saved.editDecisionList?.captions.map((caption) => caption.text).join(" ")).toContain("reviewed proof line");
    expect(saved.visualBeats[0]?.endMs).not.toBe(firstScript.visualBeats[0]?.endMs);
    expect(updated.renders).toEqual([]);
  });

  it("preserves user-edited visual beat source range, focus, and callout in rebuilt render manifests", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProject({
      name: "Focus review",
      profile: profileFixture()
    });
    await store.updateMoments(project.id, [
      {
        id: "moment-1",
        label: "Upload proof",
        startMs: 0,
        endMs: 3_000,
        evidence: "The screen shows the upload proof.",
        confidence: 0.86,
        proofScore: 0.9,
        visualRole: "proof",
        focus: { x: 0.55, y: 0.5, scale: 1.22 },
        enabled: true
      }
    ]);
    await store.generateConcepts(project.id);
    const scripted = await store.generateScripts(project.id);
    const firstScript = scripted.scripts[0]!;
    const editedFocus = { x: 0.31, y: 0.62, scale: 1.44 };
    const editedSource = { sourceStartMs: 500, sourceEndMs: 2_400 };
    const editedCallout = "Proof: CSV imported in seconds";
    const transitionOverride = { enabled: false, kind: "snap_cut" as const };
    const cursorOverride = { enabled: true, kind: "cursor_candidate" as const, label: "Imported row count" };

    const updated = await store.updateScripts(project.id, [
      {
        ...firstScript,
        visualBeats: firstScript.visualBeats.map((beat, index) =>
          index === 0
            ? { ...beat, ...editedSource, callout: editedCallout, focus: editedFocus }
            : index === 1
              ? { ...beat, cursorEmphasis: cursorOverride, transitionIn: transitionOverride }
              : beat
        )
      }
    ]);
    const saved = updated.scripts[0]!;

    expect(saved.visualBeats[0]).toMatchObject(editedSource);
    expect(saved.visualBeats[0]?.callout).toBe(editedCallout);
    expect(saved.visualBeats[0]?.focus).toEqual(editedFocus);
    expect(saved.visualBeats[1]?.transitionIn).toEqual(transitionOverride);
    expect(saved.visualBeats[1]?.cursorEmphasis).toEqual(cursorOverride);
    expect(saved.editDecisionList?.sourceSegments[0]).toMatchObject(editedSource);
    expect(saved.editDecisionList?.sourceSegments[0]?.focus).toEqual(editedFocus);
    expect(saved.editDecisionList?.zooms[0]?.focus).toEqual(editedFocus);
    expect(saved.editDecisionList?.callouts[0]?.anchor).toEqual(editedFocus);
    expect(saved.editDecisionList?.callouts[0]?.text).toBe(editedCallout);
    expect(saved.editDecisionList?.overlays.find((overlay) => overlay.id === "proof-1")?.text).toBe(editedCallout);
    expect(saved.editDecisionList?.transitions.some((transition) => transition.id === "cut-1")).toBe(false);
    expect(saved.editDecisionList?.cursorCues[0]).toMatchObject({
      id: "cursor-2",
      kind: "cursor_candidate",
      label: "Imported row count"
    });
    expect(updated.renders).toEqual([]);
  });

  it("refreshes script render manifests and clears renders after profile brand changes", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProject({
      name: "Brand refresh",
      profile: profileFixture()
    });
    await store.updateMoments(project.id, [
      {
        id: "moment-1",
        label: "Upload proof",
        startMs: 0,
        endMs: 3_000,
        evidence: "The screen shows the upload proof.",
        confidence: 0.86,
        proofScore: 0.9,
        visualRole: "proof",
        focus: { x: 0.55, y: 0.5, scale: 1.22 },
        enabled: true
      }
    ]);
    await store.generateConcepts(project.id);
    const scripted = await store.generateScripts(project.id);
    await store.replaceRenders(project.id, [renderFixture({ id: "render-1", scriptId: scripted.scripts[0]!.id })]);

    const updated = await store.updateProfile(project.id, {
      ...scripted.profile,
      brandPresenterEnabled: true,
      brandKit: {
        ...scripted.profile.brandKit!,
        primaryColor: "#123456"
      }
    });

    expect(updated.renders).toEqual([]);
    expect(updated.status).toBe("script_review");
    expect(updated.scripts[0]?.editDecisionList?.brandKit.primaryColor).toBe("#123456");
    expect(updated.scripts[0]?.editDecisionList?.presenter.enabled).toBe(true);
  });

  it("creates exports with explicit hosted session scope", async () => {
    const store = new GideonStore();
    await store.load();
    const project = await store.createProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      name: "Hosted project",
      profile: profileFixture()
    });
    await store.replaceRenders(project.id, [renderFixture({ id: "render-1" })]);
    const artifact = exportArtifactFixture({
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id
    });

    const updated = await store.createExportForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      renderId: "render-1",
      artifact
    });
    const storedArtifact = await store.getExportArtifactForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      exportId: artifact.id
    });

    expect(updated.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "export-1", kind: "export" })]));
    expect(storedArtifact).toMatchObject({
      id: "export-1",
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: project.id,
      kind: "export"
    });
    const state = await store.load();
    expect(state.usageEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "exports", quantity: 1, source: "export" }),
        expect.objectContaining({ metric: "storage_bytes", quantity: artifact.byteSize, source: "export" })
      ])
    );
    expect(
      state.auditEvents.some(
        (event) => event.action === "artifact.create" && event.actorUserId === DEFAULT_LOCAL_USER_ID && event.targetId === "export-1"
      )
    ).toBe(true);
  });
});

describe("GideonStore relational read paths", () => {
  beforeEach(async () => {
    electronMock.userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-store-test-"));
  });

  it("uses relational project reads after hosted session authorization", async () => {
    const state = { ...createLocalUserWorkspace(), usageEvents: [], auditEvents: [], projects: [], activeProjectId: null };
    const relationalProject = createRelationalProject();
    const store = new GideonStore({
      persistence: memoryPersistence(state),
      relationalReads: {
        listWorkspaceProjects(input) {
          expect(input).toEqual({ workspaceId: DEFAULT_LOCAL_WORKSPACE_ID });
          return [relationalProject];
        },
        getProject(input) {
          expect(input).toEqual({ workspaceId: DEFAULT_LOCAL_WORKSPACE_ID, projectId: "project-relational-1" });
          return relationalProject;
        }
      }
    });

    const projects = await store.listProjectsForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID
    });
    const project = await store.getProjectForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: "project-relational-1"
    });

    expect(projects).toEqual([relationalProject]);
    expect(project.id).toBe("project-relational-1");
  });

  it("uses relational job and export artifact reads for hosted API lookups", async () => {
    const state = { ...createLocalUserWorkspace(), usageEvents: [], auditEvents: [], projects: [], activeProjectId: null };
    const relationalProject = createRelationalProject();
    const relationalJob = createJob({
      id: "job-relational-1",
      projectId: relationalProject.id,
      kind: "analysis",
      now: "2026-06-29T12:00:00.000Z"
    });
    const exportArtifact = exportArtifactFixture({
      id: "export-relational-1",
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: relationalProject.id
    });
    const store = new GideonStore({
      persistence: memoryPersistence(state),
      relationalReads: {
        getProject(input) {
          expect(input.workspaceId).toBe(DEFAULT_LOCAL_WORKSPACE_ID);
          expect(input.projectId).toBe(relationalProject.id);
          return relationalProject;
        },
        getJob(input) {
          expect(input).toEqual({ workspaceId: DEFAULT_LOCAL_WORKSPACE_ID, jobId: "job-relational-1" });
          return relationalJob;
        },
        getArtifact(input) {
          expect(input).toEqual({ workspaceId: DEFAULT_LOCAL_WORKSPACE_ID, artifactId: "export-relational-1" });
          return exportArtifact;
        }
      }
    });

    const fetchedJob = await store.getJobForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      jobId: "job-relational-1"
    });
    const fetchedExport = await store.getExportArtifactForSession({
      userId: DEFAULT_LOCAL_USER_ID,
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: relationalProject.id,
      exportId: "export-relational-1"
    });

    expect(fetchedJob).toEqual({ project: relationalProject, job: relationalJob });
    expect(fetchedExport).toBe(exportArtifact);
  });

  it("rejects relational export artifacts that do not belong to the requested project", async () => {
    const state = { ...createLocalUserWorkspace(), usageEvents: [], auditEvents: [], projects: [], activeProjectId: null };
    const relationalProject = createRelationalProject();
    const store = new GideonStore({
      persistence: memoryPersistence(state),
      relationalReads: {
        getProject: () => relationalProject,
        getArtifact: () =>
          exportArtifactFixture({
            id: "export-other-project",
            workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
            projectId: "other-project"
          })
      }
    });

    await expect(
      store.getExportArtifactForSession({
        userId: DEFAULT_LOCAL_USER_ID,
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: relationalProject.id,
        exportId: "export-other-project"
      })
    ).rejects.toThrow("Export artifact not found.");
  });
});

describe("GideonStore relational mirror", () => {
  beforeEach(async () => {
    electronMock.userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-store-test-"));
  });

  it("mirrors live job and artifact state after successful saves", async () => {
    const job = createJob({
      id: "job-1",
      projectId: "project-1",
      kind: "analysis",
      now: "2026-06-29T12:00:00.000Z",
      userMessage: "Waiting to analyze recording."
    });
    const artifact: ArtifactRecord = {
      id: "artifact-1",
      workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
      projectId: "project-1",
      kind: "render",
      provider: "s3",
      storageKey: "private/local/project-1/render.mp4",
      contentType: "video/mp4",
      byteSize: 1234,
      sha256: "b".repeat(64),
      originalFileName: "render.mp4",
      createdAt: "2026-06-29T12:01:00.000Z"
    };
    const state = createMirrorState({ job, artifact });
    state.projects[0]?.uploadSessions.push({
      ...uploadSessionFixture({ artifactId: "artifact-1", status: "completed" }),
      createdAt: "2026-06-29T12:01:00.000Z",
      updatedAt: "2026-06-29T12:02:00.000Z"
    });
    const mirroredUsers: string[] = [];
    const mirroredWorkspaces: string[] = [];
    const mirroredMembers: string[] = [];
    const mirroredProjects: string[] = [];
    const mirroredUploadSessions: string[] = [];
    const mirroredJobs: Array<{ queueName: string; stage?: string; jobId: string }> = [];
    const mirroredArtifacts: string[] = [];
    const mirroredUsage: string[] = [];
    const mirroredAudit: string[] = [];
    const store = new GideonStore({
      userDataDir: electronMock.userDataDir,
      persistence: {
        metadata: { provider: "file", location: "memory" },
        async load() {
          return state;
        },
        async save(nextState) {
          state.projects = nextState.projects;
        }
      },
      relationalQueueName: "gideon-test-workers",
      relationalMirror: {
        upsertUser(input) {
          mirroredUsers.push(input.id);
          return input;
        },
        upsertWorkspace(input) {
          mirroredWorkspaces.push(input.id);
          return input;
        },
        upsertWorkspaceMember(input) {
          mirroredMembers.push(input.id);
          return input;
        },
        upsertProject(input) {
          mirroredProjects.push(input.id);
          return input;
        },
        upsertRecordingUploadSession(input) {
          mirroredUploadSessions.push(input.id);
          return input;
        },
        upsertJob(input) {
          mirroredJobs.push({
            queueName: input.queueName,
            stage: input.stage,
            jobId: input.job.id
          });
          return input.job;
        },
        upsertArtifact(input) {
          mirroredArtifacts.push(input.id);
          return input;
        },
        upsertUsageEvent(input) {
          mirroredUsage.push(input.id);
          return input;
        },
        upsertAuditEvent(input) {
          mirroredAudit.push(input.id);
          return input;
        }
      }
    });

    await store.appendJobEvent("project-1", {
      jobId: "job-1",
      kind: "stage",
      stage: "semantic_analysis",
      message: "Analyzing recording."
    });

    expect(mirroredJobs.at(-1)).toEqual({
      queueName: "gideon-test-workers",
      stage: "semantic_analysis",
      jobId: "job-1"
    });
    expect(mirroredUsers).toContain(DEFAULT_LOCAL_USER_ID);
    expect(mirroredWorkspaces).toContain(DEFAULT_LOCAL_WORKSPACE_ID);
    expect(mirroredMembers).toContain(DEFAULT_LOCAL_MEMBER_ID);
    expect(mirroredProjects).toContain("project-1");
    expect(mirroredUploadSessions).toContain("upload-1");
    expect(mirroredArtifacts).toContain("artifact-1");
    expect(mirroredUsage).toContain("usage-1");
    expect(mirroredAudit).toContain("audit-1");
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

function memoryPersistence(state: AppState) {
  return {
    metadata: { provider: "file" as const, location: "memory" },
    async load() {
      return state;
    },
    async save(nextState: AppState) {
      Object.assign(state, nextState);
    }
  };
}

function createRelationalProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-relational-1",
    workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    name: "Relational hosted project",
    status: "ready",
    profile: profileFixture(),
    recording: recordingFixture(),
    frameEvidence: [],
    moments: [],
    concepts: [],
    scripts: [scriptFixture()],
    renders: [renderFixture({ id: "render-relational-1" })],
    artifacts: [],
    uploadSessions: [],
    providerRuns: [],
    jobs: [],
    jobEvents: [],
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:05:00.000Z",
    ...overrides
  };
}

function createMirrorState(input: { job: AppState["projects"][number]["jobs"][number]; artifact: ArtifactRecord }): AppState {
  const local = createLocalUserWorkspace();
  const project: Project = {
    id: "project-1",
    workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    name: "Mirror project",
    status: "recording_ready",
    profile: profileFixture(),
    recording: recordingFixture(),
    frameEvidence: [],
    moments: [],
    concepts: [],
    scripts: [],
    renders: [],
    artifacts: [input.artifact],
    uploadSessions: [],
    providerRuns: [],
    jobs: [input.job],
    jobEvents: [],
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:00:00.000Z"
  };
  return {
    ...local,
    usageEvents: [
      {
        id: "usage-1",
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: project.id,
        metric: "llm_runs",
        quantity: 1,
        unit: "count",
        source: "analysis",
        idempotencyKey: "analysis:project-1:job-1",
        createdAt: "2026-06-29T12:02:00.000Z"
      }
    ],
    auditEvents: [
      {
        id: "audit-1",
        workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
        projectId: project.id,
        actorUserId: DEFAULT_LOCAL_USER_ID,
        actorType: "local_user",
        action: "usage.record",
        targetType: "usage",
        targetId: "usage-1",
        summary: "Recorded analysis usage.",
        metadata: { metric: "llm_runs", quantity: 1 },
        createdAt: "2026-06-29T12:02:00.000Z"
      }
    ],
    activeProjectId: project.id,
    projects: [project]
  };
}

function uploadSessionFixture(
  overrides: Partial<Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt">> = {}
): Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt"> {
  return {
    id: "upload-1",
    workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    projectId: "project-1",
    artifactId: "upload-1",
    provider: "r2",
    storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
    status: "pending",
    method: "PUT",
    contentType: "video/quicktime",
    byteSize: 1024,
    originalFileName: "walkthrough.mov",
    expiresAt: "2026-06-25T12:15:00.000Z",
    ...overrides
  };
}

function scriptFixture(overrides: Partial<ScriptDraft> = {}): ScriptDraft {
  return {
    id: "script-1",
    conceptId: "concept-1",
    hook: "Stop stitching walkthrough clips manually.",
    voiceoverText: "Gideon turns one product recording into short-form video drafts.",
    captions: [
      {
        startMs: 0,
        endMs: 2_000,
        text: "Turn recordings into video drafts"
      }
    ],
    cta: "Try Gideon",
    visualBeats: [
      {
        startMs: 0,
        endMs: 2_000,
        momentId: "moment-1",
        instruction: "Show the upload-to-export workflow."
      }
    ],
    approved: true,
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function momentFixture(overrides: Partial<DetectedMoment> = {}): DetectedMoment {
  return {
    id: "moment-1",
    label: "Fast export proof",
    startMs: 0,
    endMs: 2_000,
    evidence: "Export workflow appears on screen.",
    sourceEvidenceIds: ["frame-1"],
    confidence: 0.9,
    enabled: true,
    ...overrides
  };
}

function renderFixture(overrides: Partial<RenderedVideo> & { id: string }): RenderedVideo {
  return {
    id: overrides.id,
    scriptId: "script-1",
    title: "Gideon Export",
    status: "completed",
    outputPath: "/private/cache/render.mp4",
    outputUrl: "file:///private/cache/render.mp4",
    artifactId: "render-artifact-1",
    storageKey: "workspaces/local-workspace/projects/project-1/render/render-artifact-1.mp4",
    sha256: "c".repeat(64),
    sizeBytes: 4096,
    validation: {
      width: 1080,
      height: 1920,
      durationMs: 30_000,
      videoCodec: "h264",
      audioCodec: "aac",
      fastStart: true
    },
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function artifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "upload-1",
    workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    projectId: "project-1",
    kind: "source_recording",
    provider: "r2",
    storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
    contentType: "video/quicktime",
    byteSize: 1024,
    sha256: "a".repeat(64),
    originalFileName: "walkthrough.mov",
    localPath: "/private/cache/walkthrough.mov",
    localUrl: "file:///private/cache/walkthrough.mov",
    createdAt: "2026-06-25T12:02:00.000Z",
    ...overrides
  };
}

function exportArtifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "export-1",
    workspaceId: DEFAULT_LOCAL_WORKSPACE_ID,
    projectId: "project-1",
    kind: "export",
    provider: "r2",
    storageKey: "workspaces/local-workspace/projects/project-1/export/export-1-gideon-export.mp4",
    contentType: "video/mp4",
    byteSize: 4096,
    sha256: "b".repeat(64),
    originalFileName: "gideon-export.mp4",
    localPath: "/private/cache/gideon-export.mp4",
    localUrl: "file:///private/cache/gideon-export.mp4",
    createdAt: "2026-06-25T12:04:00.000Z",
    ...overrides
  };
}

function recordingFixture(overrides: Partial<RecordingMetadata> = {}): RecordingMetadata {
  return {
    filePath: "/private/cache/walkthrough.mov",
    fileUrl: "file:///private/cache/walkthrough.mov",
    fileName: "walkthrough.mov",
    artifactId: "upload-1",
    storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
    sha256: "a".repeat(64),
    sizeBytes: 1024,
    durationMs: 42_000,
    width: 1280,
    height: 720,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
    validatedAt: "2026-06-25T12:02:00.000Z",
    ...overrides
  };
}
