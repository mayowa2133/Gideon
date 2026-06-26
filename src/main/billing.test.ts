import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  billingStatusFromStripe,
  loadBillingConfig,
  normalizeStripeSubscriptionEvent,
  planForStripePriceId,
  verifyStripeWebhookSignature
} from "./billing";

describe("billing provider integration", () => {
  it("loads Stripe billing configuration and price mappings", () => {
    const config = loadBillingConfig({
      GIDEON_BILLING_PROVIDER: "stripe",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      GIDEON_STRIPE_STARTER_PRICE_ID: "price_starter",
      GIDEON_STRIPE_TEAM_PRICE_ID: "price_team"
    });

    expect(config.provider).toBe("stripe");
    expect(config.stripeWebhookSecret).toBe("whsec_test");
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
});
