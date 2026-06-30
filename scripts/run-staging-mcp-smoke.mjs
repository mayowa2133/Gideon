#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const live = args.has("--live") || process.env.GIDEON_STAGING_MCP_SMOKE_LIVE === "true";
const dryRun = args.has("--dry-run") || !live;
const skipMutations = args.has("--skip-mutations") || process.env.GIDEON_STAGING_MCP_SMOKE_SKIP_MUTATIONS === "true";
const skipEnqueue = args.has("--skip-enqueue") || process.env.GIDEON_STAGING_MCP_SMOKE_SKIP_ENQUEUE === "true";
const requireMetricExport =
  args.has("--require-metric-export") || process.env.GIDEON_STAGING_MCP_REQUIRE_METRIC_EXPORT === "true";

const plan = [
  "Validate hosted API base URL, active Gideon session cookie, and scratch project ID.",
  "Fetch the hosted session and CSRF token to verify staging SSO/session policy.",
  "Fetch sanitized MCP project context using the same route the MCP server calls.",
  "Verify the context has at least one script and one moment unless mutations are explicitly skipped.",
  "Patch a scratch script with the current revision and verify success.",
  "Replay a stale script patch with the old revision and verify 409 revision_conflict.",
  "Restore the script field with the latest revision.",
  "Patch a scratch moment with the current revision and verify success.",
  "Replay a stale moment patch with the old revision and verify 409 revision_conflict.",
  "Restore the moment field with the latest revision.",
  "Enqueue hosted analysis and render jobs through the MCP-used API routes.",
  "Optionally query the deployed observability backend for hosted MCP/review metric export evidence."
];

if (dryRun) {
  console.log("Staging MCP smoke dry-run:");
  plan.forEach((step, index) => console.log(`${index + 1}. ${step}`));
  console.log("Set GIDEON_STAGING_MCP_SMOKE_LIVE=true or pass --live to execute against deployed staging.");
  console.log(
    "Required live env: GIDEON_STAGING_MCP_API_BASE_URL, GIDEON_STAGING_MCP_SESSION_COOKIE, GIDEON_STAGING_MCP_PROJECT_ID."
  );
  console.log("Optional env: GIDEON_STAGING_MCP_CSRF_TOKEN, GIDEON_STAGING_MCP_SCRIPT_ID, GIDEON_STAGING_MCP_MOMENT_ID.");
  process.exit(0);
}

const config = loadConfig();
await runSmoke(config);

function loadConfig() {
  return {
    baseUrl: requiredUrl("GIDEON_STAGING_MCP_API_BASE_URL"),
    sessionCookie: requiredEnv("GIDEON_STAGING_MCP_SESSION_COOKIE"),
    projectId: requiredEnv("GIDEON_STAGING_MCP_PROJECT_ID"),
    csrfToken: optionalEnv("GIDEON_STAGING_MCP_CSRF_TOKEN"),
    scriptId: optionalEnv("GIDEON_STAGING_MCP_SCRIPT_ID"),
    momentId: optionalEnv("GIDEON_STAGING_MCP_MOMENT_ID"),
    metricProbeUrl: optionalUrl("GIDEON_STAGING_MCP_METRIC_PROBE_URL"),
    metricProbeBearerToken: optionalEnv("GIDEON_STAGING_MCP_METRIC_PROBE_BEARER_TOKEN"),
    mutationSuffix: optionalEnv("GIDEON_STAGING_MCP_MUTATION_SUFFIX") ?? `staging-mcp-smoke-${Date.now()}`
  };
}

async function runSmoke(config) {
  const client = createApiClient(config.baseUrl, config.sessionCookie);
  console.log("RUN hosted session check");
  const session = await client.json("GET", "/api/v1/auth/session", { expectedStatuses: [200] });
  const csrfToken = config.csrfToken ?? requiredNestedString(session.body, ["data", "csrfToken"], "csrfToken");

  console.log("RUN hosted MCP context");
  let context = await readMcpContext(client, config.projectId);
  const project = requiredObject(context.body?.data?.project, "mcp project");
  assertNoPrivateMaterial(project);

  if (!skipMutations) {
    const script = selectById(project.scripts, config.scriptId, "script");
    const moment = selectById(project.moments, config.momentId, "moment");

    console.log("RUN script revision success/conflict/restore");
    context = await verifyScriptRevisionFlow(client, csrfToken, config.projectId, script, config.mutationSuffix);

    console.log("RUN moment revision success/conflict/restore");
    const latestProject = requiredObject(context.body?.data?.project, "latest mcp project");
    const latestMoment = selectById(latestProject.moments, moment.id, "moment");
    await verifyMomentRevisionFlow(client, csrfToken, config.projectId, latestMoment, config.mutationSuffix);
  } else {
    console.log("SKIP review mutations because --skip-mutations is set.");
  }

  if (!skipEnqueue) {
    console.log("RUN hosted MCP analysis enqueue");
    await client.json("POST", `/api/v1/projects/${encodeURIComponent(config.projectId)}/analysis-runs`, {
      csrfToken,
      body: {},
      expectedStatuses: [202]
    });

    console.log("RUN hosted MCP render enqueue");
    await client.json("POST", `/api/v1/projects/${encodeURIComponent(config.projectId)}/render-jobs`, {
      csrfToken,
      body: {},
      expectedStatuses: [202]
    });
  } else {
    console.log("SKIP job enqueueing because --skip-enqueue is set.");
  }

  if (requireMetricExport) {
    console.log("RUN hosted MCP metric export probe");
    await probeMetricExport(config);
  } else {
    console.log("SKIP metric export probe; pass --require-metric-export to require deployed observability evidence.");
  }

  console.log(`Staging MCP smoke passed for project ${config.projectId}.`);
}

async function verifyScriptRevisionFlow(client, csrfToken, projectId, script, suffix) {
  const originalHook = requiredString(script.hook, "script.hook");
  const originalRevision = requiredString(script.revision, "script.revision");
  const smokeHook = `${originalHook} [${suffix}]`;

  const edited = await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(script.id)}`, {
    csrfToken,
    revision: originalRevision,
    body: { hook: smokeHook },
    expectedStatuses: [200]
  });
  assertNestedEquals(edited.body, ["data", "project", "id"], projectId, "script edit project.id");

  await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(script.id)}`, {
    csrfToken,
    revision: originalRevision,
    body: { hook: `${smokeHook} stale` },
    expectedStatuses: [409],
    expectedErrorCode: "revision_conflict"
  });

  const context = await readMcpContext(client, projectId);
  const updatedScript = selectById(requiredObject(context.body?.data?.project, "mcp project").scripts, script.id, "script");
  await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(script.id)}`, {
    csrfToken,
    revision: requiredString(updatedScript.revision, "updated script.revision"),
    body: { hook: originalHook },
    expectedStatuses: [200]
  });
  return readMcpContext(client, projectId);
}

async function verifyMomentRevisionFlow(client, csrfToken, projectId, moment, suffix) {
  const originalLabel = requiredString(moment.label, "moment.label");
  const originalRevision = requiredString(moment.revision, "moment.revision");
  const smokeLabel = `${originalLabel} [${suffix}]`;

  await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/moments/${encodeURIComponent(moment.id)}`, {
    csrfToken,
    revision: originalRevision,
    body: { label: smokeLabel },
    expectedStatuses: [200]
  });

  await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/moments/${encodeURIComponent(moment.id)}`, {
    csrfToken,
    revision: originalRevision,
    body: { label: `${smokeLabel} stale` },
    expectedStatuses: [409],
    expectedErrorCode: "revision_conflict"
  });

  const context = await readMcpContext(client, projectId);
  const updatedMoment = selectById(requiredObject(context.body?.data?.project, "mcp project").moments, moment.id, "moment");
  await client.json("PATCH", `/api/v1/projects/${encodeURIComponent(projectId)}/moments/${encodeURIComponent(moment.id)}`, {
    csrfToken,
    revision: requiredString(updatedMoment.revision, "updated moment.revision"),
    body: { label: originalLabel },
    expectedStatuses: [200]
  });
}

async function readMcpContext(client, projectId) {
  return client.json("GET", `/api/v1/projects/${encodeURIComponent(projectId)}/mcp-context`, {
    expectedStatuses: [200]
  });
}

async function probeMetricExport(config) {
  if (!config.metricProbeUrl) {
    fail("GIDEON_STAGING_MCP_METRIC_PROBE_URL is required when metric export is required.");
  }
  const headers = {
    accept: "application/json",
    ...(config.metricProbeBearerToken ? { authorization: `Bearer ${config.metricProbeBearerToken}` } : {})
  };
  const response = await fetch(config.metricProbeUrl, { headers });
  if (response.status < 200 || response.status >= 300) {
    fail(`Metric probe returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  for (const expected of ["hosted_mcp_context_served", "hosted_review_edit_succeeded", "hosted_review_edit_failed"]) {
    if (!text.includes(expected)) {
      fail(`Metric probe response did not include ${expected}.`);
    }
  }
}

function createApiClient(baseUrl, sessionCookie) {
  return {
    async json(method, route, options = {}) {
      const headers = {
        accept: "application/json",
        cookie: sessionCookie,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.csrfToken ? { "x-csrf-token": options.csrfToken } : {}),
        ...(options.revision ? { "if-match": JSON.stringify(options.revision) } : {})
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
      if (options.expectedErrorCode && body?.error?.code !== options.expectedErrorCode) {
        fail(`${method} ${route} returned expected HTTP ${response.status} but error code ${body?.error?.code ?? "none"}.`);
      }
      return { status: response.status, body, headers: response.headers };
    }
  };
}

function selectById(items, id, label) {
  if (!Array.isArray(items) || items.length < 1) {
    fail(`MCP context must include at least one ${label} for live mutation smoke.`);
  }
  const item = id ? items.find((candidate) => candidate?.id === id) : items.find((candidate) => typeof candidate?.id === "string");
  if (!item) {
    fail(`MCP context did not include ${label}${id ? ` ${id}` : ""}.`);
  }
  return item;
}

function assertNoPrivateMaterial(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ["/private/", "file://", "signedUrl", "objectKey", "uploadUrl", "downloadUrl"]) {
    if (serialized.includes(forbidden)) {
      fail(`MCP context exposed private material marker ${forbidden}.`);
    }
  }
}

function assertNestedEquals(root, keys, expected, label) {
  let value = root;
  for (const key of keys) {
    value = value?.[key];
  }
  if (value !== expected) {
    fail(`${label} expected ${expected} but received ${value ?? "missing"}.`);
  }
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

function optionalUrl(name) {
  const value = optionalEnv(name);
  if (!value) {
    return null;
  }
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
  const value = optionalEnv(name);
  if (!value) {
    fail(`${name} is required for live staging MCP smoke.`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
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
    fail(`${label} is missing from staging MCP smoke response.`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is missing from staging MCP smoke response.`);
  }
  return value;
}

function fail(message) {
  console.error(`Staging MCP smoke failed: ${message}`);
  process.exit(1);
}
