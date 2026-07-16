import { createHash } from "node:crypto";
import fsConstants from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface CaptureSupportDiagnostic {
  code: string;
  message: string;
  metadata?: unknown;
}

export interface RedactedCaptureSupportReport {
  schemaVersion: "1";
  bundleId: string;
  captureId: string;
  createdAt: string;
  diagnostics: Array<{ code: string; message: string; metadata?: unknown }>;
  exclusions: ["media", "screenshots", "credentials", "selectors", "private_paths", "object_keys", "signed_urls", "raw_prompts"];
}

export async function createRedactedCaptureSupportBundle(input: {
  privateRoot: string;
  bundleId: string;
  captureId: string;
  diagnostics: CaptureSupportDiagnostic[];
  now?: () => string;
}): Promise<{ path: string; byteSize: number; sha256: string; report: RedactedCaptureSupportReport }> {
  const bundleId = opaqueId(input.bundleId, "bundle ID");
  const captureId = opaqueId(input.captureId, "capture ID");
  if (!Array.isArray(input.diagnostics) || input.diagnostics.length > 100) throw new Error("Capture support diagnostics are invalid.");
  const rootStat = await fs.lstat(input.privateRoot).catch(() => undefined);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Capture support root must be a private real directory.");
  const canonicalRoot = await fs.realpath(input.privateRoot);
  const outputDir = path.join(canonicalRoot, "support-bundles");
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  await fs.chmod(outputDir, 0o700);
  const outputStat = await fs.lstat(outputDir);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink() || !inside(canonicalRoot, await fs.realpath(outputDir))) throw new Error("Capture support output directory is unsafe.");
  const report: RedactedCaptureSupportReport = {
    schemaVersion: "1",
    bundleId,
    captureId,
    createdAt: validIso(input.now?.() ?? new Date().toISOString()),
    diagnostics: input.diagnostics.map((diagnostic) => ({
      code: safeCode(diagnostic.code),
      message: redactCaptureDiagnostic(diagnostic.message),
      metadata: diagnostic.metadata === undefined ? undefined : redactValue(diagnostic.metadata, 0, { count: 0 })
    })),
    exclusions: ["media", "screenshots", "credentials", "selectors", "private_paths", "object_keys", "signed_urls", "raw_prompts"]
  };
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  if (bytes.length > 1_000_000) throw new Error("Capture support bundle exceeds the safe size limit.");
  const outputPath = path.join(outputDir, `${bundleId}.json`);
  const flags = fsConstants.constants.O_CREAT | fsConstants.constants.O_EXCL | fsConstants.constants.O_WRONLY | fsConstants.constants.O_NOFOLLOW;
  const handle = await fs.open(outputPath, flags, 0o600).catch((error: NodeJS.ErrnoException) => {
    throw new Error(error.code === "EEXIST" ? "Capture support bundle already exists." : "Capture support bundle could not be created.");
  });
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.chmod(outputPath, 0o600);
  return { path: outputPath, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), report };
}

export function redactCaptureDiagnostic(value: string): string {
  if (typeof value !== "string") return "[redacted]";
  let output = value.replace(/[\u0000-\u001f\u007f]/g, " ");
  output = output.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]");
  output = output.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-payment]");
  output = output.replace(/\b(?:bearer\s+|sk[-_]|tok[-_]|token\s*[:=_-]\s*|secret\s*[:=_-]\s*|password\s*[:=_-]\s*|api[_ -]?key\s*[:=_-]\s*)[A-Za-z0-9+/_=.:-]{4,}/gi, "[redacted-secret]");
  output = output.replace(/https?:\/\/[^\s?#]+[^\s?#]*(?:\?[^\s#]*|#[^\s]*)/gi, (url) => {
    try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}?[redacted]`; } catch { return "[redacted-url]"; }
  });
  output = output.replace(/(?:\/Users\/|\/home\/|\/private\/|\/var\/(?:tmp|folders)\/|[A-Za-z]:\\)[^\s"']+/g, "[redacted-path]");
  output = output.replace(/\b(?:workspace|workspaces|project|projects|private|artifacts|uploads|captures)\/[A-Za-z0-9._/-]{3,}\b/gi, "[redacted-object-key]");
  output = output.replace(/\b(?:\.env(?:\.[\w.-]+)?|id_rsa|id_ed25519|credentials\.json|service-account[^\s]*)\b/gi, "[redacted-filename]");
  return output.trim().slice(0, 500) || "[redacted]";
}

export function assertCaptureEvidenceIsRedacted(value: unknown): void {
  const forbiddenEvidenceKeys = /(?:password|secret|token|credential|cookie|authorization|object.?key|storage.?key|signed.?url|private.?path|filename|selector|prompt|transcript|ocr|media|screenshot|frame|html|dom|body)/i;
  const inspect = (current: unknown, depth: number, budget: { count: number }): void => {
    budget.count += 1;
    if (budget.count > 10_000 || depth > 20) throw new Error("Capture evidence exceeds the privacy inspection budget.");
    if (typeof current === "string" && redactCaptureDiagnostic(current) !== current) throw new Error("Capture evidence contains sensitive-shaped data.");
    if (Array.isArray(current)) for (const item of current) inspect(item, depth + 1, budget);
    else if (current && typeof current === "object") for (const [key, item] of Object.entries(current as Record<string, unknown>)) {
      if (forbiddenEvidenceKeys.test(key)) throw new Error("Capture evidence contains a forbidden private field.");
      inspect(item, depth + 1, budget);
    }
  };
  inspect(value, 0, { count: 0 });
}

const forbiddenMetadataKeys = /(?:password|secret|token|credential|cookie|authorization|object.?key|storage.?key|signed.?url|private.?path|file.?path|filename|selector|prompt|transcript|ocr|media|screenshot|frame|html|dom|body|value)/i;

function redactValue(value: unknown, depth: number, budget: { count: number }): unknown {
  budget.count += 1;
  if (budget.count > 1_000 || depth > 8) return "[redacted]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[redacted]";
  if (typeof value === "string") return redactCaptureDiagnostic(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactValue(item, depth + 1, budget));
  if (typeof value !== "object") return "[redacted]";
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    const safeKey = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key) ? key : "redacted_field";
    output[safeKey] = forbiddenMetadataKeys.test(key) ? "[redacted]" : redactValue(item, depth + 1, budget);
  }
  return output;
}

function opaqueId(value: string, label: string): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value)) throw new Error(`Capture support ${label} is invalid.`);
  return value;
}
function safeCode(value: string): string { if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,99}$/.test(value)) throw new Error("Capture support diagnostic code is invalid."); return value; }
function validIso(value: string): string { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Capture support timestamp is invalid."); return new Date(value).toISOString(); }
function inside(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)); }
