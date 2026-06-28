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
import type {
  ArtifactRecord,
  ProductProfile,
  RecordingMetadata,
  RecordingUploadSessionRecord,
  RenderedVideo,
  ScriptDraft
} from "../shared/types";
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

    expect(updated.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "export-1", kind: "export" })]));
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
