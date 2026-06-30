#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const live = args.has("--live") || process.env.GIDEON_STAGING_SMOKE_LIVE === "true";
const dryRun = args.has("--dry-run") || !live;
const skipDownloadHead = args.has("--skip-download-head") || process.env.GIDEON_STAGING_SMOKE_SKIP_DOWNLOAD_HEAD === "true";
const pollTimeoutMs = positiveInteger(process.env.GIDEON_STAGING_SMOKE_POLL_TIMEOUT_MS, 10 * 60 * 1000);
const pollIntervalMs = positiveInteger(process.env.GIDEON_STAGING_SMOKE_POLL_INTERVAL_MS, 5 * 1000);

const plan = [
  "Validate staging API URL, auth callback secret, and small recording fixture.",
  "Create or sync a hosted auth session through the trusted provider-callback endpoint.",
  "Create a project in the authenticated workspace.",
  "Request a private direct-upload session.",
  "PUT the recording fixture to the signed upload URL.",
  "Complete the recording upload and verify safe recording metadata.",
  "Enqueue analysis and wait for the analysis job to succeed.",
  "Enqueue rendering and wait for the render job to succeed.",
  "Read the sanitized project render list and select a completed render ID.",
  "Create an export artifact for the completed render.",
  "Create a signed private download URL for the export.",
  "Optionally HEAD the signed download URL to verify object-storage reachability."
];

if (dryRun) {
  console.log("Staging smoke dry-run:");
  plan.forEach((step, index) => console.log(`${index + 1}. ${step}`));
  console.log("Set GIDEON_STAGING_SMOKE_LIVE=true or pass --live to execute against deployed staging.");
  console.log("Required live env: GIDEON_STAGING_API_BASE_URL, GIDEON_AUTH_CALLBACK_SECRET, GIDEON_STAGING_SMOKE_RECORDING_PATH.");
  process.exit(0);
}

const config = await loadLiveConfig();
await runSmoke(config);

async function loadLiveConfig() {
  const baseUrl = requiredUrl("GIDEON_STAGING_API_BASE_URL");
  const authCallbackSecret = requiredEnv("GIDEON_AUTH_CALLBACK_SECRET");
  const recordingPath = requiredEnv("GIDEON_STAGING_SMOKE_RECORDING_PATH");
  const recordingStats = await fs.stat(recordingPath).catch(() => null);
  if (!recordingStats?.isFile() || recordingStats.size < 1) {
    fail("GIDEON_STAGING_SMOKE_RECORDING_PATH must point to a readable non-empty file.");
  }
  const maxFixtureBytes = positiveInteger(process.env.GIDEON_STAGING_SMOKE_MAX_BYTES, 250 * 1024 * 1024);
  if (recordingStats.size > maxFixtureBytes) {
    fail(`Staging smoke fixture is too large: ${recordingStats.size} bytes exceeds ${maxFixtureBytes}.`);
  }
  return {
    baseUrl,
    authCallbackSecret,
    recordingPath,
    recordingSize: recordingStats.size,
    contentType: process.env.GIDEON_STAGING_SMOKE_CONTENT_TYPE?.trim() || contentTypeFromPath(recordingPath),
    authSubject: process.env.GIDEON_STAGING_SMOKE_AUTH_SUBJECT?.trim() || "oidc|staging-smoke",
    email: process.env.GIDEON_STAGING_SMOKE_EMAIL?.trim() || "staging-smoke@example.invalid",
    displayName: process.env.GIDEON_STAGING_SMOKE_DISPLAY_NAME?.trim() || "Staging Smoke",
    workspaceName: process.env.GIDEON_STAGING_SMOKE_WORKSPACE_NAME?.trim() || "Gideon staging smoke",
    projectName: process.env.GIDEON_STAGING_SMOKE_PROJECT_NAME?.trim() || `Staging smoke ${new Date().toISOString()}`,
    profile: smokeProfile()
  };
}

async function runSmoke(config) {
  const client = createApiClient(config.baseUrl);
  console.log("RUN hosted auth callback");
  const auth = await client.json("POST", "/api/v1/auth/provider-callback", {
    headers: { "x-gideon-auth-callback-secret": config.authCallbackSecret },
    body: {
      authSubject: config.authSubject,
      email: config.email,
      displayName: config.displayName,
      identityProvider: "oidc",
      defaultWorkspaceName: config.workspaceName
    },
    expectedStatuses: [201]
  });
  const cookie = sessionCookie(auth.headers);
  const csrfToken = requiredDataString(auth.body, "csrfToken");

  console.log("RUN hosted session check");
  await client.json("GET", "/api/v1/auth/session", {
    cookie,
    expectedStatuses: [200]
  });

  console.log("RUN project creation");
  const projectResponse = await client.json("POST", "/api/v1/projects", {
    cookie,
    csrfToken,
    body: {
      name: config.projectName,
      profile: config.profile
    },
    expectedStatuses: [201]
  });
  const projectId = requiredNestedString(projectResponse.body, ["data", "project", "id"], "project.id");

  console.log("RUN direct upload session");
  const uploadResponse = await client.json("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/recordings/uploads`, {
    cookie,
    csrfToken,
    body: {
      filename: path.basename(config.recordingPath),
      sizeBytes: config.recordingSize,
      mediaType: config.contentType
    },
    expectedStatuses: [201]
  });
  const recordingId = requiredNestedString(uploadResponse.body, ["data", "recordingId"], "recordingId");
  const upload = requiredObject(uploadResponse.body?.data?.upload, "upload");
  const uploadUrl = requiredString(upload.uploadUrl, "upload.uploadUrl");
  const uploadMethod = requiredString(upload.method, "upload.method");
  if (uploadMethod !== "PUT") {
    fail(`Unsupported upload method ${uploadMethod}; expected PUT.`);
  }

  console.log("RUN signed recording upload");
  const recordingBuffer = await fs.readFile(config.recordingPath);
  await putSignedUpload(uploadUrl, upload.headers, recordingBuffer, config.contentType);
  const checksumSha256 = createHash("sha256").update(recordingBuffer).digest("hex");

  console.log("RUN recording completion");
  await client.json("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/recordings/${encodeURIComponent(recordingId)}/complete`, {
    cookie,
    csrfToken,
    body: { checksumSha256 },
    expectedStatuses: [200]
  });

  console.log("RUN analysis enqueue");
  const analysisResponse = await client.json("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/analysis-runs`, {
    cookie,
    csrfToken,
    body: {},
    expectedStatuses: [202]
  });
  const analysisJobId = requiredNestedString(analysisResponse.body, ["data", "job", "id"], "analysis job.id");
  await waitForJob(client, cookie, analysisJobId, "analysis");

  console.log("RUN render enqueue");
  const renderResponse = await client.json("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/render-jobs`, {
    cookie,
    csrfToken,
    body: {},
    expectedStatuses: [202]
  });
  const renderJobId = requiredNestedString(renderResponse.body, ["data", "job", "id"], "render job.id");
  await waitForJob(client, cookie, renderJobId, "render");

  console.log("RUN completed render lookup");
  const projectAfterRender = await client.json("GET", `/api/v1/projects/${encodeURIComponent(projectId)}`, {
    cookie,
    expectedStatuses: [200]
  });
  const renders = projectAfterRender.body?.data?.project?.renders;
  if (!Array.isArray(renders)) {
    fail("Project response did not include sanitized renders.");
  }
  const completedRender = renders.find((render) => render && render.status === "completed" && typeof render.id === "string");
  if (!completedRender) {
    fail("No completed render was available for export after render job success.");
  }

  console.log("RUN export creation");
  const exportResponse = await client.json("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/exports`, {
    cookie,
    csrfToken,
    body: { renderId: completedRender.id },
    expectedStatuses: [201]
  });
  const exportId = requiredNestedString(exportResponse.body, ["data", "export", "id"], "export.id");

  console.log("RUN export download URL creation");
  const downloadResponse = await client.json(
    "POST",
    `/api/v1/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(exportId)}/download-url`,
    {
      cookie,
      csrfToken,
      body: {},
      expectedStatuses: [200]
    }
  );
  const downloadUrl = requiredNestedString(downloadResponse.body, ["data", "download", "url"], "download.url");

  if (!skipDownloadHead) {
    console.log("RUN signed download HEAD");
    await headSignedDownload(downloadUrl);
  }

  console.log(`Staging smoke passed for project ${projectId}.`);
}

function createApiClient(baseUrl) {
  return {
    async json(method, route, options = {}) {
      const headers = {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.csrfToken ? { "x-csrf-token": options.csrfToken } : {}),
        ...(options.headers ?? {})
      };
      const response = await fetch(new URL(route, baseUrl), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const text = await response.text();
      const body = text ? safeJson(text) : {};
      const expectedStatuses = options.expectedStatuses ?? [200];
      if (!expectedStatuses.includes(response.status)) {
        const code = body?.error?.code ? ` ${body.error.code}` : "";
        const message = body?.error?.message ? `: ${body.error.message}` : "";
        fail(`${method} ${route} returned HTTP ${response.status}${code}${message}`);
      }
      return { status: response.status, headers: response.headers, body };
    }
  };
}

async function putSignedUpload(uploadUrl, uploadHeaders, body, contentType) {
  const headers = normalizeUploadHeaders(uploadHeaders);
  if (!hasHeader(headers, "content-type")) {
    headers["content-type"] = contentType;
  }
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body
  });
  if (response.status < 200 || response.status >= 300) {
    fail(`Signed upload returned HTTP ${response.status}.`);
  }
}

async function waitForJob(client, cookie, jobId, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= pollTimeoutMs) {
    const response = await client.json("GET", `/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      cookie,
      expectedStatuses: [200]
    });
    const job = requiredObject(response.body?.data?.job, `${label} job`);
    const status = requiredString(job.status, `${label} job.status`);
    if (status === "succeeded") {
      console.log(`PASS ${label} job ${jobId} succeeded.`);
      return;
    }
    if (status === "failed" || status === "canceled") {
      fail(`${label} job ${jobId} ended with status ${status}.`);
    }
    await delay(pollIntervalMs);
  }
  fail(`${label} job ${jobId} did not finish within ${pollTimeoutMs}ms.`);
}

async function headSignedDownload(downloadUrl) {
  const response = await fetch(downloadUrl, { method: "HEAD" });
  if (response.status < 200 || response.status >= 400) {
    fail(`Signed download HEAD returned HTTP ${response.status}.`);
  }
}

function sessionCookie(headers) {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) {
    fail("Hosted auth callback did not return Set-Cookie.");
  }
  return setCookie.split(";")[0] ?? "";
}

function normalizeUploadHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => typeof entry[1] === "string")
      .map(([key, headerValue]) => [key.toLowerCase(), headerValue])
  );
}

function hasHeader(headers, expected) {
  return Object.keys(headers).some((header) => header.toLowerCase() === expected.toLowerCase());
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail("API returned a non-JSON response.");
  }
}

function requiredUrl(name) {
  const value = requiredEnv(name);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    return url;
  } catch {
    fail(`${name} must be an absolute http(s) URL.`);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required for live staging smoke.`);
  }
  return value;
}

function requiredDataString(body, field) {
  return requiredNestedString(body, ["data", field], field);
}

function requiredNestedString(root, keys, label) {
  let value = root;
  for (const key of keys) {
    value = value?.[key];
  }
  return requiredString(value, label);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} is missing from staging smoke response.`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is missing from staging smoke response.`);
  }
  return value;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function contentTypeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mov") {
    return "video/quicktime";
  }
  if (extension === ".webm") {
    return "video/webm";
  }
  return "video/mp4";
}

function smokeProfile() {
  return {
    productName: "Gideon staging smoke",
    targetCustomer: "B2B SaaS founders",
    productDescription: "A staging verification project that proves Gideon can turn a product walkthrough into a private export.",
    preferredTone: "direct",
    toneGuidance: "Clear, concise, evidence-led.",
    platforms: ["youtube_shorts"]
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`Staging smoke failed: ${message}`);
  process.exit(1);
}
