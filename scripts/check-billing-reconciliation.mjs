#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const options = parseArgs(args);
const dryRun = options.flags.has("dry-run");
const live = options.flags.has("live") || process.env.GIDEON_BILLING_RECONCILIATION_LIVE === "true";
const fixturePath = options.values["fixture-path"] ? path.resolve(options.values["fixture-path"]) : null;
const errors = [];

const priceEnv = {
  starter: "GIDEON_STRIPE_STARTER_PRICE_ID",
  team: "GIDEON_STRIPE_TEAM_PRICE_ID",
  enterprise: "GIDEON_STRIPE_ENTERPRISE_PRICE_ID"
};
const supportedStatuses = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"]);
const sensitivePatterns = [
  /gideon_session=/i,
  /sk-live-[A-Za-z0-9_-]{12,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /x-amz-signature=/i,
  /x-goog-signature=/i,
  /signedUrl/i,
  /uploadUrl/i,
  /downloadUrl/i
];

if (dryRun) {
  console.log("Billing reconciliation check dry-run:");
  console.log("1. Require GIDEON_BILLING_PROVIDER=stripe and Stripe webhook/price mapping configuration.");
  console.log("2. Validate starter, team, and enterprise Stripe price IDs are present and unique.");
  console.log("3. Load sanitized subscriptions from --fixture-path or fetch Stripe subscriptions only when --live is set.");
  console.log("4. Require each subscription to carry Gideon workspace metadata and a mapped price ID.");
  console.log("5. Detect duplicate active subscriptions per workspace and secret-like material in fixture data.");
  process.exit(0);
}

validateConfig();

const subscriptions = live ? await fetchLiveSubscriptions() : readFixtureSubscriptions();
validateSubscriptions(subscriptions);

if (errors.length > 0) {
  console.error("Billing reconciliation check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `Billing reconciliation check passed for ${subscriptions.length} subscription${subscriptions.length === 1 ? "" : "s"} using ${
    live ? "live Stripe data" : path.relative(process.cwd(), fixturePath)
  }.`
);

function parseArgs(inputArgs) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = inputArgs[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }
    values[key] = next;
    index += 1;
  }
  return { flags, values };
}

function validateConfig() {
  if (value("GIDEON_BILLING_PROVIDER") !== "stripe") {
    errors.push("Set GIDEON_BILLING_PROVIDER=stripe before running billing reconciliation checks.");
  }
  if (!value("STRIPE_WEBHOOK_SECRET") && !value("GIDEON_STRIPE_WEBHOOK_SECRET")) {
    errors.push("Set STRIPE_WEBHOOK_SECRET or GIDEON_STRIPE_WEBHOOK_SECRET so webhook-derived billing state can be trusted.");
  }
  const priceIds = configuredPriceIds();
  for (const plan of Object.keys(priceEnv)) {
    if (!priceIds[plan]) {
      errors.push(`Set ${priceEnv[plan]} so Stripe subscriptions can be mapped to Gideon ${plan} workspaces.`);
    }
  }
  const duplicates = duplicateValues(Object.values(priceIds).filter(Boolean));
  for (const duplicate of duplicates) {
    errors.push(`Stripe price ID ${duplicate} is assigned to multiple Gideon plans.`);
  }
  if (live && !stripeSecretKey()) {
    errors.push("Set STRIPE_SECRET_KEY or GIDEON_STRIPE_SECRET_KEY before live billing reconciliation.");
  }
  if (!live && !fixturePath) {
    errors.push("Provide --fixture-path for offline billing reconciliation or pass --live explicitly.");
  }
}

function readFixtureSubscriptions() {
  if (errors.length > 0) {
    return [];
  }
  let fixture;
  try {
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  } catch (error) {
    errors.push(`Could not read billing reconciliation fixture ${path.relative(process.cwd(), fixturePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    return [];
  }
  validateSafeFixture(fixture);
  const subscriptions = Array.isArray(fixture) ? fixture : fixture?.subscriptions;
  if (!Array.isArray(subscriptions)) {
    errors.push("Billing reconciliation fixture must be an array or an object with a subscriptions array.");
    return [];
  }
  return subscriptions;
}

async function fetchLiveSubscriptions() {
  if (errors.length > 0) {
    return [];
  }
  const apiBaseUrl = normalizeStripeApiBaseUrl(value("GIDEON_STRIPE_API_BASE_URL"));
  const limit = Math.min(Math.max(Number(options.values.limit ?? "100"), 1), 100);
  const response = await fetch(`${apiBaseUrl}/v1/subscriptions?status=all&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`
    }
  });
  if (!response.ok) {
    const message = await safeStripeError(response);
    errors.push(`Stripe subscription list request failed with ${response.status}: ${message}`);
    return [];
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    errors.push("Stripe subscription list response must include a data array.");
    return [];
  }
  return payload.data;
}

function validateSubscriptions(subscriptions) {
  const activeWorkspaceSubscriptions = new Map();
  const priceIds = configuredPriceIds();
  for (const [index, subscription] of subscriptions.entries()) {
    const label = `subscription ${index + 1}`;
    if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    const id = stringValue(subscription.id);
    const customer = stringValue(subscription.customer);
    const status = stringValue(subscription.status);
    const workspaceId = subscriptionWorkspaceId(subscription);
    const priceId = subscriptionPriceId(subscription);
    if (!id) {
      errors.push(`${label} is missing id.`);
    }
    if (!customer) {
      errors.push(`${label} is missing customer.`);
    }
    if (!supportedStatuses.has(status)) {
      errors.push(`${label} has unsupported status ${status || "missing"}.`);
    }
    if (!workspaceId) {
      errors.push(`${label} metadata must include gideonWorkspaceId or workspaceId.`);
    }
    if (!priceId) {
      errors.push(`${label} is missing a subscription price ID.`);
    } else if (!Object.values(priceIds).includes(priceId)) {
      errors.push(`${label} price ${priceId} is not mapped to any configured Gideon plan.`);
    }
    if (status !== "canceled" && !Number.isFinite(Number(subscription.current_period_end))) {
      errors.push(`${label} must include current_period_end for non-canceled subscriptions.`);
    }
    if (workspaceId && ["trialing", "active", "past_due"].includes(status)) {
      const existing = activeWorkspaceSubscriptions.get(workspaceId);
      if (existing) {
        errors.push(`Workspace ${workspaceId} has multiple non-terminal Stripe subscriptions: ${existing} and ${id || label}.`);
      } else {
        activeWorkspaceSubscriptions.set(workspaceId, id || label);
      }
    }
  }
}

function validateSafeFixture(fixture) {
  const serialized = JSON.stringify(fixture);
  for (const pattern of sensitivePatterns) {
    if (pattern.test(serialized)) {
      errors.push(`Billing reconciliation fixture contains sensitive material matching ${pattern}.`);
    }
  }
}

function configuredPriceIds() {
  return Object.fromEntries(Object.entries(priceEnv).map(([plan, envName]) => [plan, value(envName)]));
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of values) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }
  return [...duplicates];
}

function subscriptionWorkspaceId(subscription) {
  const metadata = objectValue(subscription.metadata);
  return stringValue(metadata.gideonWorkspaceId) || stringValue(metadata.workspaceId);
}

function subscriptionPriceId(subscription) {
  const items = objectValue(subscription.items);
  const data = Array.isArray(items.data) ? items.data : [];
  for (const item of data) {
    const price = objectValue(objectValue(item).price);
    const id = stringValue(price.id);
    if (id) {
      return id;
    }
  }
  return null;
}

function stringValue(input) {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function objectValue(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function stripeSecretKey() {
  return value("STRIPE_SECRET_KEY") || value("GIDEON_STRIPE_SECRET_KEY");
}

function normalizeStripeApiBaseUrl(raw) {
  const fallback = "https://api.stripe.com";
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

async function safeStripeError(response) {
  try {
    const payload = await response.json();
    const message = stringValue(objectValue(objectValue(payload).error).message);
    if (message) {
      return message.replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]");
    }
  } catch {
    // Fall through to text.
  }
  try {
    const raw = await response.text();
    return raw.replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
  } catch {
    return "unknown error";
  }
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
