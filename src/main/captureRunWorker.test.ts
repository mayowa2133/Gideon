import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactKind, ArtifactRecord } from "../shared/types";
import { createFlowExecutionReceipt, type CaptureEnvironment, type CaptureEnvironmentVersion, type CapturePersona, type CaptureRun, type FlowExecutionRecord, type ProductFlowRevision } from "../shared/productFlowCapture";
import type { PrivateObjectStorage } from "./storage";
import { createCaptureRunWorker, type CaptureRunWorkerRepository } from "./captureRunWorker";
import { compileProductFlow } from "./productFlowCompiler";
import { browserPolicyForEnvironment } from "./captureService";
import type { PlaywrightCaptureExecutorInput } from "./playwrightCaptureExecutor";
import type { CaptureVideoQualityResult } from "./captureVideoQuality";

describe("capture run worker", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

  it("requires isolated runtime for non-local environments", async () => {
    const repo = repository();
    repo.environment.type = "staging";
    await expect(createCaptureRunWorker({ repository: repo, storage: storage(), runtime: { isolation: "local_test", async execute() { throw new Error("unused"); } } }).execute({ workspaceId: "workspace-1", captureRunId: "run-1" })).rejects.toThrow("require a container");
  });

  it("stops after an unverified dry run and preserves its receipt", async () => {
    const repo = repository();
    const stored = storage();
    const diagnostics: unknown[] = [];
    const worker = createCaptureRunWorker({
      repository: repo,
      storage: stored,
      runtime: { isolation: "local_test", async execute(input) { return { receipt: receipt(input, "failed"), networkReceipts: [] }; } },
      resetAdapters: { fixture_api: { async reset() {} } },
      onDiagnostic: (error) => diagnostics.push(error)
    });
    const result = await worker.execute({ workspaceId: "workspace-1", captureRunId: "run-1" });
    expect(diagnostics).toEqual([]);
    expect(result.run.status).toBe("needs_review");
    expect(repo.executions.at(-1)).toMatchObject({ status: "failed", blockerCode: "dry_run_failed" });
    expect(stored.kinds).toEqual(["verification_receipt"]);
  });

  it("records, normalizes, assembles, stores lineage, and activates a verified source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-worker-test-"));
    roots.push(root);
    const raw = path.join(root, "raw.webm");
    const normalized = path.join(root, "normalized.mp4");
    const assembled = path.join(root, "assembled.mp4");
    await Promise.all([fs.writeFile(raw, "raw"), fs.writeFile(normalized, "normalized"), fs.writeFile(assembled, "assembled")]);
    const repo = repository();
    const stored = storage();
    const activated: unknown[] = [];
    const resets: string[] = [];
    const usage: unknown[] = [];
    let calls = 0;
    const worker = createCaptureRunWorker({
      repository: repo,
      storage: stored,
      runtime: {
        isolation: "local_test",
        async execute(input) {
          calls += 1;
          return { receipt: receipt(input, "verified"), rawCapture: calls === 2 ? { path: raw, contentType: "video/webm", byteSize: 3, sha256: "a".repeat(64) } : undefined, networkReceipts: [] };
        }
      },
      resetAdapters: { fixture_api: { async reset(input) { resets.push(input.phase); } } },
      normalize: async () => ({ outputPath: normalized, recording: recording(), manifest: normalizationManifest() }),
      validateQuality: async () => ({ blackDurationMs: 0, blackRatio: 0 }),
      analyzeQuality: async (input) => qualityResult(input.outputDir),
      assemble: async (input) => ({ outputPath: assembled, recording: recording(), manifest: assemblyManifest(input.captureRunId) }),
      activateSourceRecording: async (input) => { activated.push(input); },
      recordBrowserUsage: async (input) => { usage.push(input); }
    });
    const result = await worker.execute({ workspaceId: "workspace-1", captureRunId: "run-1" });
    expect(result.run.status).toBe("completed");
    expect(repo.executions.at(-1)).toMatchObject({ status: "verified", rawCaptureArtifactId: expect.any(String), normalizedClipArtifactId: expect.any(String), quality: { status: "ready", checks: [{ code: "fixture", status: "pass" }] } });
    expect(stored.kinds).toEqual(["verification_receipt", "raw_browser_capture", "quality_report", "quality_contact_sheet", "normalized_flow_clip", "action_telemetry", "source_recording", "capture_assembly_manifest"]);
    expect(repo.artifacts.map((artifact) => artifact.kind)).toEqual(stored.kinds);
    expect(activated).toHaveLength(1);
    expect(resets).toEqual(["dry_run", "recording"]);
    expect(usage).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1", browserSeconds: 2, idempotencyKey: "capture-browser-usage:run-1" }]);
  });

  it("keeps a failed-quality clip out of verified previews and assembly", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-worker-quality-test-"));
    roots.push(root);
    const raw = path.join(root, "raw.webm");
    const normalized = path.join(root, "normalized.mp4");
    await Promise.all([fs.writeFile(raw, "raw"), fs.writeFile(normalized, "normalized")]);
    const repo = repository();
    const stored = storage();
    let calls = 0;
    const result = await createCaptureRunWorker({
      repository: repo,
      storage: stored,
      runtime: { isolation: "local_test", async execute(input) { calls += 1; return { receipt: receipt(input, "verified"), rawCapture: calls === 2 ? { path: raw, contentType: "video/webm", byteSize: 3, sha256: "a".repeat(64) } : undefined, networkReceipts: [] }; } },
      resetAdapters: { fixture_api: { async reset() {} } },
      normalize: async () => ({ outputPath: normalized, recording: recording(), manifest: normalizationManifest() }),
      validateQuality: async () => ({ blackDurationMs: 0, blackRatio: 0 }),
      analyzeQuality: async (input) => qualityResult(input.outputDir, "failed"),
      assemble: async () => { throw new Error("failed quality must not assemble"); }
    }).execute({ workspaceId: "workspace-1", captureRunId: "run-1" });
    expect(result.run.status).toBe("needs_review");
    expect(repo.executions.at(-1)).toMatchObject({ status: "failed", blockerCode: "quality_gate_failed", quality: { status: "failed", checks: [{ code: "fixture", status: "fail" }] } });
    expect(repo.executions.at(-1)).not.toHaveProperty("normalizedClipArtifactId");
    expect(stored.kinds).toEqual(["verification_receipt", "raw_browser_capture", "quality_report", "quality_contact_sheet"]);
  });

  it("cooperatively cancels before opening a browser and runs cleanup", async () => {
    const repo = repository();
    const cleanup: unknown[] = [];
    const result = await createCaptureRunWorker({
      repository: repo, storage: storage(), runtime: { isolation: "local_test", async execute() { throw new Error("browser must not start"); } },
      shouldCancel: async () => true, onCanceledCleanup: async (input) => { cleanup.push(input); }
    }).execute({ workspaceId: "workspace-1", captureRunId: "run-1" });
    expect(result.run.status).toBe("canceled");
    expect(cleanup).toEqual([{ workspaceId: "workspace-1", projectId: "project-1", captureRunId: "run-1" }]);
  });
});

function repository(): CaptureRunWorkerRepository & { environment: CaptureEnvironment; executions: FlowExecutionRecord[]; artifacts: ArtifactRecord[] } {
  const run: CaptureRun = { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "job-1", status: "queued", flowRevisionIds: ["flow-1:revision:2"], compiledPlanHashes: [], policyFingerprint: "", idempotencyKey: "capture-key-1", requestHash: "a".repeat(64), estimatedBrowserSeconds: 48, createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" };
  const environment: CaptureEnvironment = { id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Local", type: "local_preview", baseUrl: "http://localhost:3000", allowedDomains: ["localhost"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: "version-1", createdAt: run.createdAt, updatedAt: run.updatedAt };
  const version: CaptureEnvironmentVersion = { id: "version-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: environment.id, revision: 1, applicationFingerprint: "a".repeat(64), browserPolicyFingerprint: "b".repeat(64), validatedAt: run.createdAt, createdAt: run.createdAt };
  const flow = approvedFlow();
  const persona: CapturePersona = { id: "persona-1", workspaceId: "workspace-1", projectId: "project-1", environmentId: environment.id, key: "admin", displayName: "Admin", roleDescription: "Demo administrator", status: "active", revision: 1, createdAt: run.createdAt, updatedAt: run.updatedAt };
  const plan = compileProductFlow(flow, browserPolicyForEnvironment(environment));
  run.compiledPlanHashes = [plan.compiledPlanHash];
  run.policyFingerprint = plan.policyFingerprint;
  return {
    environment, executions: [], artifacts: [],
    async getCaptureRun() { return run; }, async upsertCaptureRun(next) { Object.assign(run, next); return run; },
    async getEnvironmentVersion() { return version; }, async getEnvironment() { return environment; },
    async getFlow() { return flow; }, async getPersona() { return persona; },
    async upsertFlowExecution(execution) { this.executions.push(execution); return execution; },
    async upsertArtifact(artifact) { this.artifacts.push(artifact); return artifact; }
  };
}

function approvedFlow(): ProductFlowRevision {
  return { schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Open dashboard", goal: "Open dashboard and verify it.", startingState: { entryPath: "/" }, steps: [{ id: "step-1", intent: "Confirm dashboard URL.", action: { type: "wait_for", assertion: { type: "url", path: "/" } }, riskClass: "observe" }], finalAssertions: [{ type: "url", path: "/" }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["user:goal"] };
}

function receipt(input: PlaywrightCaptureExecutorInput, status: "verified" | "failed") {
  return createFlowExecutionReceipt({ id: input.id, workspaceId: input.workspaceId, projectId: input.plan.projectId, flowId: input.plan.flowId, flowRevision: input.plan.flowRevision, environmentVersionId: input.plan.environmentVersionId, compiledPlanHash: input.plan.compiledPlanHash, steps: [{ stepId: "step-1", status: status === "verified" ? "succeeded" : "failed", policyDecision: input.plan.steps[0]!.policyDecision, assertions: [], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z", safeErrorCode: status === "verified" ? undefined : "test_failed" }], finalAssertions: [{ assertion: { type: "url", path: "/" }, passed: status === "verified", safeMessage: status }], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z" });
}

function storage(): PrivateObjectStorage & { kinds: ArtifactKind[] } {
  let id = 0;
  return { kinds: [], async putFile(input) { this.kinds.push(input.kind); const artifact: ArtifactRecord = { id: `artifact-${++id}`, workspaceId: input.workspaceId, projectId: input.projectId, kind: input.kind, provider: "local_private", storageKey: `${input.kind}/${id}`, contentType: input.contentType ?? "application/octet-stream", byteSize: 10, sha256: "a".repeat(64), originalFileName: input.originalFileName ?? "artifact", createdAt: "2026-07-14T10:00:00.000Z" }; return { artifact, filePath: input.sourcePath, fileUrl: `file://${input.sourcePath}` }; } };
}

function recording() { return { fileName: "capture.mp4", fileUrl: "file:///capture.mp4", durationMs: 1000, width: 1440, height: 900, fps: 30, videoCodec: "h264", audioCodec: null, byteSize: 10 } as const; }
function normalizationManifest() { return { schemaVersion: "1", normalizerVersion: "capture-normalizer-v1", executionReceiptId: "receipt", compiledPlanHash: "a".repeat(64), input: { sha256: "a".repeat(64), byteSize: 3, contentType: "video/webm" }, output: { sha256: "a".repeat(64), byteSize: 10, contentType: "video/mp4", durationMs: 1000, width: 1440, height: 900, fps: 30, videoCodec: "h264" }, ffmpegVersion: "ffmpeg version test", manifestHash: "b".repeat(64), createdAt: "2026-07-14T10:00:00.000Z" } as const; }
function assemblyManifest(captureRunId: string) { return { schemaVersion: "1", assemblerVersion: "capture-assembler-v1", captureRunId, clips: [], output: { sha256: "a".repeat(64), byteSize: 10, durationMs: 1000, width: 1440, height: 900, fps: 30, videoCodec: "h264" }, ffmpegVersion: "ffmpeg version test", manifestHash: "b".repeat(64), createdAt: "2026-07-14T10:00:00.000Z" } as const; }
async function qualityResult(outputDir: string, status: "ready" | "failed" = "ready"): Promise<CaptureVideoQualityResult> {
  await fs.mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "quality-report.json");
  const contactSheetPath = path.join(outputDir, "contact-sheet.jpg");
  await Promise.all([fs.writeFile(reportPath, "{}"), fs.writeFile(contactSheetPath, "image")]);
  return { reportPath, contactSheetPath, report: { schemaVersion: "1", qualityVersion: "capture-video-quality-v1", thresholdsVersion: "capture-quality-thresholds-v1", profile: "landscape", status, media: { durationMs: 1000, width: 1440, height: 900, fps: 30, videoCodec: "h264", audioCodec: null }, samples: [], presentation: { effectiveUiTextPx: 12, captionMaximumLines: 0, captionMarginPx: 1440, captionUiGapPx: 900, targetEvidenceRatio: 0, averageStepMs: 1000, maximumPanCropWidthsPerSecond: 0 }, checks: [{ code: "fixture", status: status === "failed" ? "fail" : "pass", message: status === "failed" ? "failed" : "passed" }], contactSheet: { sampledFrames: 0, columns: 4, rows: 2 }, reportHash: "a".repeat(64), createdAt: "2026-07-14T10:00:00.000Z" } };
}
