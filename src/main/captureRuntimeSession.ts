import fs from "node:fs/promises";
import path from "node:path";

export interface CaptureRuntimeSession {
  id: string;
  workspaceId: string;
  root: string;
  profileDir: string;
  cacheDir: string;
  tempDir: string;
  outputDir: string;
  clipboardPath: string;
}

export async function createCaptureRuntimeSession(root: string, workspaceId: string, executionId: string): Promise<CaptureRuntimeSession> {
  const safeWorkspace = safeSegment(workspaceId, "workspace");
  const safeExecution = safeSegment(executionId, "execution");
  const base = path.resolve(root);
  await assertPrivateRoot(base);
  const workspaceRoot = resolveInside(base, safeWorkspace);
  try { await fs.mkdir(workspaceRoot, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const workspaceStat = await fs.lstat(workspaceRoot);
  if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) throw new Error("Capture workspace root must be a private directory.");
  const sessionRoot = resolveInside(workspaceRoot, safeExecution);
  await fs.mkdir(sessionRoot, { recursive: false, mode: 0o700 });
  const session = {
    id: safeExecution,
    workspaceId: safeWorkspace,
    root: sessionRoot,
    profileDir: path.join(sessionRoot, "profile"),
    cacheDir: path.join(sessionRoot, "cache"),
    tempDir: path.join(sessionRoot, "tmp"),
    outputDir: path.join(sessionRoot, "output"),
    clipboardPath: path.join(sessionRoot, "clipboard")
  };
  await Promise.all([session.profileDir, session.cacheDir, session.tempDir, session.outputDir].map((directory) => fs.mkdir(directory, { mode: 0o700 })));
  await fs.writeFile(session.clipboardPath, "", { mode: 0o600, flag: "wx" });
  return session;
}

export function resolveCaptureSessionPath(session: CaptureRuntimeSession, workspaceId: string, ...segments: string[]): string {
  if (safeSegment(workspaceId, "workspace") !== session.workspaceId) throw new Error("Capture session workspace boundary violation.");
  return resolveInside(session.root, ...segments);
}

export async function destroyCaptureRuntimeSession(session: CaptureRuntimeSession): Promise<void> {
  await fs.rm(session.root, { recursive: true, force: true });
  try { await fs.lstat(session.root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Capture runtime session teardown did not complete.");
}

async function assertPrivateRoot(root: string): Promise<void> {
  let stat;
  try { stat = await fs.lstat(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    stat = await fs.lstat(root);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Capture session root must be a private directory.");
  await fs.chmod(root, 0o700);
}

function resolveInside(root: string, ...segments: string[]): string {
  const resolved = path.resolve(root, ...segments);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Capture session path escapes its private root.");
  return resolved;
}

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value) || value === "." || value === "..") throw new Error(`Capture ${label} identifier is invalid.`);
  return value;
}
