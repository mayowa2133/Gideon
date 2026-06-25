import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startGideonControlServer } from "./controlServer";
import type { AppState, Project } from "../shared/types";

describe("Gideon control server", () => {
  it("handles JSON-line control requests over a local socket", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-control-"));
    const socketPath = path.join(dir, "control.sock");
    const project = {
      id: "project-1",
      name: "Demo",
      scripts: [{ id: "script-1", hook: "Old" }],
      moments: [{ id: "moment-1", label: "Old moment" }]
    } as Project;
    const state = {
      activeProjectId: "project-1",
      projects: [project]
    } as AppState;
    const server = await startGideonControlServer({
      socketPath,
      handlers: {
        status: async () => ({ ok: true }),
        listProjects: async () => state,
        getProject: async () => project,
        updateScript: async (input) => {
          project.scripts = project.scripts.map((script) =>
            script.id === input.scriptId ? { ...script, hook: input.hook ?? script.hook } : script
          );
          return project;
        },
        updateMoment: async () => project,
        enqueueAnalysis: async () => project,
        enqueueRender: async () => project
      }
    });

    try {
      const status = await request(socketPath, { id: 1, method: "status", params: {} });
      expect(status.result).toEqual({ ok: true });
      const edit = await request(socketPath, {
        id: 2,
        method: "updateScript",
        params: { projectId: "project-1", scriptId: "script-1", hook: "New hook" }
      });
      expect(JSON.stringify(edit.result)).toContain("New hook");
    } finally {
      server.close();
    }
  });
});

async function request(socketPath: string, payload: unknown): Promise<{ result?: unknown; error?: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.includes("\n")) {
        socket.end();
        resolve(JSON.parse(response.trim()) as { result?: unknown; error?: unknown });
      }
    });
    socket.on("error", reject);
  });
}
