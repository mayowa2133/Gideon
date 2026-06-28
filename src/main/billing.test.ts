import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  billingStatusFromStripe,
  createStripeBillingService,
  loadBillingConfig,
  normalizeStripeSubscriptionEvent,
  planForStripePriceId,
  verifyStripeWebhookSignature
} from "./billing";
import type { Workspace } from "../shared/types";

describe("billing provider integration", () => {
  it("loads Stripe billing configuration and price mappings", () => {
    const config = loadBillingConfig({
      GIDEON_BILLING_PROVIDER: "stripe",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_SECRET_KEY: "sk_test",
      GIDEON_STRIPE_API_BASE_URL: "https://stripe.test/",
      GIDEON_STRIPE_STARTER_PRICE_ID: "price_starter",
      GIDEON_STRIPE_TEAM_PRICE_ID: "price_team"
    });

    expect(config.provider).toBe("stripe");
    expect(config.stripeWebhookSecret).toBe("whsec_test");
    expect(config.stripeSecretKey).toBe("sk_test");
    expect(config.stripeApiBaseUrl).toBe("https://stripe.test");
    expect(planForStripePriceId("price_team", config)).toBe("team");
    expect(planForStripePriceId("missing", config)).toBeNull();
  });

  it("verifies Stripe-style webhook signatures with timestamp tolerance", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
    const timestamp = 1_777_000_000;
    const secret = "whsec_test";
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

    expect(
      verifyStripeWebhookSignature({
        payload,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        webhookSecret: secret,
        nowMs: timestamp * 1000
      })
    ).toBe(true);

    expect(() =>
      verifyStripeWebhookSignature({
        payload,
        signatureHeader: `t=${timestamp},v1=bad`,
        webhookSecret: secret,
        nowMs: timestamp * 1000
      })
    ).toThrow("verification failed");

    expect(() =>
      verifyStripeWebhookSignature({
        payload,
        signatureHeader: `t=${timestamp},v1=${signature}`,
        webhookSecret: secret,
        nowMs: (timestamp + 301) * 1000
      })
    ).toThrow("outside the allowed tolerance");
  });

  it("normalizes Stripe subscription events into workspace billing updates", () => {
    const update = normalizeStripeSubscriptionEvent(
      {
        id: "evt_1",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            cancel_at_period_end: false,
            current_period_end: 1_777_000_000,
            metadata: { gideonWorkspaceId: "workspace-1" },
            items: {
              data: [{ price: { id: "price_team" } }]
            }
          }
        }
      },
      {
        stripePriceIds: {
          team: "price_team"
        }
      }
    );

    expect(update).toMatchObject({
      workspaceId: "workspace-1",
      provider: "stripe",
      providerEventId: "evt_1",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      plan: "team",
      billingStatus: "active",
      currentPeriodEnd: "2026-04-24T03:06:40.000Z",
      cancelAtPeriodEnd: false
    });
  });

  it("ignores unsupported Stripe event types and maps non-active statuses safely", () => {
    expect(normalizeStripeSubscriptionEvent({ id: "evt_1", type: "invoice.paid" }, { stripePriceIds: {} })).toBeNull();
    expect(billingStatusFromStripe("trialing")).toBe("trialing");
    expect(billingStatusFromStripe("unpaid")).toBe("past_due");
    expect(billingStatusFromStripe("canceled")).toBe("canceled");
    expect(billingStatusFromStripe("paused")).toBe("not_configured");
  });

  it("creates Stripe checkout sessions with workspace metadata and configured price", async () => {
    const requests: Array<{ url: string; auth: string | undefined; body: URLSearchParams }> = [];
    const service = createStripeBillingService(
      {
        provider: "stripe",
        stripeSecretKey: "sk_test",
        stripeApiBaseUrl: "https://stripe.test"
      },
      async (url, init) => {
        requests.push({ url, auth: init.headers.Authorization, body: init.body });
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: "cs_test_1",
              url: "https://checkout.stripe.test/cs_test_1",
              expires_at: 1_777_000_000
            };
          },
          async text() {
            return "";
          }
        };
      }
    );

    const session = await service.createCheckoutSession({
      userId: "user-1",
      workspace: workspaceFixture({ billingCustomerId: "cus_existing" }),
      plan: "team",
      priceId: "price_team",
      successUrl: "https://gideon.example.test/success",
      cancelUrl: "https://gideon.example.test/cancel"
    });

    expect(session).toEqual({
      id: "cs_test_1",
      provider: "stripe",
      url: "https://checkout.stripe.test/cs_test_1",
      expiresAt: "2026-04-24T03:06:40.000Z"
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://stripe.test/v1/checkout/sessions");
    expect(requests[0]?.auth).toBe("Bearer sk_test");
    expect(Object.fromEntries(requests[0]!.body.entries())).toMatchObject({
      mode: "subscription",
      customer: "cus_existing",
      client_reference_id: "workspace-1",
      success_url: "https://gideon.example.test/success",
      cancel_url: "https://gideon.example.test/cancel",
      allow_promotion_codes: "true",
      "line_items[0][price]": "price_team",
      "line_items[0][quantity]": "1",
      "metadata[gideonWorkspaceId]": "workspace-1",
      "metadata[gideonUserId]": "user-1",
      "metadata[gideonPlan]": "team",
      "subscription_data[metadata][gideonWorkspaceId]": "workspace-1",
      "subscription_data[metadata][workspaceId]": "workspace-1",
      "subscription_data[metadata][gideonPlan]": "team"
    });
  });

  it("creates Stripe customer portal sessions for existing customers", async () => {
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    const service = createStripeBillingService(
      {
        provider: "stripe",
        stripeSecretKey: "sk_test",
        stripeApiBaseUrl: "https://stripe.test"
      },
      async (url, init) => {
        requests.push({ url, body: init.body });
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              id: "bps_test_1",
              url: "https://billing.stripe.test/bps_test_1"
            };
          },
          async text() {
            return "";
          }
        };
      }
    );

    const session = await service.createCustomerPortalSession({
      userId: "user-1",
      workspace: workspaceFixture({ billingCustomerId: "cus_existing" }),
      returnUrl: "https://gideon.example.test/settings/billing"
    });

    expect(session).toEqual({
      id: "bps_test_1",
      provider: "stripe",
      url: "https://billing.stripe.test/bps_test_1"
    });
    expect(requests[0]?.url).toBe("https://stripe.test/v1/billing_portal/sessions");
    expect(Object.fromEntries(requests[0]!.body.entries())).toEqual({
      customer: "cus_existing",
      return_url: "https://gideon.example.test/settings/billing"
    });
  });

  it("maps Stripe billing service failures without leaking secrets", async () => {
    const service = createStripeBillingService(
      {
        provider: "stripe",
        stripeSecretKey: "sk_test_secret",
        stripeApiBaseUrl: "https://stripe.test"
      },
      async () => ({
        ok: false,
        status: 400,
        async json() {
          return { error: { message: "No such price: price_missing" } };
        },
        async text() {
          return "sk_test_secret should not be used";
        }
      })
    );

    await expect(
      service.createCheckoutSession({
        userId: "user-1",
        workspace: workspaceFixture(),
        plan: "team",
        priceId: "price_missing",
        successUrl: "https://gideon.example.test/success",
        cancelUrl: "https://gideon.example.test/cancel"
      })
    ).rejects.toThrow("No such price");
    await expect(
      service.createCheckoutSession({
        userId: "user-1",
        workspace: workspaceFixture(),
        plan: "team",
        priceId: "price_missing",
        successUrl: "https://gideon.example.test/success",
        cancelUrl: "https://gideon.example.test/cancel"
      })
    ).rejects.not.toThrow("sk_test_secret");
  });
});

function workspaceFixture(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "Workspace",
    slug: "workspace",
    plan: "local_mvp",
    billingStatus: "not_configured",
    billingProvider: "manual",
    entitlements: {
      sourceMinutesMonthly: 120,
      transcriptionMinutesMonthly: 120,
      aiRunsMonthly: 500,
      ttsCharactersMonthly: 200_000,
      renderMinutesMonthly: 120,
      storageBytes: 10_000_000_000,
      exportsMonthly: 100,
      projects: 25
    },
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    ...overrides
  };
}
