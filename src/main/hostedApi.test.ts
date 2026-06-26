import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSignedSession } from "./auth";
import { handleHostedApiRequest, type HostedApiStore } from "./hostedApi";
import { requestJobCancel as requestJobCancelState, retryJob as retryJobState } from "../shared/jobState";
import type {
  AppState,
  ApplyBillingSubscriptionInput,
  CreateProjectInput,
  JobRecord,
  ProductProfile,
  Project,
  SyncAuthenticatedUserInput
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
});

function testApi() {
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
        stripePriceIds: {
          team: "price_team"
        }
      },
      internalAuthCallbackSecret: "internal-secret"
    }
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
  jobs?: JobRecord[];
}): Project {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.name,
    status: "draft",
    profile: input.profile ?? profileFixture(),
    moments: [],
    frameEvidence: [],
    concepts: [],
    scripts: [],
    renders: [],
    artifacts: [],
    uploadSessions: [],
    providerRuns: [],
    jobs: input.jobs ?? [],
    jobEvents: [],
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z"
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
