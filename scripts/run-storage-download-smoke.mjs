#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const skipFetch = args.has("--skip-fetch") || value("GIDEON_STORAGE_SIGNED_DOWNLOAD_SKIP_FETCH") === "true";
const errors = [];

const requiredEnv = [
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_SIGNED_URL_MAX_SECONDS",
  "GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY"
];

if (dryRun) {
  console.log("Storage signed-download smoke dry-run:");
  console.log(`1. Require private S3/R2 storage env: ${requiredEnv.join(", ")}.`);
  console.log("2. Validate the smoke object key is private and workspace/project scoped.");
  console.log("3. Mint a short-lived signed GET URL without printing it.");
  console.log("4. Validate the signed URL lifetime does not exceed GIDEON_SIGNED_URL_MAX_SECONDS.");
  console.log("5. GET byte range 0-0 from the signed URL unless --skip-fetch is set.");
  console.log("6. Print only safe status, provider, bucket hash, object-key hash, and response metadata.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

const provider = value("GIDEON_STORAGE_PROVIDER");
if (provider !== "s3" && provider !== "r2") {
  errors.push("GIDEON_STORAGE_PROVIDER must be s3 or r2 for storage signed-download smoke.");
}

validateUrl("GIDEON_STORAGE_ENDPOINT", ["https:"], "GIDEON_STORAGE_ENDPOINT must be an https:// URL.");
validateBucketName();
validateStorageKey();
const expiresInSeconds = validateSignedUrlLifetime();

let signedUrl = "";
if (errors.length === 0) {
  signedUrl = presignedGetUrl({
    url: s3ObjectUrl(value("GIDEON_STORAGE_ENDPOINT"), value("GIDEON_STORAGE_BUCKET"), value("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY")),
    region: value("GIDEON_STORAGE_REGION") || "auto",
    accessKeyId: value("GIDEON_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: value("GIDEON_STORAGE_SECRET_ACCESS_KEY"),
    expiresInSeconds,
    now: new Date()
  });
  validateSignedUrlShape(signedUrl, expiresInSeconds);
}

let fetchSummary = null;
if (!skipFetch && errors.length === 0) {
  fetchSummary = await fetchSignedByteRange(signedUrl);
}

if (errors.length > 0) {
  console.error("Storage signed-download smoke failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Storage signed-download smoke passed.");
console.log(`Provider: ${provider}`);
console.log(`Bucket hash: ${hashForLog(value("GIDEON_STORAGE_BUCKET"))}`);
console.log(`Object key hash: ${hashForLog(value("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY"))}`);
console.log(`Signed URL lifetime seconds: ${expiresInSeconds}`);
if (fetchSummary) {
  console.log(`Signed download range status: ${fetchSummary.status}`);
  if (fetchSummary.contentLength) {
    console.log(`Signed download content-length: ${fetchSummary.contentLength}`);
  }
  if (fetchSummary.contentRange) {
    console.log(`Signed download content-range: ${fetchSummary.contentRange}`);
  }
} else {
  console.log("Signed download range fetch: skipped");
}

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for storage signed-download smoke.`);
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

function validateStorageKey() {
  const storageKey = value("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY");
  if (!storageKey) {
    return;
  }
  if (storageKey.startsWith("/") || storageKey.includes("..") || storageKey.includes("//")) {
    errors.push("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY must be a normalized private object key.");
  }
  if (!/^workspaces\/[^/]+\/projects\/[^/]+\/(?:export|render|source_recording)\//.test(storageKey)) {
    errors.push("GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY must reference a workspace/project scoped source_recording, render, or export object.");
  }
}

function validateSignedUrlLifetime() {
  const parsed = Number(value("GIDEON_SIGNED_URL_MAX_SECONDS"));
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 3600) {
    errors.push("GIDEON_SIGNED_URL_MAX_SECONDS must be an integer between 60 and 3600.");
    return 900;
  }
  return parsed;
}

function validateSignedUrlShape(url, expiresInSeconds) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    errors.push("Signed download URL must use https://.");
  }
  if (parsed.searchParams.get("X-Amz-Expires") !== String(expiresInSeconds)) {
    errors.push("Signed download URL expiry must match GIDEON_SIGNED_URL_MAX_SECONDS.");
  }
  if (!parsed.searchParams.get("X-Amz-Signature")) {
    errors.push("Signed download URL must include an S3-compatible signature.");
  }
  if (url.includes(value("GIDEON_STORAGE_SECRET_ACCESS_KEY"))) {
    errors.push("Signed download URL must not contain the storage secret access key.");
  }
}

async function fetchSignedByteRange(signedUrl) {
  const response = await fetch(signedUrl, {
    method: "GET",
    headers: {
      Range: "bytes=0-0"
    }
  }).catch((error) => {
    errors.push(`Signed download range fetch failed: ${error instanceof Error ? error.message : "unknown error"}.`);
    return null;
  });
  if (!response) {
    return null;
  }
  if (response.status !== 200 && response.status !== 206) {
    errors.push(`Signed download range fetch returned HTTP ${response.status}.`);
    return null;
  }
  await readAtMostOneChunk(response);
  return {
    status: response.status,
    contentLength: response.headers.get("content-length"),
    contentRange: response.headers.get("content-range")
  };
}

async function readAtMostOneChunk(response) {
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  try {
    await reader.read();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function presignedGetUrl(input) {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const signedHeaders = "host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders
  });
  const canonicalQueryString = canonicalQuery(query);
  const canonicalHeaders = `host:${input.url.host}\n`;
  const canonicalRequest = ["GET", canonicalUri(input.url.pathname), canonicalQueryString, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  input.url.search = canonicalQuery(query);
  return input.url.toString();
}

function s3ObjectUrl(endpoint, bucket, storageKey) {
  const target = new URL(endpoint);
  const basePath = target.pathname.replace(/\/+$/g, "");
  target.pathname = `${basePath}/${encodeURIComponent(bucket)}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
  target.search = "";
  return target;
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

function hashForLog(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
