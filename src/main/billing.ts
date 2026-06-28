import { createHmac, timingSafeEqual } from "node:crypto";
import type { HostedBillingService, HostedBillingSession } from "./hostedApi";
import type { ApplyBillingSubscriptionInput, BillingStatus, WorkspacePlan } from "../shared/types";

export interface BillingConfig {
  provider: "none" | "stripe";
  stripeWebhookSecret: string | null;
  stripeSecretKey: string | null;
  stripeApiBaseUrl: string;
  stripePriceIds: Partial<Record<Exclude<WorkspacePlan, "local_mvp">, string>>;
}

type StripeFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: URLSearchParams;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

const SUPPORTED_SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

export function loadBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  return {
    provider: normalizeBillingProvider(env.GIDEON_BILLING_PROVIDER),
    stripeWebhookSecret: nonEmpty(env.STRIPE_WEBHOOK_SECRET ?? env.GIDEON_STRIPE_WEBHOOK_SECRET),
    stripeSecretKey: nonEmpty(env.STRIPE_SECRET_KEY ?? env.GIDEON_STRIPE_SECRET_KEY),
    stripeApiBaseUrl: normalizeStripeApiBaseUrl(env.GIDEON_STRIPE_API_BASE_URL),
    stripePriceIds: {
      starter: nonEmpty(env.GIDEON_STRIPE_STARTER_PRICE_ID) ?? undefined,
      team: nonEmpty(env.GIDEON_STRIPE_TEAM_PRICE_ID) ?? undefined,
      enterprise: nonEmpty(env.GIDEON_STRIPE_ENTERPRISE_PRICE_ID) ?? undefined
    }
  };
}

export function createStripeBillingService(
  config: Pick<BillingConfig, "provider" | "stripeSecretKey" | "stripeApiBaseUrl">,
  fetcher: StripeFetch = fetch
): HostedBillingService {
  if (config.provider !== "stripe") {
    throw new Error("Stripe billing service requires GIDEON_BILLING_PROVIDER=stripe.");
  }
  if (!config.stripeSecretKey) {
    throw new Error("Stripe secret key is not configured.");
  }
  const apiBaseUrl = config.stripeApiBaseUrl.replace(/\/+$/, "");
  const secretKey = config.stripeSecretKey;
  return {
    async createCheckoutSession(input) {
      const params = new URLSearchParams({
        mode: "subscription",
        client_reference_id: input.workspace.id,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: "true",
        "line_items[0][price]": input.priceId,
        "line_items[0][quantity]": "1",
        "metadata[gideonWorkspaceId]": input.workspace.id,
        "metadata[gideonUserId]": input.userId,
        "metadata[gideonPlan]": input.plan,
        "subscription_data[metadata][gideonWorkspaceId]": input.workspace.id,
        "subscription_data[metadata][workspaceId]": input.workspace.id,
        "subscription_data[metadata][gideonPlan]": input.plan
      });
      if (input.workspace.billingCustomerId) {
        params.set("customer", input.workspace.billingCustomerId);
      }
      return stripeSessionFromResponse(
        await stripePost({
          url: `${apiBaseUrl}/v1/checkout/sessions`,
          secretKey,
          params,
          fetcher
        })
      );
    },
    async createCustomerPortalSession(input) {
      if (!input.workspace.billingCustomerId) {
        throw new Error("Workspace does not have a Stripe billing customer.");
      }
      return stripeSessionFromResponse(
        await stripePost({
          url: `${apiBaseUrl}/v1/billing_portal/sessions`,
          secretKey,
          params: new URLSearchParams({
            customer: input.workspace.billingCustomerId,
            return_url: input.returnUrl
          }),
          fetcher
        })
      );
    }
  };
}

export function verifyStripeWebhookSignature(input: {
  payload: string | Buffer;
  signatureHeader: string;
  webhookSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const timestamp = stripeSignaturePart(input.signatureHeader, "t");
  const signatures = stripeSignatureParts(input.signatureHeader, "v1");
  if (!timestamp || signatures.length === 0) {
    throw new Error("Stripe webhook signature header is missing timestamp or v1 signature.");
  }
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Stripe webhook signature timestamp is invalid.");
  }
  const nowMs = input.nowMs ?? Date.now();
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampNumber) > toleranceSeconds) {
    throw new Error("Stripe webhook signature timestamp is outside the allowed tolerance.");
  }
  const payload = Buffer.isBuffer(input.payload) ? input.payload.toString("utf8") : input.payload;
  const expected = createHmac("sha256", input.webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
  });
  if (!valid) {
    throw new Error("Stripe webhook signature verification failed.");
  }
  return true;
}

export function normalizeStripeSubscriptionEvent(
  event: unknown,
  config: Pick<BillingConfig, "stripePriceIds">
): ApplyBillingSubscriptionInput | null {
  if (!isObject(event)) {
    throw new Error("Stripe event payload must be an object.");
  }
  const type = stringValue(event.type);
  if (!SUPPORTED_SUBSCRIPTION_EVENTS.has(type)) {
    return null;
  }
  const subscription = objectValue(objectValue(event.data).object);
  const eventId = requiredString(event.id, "Stripe event id");
  const subscriptionId = requiredString(subscription.id, "Stripe subscription id");
  const customerId = requiredString(subscription.customer, "Stripe customer id");
  const workspaceId = subscriptionWorkspaceId(subscription);
  if (!workspaceId) {
    throw new Error("Stripe subscription metadata must include gideonWorkspaceId or workspaceId.");
  }
  const priceId = subscriptionPriceId(subscription);
  if (!priceId) {
    throw new Error("Stripe subscription event is missing a price id.");
  }
  const plan = planForStripePriceId(priceId, config);
  if (!plan) {
    throw new Error(`Stripe price ${priceId} is not mapped to a Gideon workspace plan.`);
  }
  return {
    workspaceId,
    provider: "stripe",
    providerEventId: eventId,
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    plan,
    billingStatus: billingStatusFromStripe(requiredString(subscription.status, "Stripe subscription status")),
    currentPeriodEnd: unixSecondsToIso(numberValue(subscription.current_period_end)),
    cancelAtPeriodEnd: booleanValue(subscription.cancel_at_period_end)
  };
}

export function planForStripePriceId(
  priceId: string,
  config: Pick<BillingConfig, "stripePriceIds">
): Exclude<WorkspacePlan, "local_mvp"> | null {
  for (const [plan, configuredPriceId] of Object.entries(config.stripePriceIds)) {
    if (configuredPriceId === priceId) {
      return plan as Exclude<WorkspacePlan, "local_mvp">;
    }
  }
  return null;
}

export function billingStatusFromStripe(status: string): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "not_configured";
  }
}

function normalizeBillingProvider(value: string | undefined): BillingConfig["provider"] {
  return value?.trim().toLowerCase() === "stripe" ? "stripe" : "none";
}

function normalizeStripeApiBaseUrl(value: string | undefined): string {
  const normalized = nonEmpty(value) ?? "https://api.stripe.com";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "https://api.stripe.com";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "https://api.stripe.com";
  }
}

async function stripePost(input: {
  url: string;
  secretKey: string;
  params: URLSearchParams;
  fetcher: StripeFetch;
}): Promise<unknown> {
  const response = await input.fetcher(input.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: input.params
  });
  if (response.ok) {
    return response.json();
  }
  const message = await stripeErrorMessage(response);
  throw new Error(`Stripe billing request failed with ${response.status}: ${message}`);
}

async function stripeErrorMessage(response: { json(): Promise<unknown>; text(): Promise<string> }): Promise<string> {
  try {
    const payload = await response.json();
    const message = stringValue(objectValue(objectValue(payload).error).message);
    if (message) {
      return message;
    }
  } catch {
    // Fall through to text body.
  }
  try {
    const raw = await response.text();
    return raw.slice(0, 300) || "Stripe request failed.";
  } catch {
    return "Stripe request failed.";
  }
}

function stripeSessionFromResponse(payload: unknown): HostedBillingSession {
  const body = objectValue(payload);
  const id = requiredString(body.id, "Stripe session id");
  const url = requiredString(body.url, "Stripe session url");
  const expiresAt = unixSecondsToIso(numberValue(body.expires_at));
  return {
    id,
    provider: "stripe",
    url,
    ...(expiresAt ? { expiresAt } : {})
  };
}

function stripeSignatureParts(header: string, key: string): string[] {
  return header
    .split(",")
    .flatMap((part) => {
      const [candidateKey, value] = part.trim().split("=");
      return candidateKey === key && value ? [value] : [];
    });
}

function stripeSignaturePart(header: string, key: string): string | null {
  return stripeSignatureParts(header, key)[0] ?? null;
}

function subscriptionWorkspaceId(subscription: Record<string, unknown>): string | null {
  const metadata = objectValue(subscription.metadata);
  return stringValue(metadata.gideonWorkspaceId) || stringValue(metadata.workspaceId) || null;
}

function subscriptionPriceId(subscription: Record<string, unknown>): string | null {
  const items = objectValue(subscription.items);
  const data = Array.isArray(items.data) ? items.data : [];
  for (const item of data) {
    const priceId = stringValue(objectValue(objectValue(item).price).id);
    if (priceId) {
      return priceId;
    }
  }
  return stringValue(objectValue(subscription.plan).id) || null;
}

function unixSecondsToIso(value: number | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  return new Date(value * 1000).toISOString();
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requiredString(value: unknown, label: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
