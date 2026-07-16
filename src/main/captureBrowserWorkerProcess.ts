import fs from "node:fs/promises";
import path from "node:path";
import { executePlaywrightCapture } from "./playwrightCaptureExecutor";
import { createCaptureRuntimeSession, destroyCaptureRuntimeSession } from "./captureRuntimeSession";
import { verifyIsolatedCaptureManifest, type IsolatedCaptureManifest } from "./isolatedCaptureRuntime";

interface WorkerRequest {
  schemaVersion: "1";
  manifest: IsolatedCaptureManifest;
  fixtureGrant: { grantId: string; values: Record<string, string> };
}

async function main(): Promise<void> {
  const request = validateRequest(JSON.parse(await readBoundedStdin(5_000_000)) as unknown);
  const policyVersion = required(process.env.GIDEON_CAPTURE_RUNTIME_POLICY_VERSION);
  const policyHash = required(process.env.GIDEON_CAPTURE_RUNTIME_POLICY_HASH);
  const imageDigest = required(process.env.GIDEON_CAPTURE_RUNTIME_IMAGE_DIGEST);
  if (request.manifest.runtimePolicyVersion !== policyVersion || request.manifest.runtimePolicyHash !== policyHash || !/^[a-f0-9]{64}$/.test(policyHash) || !/^sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error("Runtime identity mismatch.");
  if (request.manifest.plan.startingState.credentialGrantId) throw new Error("Credential login requires an external isolated-runtime adapter.");
  const proxyServer = required(process.env.GIDEON_CAPTURE_PROXY_SERVER);
  const wallClockMs = boundedInteger(process.env.GIDEON_CAPTURE_WALL_CLOCK_MS ?? "300000", 1_000, 300_000);
  const maxArtifactBytes = boundedInteger(process.env.GIDEON_CAPTURE_MAX_ARTIFACT_BYTES ?? "524288000", 1_000_000, 524_288_000);
  const wallClock = setTimeout(() => {
    process.stderr.write("Capture browser worker exceeded its wall-clock limit.\n");
    process.exit(124);
  }, wallClockMs);
  const root = process.env.GIDEON_CAPTURE_SESSION_ROOT?.trim() || "/work/session";
  const exportRoot = process.env.GIDEON_CAPTURE_EXPORT_ROOT?.trim() || "/work/output";
  const session = await createCaptureRuntimeSession(root, request.manifest.workspaceId, request.manifest.executionId);
  process.env.HOME = session.profileDir;
  process.env.TMPDIR = session.tempDir;
  process.env.XDG_CACHE_HOME = session.cacheDir;
  const outputDir = safeExportPath(exportRoot, request.manifest.workspaceId, request.manifest.executionId);
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  try {
    const result = await executePlaywrightCapture({
      id: request.manifest.executionId,
      workspaceId: request.manifest.workspaceId,
      plan: request.manifest.plan,
      policy: request.manifest.policy,
      fixtureValues: request.fixtureGrant.values,
      outputDir,
      recordVideo: request.manifest.recordVideo,
      viewport: request.manifest.viewport,
      capturePacing: request.manifest.capturePacing,
      capturePresentation: request.manifest.capturePresentation,
      maskingPolicy: request.manifest.maskingPolicy,
      proxyServer
    });
    if (result.rawCapture && result.rawCapture.byteSize > maxArtifactBytes) throw new Error("Capture artifact exceeds the runtime limit.");
    await destroyCaptureRuntimeSession(session);
    clearTimeout(wallClock);
    process.stdout.write(JSON.stringify({ schemaVersion: "1", manifestHash: request.manifest.manifestHash, startedAt, completedAt: new Date().toISOString(), result, sessionCleanup: "complete", runtimeInstanceCleanup: "orchestrator_required" }) + "\n");
  } catch (error) {
    clearTimeout(wallClock);
    await destroyCaptureRuntimeSession(session).catch(() => undefined);
    throw error;
  }
}

function validateRequest(value: unknown): WorkerRequest {
  if (!value || typeof value !== "object") throw new Error("Worker request is invalid.");
  const request = value as Partial<WorkerRequest>;
  if (request.schemaVersion !== "1" || !request.manifest || !request.fixtureGrant || typeof request.fixtureGrant !== "object") throw new Error("Worker request is invalid.");
  verifyIsolatedCaptureManifest(request.manifest);
  const grant = request.fixtureGrant as WorkerRequest["fixtureGrant"];
  if (grant.grantId !== request.manifest.fixtureGrantId || !grant.values || typeof grant.values !== "object" || Array.isArray(grant.values)) throw new Error("Worker fixture grant does not match the manifest.");
  const keys = Object.keys(grant.values).sort();
  if (JSON.stringify(keys) !== JSON.stringify(request.manifest.fixtureKeys) || Object.values(grant.values).some((item) => typeof item !== "string" || item.length > 10_000)) throw new Error("Worker fixture grant values are invalid.");
  return request as WorkerRequest;
}

async function readBoundedStdin(maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("Worker request exceeds its size limit.");
    chunks.push(buffer);
  }
  if (size < 2) throw new Error("Worker request is empty.");
  return Buffer.concat(chunks).toString("utf8");
}

function safeExportPath(root: string, workspaceId: string, executionId: string): string {
  const base = path.resolve(root);
  const output = path.resolve(base, workspaceId, executionId);
  if (!output.startsWith(`${base}${path.sep}`)) throw new Error("Worker export path is invalid.");
  return output;
}
function required(value: string | undefined): string { const result = value?.trim(); if (!result) throw new Error("Worker runtime configuration is incomplete."); return result; }
function boundedInteger(value: string, minimum: number, maximum: number): number { const result = Number(value); if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error("Worker runtime limit is invalid."); return result; }

void main().catch(() => {
  process.stderr.write("Capture browser worker failed safely.\n");
  process.exit(1);
});
