import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

interface GideonState {
  projects?: GideonProject[];
  workspaceMembers?: GideonWorkspaceMember[];
  auditEvents?: GideonAuditEvent[];
  activeUserId?: string | null;
  activeWorkspaceId?: string | null;
  activeProjectId?: string | null;
  [key: string]: unknown;
}

interface GideonProject {
  id: string;
  workspaceId?: string;
  name?: string;
  status?: string;
  updatedAt?: string;
  profile?: Record<string, unknown>;
  recording?: Record<string, unknown>;
  moments?: GideonMoment[];
  scripts?: GideonScript[];
  renders?: Array<Record<string, unknown>>;
  jobs?: Array<Record<string, unknown>>;
  jobEvents?: Array<Record<string, unknown>>;
  providerRuns?: Array<Record<string, unknown>>;
  frameEvidence?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface GideonWorkspaceMember {
  workspaceId?: string;
  userId?: string;
  role?: "owner" | "admin" | "editor" | "viewer";
  [key: string]: unknown;
}

interface GideonAuditEvent {
  id: string;
  workspaceId: string;
  projectId?: string;
  actorUserId: string;
  actorType: "mcp_agent";
  action: string;
  targetType: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, JsonValue>;
  createdAt: string;
}

interface GideonScript {
  id: string;
  hook?: string;
  voiceoverText?: string;
  cta?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface GideonMoment {
  id: string;
  label?: string;
  evidence?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

interface HostedMcpConfig {
  baseUrl: string;
  cookie: string;
  csrfToken?: string;
}

const hostedTransportSchema = {
  hostedApiBaseUrl: optionalString("Hosted Gideon API base URL. Defaults to GIDEON_MCP_HOSTED_API_BASE_URL."),
  hostedSessionCookie: optionalString("Raw hosted session Cookie header. Defaults to GIDEON_MCP_HOSTED_SESSION_COOKIE."),
  hostedCsrfToken: optionalString("Hosted CSRF token for mutations. Defaults to GIDEON_MCP_HOSTED_CSRF_TOKEN or is discovered from /auth/session.")
};

const tools = [
  {
    name: "gideon_status",
    description: "Check whether the local Gideon store is reachable. No provider API keys are required.",
    inputSchema: objectSchema({
      controlSocketPath: optionalString("Explicit Gideon app control socket path. Defaults to GIDEON_CONTROL_SOCKET or the macOS app data path."),
      storePath: optionalString("Explicit path to gideon-store.json. Defaults to GIDEON_STORE_PATH or the macOS app data path."),
      ...hostedTransportSchema
    })
  },
  {
    name: "gideon_list_projects",
    description: "List local Gideon projects with high-level status for agent review.",
    inputSchema: objectSchema({
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    })
  },
  {
    name: "gideon_get_project",
    description: "Inspect one Gideon project including profile, evidence, scripts, renders, and jobs.",
    inputSchema: objectSchema({
      projectId: { type: "string", description: "Gideon project ID." },
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    }, ["projectId"])
  },
  {
    name: "gideon_get_audit_log",
    description: "Inspect recent local audit events, including Codex/Claude MCP edits.",
    inputSchema: objectSchema({
      projectId: optionalString("Optional project ID to filter audit events."),
      limit: { type: "number", description: "Maximum number of events to return. Defaults to 25." },
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    })
  },
  {
    name: "gideon_update_script",
    description: "Apply bounded edits to a script draft. This lets Codex/Claude edit copy without provider API keys.",
    inputSchema: objectSchema({
      projectId: { type: "string" },
      scriptId: { type: "string" },
      hook: optionalString("Replacement hook text."),
      voiceoverText: optionalString("Replacement voiceover text."),
      cta: optionalString("Replacement CTA text."),
      revision: optionalString("Expected script revision from hosted MCP context. Hosted mode auto-discovers the current revision when omitted."),
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    }, ["projectId", "scriptId"])
  },
  {
    name: "gideon_update_moment",
    description: "Apply bounded edits to a detected moment label/evidence/enabled flag.",
    inputSchema: objectSchema({
      projectId: { type: "string" },
      momentId: { type: "string" },
      label: optionalString("Replacement moment label."),
      evidence: optionalString("Replacement evidence text."),
      enabled: { type: "boolean", description: "Whether this moment should be used." },
      revision: optionalString("Expected moment revision from hosted MCP context. Hosted mode auto-discovers the current revision when omitted."),
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    }, ["projectId", "momentId"])
  },
  {
    name: "gideon_enqueue_analysis",
    description: "Ask the running Gideon app to enqueue an analysis job through its local worker queue.",
    inputSchema: objectSchema({
      projectId: { type: "string" },
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      ...hostedTransportSchema
    }, ["projectId"])
  },
  {
    name: "gideon_enqueue_render",
    description: "Ask the running Gideon app to enqueue a render job through its local worker queue.",
    inputSchema: objectSchema({
      projectId: { type: "string" },
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      ...hostedTransportSchema
    }, ["projectId"])
  },
  {
    name: "gideon_generate_video_edit_plan",
    description: "Create a deterministic edit plan from a user instruction and optional project context.",
    inputSchema: objectSchema({
      instruction: { type: "string", description: "User's desired edit or marketing outcome." },
      projectId: optionalString("Optional project ID to ground the plan."),
      controlSocketPath: optionalString("Explicit Gideon app control socket path."),
      storePath: optionalString("Explicit path to gideon-store.json."),
      ...hostedTransportSchema
    }, ["instruction"])
  }
];

export function resolveControlSocketPath(env: NodeJS.ProcessEnv = process.env, homeDir = os.homedir()): string {
  if (env.GIDEON_CONTROL_SOCKET) {
    return env.GIDEON_CONTROL_SOCKET;
  }
  if (env.GIDEON_USER_DATA_DIR) {
    return path.join(env.GIDEON_USER_DATA_DIR, "gideon-control.sock");
  }
  return path.join(homeDir, "Library", "Application Support", "Gideon", "gideon-control.sock");
}

export function resolveStorePath(env: NodeJS.ProcessEnv = process.env, homeDir = os.homedir()): string {
  if (env.GIDEON_STORE_PATH) {
    return env.GIDEON_STORE_PATH;
  }
  if (env.GIDEON_USER_DATA_DIR) {
    return path.join(env.GIDEON_USER_DATA_DIR, "gideon-store.json");
  }
  return path.join(homeDir, "Library", "Application Support", "Gideon", "gideon-store.json");
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  switch (name) {
    case "gideon_status":
      return textResult(await status(args));
    case "gideon_list_projects":
      return textResult(await listProjectsTool(args));
    case "gideon_get_project":
      return textResult(await getProjectTool(args));
    case "gideon_get_audit_log":
      return textResult(await getAuditLogTool(args));
    case "gideon_update_script":
      return textResult(await updateScript(args));
    case "gideon_update_moment":
      return textResult(await updateMoment(args));
    case "gideon_enqueue_analysis":
      if (hostedConfigFromArgs(args)) {
        return textResult(
          await hostedApiRequest(args, "POST", `/api/v1/projects/${encodeURIComponent(requireString(args.projectId, "projectId"))}/analysis-runs`, {}, true)
        );
      }
      return textResult(
        await requireLiveControl(args, "enqueueAnalysis", {
          projectId: requireString(args.projectId, "projectId")
        })
      );
    case "gideon_enqueue_render":
      if (hostedConfigFromArgs(args)) {
        return textResult(
          await hostedApiRequest(args, "POST", `/api/v1/projects/${encodeURIComponent(requireString(args.projectId, "projectId"))}/render-jobs`, {}, true)
        );
      }
      return textResult(
        await requireLiveControl(args, "enqueueRender", {
          projectId: requireString(args.projectId, "projectId")
        })
      );
    case "gideon_generate_video_edit_plan":
      return textResult(await generateVideoEditPlan(args));
    default:
      throw new Error(`Unknown Gideon tool: ${name}`);
  }
}

export function createVideoEditPlan(instruction: string, project?: GideonProject): Record<string, JsonValue> {
  const projectName = typeof project?.profile?.productName === "string" ? project.profile.productName : project?.name ?? "the product";
  const enabledMoments = (project?.moments ?? []).filter((moment) => moment.enabled !== false).slice(0, 3);
  return {
    projectName,
    instruction,
    approach: [
      "Inspect available moments, transcript, OCR, and current scripts before editing.",
      "Prefer edits that are grounded in visible UI proof or transcript evidence.",
      "Update hook and voiceover first; keep CTA specific and low-hype.",
      "Ask Gideon to render only after the user approves the edited script."
    ],
    suggestedMomentIds: enabledMoments.map((moment) => moment.id),
    editableFields: ["script.hook", "script.voiceoverText", "script.cta", "moment.label", "moment.evidence", "moment.enabled"],
    unavailableWithoutFutureTools: ["direct social posting", "billing changes", "workspace membership changes", "destructive deletion"]
  };
}

async function status(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const storePath = pathFromArgs(args);
  const controlSocketPath = controlSocketPathFromArgs(args);
  const hostedConfig = hostedConfigFromArgs(args);
  const hostedSession = hostedConfig ? await maybeHostedApiRequest(args, "GET", "/api/v1/auth/session") : null;
  const live = await maybeControlRequest(args, "status", {});
  let exists = false;
  let projectCount = 0;
  try {
    const state = await readState(storePath);
    exists = true;
    projectCount = state.projects?.length ?? 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return {
    server: "gideon-mcp",
    liveAppConnected: Boolean(live),
    liveApp: live ? sanitizeRecord(live) : {},
    hostedApiConfigured: Boolean(hostedConfig),
    hostedApiConnected: Boolean(hostedSession),
    hostedApi: hostedSession ? sanitizeRecord(hostedSession) : {},
    controlSocketPath,
    storePath,
    storeExists: exists,
    projectCount,
    apiKeyRequired: false
  };
}

async function listProjectsTool(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  if (hostedConfigFromArgs(args)) {
    return await hostedApiRequest(args, "GET", "/api/v1/projects");
  }
  const live = await maybeControlRequest(args, "listProjects", {});
  if (live) {
    return { mode: "live_app", state: sanitizeRecord(live) };
  }
  return { mode: "direct_store", ...listProjects(await readStateFromArgs(args)) };
}

async function getProjectTool(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const projectId = requireString(args.projectId, "projectId");
  if (hostedConfigFromArgs(args)) {
    return await hostedApiRequest(args, "GET", `/api/v1/projects/${encodeURIComponent(projectId)}/mcp-context`);
  }
  const live = await maybeControlRequest(args, "getProject", { projectId });
  if (live) {
    return { mode: "live_app", project: sanitizeRecord(live) };
  }
  const state = await readStateFromArgs(args);
  const project = requireProject(state, projectId);
  assertDirectStorePermission(state, project, "project:read");
  return { mode: "direct_store", ...projectPayload(state, project) };
}

async function getAuditLogTool(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  if (hostedConfigFromArgs(args)) {
    const projectId = requireString(args.projectId, "projectId");
    const context = await hostedApiRequest(args, "GET", `/api/v1/projects/${encodeURIComponent(projectId)}/mcp-context`);
    const project = context.project as Record<string, unknown> | undefined;
    const auditEvents = Array.isArray(project?.auditEvents) ? project.auditEvents : [];
    const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.max(1, Math.min(100, Math.floor(args.limit))) : 25;
    return { mode: "hosted_api", auditEvents: auditEvents.slice(-limit).reverse() as JsonValue[] };
  }
  const live = await maybeControlRequest(args, "listProjects", {});
  const state = live ? (live as GideonState) : await readStateFromArgs(args);
  const projectId = typeof args.projectId === "string" && args.projectId.trim() ? args.projectId.trim() : null;
  const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.max(1, Math.min(100, Math.floor(args.limit))) : 25;
  if (projectId) {
    const project = requireProject(state, projectId);
    assertDirectStorePermission(state, project, "project:read");
  }
  const events = (state.auditEvents ?? [])
    .filter((event) => !projectId || event.projectId === projectId)
    .slice(-limit)
    .reverse()
    .map((event) => sanitizeRecord(event));
  return { mode: live ? "live_app" : "direct_store", auditEvents: events };
}

async function updateScript(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  if (hostedConfigFromArgs(args)) {
    const projectId = requireString(args.projectId, "projectId");
    const scriptId = requireString(args.scriptId, "scriptId");
    const revision =
      optionalArgString(args.revision) ?? (await hostedEditableRevision(args, projectId, "scripts", scriptId));
    return await hostedApiRequest(
      args,
      "PATCH",
      `/api/v1/projects/${encodeURIComponent(projectId)}/scripts/${encodeURIComponent(scriptId)}`,
      {
        revision,
        hook: optionalControlValue(args.hook),
        voiceoverText: optionalControlValue(args.voiceoverText),
        cta: optionalControlValue(args.cta)
      },
      true
    );
  }
  const live = await maybeControlRequest(args, "updateScript", {
    projectId: requireString(args.projectId, "projectId"),
    scriptId: requireString(args.scriptId, "scriptId"),
    hook: optionalControlValue(args.hook),
    voiceoverText: optionalControlValue(args.voiceoverText),
    cta: optionalControlValue(args.cta)
  });
  if (live) {
    return { mode: "live_app", project: sanitizeRecord(live) };
  }
  const storePath = pathFromArgs(args);
  const projectId = requireString(args.projectId, "projectId");
  const scriptId = requireString(args.scriptId, "scriptId");
  const state = await readState(storePath);
  const project = requireProject(state, projectId);
  assertDirectStorePermission(state, project, "mcp:write");
  const script = (project.scripts ?? []).find((candidate) => candidate.id === scriptId);
  if (!script) {
    throw new Error(`Script ${scriptId} was not found.`);
  }
  if (typeof args.hook === "string") {
    script.hook = args.hook.trim();
  }
  if (typeof args.voiceoverText === "string") {
    script.voiceoverText = args.voiceoverText.trim();
  }
  if (typeof args.cta === "string") {
    script.cta = args.cta.trim();
  }
  script.updatedAt = new Date().toISOString();
  project.updatedAt = script.updatedAt;
  const changedFields = ["hook", "voiceoverText", "cta"].filter((field) => typeof args[field] === "string");
  appendMcpAudit(state, {
    project,
    action: "scripts.update",
    targetType: "script",
    targetId: scriptId,
    summary: `MCP updated script ${scriptId}.`,
    metadata: { changedFields: changedFields.join(",") }
  });
  await writeState(storePath, state);
  return {
    mode: "direct_store",
    projectId,
    scriptId,
    updatedAt: script.updatedAt,
    changedFields
  };
}

async function updateMoment(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  if (hostedConfigFromArgs(args)) {
    const projectId = requireString(args.projectId, "projectId");
    const momentId = requireString(args.momentId, "momentId");
    const revision =
      optionalArgString(args.revision) ?? (await hostedEditableRevision(args, projectId, "moments", momentId));
    return await hostedApiRequest(
      args,
      "PATCH",
      `/api/v1/projects/${encodeURIComponent(projectId)}/moments/${encodeURIComponent(momentId)}`,
      {
        revision,
        label: optionalControlValue(args.label),
        evidence: optionalControlValue(args.evidence),
        enabled: typeof args.enabled === "boolean" ? args.enabled : undefined
      },
      true
    );
  }
  const live = await maybeControlRequest(args, "updateMoment", {
    projectId: requireString(args.projectId, "projectId"),
    momentId: requireString(args.momentId, "momentId"),
    label: optionalControlValue(args.label),
    evidence: optionalControlValue(args.evidence),
    enabled: typeof args.enabled === "boolean" ? args.enabled : undefined
  });
  if (live) {
    return { mode: "live_app", project: sanitizeRecord(live) };
  }
  const storePath = pathFromArgs(args);
  const projectId = requireString(args.projectId, "projectId");
  const momentId = requireString(args.momentId, "momentId");
  const state = await readState(storePath);
  const project = requireProject(state, projectId);
  assertDirectStorePermission(state, project, "mcp:write");
  const moment = (project.moments ?? []).find((candidate) => candidate.id === momentId);
  if (!moment) {
    throw new Error(`Moment ${momentId} was not found.`);
  }
  if (typeof args.label === "string") {
    moment.label = args.label.trim();
  }
  if (typeof args.evidence === "string") {
    moment.evidence = args.evidence.trim();
  }
  if (typeof args.enabled === "boolean") {
    moment.enabled = args.enabled;
  }
  project.updatedAt = new Date().toISOString();
  const changedFields = ["label", "evidence", "enabled"].filter((field) => typeof args[field] !== "undefined");
  appendMcpAudit(state, {
    project,
    action: "moments.update",
    targetType: "moment",
    targetId: momentId,
    summary: `MCP updated moment ${momentId}.`,
    metadata: { changedFields: changedFields.join(",") }
  });
  await writeState(storePath, state);
  return {
    mode: "direct_store",
    projectId,
    momentId,
    updatedAt: project.updatedAt,
    changedFields
  };
}

async function generateVideoEditPlan(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const instruction = requireString(args.instruction, "instruction");
  let project: GideonProject | undefined;
  if (typeof args.projectId === "string") {
    if (hostedConfigFromArgs(args)) {
      const hosted = await hostedApiRequest(args, "GET", `/api/v1/projects/${encodeURIComponent(args.projectId)}/mcp-context`);
      project = hosted.project as GideonProject | undefined;
    } else {
      const live = await maybeControlRequest(args, "getProject", { projectId: args.projectId });
      project = live ? (live as GideonProject) : requireProject(await readStateFromArgs(args), args.projectId);
    }
  }
  return createVideoEditPlan(instruction, project);
}

async function readStateFromArgs(args: Record<string, unknown>): Promise<GideonState> {
  return readState(pathFromArgs(args));
}

async function readState(storePath: string): Promise<GideonState> {
  return JSON.parse(await fs.readFile(storePath, "utf8")) as GideonState;
}

async function writeState(storePath: string, state: GideonState): Promise<void> {
  const temporaryPath = `${storePath}.mcp.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2));
  await fs.rename(temporaryPath, storePath);
}

async function maybeControlRequest(
  args: Record<string, unknown>,
  method: string,
  params: Record<string, unknown>
): Promise<unknown | null> {
  try {
    return await controlRequest(controlSocketPathFromArgs(args), method, params);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ECONNREFUSED" || code === "EACCES") {
      return null;
    }
    return null;
  }
}

async function maybeHostedApiRequest(
  args: Record<string, unknown>,
  method: "GET" | "POST" | "PATCH",
  apiPath: string,
  body?: Record<string, unknown>,
  requiresCsrf = false
): Promise<Record<string, JsonValue> | null> {
  try {
    return await hostedApiRequest(args, method, apiPath, body, requiresCsrf);
  } catch {
    return null;
  }
}

async function hostedApiRequest(
  args: Record<string, unknown>,
  method: "GET" | "POST" | "PATCH",
  apiPath: string,
  body?: Record<string, unknown>,
  requiresCsrf = false
): Promise<Record<string, JsonValue>> {
  const config = requireHostedConfig(args);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Cookie: config.cookie
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (requiresCsrf) {
    headers["X-CSRF-Token"] = config.csrfToken ?? (await hostedCsrfToken(config));
  }
  const response = await fetch(new URL(apiPath, `${config.baseUrl}/`).toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Record<string, JsonValue>;
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.error?.code ?? `Hosted Gideon API request failed with ${response.status}.`);
  }
  return { mode: "hosted_api", ...(payload.data ?? {}) };
}

async function hostedCsrfToken(config: HostedMcpConfig): Promise<string> {
  const response = await fetch(new URL("/api/v1/auth/session", `${config.baseUrl}/`).toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: config.cookie
    }
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { csrfToken?: unknown };
    error?: { message?: string };
  };
  if (!response.ok || typeof payload.data?.csrfToken !== "string" || !payload.data.csrfToken.trim()) {
    throw new Error(payload.error?.message ?? "Hosted MCP mode could not discover a CSRF token from the active session.");
  }
  return payload.data.csrfToken.trim();
}

async function hostedEditableRevision(
  args: Record<string, unknown>,
  projectId: string,
  collection: "scripts" | "moments",
  id: string
): Promise<string> {
  const context = await hostedApiRequest(args, "GET", `/api/v1/projects/${encodeURIComponent(projectId)}/mcp-context`);
  const project = context.project as Record<string, unknown> | undefined;
  const records = project?.[collection];
  if (!Array.isArray(records)) {
    throw new Error(`Hosted MCP context did not include ${collection}.`);
  }
  const record = records.find((candidate) => {
    return Boolean(candidate && typeof candidate === "object" && (candidate as { id?: unknown }).id === id);
  }) as { revision?: unknown } | undefined;
  if (typeof record?.revision !== "string" || !record.revision.trim()) {
    throw new Error(`Hosted MCP context did not include a revision for ${collection.slice(0, -1)} ${id}.`);
  }
  return record.revision.trim();
}

function hostedConfigFromArgs(args: Record<string, unknown>): HostedMcpConfig | null {
  const baseUrl = optionalArgString(args.hostedApiBaseUrl) ?? optionalArgString(process.env.GIDEON_MCP_HOSTED_API_BASE_URL);
  if (!baseUrl) {
    return null;
  }
  const cookie =
    optionalArgString(args.hostedSessionCookie) ??
    optionalArgString(process.env.GIDEON_MCP_HOSTED_SESSION_COOKIE) ??
    hostedCookieFromToken(
      optionalArgString(args.hostedSessionToken) ?? optionalArgString(process.env.GIDEON_MCP_HOSTED_SESSION_TOKEN),
      optionalArgString(process.env.GIDEON_SESSION_COOKIE_NAME) ?? "gideon_session"
    );
  if (!cookie) {
    throw new Error("Hosted MCP mode requires hostedSessionCookie, GIDEON_MCP_HOSTED_SESSION_COOKIE, or GIDEON_MCP_HOSTED_SESSION_TOKEN.");
  }
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Hosted MCP API base URL must use http or https.");
  }
  return {
    baseUrl: parsed.toString().replace(/\/$/, ""),
    cookie,
    csrfToken: optionalArgString(args.hostedCsrfToken) ?? optionalArgString(process.env.GIDEON_MCP_HOSTED_CSRF_TOKEN)
  };
}

function requireHostedConfig(args: Record<string, unknown>): HostedMcpConfig {
  const config = hostedConfigFromArgs(args);
  if (!config) {
    throw new Error("Hosted MCP mode requires hostedApiBaseUrl or GIDEON_MCP_HOSTED_API_BASE_URL.");
  }
  return config;
}

function hostedCookieFromToken(token: string | undefined, cookieName: string): string | undefined {
  return token ? `${cookieName}=${token}` : undefined;
}

async function requireLiveControl(
  args: Record<string, unknown>,
  method: string,
  params: Record<string, unknown>
): Promise<Record<string, JsonValue>> {
  const result = await maybeControlRequest(args, method, params);
  if (!result) {
    throw new Error(
      `Gideon desktop app is not reachable at ${controlSocketPathFromArgs(args)}. Start the app before using ${method}.`
    );
  }
  return {
    mode: "live_app",
    project: sanitizeRecord(result)
  };
}

async function controlRequest(socketPath: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const id = Date.now();
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk;
      if (!response.includes("\n")) {
        return;
      }
      socket.end();
      const parsed = JSON.parse(response.trim()) as { result?: unknown; error?: { message?: string } };
      if (parsed.error) {
        reject(new Error(parsed.error.message ?? "Gideon control request failed."));
      } else {
        resolve(parsed.result);
      }
    });
    socket.on("error", reject);
  });
}

function listProjects(state: GideonState): Record<string, JsonValue> {
  return {
    activeProjectId: state.activeProjectId ?? null,
    projects: (state.projects ?? []).map((project) => ({
      id: project.id,
      name: project.name ?? "",
      status: project.status ?? "unknown",
      updatedAt: project.updatedAt ?? "",
      moments: project.moments?.length ?? 0,
      scripts: project.scripts?.length ?? 0,
      renders: project.renders?.length ?? 0,
      jobs: project.jobs?.length ?? 0
    }))
  };
}

function projectPayload(state: GideonState, project: GideonProject): Record<string, JsonValue> {
  return {
    id: project.id,
    name: project.name ?? "",
    status: project.status ?? "unknown",
    profile: sanitizeRecord(project.profile),
    recording: sanitizeRecord(project.recording),
    moments: (project.moments ?? []).map((moment) => sanitizeRecord(moment)),
    frameEvidence: (project.frameEvidence ?? []).map((frame) => sanitizeRecord(frame)),
    scripts: (project.scripts ?? []).map((script) => sanitizeRecord(script)),
    renders: (project.renders ?? []).map((render) => sanitizeRecord(render)),
    jobs: (project.jobs ?? []).map((job) => sanitizeRecord(job)),
    jobEvents: (project.jobEvents ?? []).slice(-20).map((event) => sanitizeRecord(event)),
    providerRuns: (project.providerRuns ?? []).map((run) => sanitizeRecord(run)),
    auditEvents: (state.auditEvents ?? [])
      .filter((event) => event.projectId === project.id)
      .slice(-10)
      .map((event) => sanitizeRecord(event))
  };
}

function requireProject(state: GideonState, projectId: string): GideonProject {
  const project = (state.projects ?? []).find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }
  return project;
}

function assertDirectStorePermission(state: GideonState, project: GideonProject, action: "project:read" | "mcp:write"): void {
  if (!state.workspaceMembers?.length) {
    return;
  }
  const workspaceId = project.workspaceId ?? state.activeWorkspaceId ?? "local-workspace";
  const userId = state.activeUserId ?? "local-user";
  const member = state.workspaceMembers.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId
  );
  if (!member) {
    throw new Error("The active user is not a member of this workspace.");
  }
  if (!directRoleAllows(member.role, action)) {
    throw new Error(`Workspace role ${member.role} cannot perform ${action}.`);
  }
}

function directRoleAllows(role: GideonWorkspaceMember["role"], action: "project:read" | "mcp:write"): boolean {
  if (role === "owner" || role === "admin") {
    return true;
  }
  if (role === "editor") {
    return true;
  }
  return action === "project:read" && role === "viewer";
}

function appendMcpAudit(
  state: GideonState,
  input: {
    project: GideonProject;
    action: string;
    targetType: string;
    targetId?: string;
    summary: string;
    metadata?: Record<string, JsonValue>;
  }
): GideonAuditEvent {
  const workspaceId = input.project.workspaceId ?? state.activeWorkspaceId ?? "local-workspace";
  const event: GideonAuditEvent = {
    id: randomUUID(),
    workspaceId,
    projectId: input.project.id,
    actorUserId: state.activeUserId ?? "local-user",
    actorType: "mcp_agent",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    metadata: input.metadata,
    createdAt: new Date().toISOString()
  };
  state.auditEvents = [...(state.auditEvents ?? []), event].slice(-500);
  return event;
}

function pathFromArgs(args: Record<string, unknown>): string {
  return typeof args.storePath === "string" && args.storePath.trim()
    ? args.storePath.trim()
    : resolveStorePath();
}

function controlSocketPathFromArgs(args: Record<string, unknown>): string {
  return typeof args.controlSocketPath === "string" && args.controlSocketPath.trim()
    ? args.controlSocketPath.trim()
    : resolveControlSocketPath();
}

function optionalControlValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalArgString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(description: string): Record<string, string> {
  return { type: "string", description };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

function sanitizeRecord(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;
}

function textResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

async function handleMessage(message: JsonRpcMessage): Promise<Record<string, unknown> | null> {
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  if (!message.method) {
    return hasId ? errorResponse(message.id ?? null, -32600, "Invalid request.") : null;
  }
  try {
    if (message.method === "initialize") {
      return hasId
        ? resultResponse(message.id ?? null, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "gideon-mcp", version: "0.1.0" }
          })
        : null;
    }
    if (message.method === "tools/list") {
      return hasId ? resultResponse(message.id ?? null, { tools }) : null;
    }
    if (message.method === "tools/call") {
      const params = message.params ?? {};
      const name = requireString(params.name, "tool name");
      const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
      return hasId ? resultResponse(message.id ?? null, await callTool(name, args)) : null;
    }
    if (message.method === "ping") {
      return hasId ? resultResponse(message.id ?? null, {}) : null;
    }
    return hasId ? errorResponse(message.id ?? null, -32601, `Unknown method: ${message.method}`) : null;
  } catch (error) {
    return hasId ? errorResponse(message.id ?? null, -32000, error instanceof Error ? error.message : "Tool failed.") : null;
  }
}

function resultResponse(id: string | number | null, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function startStdioServer(): void {
  const lines = readline.createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    void (async () => {
      if (!line.trim()) {
        return;
      }
      const response = await handleMessage(JSON.parse(line) as JsonRpcMessage);
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    })().catch((error) => {
      process.stdout.write(`${JSON.stringify(errorResponse(null, -32700, error instanceof Error ? error.message : "Parse error."))}\n`);
    });
  });
}

if (require.main === module) {
  startStdioServer();
}
