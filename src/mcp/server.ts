import fs from "node:fs/promises";
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
  activeProjectId?: string | null;
  [key: string]: unknown;
}

interface GideonProject {
  id: string;
  name?: string;
  status?: string;
  updatedAt?: string;
  profile?: Record<string, unknown>;
  recording?: Record<string, unknown>;
  moments?: GideonMoment[];
  scripts?: GideonScript[];
  renders?: Array<Record<string, unknown>>;
  jobs?: Array<Record<string, unknown>>;
  providerRuns?: Array<Record<string, unknown>>;
  frameEvidence?: Array<Record<string, unknown>>;
  [key: string]: unknown;
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

const tools = [
  {
    name: "gideon_status",
    description: "Check whether the local Gideon store is reachable. No provider API keys are required.",
    inputSchema: objectSchema({
      storePath: optionalString("Explicit path to gideon-store.json. Defaults to GIDEON_STORE_PATH or the macOS app data path.")
    })
  },
  {
    name: "gideon_list_projects",
    description: "List local Gideon projects with high-level status for agent review.",
    inputSchema: objectSchema({
      storePath: optionalString("Explicit path to gideon-store.json.")
    })
  },
  {
    name: "gideon_get_project",
    description: "Inspect one Gideon project including profile, evidence, scripts, renders, and jobs.",
    inputSchema: objectSchema({
      projectId: { type: "string", description: "Gideon project ID." },
      storePath: optionalString("Explicit path to gideon-store.json.")
    }, ["projectId"])
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
      storePath: optionalString("Explicit path to gideon-store.json.")
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
      storePath: optionalString("Explicit path to gideon-store.json.")
    }, ["projectId", "momentId"])
  },
  {
    name: "gideon_generate_video_edit_plan",
    description: "Create a deterministic edit plan from a user instruction and optional project context.",
    inputSchema: objectSchema({
      instruction: { type: "string", description: "User's desired edit or marketing outcome." },
      projectId: optionalString("Optional project ID to ground the plan."),
      storePath: optionalString("Explicit path to gideon-store.json.")
    }, ["instruction"])
  }
];

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
      return textResult(listProjects(await readStateFromArgs(args)));
    case "gideon_get_project":
      return textResult(getProject(await readStateFromArgs(args), requireString(args.projectId, "projectId")));
    case "gideon_update_script":
      return textResult(await updateScript(args));
    case "gideon_update_moment":
      return textResult(await updateMoment(args));
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
    storePath,
    storeExists: exists,
    projectCount,
    apiKeyRequired: false
  };
}

async function updateScript(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const storePath = pathFromArgs(args);
  const projectId = requireString(args.projectId, "projectId");
  const scriptId = requireString(args.scriptId, "scriptId");
  const state = await readState(storePath);
  const project = requireProject(state, projectId);
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
  await writeState(storePath, state);
  return {
    projectId,
    scriptId,
    updatedAt: script.updatedAt,
    changedFields: ["hook", "voiceoverText", "cta"].filter((field) => typeof args[field] === "string")
  };
}

async function updateMoment(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const storePath = pathFromArgs(args);
  const projectId = requireString(args.projectId, "projectId");
  const momentId = requireString(args.momentId, "momentId");
  const state = await readState(storePath);
  const project = requireProject(state, projectId);
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
  await writeState(storePath, state);
  return {
    projectId,
    momentId,
    updatedAt: project.updatedAt,
    changedFields: ["label", "evidence", "enabled"].filter((field) => typeof args[field] !== "undefined")
  };
}

async function generateVideoEditPlan(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  const instruction = requireString(args.instruction, "instruction");
  let project: GideonProject | undefined;
  if (typeof args.projectId === "string") {
    project = requireProject(await readStateFromArgs(args), args.projectId);
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

function getProject(state: GideonState, projectId: string): Record<string, JsonValue> {
  const project = requireProject(state, projectId);
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
    providerRuns: (project.providerRuns ?? []).map((run) => sanitizeRecord(run))
  };
}

function requireProject(state: GideonState, projectId: string): GideonProject {
  const project = (state.projects ?? []).find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }
  return project;
}

function pathFromArgs(args: Record<string, unknown>): string {
  return typeof args.storePath === "string" && args.storePath.trim()
    ? args.storePath.trim()
    : resolveStorePath();
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
