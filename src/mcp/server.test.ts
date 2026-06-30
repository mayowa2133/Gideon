import fs from "node:fs/promises";
import http from "node:http";
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

  it("uses hosted API mode for authenticated project inspection, edits, and job enqueueing", async () => {
    const calls: Array<{ method: string; url: string; cookie?: string; csrf?: string; body?: unknown }> = [];
    const hosted = await startFakeHostedApiServer(calls);

    try {
      const common = {
        hostedApiBaseUrl: hosted.baseUrl,
        hostedSessionCookie: "gideon_session=session-token"
      };

      const listed = await callTool("gideon_list_projects", common);
      expect(listed.content[0]?.text).toContain("hosted_api");
      expect(listed.content[0]?.text).toContain("Hosted project");

      const project = await callTool("gideon_get_project", { ...common, projectId: "project-1" });
      expect(project.content[0]?.text).toContain("Hosted hook");
      expect(project.content[0]?.text).not.toContain("session-token");

      const edited = await callTool("gideon_update_script", {
        ...common,
        projectId: "project-1",
        scriptId: "script-1",
        hook: "Hosted edit"
      });
      expect(edited.content[0]?.text).toContain("Hosted edit");

      const enqueued = await callTool("gideon_enqueue_render", { ...common, projectId: "project-1" });
      expect(enqueued.content[0]?.text).toContain("job-render-1");
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "GET", url: "/api/v1/projects" }),
          expect.objectContaining({ method: "GET", url: "/api/v1/projects/project-1/mcp-context" }),
          expect.objectContaining({
            method: "PATCH",
            url: "/api/v1/projects/project-1/scripts/script-1",
            cookie: "gideon_session=session-token",
            csrf: "csrf-hosted"
          }),
          expect.objectContaining({
            method: "POST",
            url: "/api/v1/projects/project-1/render-jobs",
            csrf: "csrf-hosted"
          })
        ])
      );
    } finally {
      await hosted.close();
    }
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

async function startFakeHostedApiServer(
  calls: Array<{ method: string; url: string; cookie?: string; csrf?: string; body?: unknown }>
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const body = rawBody ? JSON.parse(rawBody) : undefined;
      calls.push({
        method: request.method ?? "GET",
        url: request.url ?? "/",
        cookie: request.headers.cookie,
        csrf: request.headers["x-csrf-token"] as string | undefined,
        body
      });
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/v1/auth/session") {
        response.end(JSON.stringify({ data: { csrfToken: "csrf-hosted" }, meta: { requestId: "req_hosted" } }));
        return;
      }
      if (request.method === "GET" && request.url === "/api/v1/projects") {
        response.end(
          JSON.stringify({
            data: { projects: [{ id: "project-1", name: "Hosted project", status: "script_review" }] },
            meta: { requestId: "req_hosted" }
          })
        );
        return;
      }
      if (request.method === "GET" && request.url === "/api/v1/projects/project-1/mcp-context") {
        response.end(
          JSON.stringify({
            data: {
              project: {
                id: "project-1",
                name: "Hosted project",
                scripts: [{ id: "script-1", hook: "Hosted hook", voiceoverText: "Hosted VO", cta: "Hosted CTA" }],
                moments: [{ id: "moment-1", label: "Hosted moment", enabled: true }],
                auditEvents: []
              }
            },
            meta: { requestId: "req_hosted" }
          })
        );
        return;
      }
      if (request.method === "PATCH" && request.url === "/api/v1/projects/project-1/scripts/script-1") {
        response.end(
          JSON.stringify({
            data: {
              project: {
                id: "project-1",
                scripts: [{ id: "script-1", hook: body?.hook ?? "Hosted hook" }]
              }
            },
            meta: { requestId: "req_hosted" }
          })
        );
        return;
      }
      if (request.method === "POST" && request.url === "/api/v1/projects/project-1/render-jobs") {
        response.statusCode = 202;
        response.end(
          JSON.stringify({
            data: {
              renderJob: { id: "job-render-1", projectId: "project-1", status: "queued" },
              job: { id: "job-render-1", kind: "render", status: "queued" }
            },
            meta: { requestId: "req_hosted" }
          })
        );
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { message: "not found" }, meta: { requestId: "req_hosted" } }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fake hosted API server did not bind to a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
