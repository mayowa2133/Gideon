import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSignedSession } from "./auth";
import {
  createHostedApiDependencies,
  handleHostedApiRequest,
  type HostedBillingService,
  type HostedApiStore,
  type HostedExportService,
  type HostedJobQueueService,
  type HostedRecordingUploadService
} from "./hostedApi";
import { requestJobCancel as requestJobCancelState, retryJob as retryJobState } from "../shared/jobState";
import type {
  AppState,
  ApplyBillingSubscriptionInput,
  ArtifactRecord,
  CreateProjectInput,
  JobRecord,
  ProductProfile,
  Project,
  RecordingMetadata,
  RecordingUploadSessionRecord,
  RenderedVideo,
  ScriptDraft,
  SyncAuthenticatedUserInput,
  Workspace
} from "../shared/types";
import { createLocalUserWorkspace } from "../shared/usage";

describe("hosted API foundation", () => {
  it("returns a null auth session without a cookie", async () => {
    const api = testApi();
    const response = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/auth/session",
        headers: { "x-request-id": "req_test_1" }
      },
      api
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { session: null },
      meta: { requestId: "req_test_1" }
    });
  });

  it("auto-wires configured Stripe billing service into hosted dependencies", () => {
    const store = new InMemoryHostedApiStore();
    const dependencies = createHostedApiDependencies({
      store,
      env: {
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_AUTH_CALLBACK_SECRET: "internal-secret",
        GIDEON_BILLING_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: "sk_test",
        GIDEON_STRIPE_API_BASE_URL: "https://stripe.example.test",
        GIDEON_STRIPE_TEAM_PRICE_ID: "price_team"
      }
    });

    expect(dependencies.store).toBe(store);
    expect(dependencies.config.billing.provider).toBe("stripe");
    expect(dependencies.config.billing.stripeSecretKey).toBe("sk_test");
    expect(dependencies.billingService).toBeDefined();
  });

  it("leaves hosted billing disabled when Stripe billing is missing a secret key", async () => {
    const dependencies = createHostedApiDependencies({
      store: new InMemoryHostedApiStore(),
      env: {
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_BILLING_PROVIDER: "stripe",
        GIDEON_STRIPE_TEAM_PRICE_ID: "price_team"
      }
    });
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    expect(dependencies.billingService).toBeUndefined();
    const response = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/workspaces/local-workspace/billing/checkout-sessions",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        body: {
          plan: "team",
          successUrl: "https://gideon.example.test/success",
          cancelUrl: "https://gideon.example.test/cancel"
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      dependencies
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: "billing_not_configured" } });
  });

  it("auto-wires configured HTTP hosted worker queue service into hosted dependencies", () => {
    const dependencies = createHostedApiDependencies({
      store: new InMemoryHostedApiStore(),
      env: {
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_HOSTED_QUEUE_URL: "https://workers.example.test/enqueue",
        GIDEON_HOSTED_QUEUE_SECRET: "queue-secret"
      }
    });

    expect(dependencies.config.jobQueue).toEqual({
      provider: "http",
      httpEndpointUrl: "https://workers.example.test/enqueue",
      signingSecret: "queue-secret",
      redisUrl: null,
      bullMqQueueName: "gideon-hosted-worker-jobs",
      bullMqPrefix: null
    });
    expect(dependencies.jobQueueService).toBeDefined();
  });

  it("auto-wires in-memory hosted worker broker queue service into hosted dependencies", async () => {
    const dependencies = createHostedApiDependencies({
      store: new InMemoryHostedApiStore(),
      env: {
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_HOSTED_QUEUE_PROVIDER: "memory"
      }
    });

    expect(dependencies.config.jobQueue).toEqual({
      provider: "memory",
      httpEndpointUrl: null,
      signingSecret: null,
      redisUrl: null,
      bullMqQueueName: "gideon-hosted-worker-jobs",
      bullMqPrefix: null
    });
    expect(dependencies.jobQueueService).toBeDefined();
    expect(dependencies.jobQueueBroker).toBeDefined();

    await dependencies.jobQueueService?.enqueueAnalysisJob({ projectId: "project-1", jobId: "job-1" });

    expect(dependencies.jobQueueBroker?.stats()).toMatchObject({ active: 0, pending: 1 });
    expect(dependencies.jobQueueBroker?.stats().pendingByKind).toEqual({ analysis: 1 });
  });

  it("creates hosted analysis jobs through auto-wired memory broker queue", async () => {
    const api = createHostedApiDependencies({
      store: new InMemoryHostedApiStore(),
      env: {
        GIDEON_SESSION_SECRET: "session-secret",
        GIDEON_HOSTED_QUEUE_PROVIDER: "memory"
      }
    });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        recording: recordingFixture({ artifactId: "recording-1" })
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const response = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/analysis-runs",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(response.status).toBe(202);
    expect(api.jobQueueBroker?.stats()).toMatchObject({ active: 0, pending: 1 });
    expect(api.jobQueueBroker?.stats().pendingByKind).toEqual({ analysis: 1 });
  });

  it("syncs trusted auth callbacks and returns a signed cookie session", async () => {
    const api = testApi();
    const response = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/auth/provider-callback",
        headers: {
          "x-gideon-auth-callback-secret": "internal-secret",
          "x-request-id": "req_auth_1"
        },
        body: {
          authSubject: "oidc|founder-1",
          email: "Founder@Example.com",
          displayName: "Founder",
          identityProvider: "google",
          defaultWorkspaceName: "Founder workspace"
        },
        nowMs: Date.parse("2026-06-25T12:00:00.000Z")
      },
      api
    );

    expect(response.status).toBe(201);
    expect(response.headers["Set-Cookie"]).toContain("gideon_session=");
    expect(response.body).toMatchObject({
      data: {
        session: {
          user: {
            email: "founder@example.com",
            displayName: "Founder"
          },
          workspace: {
            name: "Founder workspace"
          },
          role: "owner"
        }
      },
      meta: { requestId: "req_auth_1" }
    });

    const session = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/auth/session",
        headers: { cookie: response.headers["Set-Cookie"] },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({
      data: {
        session: {
          user: { email: "founder@example.com" },
          role: "owner"
        }
      }
    });
  });

  it("requires CSRF for cookie-authenticated logout", async () => {
    const api = testApi();
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/auth/session/logout",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/auth/session/logout",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(200);
    expect(accepted.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(accepted.body).toMatchObject({ data: { session: null } });
  });

  it("lists projects for the authenticated workspace only", async () => {
    const api = testApi();
    api.store.state.projects = [
      projectFixture({ id: "project-1", workspaceId: "local-workspace", name: "Visible project" }),
      projectFixture({ id: "project-2", workspaceId: "other-workspace", name: "Hidden project" })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const response = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/projects",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        projects: [
          {
            id: "project-1",
            name: "Visible project",
            workspaceId: "local-workspace",
            productName: "Gideon"
          }
        ]
      }
    });
  });

  it("returns project details without leaking projects from another workspace", async () => {
    const api = testApi();
    api.store.state.projects = [
      projectFixture({ id: "project-1", workspaceId: "local-workspace", name: "Visible project" }),
      projectFixture({ id: "project-2", workspaceId: "other-workspace", name: "Hidden project" })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const visible = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/projects/project-1",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(visible.status).toBe(200);
    expect(visible.body).toMatchObject({
      data: {
        project: {
          id: "project-1",
          workspaceId: "local-workspace",
          profile: {
            productName: "Gideon"
          },
          momentsCount: 0,
          scriptsCount: 0,
          rendersCount: 0,
          artifactsCount: 0,
          hasRecording: false
        }
      }
    });

    const hidden = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/projects/project-2",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(hidden.status).toBe(404);
    expect(hidden.body).toMatchObject({ error: { code: "not_found" } });
  });

  it("creates projects through authenticated CSRF-protected hosted API requests", async () => {
    const api = testApi();
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {
          name: "New project",
          profile: profileFixture()
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_create_project"
        },
        body: {
          name: "New project",
          profile: profileFixture()
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(201);
    expect(accepted.headers.Location).toBe("/api/v1/projects/project-1");
    expect(accepted.body).toMatchObject({
      data: {
        project: {
          id: "project-1",
          workspaceId: "local-workspace",
          name: "New project",
          status: "draft",
          productName: "Gideon"
        }
      },
      meta: { requestId: "req_create_project" }
    });
    expect(api.store.state.projects).toHaveLength(1);
  });

  it("updates project profiles through authenticated CSRF-protected hosted API requests", async () => {
    const api = testApi();
    api.store.state.projects = [projectFixture({ id: "project-1", workspaceId: "local-workspace", name: "Existing project" })];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });
    const updatedProfile = profileFixture({
      productName: "Gideon Cloud",
      targetCustomer: "Product teams"
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "PATCH",
        path: "/api/v1/projects/project-1/profile",
        headers: { cookie: `gideon_session=${created.token}` },
        body: { profile: updatedProfile },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "PATCH",
        path: "/api/v1/projects/project-1/profile",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_update_profile"
        },
        body: { profile: updatedProfile },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      data: {
        project: {
          id: "project-1",
          workspaceId: "local-workspace",
          productName: "Gideon Cloud",
          profile: {
            productName: "Gideon Cloud",
            targetCustomer: "Product teams"
          }
        }
      },
      meta: { requestId: "req_update_profile" }
    });
    expect(api.store.state.projects[0]?.profile.productName).toBe("Gideon Cloud");
  });

  it("creates direct recording upload sessions through authenticated CSRF-protected hosted API requests", async () => {
    const uploadService: HostedRecordingUploadService = {
      async createRecordingUploadSession(input) {
        expect(input).toMatchObject({
          workspaceId: "local-workspace",
          projectId: "project-1",
          fileName: "walkthrough.mov",
          byteSize: 1024,
          contentType: "video/quicktime"
        });
        return {
          id: "upload-1",
          provider: "r2",
          storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
          uploadUrl: "https://uploads.example.test/upload-1",
          method: "PUT",
          headers: {
            "Content-Type": "video/quicktime"
          },
          expiresAt: "2026-06-25T12:15:00.000Z",
          maxBytes: 1024,
          contentType: "video/quicktime",
          originalFileName: "walkthrough.mov"
        };
      },
      async completeRecordingUploadSession() {
        throw new Error("Unexpected completion call.");
      }
    };
    const api = testApi({ uploadService });
    api.store.state.projects = [projectFixture({ id: "project-1", workspaceId: "local-workspace", name: "Visible project" })];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/recordings/uploads",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {
          filename: "walkthrough.mov",
          mediaType: "video/quicktime",
          sizeBytes: 1024
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/recordings/uploads",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_recording_upload"
        },
        body: {
          filename: "walkthrough.mov",
          mediaType: "video/quicktime",
          sizeBytes: 1024
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(201);
    expect(accepted.headers.Location).toBe("/api/v1/projects/project-1/recordings/upload-1");
    expect(accepted.body).toMatchObject({
      data: {
        recordingId: "upload-1",
        upload: {
          uploadId: "upload-1",
          provider: "r2",
          uploadUrl: "https://uploads.example.test/upload-1",
          method: "PUT",
          expiresAt: "2026-06-25T12:15:00.000Z",
          maxBytes: 1024,
          contentType: "video/quicktime",
          originalFileName: "walkthrough.mov"
        }
      },
      meta: { requestId: "req_recording_upload" }
    });
    expect((accepted.body as { data: { upload: { storageKey?: string } } }).data.upload.storageKey).toBeUndefined();
    expect(api.store.state.projects[0]?.uploadSessions).toHaveLength(1);
    expect(api.store.state.projects[0]?.uploadSessions[0]).toMatchObject({
      id: "upload-1",
      artifactId: "upload-1",
      status: "pending",
      storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov"
    });
  });

  it("completes direct recording uploads without exposing private object keys", async () => {
    const artifact = artifactFixture({ projectId: "project-1" });
    const recording = recordingFixture({
      artifactId: artifact.id,
      storageKey: artifact.storageKey,
      sha256: artifact.sha256,
      sizeBytes: artifact.byteSize
    });
    const uploadService: HostedRecordingUploadService = {
      async createRecordingUploadSession() {
        throw new Error("Unexpected create call.");
      },
      async completeRecordingUploadSession(input) {
        expect(input.session).toMatchObject({
          id: "upload-1",
          projectId: "project-1",
          status: "pending"
        });
        expect(input.checksumSha256).toBe("a".repeat(64));
        return { artifact, recording };
      }
    };
    const api = testApi({ uploadService });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        uploadSessions: [
          uploadSessionFixture({
            projectId: "project-1",
            artifactId: artifact.id,
            storageKey: artifact.storageKey,
            byteSize: artifact.byteSize,
            contentType: artifact.contentType,
            originalFileName: artifact.originalFileName
          })
        ]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/recordings/upload-1/complete",
        headers: { cookie: `gideon_session=${created.token}` },
        body: { checksumSha256: "a".repeat(64) },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/recordings/upload-1/complete",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_complete_upload"
        },
        body: { checksumSha256: "a".repeat(64) },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      data: {
        project: {
          id: "project-1",
          status: "recording_ready",
          hasRecording: true,
          artifactsCount: 1
        },
        recording: {
          artifactId: "upload-1",
          fileName: "walkthrough.mov",
          durationMs: 42_000,
          sizeBytes: 2048,
          hasAudio: true
        }
      },
      meta: { requestId: "req_complete_upload" }
    });
    const recordingBody = (accepted.body as { data: { recording: { filePath?: string; fileUrl?: string; storageKey?: string } } }).data
      .recording;
    expect(recordingBody.filePath).toBeUndefined();
    expect(recordingBody.fileUrl).toBeUndefined();
    expect(recordingBody.storageKey).toBeUndefined();
    expect(api.store.state.projects[0]?.uploadSessions[0]?.status).toBe("completed");
    expect(api.store.state.projects[0]?.recording?.artifactId).toBe("upload-1");
  });

  it("creates hosted analysis jobs and hands them to the queue service", async () => {
    const enqueued: Array<{ projectId: string; jobId: string }> = [];
    const jobQueueService: HostedJobQueueService = {
      enqueueAnalysisJob(input) {
        enqueued.push(input);
      },
      enqueueRenderJob() {
        throw new Error("Unexpected render enqueue.");
      }
    };
    const api = testApi({ jobQueueService });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        recording: recordingFixture({ artifactId: "recording-1" })
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/analysis-runs",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/analysis-runs",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_analysis_run"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(202);
    expect(accepted.headers.Location).toBe("/api/v1/jobs/job-1");
    expect(accepted.body).toMatchObject({
      data: {
        analysisRun: {
          id: "job-1",
          projectId: "project-1",
          workspaceId: "local-workspace",
          status: "queued",
          reused: false
        },
        job: {
          id: "job-1",
          kind: "analysis",
          status: "queued",
          workspaceId: "local-workspace"
        }
      },
      meta: { requestId: "req_analysis_run" }
    });
    expect(enqueued).toEqual([{ projectId: "project-1", jobId: "job-1" }]);

    const duplicate = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/analysis-runs",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:02:00.000Z")
      },
      api
    );
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toMatchObject({ data: { analysisRun: { id: "job-1", reused: true } } });
    expect(enqueued).toEqual([{ projectId: "project-1", jobId: "job-1" }]);
  });

  it("creates hosted render jobs and hands them to the queue service", async () => {
    const enqueued: Array<{ projectId: string; jobId: string }> = [];
    const jobQueueService: HostedJobQueueService = {
      enqueueAnalysisJob() {
        throw new Error("Unexpected analysis enqueue.");
      },
      enqueueRenderJob(input) {
        enqueued.push(input);
      }
    };
    const api = testApi({ jobQueueService });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        recording: recordingFixture({ artifactId: "recording-1" }),
        scripts: [scriptFixture({ id: "script-1" })]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/render-jobs",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/render-jobs",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_render_job"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(202);
    expect(accepted.headers.Location).toBe("/api/v1/jobs/job-1");
    expect(accepted.body).toMatchObject({
      data: {
        renderJob: {
          id: "job-1",
          projectId: "project-1",
          workspaceId: "local-workspace",
          status: "queued",
          reused: false
        },
        job: {
          id: "job-1",
          kind: "render",
          status: "queued",
          workspaceId: "local-workspace"
        }
      },
      meta: { requestId: "req_render_job" }
    });
    expect(enqueued).toEqual([{ projectId: "project-1", jobId: "job-1" }]);

    const duplicate = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/render-jobs",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:02:00.000Z")
      },
      api
    );
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toMatchObject({ data: { renderJob: { id: "job-1", reused: true } } });
    expect(enqueued).toEqual([{ projectId: "project-1", jobId: "job-1" }]);
  });

  it("creates hosted exports from completed renders without exposing private storage keys", async () => {
    const render = renderFixture({ id: "render-1", projectId: "project-1" });
    const exportArtifact = exportArtifactFixture({ projectId: "project-1" });
    const exportService: HostedExportService = {
      async createExport(input) {
        expect(input.project.id).toBe("project-1");
        expect(input.render.id).toBe("render-1");
        return { artifact: exportArtifact };
      },
      async createDownloadUrl() {
        throw new Error("createDownloadUrl should not be called by export creation");
      }
    };
    const api = testApi({ exportService });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        renders: [render]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/exports",
        headers: { cookie: `gideon_session=${created.token}` },
        body: { renderId: "render-1" },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/exports",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_create_export"
        },
        body: { renderId: "render-1" },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(201);
    expect(accepted.headers.Location).toBe("/api/v1/projects/project-1/exports/export-1");
    expect(accepted.body).toMatchObject({
      data: {
        export: {
          id: "export-1",
          projectId: "project-1",
          workspaceId: "local-workspace",
          renderId: "render-1",
          contentType: "video/mp4",
          byteSize: 4096,
          sha256: "b".repeat(64),
          originalFileName: "gideon-export.mp4"
        },
        project: {
          id: "project-1",
          artifactsCount: 1
        }
      },
      meta: { requestId: "req_create_export" }
    });
    const exportBody = (accepted.body as { data: { export: { storageKey?: string; localPath?: string; localUrl?: string } } }).data
      .export;
    expect(exportBody.storageKey).toBeUndefined();
    expect(exportBody.localPath).toBeUndefined();
    expect(exportBody.localUrl).toBeUndefined();
    expect(api.store.state.projects[0]?.artifacts).toHaveLength(1);
    expect(api.store.state.projects[0]?.artifacts[0]).toMatchObject({ id: "export-1", kind: "export" });
  });

  it("creates short-lived hosted export download URLs without exposing storage keys", async () => {
    const exportArtifact = exportArtifactFixture({ projectId: "project-1" });
    const exportService: HostedExportService = {
      async createExport() {
        throw new Error("createExport should not be called by download-url creation");
      },
      async createDownloadUrl(input) {
        expect(input.project.id).toBe("project-1");
        expect(input.artifact.id).toBe("export-1");
        return {
          downloadUrl: "https://downloads.example.test/export-1?sig=ok",
          expiresAt: "2026-06-25T12:16:00.000Z"
        };
      }
    };
    const api = testApi({ exportService });
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        artifacts: [exportArtifact]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/exports/export-1/download-url",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/projects/project-1/exports/export-1/download-url",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_download_export"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(200);
    expect(accepted.headers["Cache-Control"]).toBe("no-store");
    expect(accepted.body).toMatchObject({
      data: {
        download: {
          exportId: "export-1",
          projectId: "project-1",
          workspaceId: "local-workspace",
          url: "https://downloads.example.test/export-1?sig=ok",
          expiresAt: "2026-06-25T12:16:00.000Z",
          filename: "gideon-export.mp4",
          contentType: "video/mp4",
          byteSize: 4096
        }
      },
      meta: { requestId: "req_download_export" }
    });
    const downloadBody = (accepted.body as {
      data: { download: { storageKey?: string; localPath?: string; localUrl?: string } };
    }).data.download;
    expect(downloadBody.storageKey).toBeUndefined();
    expect(downloadBody.localPath).toBeUndefined();
    expect(downloadBody.localUrl).toBeUndefined();
  });

  it("returns job details without leaking jobs from another workspace", async () => {
    const api = testApi();
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        jobs: [jobFixture({ id: "job-1", projectId: "project-1" })]
      }),
      projectFixture({
        id: "project-2",
        workspaceId: "other-workspace",
        name: "Hidden project",
        jobs: [jobFixture({ id: "job-2", projectId: "project-2" })]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const visible = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/jobs/job-1",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(visible.status).toBe(200);
    expect(visible.body).toMatchObject({
      data: {
        job: {
          id: "job-1",
          projectId: "project-1",
          workspaceId: "local-workspace",
          kind: "analysis",
          status: "queued"
        }
      }
    });

    const hidden = await handleHostedApiRequest(
      {
        method: "GET",
        path: "/api/v1/jobs/job-2",
        headers: { cookie: `gideon_session=${created.token}` },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(hidden.status).toBe(404);
    expect(hidden.body).toMatchObject({ error: { code: "not_found" } });
  });

  it("cancels and retries jobs through authenticated CSRF-protected hosted API requests", async () => {
    const api = testApi();
    api.store.state.projects = [
      projectFixture({
        id: "project-1",
        workspaceId: "local-workspace",
        name: "Visible project",
        jobs: [jobFixture({ id: "job-1", projectId: "project-1" })]
      })
    ];
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/jobs/job-1/cancel",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const canceled = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/jobs/job-1/cancel",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_cancel_job"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(canceled.status).toBe(202);
    expect(canceled.body).toMatchObject({
      data: {
        job: {
          id: "job-1",
          status: "canceled",
          retryable: true,
          workspaceId: "local-workspace"
        }
      },
      meta: { requestId: "req_cancel_job" }
    });

    const retried = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/jobs/job-1/retry",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1"
        },
        body: {},
        nowMs: Date.parse("2026-06-25T12:02:00.000Z")
      },
      api
    );

    expect(retried.status).toBe(202);
    expect(retried.body).toMatchObject({
      data: {
        job: {
          id: "job-1",
          status: "queued",
          retryable: false,
          workspaceId: "local-workspace"
        }
      }
    });
    expect(api.store.state.projects[0]?.jobs[0]?.status).toBe("queued");
  });

  it("verifies Stripe webhooks and applies subscription updates", async () => {
    const api = testApi();
    const event = {
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          metadata: { gideonWorkspaceId: "local-workspace" },
          items: { data: [{ price: { id: "price_team" } }] }
        }
      }
    };
    const raw = JSON.stringify(event);
    const timestamp = 1_777_000_000;
    const signature = createHmac("sha256", "stripe-secret").update(`${timestamp}.${raw}`).digest("hex");

    const response = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/webhooks/stripe",
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        rawBody: raw,
        nowMs: timestamp * 1000
      },
      api
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { received: true, applied: true, workspaceId: "local-workspace" } });
    expect(api.store.appliedBillingUpdates).toHaveLength(1);
    expect(api.store.appliedBillingUpdates[0]).toMatchObject({
      providerEventId: "evt_1",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      plan: "team",
      billingStatus: "active"
    });
  });

  it("creates hosted billing checkout sessions for billing managers", async () => {
    const createdSessions: Array<{
      workspaceId: string;
      userId: string;
      plan: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    }> = [];
    const billingService: HostedBillingService = {
      async createCheckoutSession(input) {
        createdSessions.push({
          workspaceId: input.workspace.id,
          userId: input.userId,
          plan: input.plan,
          priceId: input.priceId,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl
        });
        return {
          id: "cs_test_1",
          provider: "stripe",
          url: "https://checkout.stripe.test/session/cs_test_1",
          expiresAt: "2026-06-25T12:30:00.000Z"
        };
      },
      async createCustomerPortalSession() {
        throw new Error("createCustomerPortalSession should not be called by checkout");
      }
    };
    const api = testApi({ billingService });
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const rejected = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/workspaces/local-workspace/billing/checkout-sessions",
        headers: { cookie: `gideon_session=${created.token}` },
        body: {
          plan: "team",
          successUrl: "https://gideon.example.test/billing/success",
          cancelUrl: "https://gideon.example.test/billing/cancel"
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ error: { code: "csrf_failed" } });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/workspaces/local-workspace/billing/checkout-sessions",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_checkout"
        },
        body: {
          plan: "team",
          successUrl: "https://gideon.example.test/billing/success",
          cancelUrl: "https://gideon.example.test/billing/cancel"
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(201);
    expect(accepted.headers["Cache-Control"]).toBe("no-store");
    expect(accepted.body).toMatchObject({
      data: {
        checkoutSession: {
          id: "cs_test_1",
          workspaceId: "local-workspace",
          provider: "stripe",
          plan: "team",
          url: "https://checkout.stripe.test/session/cs_test_1",
          expiresAt: "2026-06-25T12:30:00.000Z"
        }
      },
      meta: { requestId: "req_checkout" }
    });
    expect(createdSessions).toEqual([
      {
        workspaceId: "local-workspace",
        userId: "local-user",
        plan: "team",
        priceId: "price_team",
        successUrl: "https://gideon.example.test/billing/success",
        cancelUrl: "https://gideon.example.test/billing/cancel"
      }
    ]);
  });

  it("creates hosted billing customer portal sessions for existing billing customers", async () => {
    const billingService: HostedBillingService = {
      async createCheckoutSession() {
        throw new Error("createCheckoutSession should not be called by portal");
      },
      async createCustomerPortalSession(input) {
        expect(input.workspace.id).toBe("local-workspace");
        expect(input.workspace.billingCustomerId).toBe("cus_1");
        expect(input.returnUrl).toBe("https://gideon.example.test/settings/billing");
        return {
          id: "bps_test_1",
          provider: "stripe",
          url: "https://billing.stripe.test/session/bps_test_1"
        };
      }
    };
    const api = testApi({ billingService });
    api.store.state.workspaces = api.store.state.workspaces.map((workspace) =>
      workspace.id === "local-workspace"
        ? { ...workspace, billingProvider: "stripe", billingCustomerId: "cus_1", billingStatus: "active" }
        : workspace
    );
    const created = createSignedSession({
      secret: "session-secret",
      userId: "local-user",
      authSubject: "local:local-user",
      workspaceId: "local-workspace",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });

    const accepted = await handleHostedApiRequest(
      {
        method: "POST",
        path: "/api/v1/workspaces/local-workspace/billing/portal-sessions",
        headers: {
          cookie: `gideon_session=${created.token}`,
          "x-csrf-token": "csrf-1",
          "x-request-id": "req_portal"
        },
        body: {
          returnUrl: "https://gideon.example.test/settings/billing"
        },
        nowMs: Date.parse("2026-06-25T12:01:00.000Z")
      },
      api
    );

    expect(accepted.status).toBe(201);
    expect(accepted.headers["Cache-Control"]).toBe("no-store");
    expect(accepted.body).toMatchObject({
      data: {
        portalSession: {
          id: "bps_test_1",
          workspaceId: "local-workspace",
          provider: "stripe",
          plan: "local_mvp",
          url: "https://billing.stripe.test/session/bps_test_1",
          expiresAt: null
        }
      },
      meta: { requestId: "req_portal" }
    });
  });
});

function testApi(
  input: {
    uploadService?: HostedRecordingUploadService;
    jobQueueService?: HostedJobQueueService;
    exportService?: HostedExportService;
    billingService?: HostedBillingService;
  } = {}
) {
  const store = new InMemoryHostedApiStore();
  return {
    store,
    config: {
      auth: {
        sessionCookieName: "gideon_session",
        sessionSecret: "session-secret",
        sessionDurationSeconds: 3600,
        secureCookies: true
      },
      billing: {
        provider: "stripe" as const,
        stripeWebhookSecret: "stripe-secret",
        stripeSecretKey: null,
        stripeApiBaseUrl: "https://api.stripe.com",
        stripePriceIds: {
          team: "price_team"
        }
      },
      jobQueue: {
        provider: "none" as const,
        httpEndpointUrl: null,
        signingSecret: null,
        redisUrl: null,
        bullMqQueueName: "gideon-hosted-worker-jobs",
        bullMqPrefix: null
      },
      internalAuthCallbackSecret: "internal-secret"
    },
    uploadService: input.uploadService,
    jobQueueService: input.jobQueueService,
    exportService: input.exportService,
    billingService: input.billingService
  };
}

class InMemoryHostedApiStore implements HostedApiStore {
  state: AppState = {
    ...createLocalUserWorkspace("2026-06-25T00:00:00.000Z"),
    usageEvents: [],
    auditEvents: [],
    projects: [],
    activeProjectId: null
  };
  appliedBillingUpdates: ApplyBillingSubscriptionInput[] = [];

  async load(): Promise<AppState> {
    return this.state;
  }

  async syncAuthenticatedUser(input: SyncAuthenticatedUserInput): Promise<AppState> {
    const user = {
      id: "user-founder-1",
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName ?? "Founder",
      authSubject: input.authSubject,
      identityProvider: input.identityProvider,
      lastSignedInAt: input.now ?? "2026-06-25T12:00:00.000Z",
      createdAt: input.now ?? "2026-06-25T12:00:00.000Z"
    };
    const workspace = {
      id: "workspace-founder-1",
      name: input.defaultWorkspaceName ?? "Founder workspace",
      slug: "founder-workspace",
      plan: "local_mvp" as const,
      billingStatus: "not_configured" as const,
      billingProvider: "manual" as const,
      entitlements: this.state.workspaces[0]!.entitlements,
      createdAt: "2026-06-25T12:00:00.000Z",
      updatedAt: "2026-06-25T12:00:00.000Z"
    };
    this.state = {
      ...this.state,
      users: [...this.state.users.filter((candidate) => candidate.authSubject !== input.authSubject), user],
      workspaces: [...this.state.workspaces.filter((candidate) => candidate.id !== workspace.id), workspace],
      workspaceMembers: [
        ...this.state.workspaceMembers.filter((candidate) => candidate.userId !== user.id),
        {
          id: "member-founder-1",
          workspaceId: workspace.id,
          userId: user.id,
          role: "owner" as const,
          createdAt: "2026-06-25T12:00:00.000Z"
        }
      ],
      activeUserId: user.id,
      activeWorkspaceId: workspace.id
    };
    return this.state;
  }

  async applyBillingSubscriptionUpdate(input: ApplyBillingSubscriptionInput): Promise<AppState> {
    this.appliedBillingUpdates.push(input);
    return this.state;
  }

  async getWorkspaceForBillingSession(input: { userId: string; workspaceId: string }): Promise<Workspace> {
    const membership = this.state.workspaceMembers.find(
      (candidate) => candidate.userId === input.userId && candidate.workspaceId === input.workspaceId
    );
    if (!membership) {
      throw new Error("The active user is not a member of this workspace.");
    }
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error(`Workspace role ${membership.role} cannot perform billing:manage.`);
    }
    const workspace = this.state.workspaces.find((candidate) => candidate.id === input.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found.");
    }
    return workspace;
  }

  async listProjectsForSession(input: { userId: string; workspaceId: string }): Promise<Project[]> {
    this.assertMember(input);
    return this.state.projects.filter((project) => project.workspaceId === input.workspaceId);
  }

  async getProjectForSession(input: { userId: string; workspaceId: string; projectId: string }): Promise<Project> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    return project;
  }

  async createProjectForSession(input: CreateProjectInput & { userId: string; workspaceId: string }): Promise<Project> {
    this.assertMember(input);
    const project = projectFixture({
      id: `project-${this.state.projects.length + 1}`,
      workspaceId: input.workspaceId,
      name: input.name,
      profile: input.profile
    });
    this.state.projects = [project, ...this.state.projects];
    return project;
  }

  async updateProfileForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    profile: ProductProfile;
  }): Promise<Project> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    project.profile = input.profile;
    project.name = project.name.trim() || input.profile.productName;
    project.updatedAt = "2026-06-25T12:01:00.000Z";
    return project;
  }

  async getJobForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    this.assertMember(input);
    return this.findJob(input);
  }

  async requestJobCancelForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    this.assertMember(input);
    const { project, job } = this.findJob(input);
    const nextJob = requestJobCancelState(job, "2026-06-25T12:01:00.000Z");
    project.jobs = project.jobs.map((candidate) => (candidate.id === input.jobId ? nextJob : candidate));
    return { project, job: nextJob };
  }

  async retryJobForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    this.assertMember(input);
    const { project, job } = this.findJob(input);
    const nextJob = retryJobState(job, "2026-06-25T12:02:00.000Z");
    project.jobs = project.jobs.map((candidate) => (candidate.id === input.jobId ? nextJob : candidate));
    return { project, job: nextJob };
  }

  async createRecordingUploadSessionRecordForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    session: Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt">;
  }): Promise<Project> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    project.uploadSessions = [
      ...project.uploadSessions.filter((candidate) => candidate.id !== input.session.id),
      {
        ...input.session,
        createdAt: "2026-06-25T12:01:00.000Z",
        updatedAt: "2026-06-25T12:01:00.000Z"
      }
    ];
    project.updatedAt = "2026-06-25T12:01:00.000Z";
    return project;
  }

  async getRecordingUploadSessionForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
  }): Promise<RecordingUploadSessionRecord> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    const session = project?.uploadSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session) {
      throw new Error("Recording upload session not found.");
    }
    return session;
  }

  async completeRecordingUploadForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
    artifact: ArtifactRecord;
    recording: RecordingMetadata;
  }): Promise<Project> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const session = project.uploadSessions.find((candidate) => candidate.id === input.sessionId);
    if (!session) {
      throw new Error("Recording upload session not found.");
    }
    if (session.status !== "pending") {
      throw new Error(`Recording upload session is already ${session.status}.`);
    }
    project.uploadSessions = project.uploadSessions.map((candidate) =>
      candidate.id === input.sessionId ? { ...candidate, status: "completed", updatedAt: "2026-06-25T12:02:00.000Z" } : candidate
    );
    project.artifacts = [input.artifact];
    project.recording = input.recording;
    project.status = "recording_ready";
    project.updatedAt = "2026-06-25T12:02:00.000Z";
    return project;
  }

  async createAnalysisJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!project.recording) {
      throw new Error("Choose a recording before analysis.");
    }
    const activeJob = project.jobs.find(
      (candidate) => candidate.kind === "analysis" && ["queued", "running", "canceling"].includes(candidate.status)
    );
    if (activeJob) {
      return { project, job: activeJob, reused: true };
    }
    const job = jobFixture({
      id: `job-${project.jobs.length + 1}`,
      projectId: project.id,
      kind: "analysis",
      userMessage: "Waiting to analyze recording."
    });
    project.jobs = [...project.jobs, job];
    project.updatedAt = "2026-06-25T12:03:00.000Z";
    return { project, job, reused: false };
  }

  async createRenderJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!project.recording) {
      throw new Error("Choose a recording before rendering.");
    }
    if (project.scripts.length === 0) {
      throw new Error("Generate scripts before rendering.");
    }
    const activeJob = project.jobs.find(
      (candidate) => candidate.kind === "render" && ["queued", "running", "canceling"].includes(candidate.status)
    );
    if (activeJob) {
      return { project, job: activeJob, reused: true };
    }
    const job = jobFixture({
      id: `job-${project.jobs.length + 1}`,
      projectId: project.id,
      kind: "render",
      userMessage: "Waiting to render selected drafts."
    });
    project.jobs = [...project.jobs, job];
    project.updatedAt = "2026-06-25T12:03:00.000Z";
    return { project, job, reused: false };
  }

  async createExportForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    renderId: string;
    artifact: ArtifactRecord;
  }): Promise<Project> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const render = project.renders.find((candidate) => candidate.id === input.renderId && candidate.status === "completed");
    if (!render) {
      throw new Error("Completed render not found.");
    }
    if (
      input.artifact.workspaceId !== input.workspaceId ||
      input.artifact.projectId !== input.projectId ||
      input.artifact.kind !== "export"
    ) {
      throw new Error("Export artifact metadata does not match the project.");
    }
    project.artifacts = [...project.artifacts.filter((candidate) => candidate.id !== input.artifact.id), input.artifact];
    project.updatedAt = "2026-06-25T12:04:00.000Z";
    return project;
  }

  async getExportArtifactForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    exportId: string;
  }): Promise<ArtifactRecord> {
    this.assertMember(input);
    const project = this.state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const artifact = project.artifacts.find((candidate) => candidate.id === input.exportId && candidate.kind === "export");
    if (!artifact) {
      throw new Error("Export artifact not found.");
    }
    return artifact;
  }

  private assertMember(input: { userId: string; workspaceId: string }): void {
    const membership = this.state.workspaceMembers.find(
      (candidate) => candidate.userId === input.userId && candidate.workspaceId === input.workspaceId
    );
    if (!membership) {
      throw new Error("The active user is not a member of this workspace.");
    }
  }

  private findJob(input: { workspaceId: string; jobId: string }): { project: Project; job: JobRecord } {
    for (const project of this.state.projects) {
      if (project.workspaceId !== input.workspaceId) {
        continue;
      }
      const job = project.jobs.find((candidate) => candidate.id === input.jobId);
      if (job) {
        return { project, job };
      }
    }
    throw new Error("Job not found.");
  }
}

function profileFixture(overrides: Partial<ProductProfile> = {}): Project["profile"] {
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

function projectFixture(input: {
  id: string;
  workspaceId: string;
  name: string;
  profile?: Project["profile"];
  uploadSessions?: RecordingUploadSessionRecord[];
  artifacts?: ArtifactRecord[];
  recording?: RecordingMetadata;
  scripts?: ScriptDraft[];
  renders?: RenderedVideo[];
  jobs?: JobRecord[];
}): Project {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    status: input.recording ? "recording_ready" : "draft",
    profile: input.profile ?? profileFixture(),
    recording: input.recording,
    moments: [],
    frameEvidence: [],
    concepts: [],
    scripts: input.scripts ?? [],
    renders: input.renders ?? [],
    artifacts: input.artifacts ?? [],
    uploadSessions: input.uploadSessions ?? [],
    providerRuns: [],
    jobs: input.jobs ?? [],
    jobEvents: [],
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z"
  };
}

function renderFixture(overrides: Partial<RenderedVideo> & { id: string; projectId: string }): RenderedVideo {
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

function jobFixture(input: Partial<JobRecord> & { id: string; projectId: string }): JobRecord {
  return {
    id: input.id,
    projectId: input.projectId,
    kind: "analysis",
    status: "queued",
    attempt: 0,
    maxAttempts: 3,
    progress: {
      current: 0,
      total: 1,
      unit: "step"
    },
    userMessage: "Waiting to start.",
    cancelable: true,
    retryable: false,
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...input
  };
}

function uploadSessionFixture(overrides: Partial<RecordingUploadSessionRecord> = {}): RecordingUploadSessionRecord {
  return {
    id: "upload-1",
    workspaceId: "local-workspace",
    projectId: "project-1",
    artifactId: "upload-1",
    provider: "r2",
    storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
    status: "pending",
    method: "PUT",
    contentType: "video/quicktime",
    byteSize: 2048,
    originalFileName: "walkthrough.mov",
    expiresAt: "2026-06-25T12:15:00.000Z",
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function artifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "upload-1",
    workspaceId: "local-workspace",
    projectId: "project-1",
    kind: "source_recording",
    provider: "r2",
    storageKey: "workspaces/local-workspace/projects/project-1/source_recording/upload-1-walkthrough.mov",
    contentType: "video/quicktime",
    byteSize: 2048,
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
    workspaceId: "local-workspace",
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
    sizeBytes: 2048,
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
