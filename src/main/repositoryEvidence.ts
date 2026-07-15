import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { RepositoryEvidence } from "./flowDiscovery";
import { stableSerialize } from "./productFlowCompiler";

export interface RepositoryEvidenceManifest {
  schemaVersion: "1";
  extractorVersion: "repository-evidence-v1";
  filesInspected: number;
  bytesInspected: number;
  excludedPaths: number;
  evidenceHash: string;
  createdAt: string;
}

const excludedNames = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".env", ".env.local", ".env.production", ".env.development"]);
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".json"]);

export async function extractRepositoryEvidence(input: {
  rootDir: string;
  maxFiles?: number;
  maxBytes?: number;
  maxFileBytes?: number;
  now?: () => string;
}): Promise<{ evidence: RepositoryEvidence; manifest: RepositoryEvidenceManifest }> {
  const root = path.resolve(input.rootDir);
  const limits = { files: input.maxFiles ?? 2_000, bytes: input.maxBytes ?? 10_000_000, fileBytes: input.maxFileBytes ?? 250_000 };
  const state = { files: 0, bytes: 0, excluded: 0 };
  const routes = new Map<string, { path: string; label?: string }>();
  const tests: RepositoryEvidence["tests"] = [];
  const flags = new Set<string>();
  for (const filePath of await walk(root, root, limits.files * 3, state)) {
    if (state.files >= limits.files || state.bytes >= limits.bytes) break;
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limits.fileBytes || stat.size + state.bytes > limits.bytes) { state.excluded += 1; continue; }
    const extension = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.has(extension)) { state.excluded += 1; continue; }
    const relative = path.relative(root, filePath).replace(/\\/g, "/");
    if (looksSecret(relative)) { state.excluded += 1; continue; }
    const content = await fs.readFile(filePath, "utf8");
    state.files += 1;
    state.bytes += Buffer.byteLength(content);
    const fileRoute = routeFromAppPath(relative);
    if (fileRoute) routes.set(fileRoute, { path: fileRoute, label: labelFromRoute(fileRoute) });
    for (const match of content.matchAll(/(?:href|to|path)\s*[=:]\s*["'`]((?:\/)[^"'`?# ]*)["'`]/g)) {
      if (match[1]) routes.set(normalizeRoute(match[1]), { path: normalizeRoute(match[1]) });
    }
    if (/\.(?:test|spec)\.[jt]sx?$/.test(relative)) {
      for (const match of content.matchAll(/(?:test|it)\s*\(\s*["'`]([^"'`]{1,200})["'`]/g)) {
        const routePaths = [...content.matchAll(/["'`]((?:\/)[a-zA-Z0-9_:/.-]+)["'`]/g)].map((item) => normalizeRoute(item[1]!)).slice(0, 50);
        tests.push({ id: `repo-test:${sha256(`${relative}:${match.index}:${match[1]}`).slice(0, 24)}`, title: match[1]!, routePaths: [...new Set(routePaths)] });
        if (tests.length >= 200) break;
      }
    }
    for (const match of content.matchAll(/(?:featureFlag|feature_flag|flagKey|isEnabled)\s*\(\s*["'`]([a-zA-Z0-9._-]{1,120})["'`]/g)) if (match[1]) flags.add(match[1]);
  }
  const evidence: RepositoryEvidence = { routePaths: [...routes.values()].slice(0, 500), tests: tests.slice(0, 200), featureFlagIds: [...flags].sort().slice(0, 200) };
  return {
    evidence,
    manifest: { schemaVersion: "1", extractorVersion: "repository-evidence-v1", filesInspected: state.files, bytesInspected: state.bytes, excludedPaths: state.excluded, evidenceHash: sha256(stableSerialize(evidence)), createdAt: input.now?.() ?? new Date().toISOString() }
  };
}

async function walk(root: string, current: string, maxEntries: number, state: { excluded: number }): Promise<string[]> {
  const output: string[] = [];
  if (output.length >= maxEntries) return output;
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (output.length >= maxEntries) break;
    if (excludedNames.has(entry.name) || entry.name.startsWith(".env") || entry.isSymbolicLink()) { state.excluded += 1; continue; }
    const target = path.join(current, entry.name);
    const resolved = path.resolve(target);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) { state.excluded += 1; continue; }
    if (entry.isDirectory()) output.push(...await walk(root, target, maxEntries - output.length, state));
    else output.push(target);
  }
  return output;
}

function routeFromAppPath(relative: string): string | null {
  const match = relative.match(/(?:^|\/)app\/(.+)\/(?:page|route)\.[jt]sx?$/);
  if (!match?.[1]) return relative.match(/(?:^|\/)app\/(?:page|route)\.[jt]sx?$/) ? "/" : null;
  const segments = match[1].split("/").filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));
  return `/${segments.map((segment) => segment.match(/^\[.+\]$/) ? ":id" : segment).join("/")}`;
}

function normalizeRoute(value: string): string {
  const route = value.split(/[?#]/, 1)[0]!.replace(/\/+/g, "/");
  return route.split("/").map((segment) => segment.match(/^\[.+\]$/) || /^\d+$/.test(segment) ? ":id" : segment).join("/").slice(0, 2_000);
}
function labelFromRoute(route: string) { const segment = route.split("/").filter(Boolean).at(-1); return segment === ":id" ? "detail" : segment?.replace(/[-_]/g, " "); }
function looksSecret(relative: string) { return /(?:^|\/)(?:secrets?|credentials?|private[-_.]?keys?)(?:\.|\/|$)/i.test(relative) || /\.(?:pem|key|p12|pfx)$/i.test(relative); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
