import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CaptureEnvironment,
  CaptureEnvironmentVersion,
  CapturePersona,
  CaptureRun,
  FlowExecutionRecord,
  ProductFlowRevision
} from "../shared/productFlowCapture";
import type { ArtifactRecord, RecordingMetadata } from "../shared/types";
import type { PrivateObjectStorage } from "./storage";
import { browserPolicyForEnvironment } from "./captureService";
import { assembleNormalizedCaptures, normalizeBrowserCapture, validateCaptureVisualQuality } from "./captureMedia";
import { executePlaywrightCapture, type PlaywrightCaptureExecutorInput, type PlaywrightCaptureResult } from "./playwrightCaptureExecutor";
import type { CaptureLoginAdapter } from "./playwrightCaptureExecutor";
import type { CaptureCredentialVault } from "./captureCredentials";
import type { CaptureAuditSink } from "./captureAudit";
import { compileProductFlow, type CompiledFlowPlan } from "./productFlowCompiler";

export interface CaptureRunWorkerRepository {
  getCaptureRun(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRun | null>;
  upsertCaptureRun(run: CaptureRun): Promise<CaptureRun>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  getFlow(input: { workspaceId: string; flowId: string }): Promise<ProductFlowRevision | null>;
  getPersona(input: { workspaceId: string; personaId: string }): Promise<CapturePersona | null>;
  upsertFlowExecution(execution: FlowExecutionRecord): Promise<FlowExecutionRecord>;
  upsertArtifact(artifact: ArtifactRecord): Promise<ArtifactRecord>;
}

export interface CaptureBrowserRuntime {
  isolation: "container" | "microvm" | "local_test";
  execute(input: PlaywrightCaptureExecutorInput): Promise<PlaywrightCaptureResult>;
}

export interface CaptureRunWorkerResult {
  run: CaptureRun;
  sourceArtifact?: ArtifactRecord;
  assemblyManifestArtifact?: ArtifactRecord;
  recording?: RecordingMetadata;
}

export interface CaptureResetAdapter {
  reset(input: { workspaceId: string; projectId: string; environment: CaptureEnvironment; version: CaptureEnvironmentVersion; persona: CapturePersona; phase: "dry_run" | "recording" }): Promise<void>;
}

export function createCaptureRunWorker(options: {
  repository: CaptureRunWorkerRepository;
  storage: PrivateObjectStorage;
  runtime: CaptureBrowserRuntime;
  fixtureValuesForPersona?: (persona: CapturePersona) => Promise<Record<string, string>>;
  resetAdapters?: Partial<Record<CaptureEnvironment["resetAdapter"], CaptureResetAdapter>>;
  loginAdapter?: CaptureLoginAdapter;
  credentialVault?: CaptureCredentialVault;
  activateSourceRecording?: (input: {
    workspaceId: string;
    projectId: string;
    captureRun: CaptureRun;
    artifact: ArtifactRecord;
    recording: RecordingMetadata;
    assemblyManifestArtifact: ArtifactRecord;
  }) => Promise<void>;
  makeId?: () => string;
  now?: () => string;
  workRoot?: string;
  ffmpegPath?: string;
  normalize?: typeof normalizeBrowserCapture;
  assemble?: typeof assembleNormalizedCaptures;
  validateQuality?: typeof validateCaptureVisualQuality;
  onDiagnostic?: (error: unknown) => void;
  shouldCancel?: (input: { workspaceId: string; captureRunId: string; jobId: string }) => Promise<boolean>;
  onCanceledCleanup?: (input: { workspaceId: string; projectId: string; captureRunId: string }) => Promise<void>;
  recordBrowserUsage?: (input: { workspaceId: string; projectId: string; captureRunId: string; browserSeconds: number; idempotencyKey: string }) => Promise<void>;
  persistCoverage?: (input: { workspaceId: string; projectId: string; captureRun: CaptureRun; executions: FlowExecutionRecord[] }) => Promise<void>;
  audit?: CaptureAuditSink;
}) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const normalize = options.normalize ?? normalizeBrowserCapture;
  const assemble = options.assemble ?? assembleNormalizedCaptures;
  const validateQuality = options.validateQuality ?? validateCaptureVisualQuality;
  return {
    async execute(input: { workspaceId: string; captureRunId: string }): Promise<CaptureRunWorkerResult> {
      let run = await options.repository.getCaptureRun(input);
      if (!run) throw new Error("Capture run was not found.");
      if (run.status === "completed") return { run };
      const version = await options.repository.getEnvironmentVersion({ workspaceId: input.workspaceId, versionId: run.environmentVersionId });
      if (!version || version.projectId !== run.projectId) throw new Error("Capture environment version was not found.");
      const environment = await options.repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: version.environmentId });
      if (!environment || environment.projectId !== run.projectId || environment.currentVersionId !== version.id || environment.status !== "ready") {
        throw new Error("Capture environment changed after this run was created.");
      }
      if (options.runtime.isolation === "local_test" && environment.type !== "local_preview") {
        throw new Error("Remote capture environments require a container or microVM browser runtime.");
      }
      const root = await fs.mkdtemp(path.join(options.workRoot ?? os.tmpdir(), `gideon-capture-${run.id}-`));
      const normalized: Array<{ path: string; execution: FlowExecutionRecord; artifact: ArtifactRecord; sha256: string; durationMs: number }> = [];
      try {
        await assertNotCanceled(options, run);
        run = await updateRun(options.repository, run, "provisioning", now());
        for (let index = 0; index < run.flowRevisionIds.length; index += 1) {
          await assertNotCanceled(options, run);
          const identity = parseFlowRevisionIdentity(run.flowRevisionIds[index]!);
          const flow = await options.repository.getFlow({ workspaceId: input.workspaceId, flowId: identity.flowId });
          if (!flow || flow.projectId !== run.projectId || flow.revision !== identity.revision || flow.environmentVersionId !== version.id) {
            throw new Error("Approved product flow changed after this run was created.");
          }
          const plan = compileProductFlow(flow, browserPolicyForEnvironment(environment));
          if (plan.compiledPlanHash !== run.compiledPlanHashes[index] || plan.policyFingerprint !== run.policyFingerprint) {
            throw new Error("Compiled product flow no longer matches the capture manifest.");
          }
          const persona = await options.repository.getPersona({ workspaceId: input.workspaceId, personaId: flow.personaId });
          if (!persona || persona.projectId !== run.projectId || persona.environmentId !== environment.id || persona.status !== "active") {
            throw new Error("Capture persona was not found.");
          }
          if (flow.startingState.credentialGrantId && flow.startingState.credentialGrantId !== persona.credentialGrantId) {
            throw new Error("Approved flow credential grant does not match the capture persona.");
          }
          const fixtures = await options.fixtureValuesForPersona?.(persona) ?? {};
          const executionId = makeId();
          let execution: FlowExecutionRecord = {
            id: executionId, workspaceId: run.workspaceId, projectId: run.projectId, captureRunId: run.id,
            flowId: flow.id, flowRevision: flow.revision, environmentVersionId: version.id, status: "running", attempt: 1,
            compiledPlanHash: plan.compiledPlanHash, createdAt: now(), updatedAt: now()
          };
          await options.repository.upsertFlowExecution(execution);
          run = await updateRun(options.repository, run, "dry_running", now());
          await reset(options.resetAdapters, { run, environment, version, persona, phase: "dry_run" });
          await assertNotCanceled(options, run);
          const auth = authenticationOptions(options, run, environment, persona);
          const dry = await execute(options.runtime, { run, plan, policy: browserPolicyForEnvironment(environment), fixtures, outputDir: path.join(root, executionId, "dry"), recordVideo: false, id: `${executionId}:dry`, ...auth });
          if (dry.receipt.status !== "verified") {
            const receiptArtifact = await putJson(options.repository, options.storage, run, "verification_receipt", `${executionId}-dry-receipt.json`, dry.receipt, root);
            execution = await options.repository.upsertFlowExecution({ ...execution, status: dry.receipt.status, receiptArtifactId: receiptArtifact.id, blockerCode: dry.receipt.blockerCode ?? "dry_run_failed", updatedAt: now() });
            run = await updateRun(options.repository, run, "needs_review", now());
            return { run };
          }
          run = await updateRun(options.repository, run, "recording", now());
          await reset(options.resetAdapters, { run, environment, version, persona, phase: "recording" });
          await assertNotCanceled(options, run);
          const recorded = await execute(options.runtime, { run, plan, policy: browserPolicyForEnvironment(environment), fixtures, outputDir: path.join(root, executionId, "record"), recordVideo: true, id: `${executionId}:record`, ...auth });
          const receiptArtifact = await putJson(options.repository, options.storage, run, "verification_receipt", `${executionId}-receipt.json`, recorded.receipt, root);
          if (recorded.receipt.status !== "verified" || !recorded.rawCapture) {
            await options.repository.upsertFlowExecution({ ...execution, status: recorded.receipt.status === "verified" ? "failed" : recorded.receipt.status, receiptArtifactId: receiptArtifact.id, blockerCode: recorded.receipt.blockerCode ?? "recording_failed", updatedAt: now() });
            run = await updateRun(options.repository, run, "needs_review", now());
            return { run };
          }
          const rawStored = await options.storage.putFile({ workspaceId: run.workspaceId, projectId: run.projectId, kind: "raw_browser_capture", sourcePath: recorded.rawCapture.path, originalFileName: `${flow.id}.webm`, contentType: "video/webm" });
          await options.repository.upsertArtifact(rawStored.artifact);
          run = await updateRun(options.repository, run, "normalizing", now());
          await assertNotCanceled(options, run);
          const normalizedResult = await normalize({
            rawCapturePath: recorded.rawCapture.path,
            outputPath: path.join(root, executionId, "normalized.mp4"),
            executionReceiptId: recorded.receipt.id,
            compiledPlanHash: plan.compiledPlanHash,
            expectedInputSha256: recorded.rawCapture.sha256,
            ffmpegPath: options.ffmpegPath,
            now
          });
          await validateQuality({ videoPath: normalizedResult.outputPath, durationMs: normalizedResult.recording.durationMs, ffmpegPath: options.ffmpegPath });
          const normalizedStored = await options.storage.putFile({ workspaceId: run.workspaceId, projectId: run.projectId, kind: "normalized_flow_clip", sourcePath: normalizedResult.outputPath, originalFileName: `${flow.id}.mp4`, contentType: "video/mp4" });
          await options.repository.upsertArtifact(normalizedStored.artifact);
          await putJson(options.repository, options.storage, run, "action_telemetry", `${executionId}-normalization.json`, { receipt: recorded.receipt, networkReceipts: recorded.networkReceipts, normalization: normalizedResult.manifest }, root);
          execution = await options.repository.upsertFlowExecution({ ...execution, status: "verified", receiptArtifactId: receiptArtifact.id, rawCaptureArtifactId: rawStored.artifact.id, normalizedClipArtifactId: normalizedStored.artifact.id, updatedAt: now() });
          normalized.push({ path: normalizedResult.outputPath, execution, artifact: normalizedStored.artifact, sha256: normalizedResult.manifest.output.sha256, durationMs: normalizedResult.recording.durationMs });
        }
        run = await updateRun(options.repository, run, "verifying", now());
        await assertNotCanceled(options, run);
        const assembly = await assemble({
          captureRunId: run.id,
          clips: normalized.map((item) => ({ path: item.path, executionId: item.execution.id, artifactId: item.artifact.id, sha256: item.sha256, durationMs: item.durationMs })),
          outputPath: path.join(root, "assembled-source.mp4"), ffmpegPath: options.ffmpegPath, now
        });
        const sourceStored = await options.storage.putFile({ workspaceId: run.workspaceId, projectId: run.projectId, kind: "source_recording", sourcePath: assembly.outputPath, originalFileName: `gideon-capture-${run.id}.mp4`, contentType: "video/mp4" });
        await options.repository.upsertArtifact(sourceStored.artifact);
        const manifestStored = await putJson(options.repository, options.storage, run, "capture_assembly_manifest", `${run.id}-assembly.json`, assembly.manifest, root);
        run = await updateRun(options.repository, run, "completed", now());
        await options.recordBrowserUsage?.({ workspaceId: run.workspaceId, projectId: run.projectId, captureRunId: run.id, browserSeconds: Math.max(1, Math.ceil(normalized.reduce((sum, item) => sum + item.durationMs, 0) / 1000) * 2), idempotencyKey: `capture-browser-usage:${run.id}` });
        await options.persistCoverage?.({ workspaceId: run.workspaceId, projectId: run.projectId, captureRun: run, executions: normalized.map((item) => item.execution) });
        await options.audit?.record({ workspaceId: run.workspaceId, projectId: run.projectId, actorUserId: "system:capture-worker", actorType: "system", action: "capture_run.complete", targetType: "capture_run", targetId: run.id, metadata: { verified_flow_count: normalized.length } });
        await options.activateSourceRecording?.({ workspaceId: run.workspaceId, projectId: run.projectId, captureRun: run, artifact: sourceStored.artifact, recording: assembly.recording, assemblyManifestArtifact: manifestStored });
        if (options.activateSourceRecording) await options.audit?.record({ workspaceId: run.workspaceId, projectId: run.projectId, actorUserId: "system:capture-worker", actorType: "system", action: "capture_assembly.activate", targetType: "recording", targetId: sourceStored.artifact.id, metadata: { capture_run_id: run.id, clip_count: normalized.length } });
        return { run, sourceArtifact: sourceStored.artifact, assemblyManifestArtifact: manifestStored, recording: assembly.recording };
      } catch (error) {
        options.onDiagnostic?.(error);
        if (error instanceof CaptureCanceledError) {
          run = await updateRun(options.repository, run, "canceled", now());
          await options.onCanceledCleanup?.({ workspaceId: run.workspaceId, projectId: run.projectId, captureRunId: run.id }).catch(() => undefined);
          return { run };
        }
        if (run.status !== "needs_review" && run.status !== "completed") await updateRun(options.repository, run, "failed", now()).catch(() => undefined);
        throw safeWorkerError(error);
      } finally {
        await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  };
}

class CaptureCanceledError extends Error {}

async function assertNotCanceled(
  options: { shouldCancel?: (input: { workspaceId: string; captureRunId: string; jobId: string }) => Promise<boolean> },
  run: CaptureRun
): Promise<void> {
  if (await options.shouldCancel?.({ workspaceId: run.workspaceId, captureRunId: run.id, jobId: run.jobId })) {
    throw new CaptureCanceledError("Capture cancellation requested.");
  }
}

async function execute(runtime: CaptureBrowserRuntime, input: { run: CaptureRun; plan: CompiledFlowPlan; policy: ReturnType<typeof browserPolicyForEnvironment>; fixtures: Record<string, string>; outputDir: string; recordVideo: boolean; id: string; loginAdapter?: CaptureLoginAdapter; useCredential?: PlaywrightCaptureExecutorInput["useCredential"] }) {
  return runtime.execute({ id: input.id, workspaceId: input.run.workspaceId, plan: input.plan, policy: input.policy, fixtureValues: input.fixtures, outputDir: input.outputDir, recordVideo: input.recordVideo, loginAdapter: input.loginAdapter, useCredential: input.useCredential });
}

async function reset(
  adapters: Partial<Record<CaptureEnvironment["resetAdapter"], CaptureResetAdapter>> | undefined,
  input: { run: CaptureRun; environment: CaptureEnvironment; version: CaptureEnvironmentVersion; persona: CapturePersona; phase: "dry_run" | "recording" }
): Promise<void> {
  if (input.environment.resetAdapter === "none") return;
  const adapter = adapters?.[input.environment.resetAdapter];
  if (!adapter) throw new Error("Capture environment reset adapter is not configured.");
  await adapter.reset({ workspaceId: input.run.workspaceId, projectId: input.run.projectId, environment: input.environment, version: input.version, persona: input.persona, phase: input.phase });
}

function authenticationOptions(
  options: { loginAdapter?: CaptureLoginAdapter; credentialVault?: CaptureCredentialVault },
  run: CaptureRun,
  environment: CaptureEnvironment,
  persona: CapturePersona
): Pick<PlaywrightCaptureExecutorInput, "loginAdapter" | "useCredential"> {
  if (!persona.credentialGrantId) return {};
  if (!options.loginAdapter || !options.credentialVault) throw new Error("Capture login adapter and credential vault are not configured.");
  return {
    loginAdapter: options.loginAdapter,
    useCredential: (grantId, consumer) => options.credentialVault!.use({ grantId, workspaceId: run.workspaceId, projectId: run.projectId, environmentId: environment.id, personaId: persona.id }, consumer)
  };
}

async function updateRun(repository: CaptureRunWorkerRepository, run: CaptureRun, status: CaptureRun["status"], updatedAt: string): Promise<CaptureRun> {
  return repository.upsertCaptureRun({ ...run, status, updatedAt });
}

async function putJson(repository: CaptureRunWorkerRepository, storage: PrivateObjectStorage, run: CaptureRun, kind: "verification_receipt" | "action_telemetry" | "capture_assembly_manifest", fileName: string, value: unknown, root: string): Promise<ArtifactRecord> {
  const filePath = path.join(root, fileName);
  await fs.writeFile(filePath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  const artifact = (await storage.putFile({ workspaceId: run.workspaceId, projectId: run.projectId, kind, sourcePath: filePath, originalFileName: fileName, contentType: "application/json" })).artifact;
  return repository.upsertArtifact(artifact);
}

function parseFlowRevisionIdentity(value: string): { flowId: string; revision: number } {
  const match = value.match(/^(.+):revision:([1-9][0-9]*)$/);
  if (!match?.[1] || !match[2]) throw new Error("Capture flow revision identity is invalid.");
  return { flowId: match[1], revision: Number(match[2]) };
}

function safeWorkerError(error: unknown): Error {
  const allowed = ["not found", "changed", "does not match", "require a container", "invalid"];
  const message = error instanceof Error ? error.message : "";
  return new Error(allowed.some((part) => message.includes(part)) ? message : "Capture execution failed. Safe diagnostics are available to operators.");
}

export const localTestCaptureRuntime: CaptureBrowserRuntime = { isolation: "local_test", execute: executePlaywrightCapture };
