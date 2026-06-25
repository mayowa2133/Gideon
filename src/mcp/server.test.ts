import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callTool, createVideoEditPlan, resolveStorePath } from "./server";

describe("Gideon MCP server tools", () => {
  it("resolves the store path from environment without requiring API keys", () => {
    expect(resolveStorePath({ GIDEON_STORE_PATH: "/tmp/gideon-store.json" }, "/home/test")).toBe("/tmp/gideon-store.json");
    expect(resolveStorePath({ GIDEON_USER_DATA_DIR: "/tmp/gideon" }, "/home/test")).toBe("/tmp/gideon/gideon-store.json");
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
    };
    expect(saved.projects[0]?.scripts[0]).toMatchObject({
      hook: "Show the result first",
      voiceoverText: "Old voiceover",
      cta: "Try the workflow today"
    });
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
});

async function writeStore(state: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-mcp-"));
  const storePath = path.join(dir, "gideon-store.json");
  await fs.writeFile(storePath, JSON.stringify(state, null, 2));
  return storePath;
}
