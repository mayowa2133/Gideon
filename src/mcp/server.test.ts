import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callTool, createVideoEditPlan, resolveControlSocketPath, resolveStorePath } from "./server";

describe("Gideon MCP server tools", () => {
  it("resolves the store path from environment without requiring API keys", () => {
    expect(resolveStorePath({ GIDEON_STORE_PATH: "/tmp/gideon-store.json" }, "/home/test")).toBe("/tmp/gideon-store.json");
    expect(resolveStorePath({ GIDEON_USER_DATA_DIR: "/tmp/gideon" }, "/home/test")).toBe("/tmp/gideon/gideon-store.json");
    expect(resolveControlSocketPath({ GIDEON_CONTROL_SOCKET: "/tmp/gideon.sock" }, "/home/test")).toBe("/tmp/gideon.sock");
  });

  it("lists projects and applies bounded script edits", async () => {
    const storePath = await writeStore({
      activeProjectId: "project-1",
      projects: [
        {
          id: "project-1",
          name: "Launch demo",
          status: "script_review",
          updatedAt: "2026-06-25T00:00:00.000Z",
          scripts: [
            {
              id: "script-1",
              hook: "Old hook",
              voiceoverText: "Old voiceover",
              cta: "Old CTA",
              updatedAt: "2026-06-25T00:00:00.000Z"
            }
          ],
          moments: []
        }
      ]
    });

    const list = await callTool("gideon_list_projects", { storePath });
    expect(list.content[0]?.text).toContain("Launch demo");

    const edit = await callTool("gideon_update_script", {
      storePath,
      projectId: "project-1",
      scriptId: "script-1",
      hook: "Show the result first",
      cta: "Try the workflow today"
    });
    expect(edit.content[0]?.text).toContain("script-1");
    const saved = JSON.parse(await fs.readFile(storePath, "utf8")) as {
      projects: Array<{ scripts: Array<{ hook: string; voiceoverText: string; cta: string }> }>;
      auditEvents?: Array<{ actorType: string; action: string; targetId: string }>;
    };
    expect(saved.projects[0]?.scripts[0]).toMatchObject({
      hook: "Show the result first",
      voiceoverText: "Old voiceover",
      cta: "Try the workflow today"
    });
    expect(saved.auditEvents?.[0]).toMatchObject({
      actorType: "mcp_agent",
      action: "scripts.update",
      targetId: "script-1"
    });
    const audit = await callTool("gideon_get_audit_log", { storePath, projectId: "project-1" });
    expect(audit.content[0]?.text).toContain("scripts.update");
  });

  it("updates moment fields and creates deterministic edit plans", async () => {
    const storePath = await writeStore({
      projects: [
        {
          id: "project-1",
          name: "Launch demo",
          profile: { productName: "Gideon" },
          moments: [{ id: "moment-1", label: "Setup", evidence: "Old", enabled: true }]
        }
      ]
    });

    await callTool("gideon_update_moment", {
      storePath,
      projectId: "project-1",
      momentId: "moment-1",
      label: "Proof screen",
      enabled: false
    });
    const project = await callTool("gideon_get_project", { storePath, projectId: "project-1" });
    expect(project.content[0]?.text).toContain("Proof screen");
    expect(project.content[0]?.text).toContain('"enabled": false');

    const plan = createVideoEditPlan("Make this punchier", {
      id: "project-1",
      name: "Launch demo",
      profile: { productName: "Gideon" },
      moments: [{ id: "moment-1", enabled: true }]
    });
    expect(plan).toMatchObject({
      projectName: "Gideon",
      instruction: "Make this punchier",
      suggestedMomentIds: ["moment-1"]
    });
  });

  it("rejects direct MCP writes when the active workspace role is read-only", async () => {
    const storePath = await writeStore({
      activeUserId: "user-1",
      activeWorkspaceId: "workspace-1",
      workspaceMembers: [{ workspaceId: "workspace-1", userId: "user-1", role: "viewer" }],
      projects: [
        {
          id: "project-1",
          workspaceId: "workspace-1",
          name: "Launch demo",
          scripts: [{ id: "script-1", hook: "Old hook" }]
        }
      ]
    });

    await expect(
      callTool("gideon_update_script", {
        storePath,
        projectId: "project-1",
        scriptId: "script-1",
        hook: "Not allowed"
      })
    ).rejects.toThrow("cannot perform mcp:write");

    const project = await callTool("gideon_get_project", { storePath, projectId: "project-1" });
    expect(project.content[0]?.text).toContain("Launch demo");
  });

  it("prefers the live app control bridge when available", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-mcp-bridge-"));
    const controlSocketPath = path.join(dir, "control.sock");
    const calls: string[] = [];
    const server = await startFakeControlServer(controlSocketPath, (method) => {
      calls.push(method);
      if (method === "listProjects") {
        return { activeProjectId: "project-1", projects: [{ id: "project-1", name: "Live project" }] };
      }
      if (method === "updateScript") {
        return { id: "project-1", scripts: [{ id: "script-1", hook: "Live hook" }] };
      }
      if (method === "enqueueRender") {
        return { id: "project-1", jobs: [{ id: "job-1", kind: "render", status: "queued" }] };
      }
      return { ok: true };
    });

    try {
      const listed = await callTool("gideon_list_projects", { controlSocketPath });
      expect(listed.content[0]?.text).toContain("live_app");
      expect(listed.content[0]?.text).toContain("Live project");

      const edited = await callTool("gideon_update_script", {
        controlSocketPath,
        projectId: "project-1",
        scriptId: "script-1",
        hook: "Live hook"
      });
      expect(edited.content[0]?.text).toContain("Live hook");

      const enqueued = await callTool("gideon_enqueue_render", { controlSocketPath, projectId: "project-1" });
      expect(enqueued.content[0]?.text).toContain("queued");
      expect(calls).toEqual(["listProjects", "updateScript", "enqueueRender"]);
    } finally {
      server.close();
    }
  });
});

async function writeStore(state: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-mcp-"));
  const storePath = path.join(dir, "gideon-store.json");
  await fs.writeFile(storePath, JSON.stringify(state, null, 2));
  return storePath;
}

async function startFakeControlServer(
  socketPath: string,
  handler: (method: string, params: Record<string, unknown>) => unknown
): Promise<net.Server> {
  const server = net.createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      const line = buffer.split("\n")[0];
      if (!line) {
        return;
      }
      const request = JSON.parse(line) as { id: string | number; method: string; params?: Record<string, unknown> };
      socket.write(`${JSON.stringify({ id: request.id, result: handler(request.method, request.params ?? {}) })}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
