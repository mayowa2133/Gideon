import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSignedSession } from "./auth";
import { handleHostedApiRequest, type HostedApiStore } from "./hostedApi";
import type { AppState, ApplyBillingSubscriptionInput, SyncAuthenticatedUserInput } from "../shared/types";
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
}
