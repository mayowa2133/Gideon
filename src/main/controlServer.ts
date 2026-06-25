import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { AppState, Project } from "../shared/types";

export interface ControlUpdateScriptInput {
  projectId: string;
  scriptId: string;
  hook?: string;
  voiceoverText?: string;
  cta?: string;
}

export interface ControlUpdateMomentInput {
  projectId: string;
  momentId: string;
  label?: string;
  evidence?: string;
  enabled?: boolean;
}

export interface GideonControlHandlers {
  status: () => Promise<Record<string, unknown>>;
  listProjects: () => Promise<AppState>;
  getProject: (projectId: string) => Promise<Project>;
  updateScript: (input: ControlUpdateScriptInput) => Promise<Project>;
  updateMoment: (input: ControlUpdateMomentInput) => Promise<Project>;
  enqueueAnalysis: (projectId: string) => Promise<Project>;
  enqueueRender: (projectId: string) => Promise<Project>;
}

interface ControlRequest {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function startGideonControlServer(input: {
  socketPath: string;
  handlers: GideonControlHandlers;
}): Promise<net.Server> {
  await prepareSocketPath(input.socketPath);
  const server = net.createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        void handleLine(socket, input.handlers, line);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function handleLine(socket: net.Socket, handlers: GideonControlHandlers, line: string): Promise<void> {
  if (!line.trim()) {
    return;
  }
  let request: ControlRequest;
  try {
    request = JSON.parse(line) as ControlRequest;
  } catch {
    socket.write(`${JSON.stringify({ id: null, error: { message: "Invalid JSON request." } })}\n`);
    return;
  }
  try {
    socket.write(`${JSON.stringify({ id: request.id ?? null, result: await dispatch(handlers, request) })}\n`);
  } catch (error) {
    socket.write(
      `${JSON.stringify({
        id: request.id ?? null,
        error: { message: error instanceof Error ? error.message : "Gideon control request failed." }
      })}\n`
    );
  }
}

async function dispatch(handlers: GideonControlHandlers, request: ControlRequest): Promise<unknown> {
  const params = request.params ?? {};
  switch (request.method) {
    case "status":
      return handlers.status();
    case "listProjects":
      return handlers.listProjects();
    case "getProject":
      return handlers.getProject(requireString(params.projectId, "projectId"));
    case "updateScript":
      return handlers.updateScript({
        projectId: requireString(params.projectId, "projectId"),
        scriptId: requireString(params.scriptId, "scriptId"),
        hook: optionalString(params.hook),
        voiceoverText: optionalString(params.voiceoverText),
        cta: optionalString(params.cta)
      });
    case "updateMoment":
      return handlers.updateMoment({
        projectId: requireString(params.projectId, "projectId"),
        momentId: requireString(params.momentId, "momentId"),
        label: optionalString(params.label),
        evidence: optionalString(params.evidence),
        enabled: typeof params.enabled === "boolean" ? params.enabled : undefined
      });
    case "enqueueAnalysis":
      return handlers.enqueueAnalysis(requireString(params.projectId, "projectId"));
    case "enqueueRender":
      return handlers.enqueueRender(requireString(params.projectId, "projectId"));
    default:
      throw new Error(`Unknown Gideon control method: ${request.method ?? "missing"}`);
  }
}

async function prepareSocketPath(socketPath: string): Promise<void> {
  await fs.mkdir(path.dirname(socketPath), { recursive: true });
  try {
    await fs.unlink(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}
