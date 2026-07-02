#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const verifyBucketLifecycle = args.has("--verify-bucket-lifecycle") || value("GIDEON_STORAGE_VERIFY_BUCKET_LIFECYCLE") === "true";
const errors = [];

const requiredEnv = [
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_STORAGE_TEMP_RETENTION_DAYS",
  "GIDEON_STORAGE_FAILED_RETENTION_DAYS",
  "GIDEON_STORAGE_SOURCE_RETENTION_DAYS",
  "GIDEON_VOICEOVER_RETENTION_DAYS",
  "GIDEON_STORAGE_EXPORT_RETENTION_DAYS",
  "GIDEON_STORAGE_DELETION_SLA_HOURS",
  "GIDEON_SIGNED_URL_MAX_SECONDS"
];

if (dryRun) {
  console.log("Storage lifecycle policy check dry-run:");
  console.log(`1. Require private S3/R2 storage env: ${requiredEnv.join(", ")}.`);
  console.log("2. Validate HTTPS storage endpoint, non-empty bucket, and non-public production artifact URLs.");
  console.log("3. Require temp/failed/source/voiceover/export retention windows and deletion SLA.");
  console.log("4. Require signed URL lifetime to stay short-lived.");
  console.log("5. Fail on public base URL configuration unless explicitly allowed for controlled rehearsal.");
  console.log("6. With --verify-bucket-lifecycle, fetch or read actual S3/R2 lifecycle XML and verify enabled expiration rules cover temp, failed, source, voiceover, and export objects.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

const provider = value("GIDEON_STORAGE_PROVIDER");
if (provider !== "s3" && provider !== "r2") {
  errors.push("GIDEON_STORAGE_PROVIDER must be s3 or r2 for production private object storage.");
}

validateUrl("GIDEON_STORAGE_ENDPOINT", ["https:"], "GIDEON_STORAGE_ENDPOINT must be an https:// URL.");
validateBucketName();
validateRetentionWindow("GIDEON_STORAGE_TEMP_RETENTION_DAYS", 1, 7);
validateRetentionWindow("GIDEON_STORAGE_FAILED_RETENTION_DAYS", 1, 30);
validateRetentionWindow("GIDEON_STORAGE_SOURCE_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_VOICEOVER_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_EXPORT_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_STORAGE_DELETION_SLA_HOURS", 1, 168);
validateRetentionWindow("GIDEON_SIGNED_URL_MAX_SECONDS", 60, 3600);
validatePublicBaseUrl();

if (verifyBucketLifecycle) {
  await validateBucketLifecycleRules();
}

if (errors.length > 0) {
  console.error("Storage lifecycle policy check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(verifyBucketLifecycle ? "Storage lifecycle policy and bucket lifecycle rules check passed." : "Storage lifecycle policy check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for production storage lifecycle checks.`);
  }
}

function validateUrl(name, protocols, message) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  try {
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol)) {
      errors.push(message);
    }
  } catch {
    errors.push(message);
  }
}

function validateBucketName() {
  const bucket = value("GIDEON_STORAGE_BUCKET");
  if (!bucket) {
    return;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) {
    errors.push("GIDEON_STORAGE_BUCKET must be a DNS-compatible private bucket name.");
  }
  if (/public|website|static/i.test(bucket)) {
    errors.push("GIDEON_STORAGE_BUCKET name must not indicate public website/static hosting.");
  }
}

function validateRetentionWindow(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function validatePublicBaseUrl() {
  const publicBaseUrl = value("GIDEON_STORAGE_PUBLIC_BASE_URL");
  if (!publicBaseUrl) {
    return;
  }
  if (value("GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL") === "true") {
    return;
  }
  errors.push("GIDEON_STORAGE_PUBLIC_BASE_URL must be unset for production private artifacts unless GIDEON_ALLOW_PUBLIC_STORAGE_BASE_URL=true.");
}

async function validateBucketLifecycleRules() {
  const xml = await loadLifecycleXml();
  if (!xml) {
    return;
  }
  const rules = parseLifecycleRules(xml).filter((rule) => rule.status.toLowerCase() === "enabled" && Number.isInteger(rule.days));
  if (rules.length === 0) {
    errors.push("Bucket lifecycle configuration must contain at least one enabled expiration rule with Days.");
    return;
  }

  for (const requirement of lifecycleRequirements()) {
    const coveringRule = rules.find((rule) => rule.days <= requirement.maxDays && rule.prefixes.some((prefix) => prefixCovers(prefix, requirement.probePrefix)));
    if (!coveringRule) {
      errors.push(
        `Bucket lifecycle configuration must include an enabled expiration rule covering ${requirement.label} (${requirement.probePrefix}) within ${requirement.maxDays} days.`
      );
    }
  }
}

async function loadLifecycleXml() {
  const fixturePath = value("GIDEON_STORAGE_LIFECYCLE_XML_PATH");
  if (fixturePath) {
    try {
      return fs.readFileSync(path.resolve(fixturePath), "utf8");
    } catch (error) {
      errors.push(`Could not read GIDEON_STORAGE_LIFECYCLE_XML_PATH: ${error instanceof Error ? error.message : "unknown error"}.`);
      return null;
    }
  }

  try {
    return await fetchBucketLifecycleXml();
  } catch (error) {
    errors.push(`Could not fetch bucket lifecycle configuration: ${error instanceof Error ? error.message : "unknown error"}.`);
    return null;
  }
}

async function fetchBucketLifecycleXml() {
  const url = bucketLifecycleUrl();
  const now = new Date();
  const headers = signedGetHeaders({
    url,
    region: value("GIDEON_STORAGE_REGION") || "auto",
    accessKeyId: value("GIDEON_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: value("GIDEON_STORAGE_SECRET_ACCESS_KEY"),
    now
  });
  const response = await httpRequest(url, headers);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP ${response.statusCode}: ${response.body.slice(0, 180)}`);
  }
  return response.body;
}

function bucketLifecycleUrl() {
  const target = new URL(value("GIDEON_STORAGE_ENDPOINT"));
  const basePath = target.pathname.replace(/\/+$/g, "");
  target.pathname = `${basePath}/${encodeURIComponent(value("GIDEON_STORAGE_BUCKET"))}`;
  target.search = "lifecycle=";
  return target;
}

function signedGetHeaders(input) {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update("").digest("hex");
  const host = input.url.host;
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((header) => `${header}:${headers[header]}\n`)
    .join("");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const canonicalRequest = ["GET", canonicalUri(input.url.pathname), canonicalQuery(input.url.searchParams), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  return {
    Host: headers.host,
    "X-Amz-Content-Sha256": headers["x-amz-content-sha256"],
    "X-Amz-Date": headers["x-amz-date"],
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

async function httpRequest(url, headers) {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, { method: "GET", headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    request.on("error", reject);
    request.setTimeout(15_000, () => request.destroy(new Error("Timed out fetching bucket lifecycle configuration.")));
    request.end();
  });
}

function parseLifecycleRules(xml) {
  return [...xml.matchAll(/<Rule\b[^>]*>([\s\S]*?)<\/Rule>/gi)].map((match) => {
    const body = match[1];
    const prefixes = [...body.matchAll(/<Prefix>([\s\S]*?)<\/Prefix>/gi)].map((prefixMatch) => decodeXml(prefixMatch[1].trim()));
    return {
      id: decodeXml(firstTag(body, "ID") ?? ""),
      status: decodeXml(firstTag(body, "Status") ?? ""),
      prefixes: prefixes.length > 0 ? prefixes : [""],
      days: Number(firstTag(firstTag(body, "Expiration") ?? "", "Days"))
    };
  });
}

function firstTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function decodeXml(valueToDecode) {
  return valueToDecode
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function lifecycleRequirements() {
  return [
    {
      label: "temporary upload/cache objects",
      probePrefix: value("GIDEON_STORAGE_TEMP_LIFECYCLE_PROBE_PREFIX") || "tmp/",
      maxDays: Number(value("GIDEON_STORAGE_TEMP_RETENTION_DAYS"))
    },
    {
      label: "failed processing objects",
      probePrefix: value("GIDEON_STORAGE_FAILED_LIFECYCLE_PROBE_PREFIX") || "failed/",
      maxDays: Number(value("GIDEON_STORAGE_FAILED_RETENTION_DAYS"))
    },
    {
      label: "source recordings",
      probePrefix: value("GIDEON_STORAGE_SOURCE_LIFECYCLE_PROBE_PREFIX") || "workspaces/gideon-lifecycle-probe/projects/gideon-lifecycle-probe/source_recording/",
      maxDays: Number(value("GIDEON_STORAGE_SOURCE_RETENTION_DAYS"))
    },
    {
      label: "voiceover artifacts",
      probePrefix: value("GIDEON_STORAGE_VOICEOVER_LIFECYCLE_PROBE_PREFIX") || "workspaces/gideon-lifecycle-probe/projects/gideon-lifecycle-probe/voiceover/",
      maxDays: Number(value("GIDEON_VOICEOVER_RETENTION_DAYS"))
    },
    {
      label: "export artifacts",
      probePrefix: value("GIDEON_STORAGE_EXPORT_LIFECYCLE_PROBE_PREFIX") || "workspaces/gideon-lifecycle-probe/projects/gideon-lifecycle-probe/export/",
      maxDays: Number(value("GIDEON_STORAGE_EXPORT_RETENTION_DAYS"))
    }
  ];
}

function prefixCovers(rulePrefix, probePrefix) {
  return probePrefix.startsWith(rulePrefix);
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secretAccessKey, dateStamp, region) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function hmac(key, input, encoding) {
  const result = createHmac("sha256", key).update(input).digest();
  return encoding === "hex" ? result.toString("hex") : result;
}

function canonicalUri(pathname) {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function canonicalQuery(searchParams) {
  return [...searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)))
    .map(([key, queryValue]) => `${uriEncode(key)}=${uriEncode(queryValue)}`)
    .join("&");
}

function uriEncode(input) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
