import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCaptureRuntimeSession, destroyCaptureRuntimeSession, resolveCaptureSessionPath } from "./captureRuntimeSession";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("capture runtime session", () => {
  it("creates private workspace-scoped state and destroys every residue", async () => {
    const root = await temporaryRoot();
    const session = await createCaptureRuntimeSession(root, "workspace-a", "execution-1");
    await fs.writeFile(path.join(session.profileDir, "Cookies"), "cookie");
    await fs.writeFile(path.join(session.cacheDir, "entry"), "cache");
    await fs.writeFile(session.clipboardPath, "private clipboard");
    expect((await fs.stat(session.root)).mode & 0o777).toBe(0o700);
    await destroyCaptureRuntimeSession(session);
    await expect(fs.stat(session.root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects cross-workspace access, traversal, duplicate sessions, and symlink roots", async () => {
    const root = await temporaryRoot();
    const session = await createCaptureRuntimeSession(root, "workspace-a", "execution-1");
    expect(() => resolveCaptureSessionPath(session, "workspace-b", "output", "clip.webm")).toThrow("workspace boundary");
    expect(() => resolveCaptureSessionPath(session, "workspace-a", "..", "workspace-b")).toThrow("escapes");
    await expect(createCaptureRuntimeSession(root, "workspace-a", "execution-1")).rejects.toMatchObject({ code: "EEXIST" });
    await destroyCaptureRuntimeSession(session);

    const target = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-session-target-")); roots.push(target);
    const link = path.join(path.dirname(root), `gideon-session-link-${Date.now()}`); roots.push(link);
    await fs.symlink(target, link);
    await expect(createCaptureRuntimeSession(link, "workspace-a", "execution-2")).rejects.toThrow("private directory");
  });
});

async function temporaryRoot(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-session-test-"));
  roots.push(parent);
  return path.join(parent, "sessions");
}
