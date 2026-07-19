import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { renderDraft as defaultRenderDraft } from "./media";
import { runAnalysisPipeline as defaultRunAnalysisPipeline, safeProviderError } from "./analysisPipeline";
import { createPrivateObjectStorage as defaultCreatePrivateObjectStorage, type PrivateObjectStorage } from "./storage";
import { loadProviderConfig as defaultLoadProviderConfig, type ProviderConfig } from "./providers/config";
import { OpenAiProvider, validateWavAudioFile as defaultValidateWavAudioFile } from "./providers/openai";
import { createAvatarWorker, type AvatarWorker } from "./avatarWorker";
import { failJob, startJob, succeedJob, updateJobStage } from "../shared/jobState";
import { estimateScriptDurationMs } from "../shared/contentEngine";
import { hasBlockingScriptWarnings } from "../shared/renderTemplates";
import { evaluateCreatorVideoQuality } from "../shared/creatorVideoQuality";
import type {
  ArtifactRecord,
  CreatorVideoQualityReport,
  DetectedMoment,
  FrameEvidence,
  JobEvent,
  JobRecord,
  JobStage,
  ProductProfile,
  Project,
  ProviderRun,
  RenderedVideo,
  ScriptDraft,
  TranscriptArtifact,
  UsageEvent,
  UsageMetric
} from "../shared/types";

type JobEventInput = Omit<JobEvent, "id" | "createdAt" | "projectId"> & { createdAt?: string };
type UsageRecordInput = Omit<UsageEvent, "id" | "workspaceId" | "projectId" | "createdAt"> & { createdAt?: string };

export type GideonJobExecutorMetricEvent =
  | {
      name: "analysis_pipeline_finished";
      projectId: string;
      jobId: string;
      durationMs: number;
      moments: number;
      frameEvidence: number;
      providerRuns: number;
      transcript: boolean;
    }
  | {
      name: "analysis_pipeline_failed";
      projectId: string;
      jobId: string;
      durationMs: number;
      safeError: string;
    }
  | {
      name: "tts_provider_finished";
      projectId: string;
      scriptId: string;
      durationMs: number;
      characters: number;
      model: string;
    }
  | {
      name: "tts_provider_failed";
      projectId: string;
      scriptId: string;
      durationMs: number;
      safeError: string;
    }
  | {
      name: "render_draft_finished";
      projectId: string;
      jobId: string;
      scriptId: string;
      renderId: string;
      durationMs: number;
      outputDurationMs?: number;
    }
  | {
      name: "render_draft_failed";
      projectId: string;
      jobId: string;
      scriptId: string;
      durationMs: number;
      safeError: string;
    }
  | {
      name: "artifact_storage_finished";
      projectId: string;
      kind: "voiceover" | "avatar_presenter" | "render";
      durationMs: number;
      artifactId: string;
      byteSize: number;
    }
  | {
      name: "artifact_storage_failed";
      projectId: string;
      kind: "voiceover" | "avatar_presenter" | "render";
      durationMs: number;
      safeError: string;
    }
  | {
      name: "usage_recorded";
      projectId: string;
      metric: UsageMetric;
      source: UsageEvent["source"];
      quantity: number;
      unit: UsageEvent["unit"];
    };

interface AnalysisPipelineResult {
  moments: DetectedMoment[];
  transcript?: TranscriptArtifact;
  analysisSummary?: string;
  frameEvidence: FrameEvidence[];
  providerRuns: ProviderRun[];
}

interface RenderDraftResult {
  outputPath: string;
  validation: RenderedVideo["validation"];
}

interface SpeechProvider {
  isConfigured(): boolean;
  synthesizeSpeech(input: { text: string; instructions: string; outputPath: string }): Promise<{
    outputPath: string;
    provider: "openai";
    model: string;
  }>;
}

export interface GideonJobExecutorStore {
  getProject(projectId: string): Promise<Project>;
  getJob(projectId: string, jobId: string): Promise<JobRecord>;
  updateJob(projectId: string, job: JobRecord): Promise<Project>;
  appendJobEvent(projectId: string, input: JobEventInput): Promise<Project>;
  runAnalysis(
    projectId: string,
    enrich: (project: Project, moments: DetectedMoment[]) => Promise<{
      moments: DetectedMoment[];
      transcript?: TranscriptArtifact;
      analysisSummary?: string;
      frameEvidence?: FrameEvidence[];
      providerRuns?: ProviderRun[];
    }>
  ): Promise<Project>;
  assertUsageAvailable(projectId: string, metric: UsageMetric, additionalQuantity: number): Promise<void>;
  recordUsage(projectId: string, input: Omit<UsageEvent, "id" | "workspaceId" | "projectId" | "createdAt"> & { createdAt?: string }): Promise<Project>;
  finishJobCancel(projectId: string, jobId: string): Promise<Project>;
  replaceRenders(projectId: string, renders: RenderedVideo[]): Promise<Project>;
  appendArtifact(projectId: string, artifact: ArtifactRecord): Promise<Project>;
  appendProviderRuns(projectId: string, providerRuns: ProviderRun[]): Promise<Project>;
  projectDir(projectId: string): string;
  storageRoot(): string;
}

export interface GideonJobExecutor {
  runAnalysisJob(projectId: string, jobId: string): Promise<Project>;
  runVoiceoverJob(projectId: string, jobId: string): Promise<Project>;
  runAvatarJob(projectId: string, jobId: string): Promise<Project>;
  runRenderJob(projectId: string, jobId: string): Promise<Project>;
}

export interface GideonJobExecutorOptions {
  store: GideonJobExecutorStore;
  runAnalysisPipeline?: (project: Project, baseMoments: DetectedMoment[], projectDir: string) => Promise<AnalysisPipelineResult>;
  renderDraft?: (input: Parameters<typeof defaultRenderDraft>[0]) => Promise<RenderDraftResult>;
  createPrivateObjectStorage?: (input: { localRootDir: string }) => PrivateObjectStorage;
  loadProviderConfig?: () => ProviderConfig;
  createSpeechProvider?: (config: ProviderConfig) => SpeechProvider;
  validateVoiceoverAudio?: (filePath: string) => Promise<{ byteSize: number; dataBytes: number }>;
  createAvatarWorker?: () => AvatarWorker;
  statFile?: (filePath: string) => Promise<{ size: number }>;
  makeId?: () => string;
  now?: () => string;
  nowMs?: () => number;
  onMetric?: (event: GideonJobExecutorMetricEvent) => void;
}

export function createGideonJobExecutor(options: GideonJobExecutorOptions): GideonJobExecutor {
  const store = options.store;
  const runAnalysisPipeline = options.runAnalysisPipeline ?? defaultRunAnalysisPipeline;
  const renderDraft = options.renderDraft ?? defaultRenderDraft;
  const createPrivateObjectStorage = options.createPrivateObjectStorage ?? defaultCreatePrivateObjectStorage;
  const loadProviderConfig = options.loadProviderConfig ?? defaultLoadProviderConfig;
  const createSpeechProvider =
    options.createSpeechProvider ?? ((config: ProviderConfig) => new OpenAiProvider({ config: config.openai }));
  const validateVoiceoverAudio = options.validateVoiceoverAudio ?? defaultValidateWavAudioFile;
  const createApprovedAvatarWorker = options.createAvatarWorker ?? createAvatarWorker;
  const statFile = options.statFile ?? ((filePath: string) => fs.stat(filePath));
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const nowMs = options.nowMs ?? Date.now;
  const emitMetric = (event: GideonJobExecutorMetricEvent): void => {
    options.onMetric?.(event);
  };

  async function runAnalysisJob(projectId: string, jobId: string): Promise<Project> {
    const project = await store.getProject(projectId);
    if (!project.recording) {
      throw new Error("Choose a recording before analysis.");
    }
    const providerRunStartCount = project.providerRuns.length;
    let job = await store.getJob(projectId, jobId);
    if (job.status === "canceled") {
      return project;
    }
    job = startJob(job, now(), "Analyzing recording evidence.");
    await store.updateJob(projectId, job);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "started",
      stage: "queued",
      message: "Analysis job started.",
      progress: job.progress,
      metadata: jobAttemptMetadata(job)
    });
    try {
      job = await advanceJobStage(projectId, jobId, "quota", 1, 5, "Checking workspace AI and media quotas.");
      await assertAnalysisQuota(project);
      if (await finishIfCancelRequested(projectId, jobId)) {
        return store.getProject(projectId);
      }
      job = await advanceJobStage(projectId, jobId, "frame_extraction", 2, 5, "Extracting representative frames.");
      job = await advanceJobStage(projectId, jobId, "transcription", 3, 5, "Transcribing source audio when configured.");
      job = await advanceJobStage(projectId, jobId, "ocr", 4, 5, "Reading UI text from extracted frames when configured.");
      job = await advanceJobStage(projectId, jobId, "semantic_analysis", 5, 5, "Analyzing product flow and moments.");
      const analysisStartedAtMs = nowMs();
      let analyzed: Project;
      try {
        analyzed = await store.runAnalysis(projectId, (analysisProject, moments) =>
          runAnalysisPipeline(analysisProject, moments, store.projectDir(projectId))
        );
        emitMetric({
          name: "analysis_pipeline_finished",
          projectId,
          jobId,
          durationMs: Math.max(0, nowMs() - analysisStartedAtMs),
          moments: analyzed.moments.length,
          frameEvidence: analyzed.frameEvidence.length,
          providerRuns: analyzed.providerRuns.length - providerRunStartCount,
          transcript: Boolean(analyzed.transcript)
        });
      } catch (error) {
        emitMetric({
          name: "analysis_pipeline_failed",
          projectId,
          jobId,
          durationMs: Math.max(0, nowMs() - analysisStartedAtMs),
          safeError: safeProviderError(error)
        });
        throw error;
      }
      await store.appendJobEvent(projectId, {
        jobId,
        kind: "stage",
        stage: "usage",
        message: "Recording provider usage for analysis.",
        progress: job.progress,
        metadata: { ...jobAttemptMetadata(job), providerRuns: analyzed.providerRuns.length }
      });
      await recordAnalysisUsage(projectId, analyzed, analyzed.providerRuns.slice(providerRunStartCount));
      if (await finishIfCancelRequested(projectId, jobId)) {
        return store.getProject(projectId);
      }
      job = await store.getJob(projectId, jobId);
      job = succeedJob(job, now(), "Analysis completed.");
      await store.appendJobEvent(projectId, {
        jobId,
        kind: "succeeded",
        stage: "finalize",
        message: "Analysis completed.",
        progress: job.progress,
        metadata: { ...jobAttemptMetadata(job), moments: analyzed.moments.length, frameEvidence: analyzed.frameEvidence.length }
      });
      return store.updateJob(projectId, job);
    } catch (error) {
      return failOrCancelJob(projectId, jobId, error);
    }
  }

  async function runRenderJob(projectId: string, jobId: string): Promise<Project> {
    const project = await store.getProject(projectId);
    if (!project.recording) {
      throw new Error("Choose a recording before rendering.");
    }
    let job = await store.getJob(projectId, jobId);
    const scopedScriptIds = job.renderScope?.scriptIds;
    const selectedConcepts = project.concepts.filter((concept) => concept.selected);
    const scripts = project.scripts.filter((script) =>
      script.approved &&
      selectedConcepts.some((concept) => concept.id === script.conceptId) &&
      (!scopedScriptIds?.length || scopedScriptIds.includes(script.id)) &&
      !hasBlockingScriptWarnings(script.qualityWarnings)
    );
    if (scripts.length === 0) {
      throw new Error("Approve at least one selected script without blocking warnings before rendering.");
    }
    if (job.status === "canceled") {
      return project;
    }
    job = startJob(job, now(), scopedScriptIds?.length === 1 ? "Rendering one approved draft." : "Rendering selected drafts.");
    await store.updateJob(projectId, job);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "started",
      stage: "queued",
      message: "Render job started.",
      progress: job.progress,
      metadata: jobAttemptMetadata(job)
    });
    const renders: RenderedVideo[] = [];
    let reservedRenderStorageBytes = 0;
    try {
      job = await advanceJobStage(projectId, jobId, "quota", 1, scripts.length + 3, "Checking render quota.");
      await store.assertUsageAvailable(projectId, "render_minutes", scripts.length);
      const scriptsToRender = scripts.slice(0, 3);
      for (const [index, script] of scriptsToRender.entries()) {
        if (await finishIfCancelRequested(projectId, jobId)) {
          return store.getProject(projectId);
        }
        const concept = project.concepts.find((candidate) => candidate.id === script.conceptId);
        const moment = concept?.proofMomentIds
          .map((momentId) => project.moments.find((candidate) => candidate.id === momentId))
          .find(Boolean);
        const createdAt = now();
        let voiceoverPath = job.renderScope?.voiceoverMode === "reuse"
          ? await reusableVoiceoverPath(projectId, script.id)
          : null;
        if (!voiceoverPath) {
          job = await advanceJobStage(
            projectId,
            jobId,
            "tts",
            index + 2,
            scriptsToRender.length + 3,
            `Generating voiceover for draft ${index + 1}/${scriptsToRender.length}.`
          );
          voiceoverPath = await createProviderVoiceover(projectId, script);
        }
        if (await finishIfCancelRequested(projectId, jobId)) {
          return store.getProject(projectId);
        }
        try {
          job = await advanceJobStage(
            projectId,
            jobId,
            "render",
            index + 3,
            scriptsToRender.length + 3,
            `Rendering draft ${index + 1}/${scriptsToRender.length}.`
          );
          const renderId = makeId();
          const renderStartedAtMs = nowMs();
          let rendered: RenderDraftResult;
          let qualityReport: CreatorVideoQualityReport | undefined;
          try {
            const avatarPresenterPath = await matchingAvatarPresenterPath(project, script);
            rendered = await renderDraft({
              projectId,
              projectDir: store.projectDir(projectId),
              profile: project.profile,
              recording: project.recording,
              script,
              moment,
              title: concept?.title ?? script.hook,
              voiceoverPath: voiceoverPath ?? undefined,
              avatarPresenterPath
            });
            const blueprint = script.creativeBlueprint ?? script.editDecisionList?.creativeBlueprint;
            if (blueprint) {
              const presenterEnabled = blueprint.scenes.some((scene) => scene.presenter.visible);
              const avatarArtifact = latestArtifactForScript(project.artifacts, "avatar_presenter", script.id);
              qualityReport = evaluateCreatorVideoQuality({
                blueprint,
                render: rendered.validation,
                sourceScript: { id: script.id, updatedAt: script.updatedAt },
                avatar: {
                  artifactPresent: !presenterEnabled || Boolean(avatarPresenterPath) || Boolean(project.profile.avatarPresenterId),
                  consent: project.profile.customAvatarSource?.consent ?? { assetType: "fictional_catalog", status: "not_required" },
                  performance: avatarArtifact?.avatarPerformance ?? (presenterEnabled ? {
                    width: 1080,
                    height: 1920,
                    fps: 30,
                    durationMs: blueprint.targetDurationMs,
                    cropSafeRegion: { x: 0.06, y: 0.04, width: 0.88, height: 0.92 },
                    backgroundType: avatarPresenterPath ? "baked" : "deterministic_fixture",
                    status: "completed"
                  } : undefined),
                  quality: avatarArtifact?.avatarQualityReport
                },
                now: createdAt
              });
            }
            emitMetric({
              name: "render_draft_finished",
              projectId,
              jobId,
              scriptId: script.id,
              renderId,
              durationMs: Math.max(0, nowMs() - renderStartedAtMs),
              outputDurationMs: rendered.validation?.durationMs
            });
          } catch (error) {
            emitMetric({
              name: "render_draft_failed",
              projectId,
              jobId,
              scriptId: script.id,
              durationMs: Math.max(0, nowMs() - renderStartedAtMs),
              safeError: safeProviderError(error)
            });
            throw error;
          }
          const output = await statFile(rendered.outputPath);
          await store.assertUsageAvailable(projectId, "storage_bytes", reservedRenderStorageBytes + output.size);
          const stored = await storeArtifactWithMetrics(projectId, "render", () =>
            createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
              workspaceId: project.workspaceId,
              projectId,
              kind: "render",
              sourcePath: rendered.outputPath,
              originalFileName: `${renderId}.mp4`,
              contentType: "video/mp4"
            })
          );
          await store.appendArtifact(projectId, stored.artifact);
          reservedRenderStorageBytes += stored.artifact.byteSize;
          renders.push({
            id: renderId,
            scriptId: script.id,
            title: concept?.title ?? script.hook,
            status: "completed",
            outputPath: stored.filePath,
            outputUrl: stored.fileUrl,
            artifactId: stored.artifact.id,
            storageKey: stored.artifact.storageKey,
            sha256: stored.artifact.sha256,
            sizeBytes: stored.artifact.byteSize,
            validation: rendered.validation,
            qualityReport,
            createdAt
          });
        } catch (error) {
          renders.push({
            id: makeId(),
            scriptId: script.id,
            title: concept?.title ?? script.hook,
            status: "failed",
            error: error instanceof Error ? error.message : "Render failed.",
            createdAt
          });
        }
      }
      if (await finishIfCancelRequested(projectId, jobId)) {
        return store.getProject(projectId);
      }
      job = await advanceJobStage(projectId, jobId, "finalize", scriptsToRender.length + 2, scriptsToRender.length + 3, "Saving render outputs.");
      const targetedScriptIds = new Set(scriptsToRender.map((script) => script.id));
      const retainedRenders = project.renders.filter((render) => !targetedScriptIds.has(render.scriptId));
      await store.replaceRenders(projectId, [...retainedRenders, ...renders]);
      await store.appendJobEvent(projectId, {
        jobId,
        kind: "stage",
        stage: "usage",
        message: "Recording render usage.",
        progress: job.progress,
        metadata: { ...jobAttemptMetadata(job), renders: renders.length }
      });
      await recordRenderUsage(projectId, renders);
      job = await store.getJob(projectId, jobId);
      job = renders.some((render) => render.status === "failed")
        ? failJob(job, now(), "One or more render drafts failed.")
        : succeedJob(job, now(), "Rendering completed.");
      await store.appendJobEvent(projectId, {
        jobId,
        kind: job.status === "failed" ? "failed" : "succeeded",
        stage: "finalize",
        message: job.userMessage,
        progress: job.progress,
        metadata: {
          ...jobAttemptMetadata(job),
          completed: renders.filter((render) => render.status === "completed").length,
          failed: renders.filter((render) => render.status === "failed").length
        }
      });
      return store.updateJob(projectId, job);
    } catch (error) {
      return failOrCancelJob(projectId, jobId, error);
    }
  }

  async function runVoiceoverJob(projectId: string, jobId: string): Promise<Project> {
    const project = await store.getProject(projectId);
    const job = await store.getJob(projectId, jobId);
    const scriptId = job.renderScope?.scriptIds?.[0];
    const script = scriptId ? project.scripts.find((candidate) => candidate.id === scriptId) : undefined;
    if (!script || !script.approved || hasBlockingScriptWarnings(script.qualityWarnings)) {
      throw new Error("Choose one approved script without blocking warnings before regenerating voiceover.");
    }
    let activeJob = startJob(job, now(), "Generating a fresh voiceover.");
    await store.updateJob(projectId, activeJob);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "started",
      stage: "queued",
      message: "Voiceover job started.",
      progress: activeJob.progress,
      metadata: jobAttemptMetadata(activeJob)
    });
    try {
      activeJob = await advanceJobStage(projectId, jobId, "quota", 1, 3, "Checking voiceover quota.");
      activeJob = await advanceJobStage(projectId, jobId, "tts", 2, 3, "Generating a fresh voiceover.");
      const voiceoverPath = await createProviderVoiceover(projectId, script);
      if (!voiceoverPath) {
        throw new Error("Voiceover generation is not configured for this workspace.");
      }
      activeJob = await store.getJob(projectId, jobId);
      activeJob = succeedJob(activeJob, now(), "Voiceover regenerated.");
      await store.appendJobEvent(projectId, {
        jobId,
        kind: "succeeded",
        stage: "finalize",
        message: activeJob.userMessage,
        progress: { current: 3, total: 3, unit: "stage" },
        metadata: jobAttemptMetadata(activeJob)
      });
      return store.updateJob(projectId, activeJob);
    } catch (error) {
      return failOrCancelJob(projectId, jobId, error);
    }
  }

  async function runAvatarJob(projectId: string, jobId: string): Promise<Project> {
    const project = await store.getProject(projectId);
    const job = await store.getJob(projectId, jobId);
    const scriptId = job.renderScope?.scriptIds?.[0];
    const script = scriptId ? project.scripts.find((candidate) => candidate.id === scriptId) : undefined;
    const avatarId = project.profile.avatarPresenterId;
    if (!script || !script.approved || hasBlockingScriptWarnings(script.qualityWarnings) || !avatarId || avatarId === "logo_head") {
      throw new Error("Choose one approved script and a fictional catalog presenter before generating an avatar clip.");
    }
    if (job.status === "canceled") {
      return project;
    }
    let activeJob = startJob(job, now(), "Generating a fictional avatar presenter clip.");
    await store.updateJob(projectId, activeJob);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "started",
      stage: "queued",
      message: "Avatar job started.",
      progress: activeJob.progress,
      metadata: jobAttemptMetadata(activeJob)
    });
    try {
      activeJob = await advanceJobStage(projectId, jobId, "quota", 1, 4, "Checking private artifact storage quota.");
      const voiceoverPath = await reusableVoiceoverPath(projectId, script.id);
      if (!voiceoverPath) {
        throw new Error("Generate and validate a private voiceover before creating an avatar clip.");
      }
      const customAvatar = await authorizedCustomAvatarInput(project);
      activeJob = await advanceJobStage(
        projectId,
        jobId,
        "avatar",
        2,
        4,
        customAvatar ? "Generating the authorized self avatar presenter." : "Generating the fictional avatar presenter."
      );
      const outputPath = path.join(store.projectDir(projectId), "avatar-presenters", `${script.id}.mp4`);
      const result = await createApprovedAvatarWorker().render({
        avatarId,
        audioPath: voiceoverPath,
        sourceImagePath: customAvatar?.sourcePath,
        outputPath,
        durationMs: estimateScriptDurationMs(script),
        disclosure: "AI-generated brand presenter",
        consent: customAvatar?.consent ?? { assetType: "fictional_catalog", status: "not_required" }
      });
      const output = await statFile(result.outputPath);
      const sourceVoiceoverArtifact = latestArtifactForScript(project.artifacts, "voiceover", script.id);
      await store.assertUsageAvailable(projectId, "storage_bytes", output.size);
      const stored = await storeArtifactWithMetrics(projectId, "avatar_presenter", () =>
        createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
          workspaceId: project.workspaceId,
          projectId,
          kind: "avatar_presenter",
          sourcePath: result.outputPath,
          originalFileName: `${script.id}-${avatarId}.mp4`,
          contentType: "video/mp4",
          avatarModelReceipt: result.receipt,
          avatarPerformance: result.performance,
          avatarQualityReport: result.qualityReport,
          avatarPresenterLineage: {
            sourceScriptId: script.id,
            sourceScriptUpdatedAt: script.updatedAt,
            sourceVoiceoverArtifactId: sourceVoiceoverArtifact?.id,
            sourceAvatarArtifactId: customAvatar?.artifactId
          }
        })
      );
      await store.appendArtifact(projectId, stored.artifact);
      activeJob = await advanceJobStage(projectId, jobId, "usage", 3, 4, "Recording avatar artifact storage usage.");
      await recordUsageWithMetrics(projectId, {
        metric: "storage_bytes",
        quantity: stored.artifact.byteSize,
        unit: "byte",
        source: "render",
        idempotencyKey: `avatar:${projectId}:${stored.artifact.id}:storage_bytes`
      });
      activeJob = await store.getJob(projectId, jobId);
      activeJob = succeedJob(activeJob, now(), "Avatar presenter clip generated.");
      await store.appendJobEvent(projectId, {
        jobId,
        kind: "succeeded",
        stage: "finalize",
        message: activeJob.userMessage,
        progress: { current: 4, total: 4, unit: "stage" },
        metadata: jobAttemptMetadata(activeJob)
      });
      return store.updateJob(projectId, activeJob);
    } catch (error) {
      return failOrCancelJob(projectId, jobId, error);
    }
  }

  async function advanceJobStage(
    projectId: string,
    jobId: string,
    stage: JobStage,
    current: number,
    total: number,
    message: string
  ): Promise<JobRecord> {
    let job = await store.getJob(projectId, jobId);
    job = updateJobStage(job, stage, { current, total, unit: "stage" }, now(), message);
    await store.updateJob(projectId, job);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "stage",
      stage,
      message,
      progress: job.progress,
      metadata: jobAttemptMetadata(job)
    });
    return job;
  }

  async function finishIfCancelRequested(projectId: string, jobId: string): Promise<boolean> {
    const job = await store.getJob(projectId, jobId);
    if (job.status !== "canceling") {
      return false;
    }
    await store.finishJobCancel(projectId, jobId);
    return true;
  }

  async function failOrCancelJob(projectId: string, jobId: string, error: unknown): Promise<Project> {
    const latest = await store.getJob(projectId, jobId);
    if (latest.status === "canceling") {
      return store.finishJobCancel(projectId, jobId);
    }
    const failed = failJob(latest, now(), safeProviderError(error));
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "failed",
      stage: "finalize",
      message: failed.safeError ?? "Job failed.",
      progress: failed.progress,
      metadata: { ...jobAttemptMetadata(failed), retryable: failed.retryable }
    });
    return store.updateJob(projectId, failed);
  }

  function jobAttemptMetadata(job: JobRecord): { attempt: number; maxAttempts: number } {
    return {
      attempt: job.attempt,
      maxAttempts: job.maxAttempts
    };
  }

  async function createProviderVoiceover(projectId: string, script: ScriptDraft): Promise<string | null> {
    const config = loadProviderConfig();
    const provider = createSpeechProvider(config);
    if (!provider.isConfigured()) {
      return null;
    }
    const startedAt = now();
    const outputPath = path.join(store.projectDir(projectId), "voiceovers", `${script.id}.wav`);
    try {
      await store.assertUsageAvailable(projectId, "tts_characters", script.voiceoverText.length);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const ttsStartedAtMs = nowMs();
      let result: Awaited<ReturnType<SpeechProvider["synthesizeSpeech"]>>;
      try {
        result = await provider.synthesizeSpeech({
          text: script.voiceoverText,
          instructions: "Speak in a clear product demo voice. Keep pacing natural and concise.",
          outputPath
        });
        emitMetric({
          name: "tts_provider_finished",
          projectId,
          scriptId: script.id,
          durationMs: Math.max(0, nowMs() - ttsStartedAtMs),
          characters: script.voiceoverText.length,
          model: result.model
        });
      } catch (error) {
        emitMetric({
          name: "tts_provider_failed",
          projectId,
          scriptId: script.id,
          durationMs: Math.max(0, nowMs() - ttsStartedAtMs),
          safeError: safeProviderError(error)
        });
        throw error;
      }
      const project = await store.getProject(projectId);
      const validation = await validateVoiceoverAudio(result.outputPath);
      const synthesized = await statFile(result.outputPath);
      if (synthesized.size !== validation.byteSize) {
        throw new Error("Generated voiceover size changed before storage.");
      }
      await store.assertUsageAvailable(projectId, "storage_bytes", synthesized.size);
      const stored = await storeArtifactWithMetrics(projectId, "voiceover", () =>
        createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
          workspaceId: project.workspaceId,
          projectId,
          kind: "voiceover",
          sourcePath: result.outputPath,
          originalFileName: `${script.id}.wav`,
          contentType: "audio/wav"
        })
      );
      await store.appendArtifact(projectId, stored.artifact);
      await store.appendProviderRuns(projectId, [
        {
          id: makeId(),
          kind: "tts",
          provider: "openai",
          model: result.model,
          promptVersion: config.openai.ttsPromptVersion ?? "tts-v1",
          status: "completed",
          startedAt,
          finishedAt: now()
        }
      ]);
      await recordUsageWithMetrics(projectId, {
        metric: "tts_characters",
        quantity: script.voiceoverText.length,
        unit: "character",
        source: "tts",
        idempotencyKey: `tts:${projectId}:${script.id}:${startedAt}`
      });
      await recordUsageWithMetrics(projectId, {
        metric: "storage_bytes",
        quantity: stored.artifact.byteSize,
        unit: "byte",
        source: "tts",
        idempotencyKey: `tts:${projectId}:${stored.artifact.id}:storage_bytes`
      });
      return stored.filePath;
    } catch (error) {
      await store.appendProviderRuns(projectId, [
        {
          id: makeId(),
          kind: "tts",
          provider: "openai",
          model: config.openai.ttsModel,
          promptVersion: config.openai.ttsPromptVersion ?? "tts-v1",
          status: "failed",
          startedAt,
          finishedAt: now(),
          error: safeProviderError(error)
        }
      ]);
      return null;
    }
  }

  async function reusableVoiceoverPath(projectId: string, scriptId: string): Promise<string | null> {
    const voiceoverPath = path.join(store.projectDir(projectId), "voiceovers", `${scriptId}.wav`);
    try {
      await fs.access(voiceoverPath);
      await validateVoiceoverAudio(voiceoverPath);
      return voiceoverPath;
    } catch {
      return null;
    }
  }

  async function assertAnalysisQuota(project: Project): Promise<void> {
    const config = loadProviderConfig();
    if (!config.openai.apiKey || !project.recording) {
      return;
    }
    const estimatedLlmRuns = 1 + 4;
    await store.assertUsageAvailable(project.id, "llm_runs", estimatedLlmRuns);
    if (project.recording.hasAudio) {
      await store.assertUsageAvailable(project.id, "transcription_minutes", minutesForDuration(project.recording.durationMs));
    }
  }

  async function recordAnalysisUsage(projectId: string, project: Project, providerRuns: ProviderRun[]): Promise<void> {
    const completedTranscription = providerRuns.some(
      (run) => run.kind === "transcription" && run.provider === "openai" && run.status === "completed"
    );
    if (completedTranscription && project.recording) {
      const quantity = minutesForDuration(project.recording.durationMs);
      await recordUsageWithMetrics(projectId, {
        metric: "transcription_minutes",
        quantity,
        unit: "minute",
        source: "transcription",
        idempotencyKey: `transcription:${projectId}:${project.transcript?.id ?? providerRuns[0]?.id}`
      });
    }

    const completedAnalysisRuns = providerRuns.filter(
      (run) => run.kind === "analysis" && run.provider === "openai" && run.status === "completed"
    ).length;
    if (completedAnalysisRuns > 0) {
      await recordUsageWithMetrics(projectId, {
        metric: "llm_runs",
        quantity: completedAnalysisRuns,
        unit: "count",
        source: "analysis",
        idempotencyKey: `analysis:${projectId}:${providerRuns.find((run) => run.kind === "analysis")?.id ?? makeId()}`
      });
    }

    const completedOcrFrames = project.frameEvidence.filter((frame) => frame.ocrProvider === "openai").length;
    if (completedOcrFrames > 0) {
      await recordUsageWithMetrics(projectId, {
        metric: "llm_runs",
        quantity: completedOcrFrames,
        unit: "count",
        source: "ocr",
        idempotencyKey: `ocr:${projectId}:${providerRuns.find((run) => run.kind === "ocr")?.id ?? makeId()}`
      });
    }
  }

  async function recordRenderUsage(projectId: string, renders: RenderedVideo[]): Promise<void> {
    for (const render of renders) {
      if (render.status !== "completed" || !render.validation) {
        continue;
      }
      await recordUsageWithMetrics(projectId, {
        metric: "render_minutes",
        quantity: minutesForDuration(render.validation.durationMs),
        unit: "minute",
        source: "render",
        idempotencyKey: `render:${projectId}:${render.id}`
      });
      if (render.artifactId && render.sizeBytes) {
        await recordUsageWithMetrics(projectId, {
          metric: "storage_bytes",
          quantity: render.sizeBytes,
          unit: "byte",
          source: "render",
          idempotencyKey: `render:${projectId}:${render.artifactId}:storage_bytes`
        });
      }
    }
  }

  async function recordUsageWithMetrics(projectId: string, input: UsageRecordInput): Promise<Project> {
    const project = await store.recordUsage(projectId, input);
    emitMetric({
      name: "usage_recorded",
      projectId,
      metric: input.metric,
      source: input.source,
      quantity: input.quantity,
      unit: input.unit
    });
    return project;
  }

  async function storeArtifactWithMetrics(
    projectId: string,
    kind: "voiceover" | "avatar_presenter" | "render",
    put: () => ReturnType<PrivateObjectStorage["putFile"]>
  ): ReturnType<PrivateObjectStorage["putFile"]> {
    const storageStartedAtMs = nowMs();
    try {
      const stored = await put();
      emitMetric({
        name: "artifact_storage_finished",
        projectId,
        kind,
        durationMs: Math.max(0, nowMs() - storageStartedAtMs),
        artifactId: stored.artifact.id,
        byteSize: stored.artifact.byteSize
      });
      return stored;
    } catch (error) {
      emitMetric({
        name: "artifact_storage_failed",
        projectId,
        kind,
        durationMs: Math.max(0, nowMs() - storageStartedAtMs),
        safeError: safeProviderError(error)
      });
      throw error;
    }
  }

  return {
    runAnalysisJob,
    runVoiceoverJob,
    runAvatarJob,
    runRenderJob
  };
}

export function minutesForDuration(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

function latestArtifactForScript(
  artifacts: ArtifactRecord[],
  kind: "voiceover" | "avatar_presenter",
  scriptId: string
): ArtifactRecord | undefined {
  return artifacts
    .filter((artifact) =>
      artifact.kind === kind &&
      (kind === "avatar_presenter"
        ? artifact.avatarPresenterLineage?.sourceScriptId === scriptId
        : artifact.originalFileName === `${scriptId}.wav`)
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

async function matchingAvatarPresenterPath(project: Project, script: ScriptDraft): Promise<string | undefined> {
  const avatarId = project.profile.avatarPresenterId;
  const presenterEnabled = script.editDecisionList?.presenter.enabled ?? project.profile.brandPresenterEnabled ?? false;
  if (!avatarId || avatarId === "logo_head" || !presenterEnabled) {
    return undefined;
  }
  const artifact = latestArtifactForScript(project.artifacts, "avatar_presenter", script.id);
  const receipt = artifact?.avatarModelReceipt;
  const lineage = artifact?.avatarPresenterLineage;
  const customAvatarArtifactId = project.profile.customAvatarSource?.artifactId;
  const expectedProvenance = customAvatarArtifactId ? "user_authorized_likeness" : "gideon_fictional_catalog";
  if (
    !artifact?.localPath ||
    lineage?.sourceScriptUpdatedAt !== script.updatedAt ||
    receipt?.avatarId !== avatarId ||
    receipt.avatarProvenance !== expectedProvenance ||
    lineage.sourceAvatarArtifactId !== customAvatarArtifactId ||
    receipt.disclosure !== "AI-generated brand presenter"
  ) {
    return undefined;
  }
  try {
    await fs.access(artifact.localPath);
    return artifact.localPath;
  } catch {
    return undefined;
  }
}

async function authorizedCustomAvatarInput(project: Project): Promise<{
  artifactId: string;
  sourcePath: string;
  consent: NonNullable<ProductProfile["customAvatarSource"]>["consent"];
} | undefined> {
  const source = project.profile.customAvatarSource;
  if (!source) {
    return undefined;
  }
  const artifact = project.artifacts.find((candidate) =>
    candidate.id === source.artifactId && candidate.kind === "avatar_source_image"
  );
  if (
    !artifact?.localPath ||
    source.consent.sourceArtifactId !== artifact.id ||
    artifact.avatarConsentRecord?.status !== "granted" ||
    artifact.avatarConsentRecord.sourceArtifactId !== artifact.id ||
    artifact.avatarConsentRecord.consentVerifiedAt !== source.consent.consentVerifiedAt
  ) {
    throw new Error("Authorized custom avatar source artifact is unavailable.");
  }
  try {
    await fs.access(artifact.localPath);
  } catch {
    throw new Error("Authorized custom avatar source file is unavailable.");
  }
  return { artifactId: artifact.id, sourcePath: artifact.localPath, consent: source.consent };
}
