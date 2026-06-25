import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  copyExport,
  getToolAvailability,
  probeRecording,
  renderDraft
} from "./media";
import { GideonStore } from "./store";
import {
  completeDirectUploadSession,
  createDirectUploadSession,
  createPrivateObjectStorage,
  isCloudStorageConfigured,
  loadStorageConfig,
  type DirectUploadSession
} from "./storage";
import { LocalWorkerQueue } from "./jobQueue";
import { startGideonControlServer } from "./controlServer";
import type {
  AddWorkspaceMemberInput,
  AppState,
  CompleteRecordingUploadSessionInput,
  ContentConcept,
  CreateRecordingUploadSessionInput,
  CreateWorkspaceInput,
  DetectedMoment,
  JobRecord,
  JobStage,
  Project,
  ProviderRun,
  RecordingUploadSession,
  RemoveWorkspaceMemberInput,
  RenderedVideo,
  ScriptDraft,
  UpdateWorkspaceMemberRoleInput
} from "../shared/types";
import { runAnalysisPipeline, safeProviderError } from "./analysisPipeline";
import { loadProviderConfig } from "./providers/config";
import { OpenAiProvider } from "./providers/openai";
import { createJob, failJob, startJob, succeedJob, updateJobStage } from "../shared/jobState";

const store = new GideonStore();
const workerQueue = new LocalWorkerQueue({ concurrency: 1 });
let mainWindow: BrowserWindow | null = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    title: "Gideon",
    backgroundColor: "#080b13",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await recoverInterruptedJobsAtStartup();
  await startControlBridge();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  const providerConfig = loadProviderConfig();
  const storageConfig = loadStorageConfig();
  ipcMain.handle("platform:info", async () => ({
    appVersion: app.getVersion(),
    userDataPath: app.getPath("userData"),
    openAiConfigured: Boolean(providerConfig.openai.apiKey),
    openAiLlmModel: providerConfig.openai.apiKey ? providerConfig.openai.llmModel : null,
    openAiTranscriptionModel: providerConfig.openai.apiKey ? providerConfig.openai.transcriptionModel : null,
    openAiTtsModel: providerConfig.openai.apiKey ? providerConfig.openai.ttsModel : null,
    storageProvider: storageConfig.provider,
    cloudStorageConfigured: isCloudStorageConfigured(storageConfig),
    ...(await getToolAvailability())
  }));

  ipcMain.handle("project:list", async () => activeWorkspaceState());

  ipcMain.handle("workspace:create", async (_event, input: CreateWorkspaceInput) => {
    await store.createWorkspace(input);
    return activeWorkspaceState();
  });
  ipcMain.handle("workspace:set-active", async (_event, workspaceId: string) => {
    await store.setActiveWorkspace(workspaceId);
    return activeWorkspaceState();
  });
  ipcMain.handle("workspace:add-member", async (_event, input: AddWorkspaceMemberInput) => {
    await store.addWorkspaceMember(input);
    return activeWorkspaceState();
  });
  ipcMain.handle("workspace:update-member-role", async (_event, input: UpdateWorkspaceMemberRoleInput) => {
    await store.updateWorkspaceMemberRole(input);
    return activeWorkspaceState();
  });
  ipcMain.handle("workspace:remove-member", async (_event, input: RemoveWorkspaceMemberInput) => {
    await store.removeWorkspaceMember(input);
    return activeWorkspaceState();
  });

  ipcMain.handle("project:set-active", async (_event, projectId: string) => store.setActiveProject(projectId));
  ipcMain.handle("project:create", async (_event, input) => store.createProject(input));
  ipcMain.handle("project:update-profile", async (_event, projectId: string, profile) =>
    store.updateProfile(projectId, profile)
  );
  ipcMain.handle("project:delete", async (_event, projectId: string) => {
    await store.deleteProject(projectId);
    return activeWorkspaceState();
  });

  ipcMain.handle("recording:choose", async (_event, projectId: string) => {
    await store.assertProjectPermission(projectId, "project:update");
    const options = {
      title: "Choose a product walkthrough recording",
      properties: ["openFile"],
      filters: [
        { name: "Video recordings", extensions: ["mp4", "mov", "webm"] },
        { name: "All files", extensions: ["*"] }
      ]
    } satisfies Electron.OpenDialogOptions;
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const originalPath = result.filePaths[0];
    const recording = await probeRecording(originalPath);
    const sourceMinutes = minutesForDuration(recording.durationMs);
    await store.assertUsageAvailable(projectId, "source_minutes", sourceMinutes);
    await store.assertUsageAvailable(projectId, "storage_bytes", recording.sizeBytes);
    const project = await store.getProject(projectId);
    const stored = await createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
      workspaceId: project.workspaceId,
      projectId,
      kind: "source_recording",
      sourcePath: originalPath,
      originalFileName: recording.fileName
    });
    const importedRecording = {
      ...recording,
      filePath: stored.filePath,
      fileUrl: stored.fileUrl,
      originalFilePath: originalPath,
      artifactId: stored.artifact.id,
      storageKey: stored.artifact.storageKey,
      sha256: stored.artifact.sha256,
      sizeBytes: stored.artifact.byteSize
    };
    await store.appendArtifact(projectId, stored.artifact);
    await store.attachRecording(projectId, importedRecording);
    await store.recordUsage(projectId, {
      metric: "source_minutes",
      quantity: sourceMinutes,
      unit: "minute",
      source: "recording",
      idempotencyKey: `recording:${projectId}:${stored.artifact.id}:source_minutes`
    });
    return store.recordUsage(projectId, {
      metric: "storage_bytes",
      quantity: stored.artifact.byteSize,
      unit: "byte",
      source: "recording",
      idempotencyKey: `recording:${projectId}:${stored.artifact.id}:storage_bytes`
    });
  });

  ipcMain.handle("recording:create-upload-session", async (_event, input: CreateRecordingUploadSessionInput) => {
    await store.assertProjectPermission(input.projectId, "project:update");
    const fileName = normalizeUploadFileName(input.fileName);
    const byteSize = normalizeUploadByteSize(input.byteSize);
    await store.assertUsageAvailable(input.projectId, "storage_bytes", byteSize);
    const project = await store.getProject(input.projectId);
    const session = createDirectUploadSession(
      {
        localRootDir: store.storageRoot()
      },
      {
        workspaceId: project.workspaceId,
        projectId: project.id,
        kind: "source_recording",
        originalFileName: fileName,
        byteSize,
        contentType: input.contentType
      }
    );
    await store.createRecordingUploadSessionRecord(input.projectId, {
      id: session.id,
      workspaceId: project.workspaceId,
      projectId: project.id,
      artifactId: session.id,
      provider: session.provider,
      storageKey: session.storageKey,
      status: "pending",
      method: session.method,
      contentType: session.contentType,
      byteSize,
      originalFileName: fileName,
      expiresAt: session.expiresAt
    });
    return toRecordingUploadSession(session);
  });

  ipcMain.handle("recording:complete-upload-session", async (_event, input: CompleteRecordingUploadSessionInput) => {
    await store.assertProjectPermission(input.projectId, "project:update");
    const session = await store.getRecordingUploadSession(input.projectId, input.sessionId);
    if (session.status !== "pending") {
      throw new Error(`Recording upload session is already ${session.status}.`);
    }
    const stored = await completeDirectUploadSession(
      {
        localRootDir: store.storageRoot()
      },
      {
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        kind: "source_recording",
        artifactId: session.artifactId,
        provider: session.provider,
        storageKey: session.storageKey,
        originalFileName: session.originalFileName,
        contentType: session.contentType,
        expectedByteSize: session.byteSize
      }
    );
    const recording = await probeRecording(stored.filePath);
    const sourceMinutes = minutesForDuration(recording.durationMs);
    await store.assertUsageAvailable(input.projectId, "source_minutes", sourceMinutes);
    await store.assertUsageAvailable(input.projectId, "storage_bytes", stored.artifact.byteSize);
    await store.completeRecordingUploadSessionRecord(input.projectId, session.id, stored.artifact);
    await store.attachRecording(input.projectId, {
      ...recording,
      fileName: stored.artifact.originalFileName,
      filePath: stored.filePath,
      fileUrl: stored.fileUrl,
      artifactId: stored.artifact.id,
      storageKey: stored.artifact.storageKey,
      sha256: stored.artifact.sha256,
      sizeBytes: stored.artifact.byteSize
    });
    await store.recordUsage(input.projectId, {
      metric: "source_minutes",
      quantity: sourceMinutes,
      unit: "minute",
      source: "recording",
      idempotencyKey: `recording:${input.projectId}:${stored.artifact.id}:source_minutes`
    });
    return store.recordUsage(input.projectId, {
      metric: "storage_bytes",
      quantity: stored.artifact.byteSize,
      unit: "byte",
      source: "recording",
      idempotencyKey: `recording:${input.projectId}:${stored.artifact.id}:storage_bytes`
    });
  });

  ipcMain.handle("analysis:run", async (_event, projectId: string) => {
    return enqueueAnalysisFromControl(projectId);
  });

  ipcMain.handle("analysis:update-moments", async (_event, projectId: string, moments: DetectedMoment[]) =>
    store.updateMoments(projectId, moments)
  );
  ipcMain.handle("concepts:generate", async (_event, projectId: string) => store.generateConcepts(projectId));
  ipcMain.handle(
    "concepts:update",
    async (_event, projectId: string, concepts: ContentConcept[], changedId: string) =>
      store.updateConcepts(projectId, concepts, changedId)
  );
  ipcMain.handle("scripts:generate", async (_event, projectId: string) => store.generateScripts(projectId));
  ipcMain.handle("scripts:update", async (_event, projectId: string, scripts: ScriptDraft[]) =>
    store.updateScripts(projectId, scripts)
  );

  ipcMain.handle("render:selected", async (_event, projectId: string) => {
    return enqueueRenderFromControl(projectId);
  });

  ipcMain.handle("job:cancel", async (_event, projectId: string, jobId: string) => store.requestJobCancel(projectId, jobId));

  ipcMain.handle("job:retry", async (_event, projectId: string, jobId: string) => {
    const job = await store.retryJob(projectId, jobId);
    if (job.kind === "analysis") {
      enqueueAnalysisJob(projectId, job.id);
      return store.getProject(projectId);
    }
    if (job.kind === "render") {
      enqueueRenderJob(projectId, job.id);
      return store.getProject(projectId);
    }
    throw new Error(`Retry is not wired for ${job.kind} jobs yet.`);
  });

  ipcMain.handle("export:video", async (_event, projectId: string, renderId: string) => {
    const project = await store.getProject(projectId);
    const render = project.renders.find((candidate) => candidate.id === renderId);
    if (!render?.outputPath) {
      throw new Error("Rendered video not found.");
    }
    await store.assertProjectPermission(projectId, "export:create");
    const options = {
      title: "Export MP4",
      defaultPath: path.join(app.getPath("downloads"), `${render.title.replace(/[^a-z0-9]+/gi, "-")}.mp4`),
      filters: [{ name: "MP4 video", extensions: ["mp4"] }]
    } satisfies Electron.SaveDialogOptions;
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return null;
    }
    await store.assertUsageAvailable(projectId, "exports", 1);
    await copyExport(render.outputPath, result.filePath);
    await store.recordUsage(projectId, {
      metric: "exports",
      quantity: 1,
      unit: "count",
      source: "export",
      idempotencyKey: `export:${projectId}:${renderId}:${result.filePath}`
    });
    return result.filePath;
  });

  ipcMain.handle("shell:reveal", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

async function startControlBridge(): Promise<void> {
  const socketPath = controlSocketPath();
  await startGideonControlServer({
    socketPath,
    handlers: {
      status: async () => ({
        ok: true,
        appVersion: app.getVersion(),
        socketPath,
        queue: workerQueue.stats(),
        apiKeyRequired: false
      }),
      listProjects: activeWorkspaceState,
      getProject: (projectId) => store.getProject(projectId),
      updateScript: updateScriptFromControl,
      updateMoment: updateMomentFromControl,
      enqueueAnalysis: (projectId) => enqueueAnalysisFromControl(projectId, "mcp_agent"),
      enqueueRender: (projectId) => enqueueRenderFromControl(projectId, "mcp_agent")
    }
  });
}

function controlSocketPath(): string {
  return process.env.GIDEON_CONTROL_SOCKET || path.join(app.getPath("userData"), "gideon-control.sock");
}

async function activeWorkspaceState(): Promise<AppState> {
  const state = await store.load();
  const activeProject = await store.getActiveProject();
  return {
    ...state,
    projects: await store.listProjects(),
    activeProjectId: activeProject?.id ?? null
  };
}

async function updateScriptFromControl(input: {
  projectId: string;
  scriptId: string;
  hook?: string;
  voiceoverText?: string;
  cta?: string;
}): Promise<Project> {
  const project = await store.getProject(input.projectId);
  const scripts = project.scripts.map((script) => {
    if (script.id !== input.scriptId) {
      return script;
    }
    return {
      ...script,
      hook: input.hook ?? script.hook,
      voiceoverText: input.voiceoverText ?? script.voiceoverText,
      cta: input.cta ?? script.cta,
      updatedAt: new Date().toISOString()
    };
  });
  if (!scripts.some((script) => script.id === input.scriptId)) {
    throw new Error(`Script ${input.scriptId} was not found.`);
  }
  return store.updateScripts(input.projectId, scripts, "mcp_agent");
}

async function updateMomentFromControl(input: {
  projectId: string;
  momentId: string;
  label?: string;
  evidence?: string;
  enabled?: boolean;
}): Promise<Project> {
  const project = await store.getProject(input.projectId);
  const moments = project.moments.map((moment) => {
    if (moment.id !== input.momentId) {
      return moment;
    }
    return {
      ...moment,
      label: input.label ?? moment.label,
      evidence: input.evidence ?? moment.evidence,
      enabled: input.enabled ?? moment.enabled
    };
  });
  if (!moments.some((moment) => moment.id === input.momentId)) {
    throw new Error(`Moment ${input.momentId} was not found.`);
  }
  return store.updateMoments(input.projectId, moments, "mcp_agent");
}

async function enqueueAnalysisFromControl(projectId: string, actorType: "local_user" | "mcp_agent" = "local_user"): Promise<Project> {
  const project = await store.getProject(projectId);
  if (!project.recording) {
    throw new Error("Choose a recording before analysis.");
  }
  const job = createJob({
    id: randomUUID(),
    projectId,
    kind: "analysis",
    now: new Date().toISOString(),
    userMessage: "Waiting to analyze recording."
  });
  await store.appendJob(projectId, job, actorType);
  enqueueAnalysisJob(projectId, job.id);
  return store.getProject(projectId);
}

async function enqueueRenderFromControl(projectId: string, actorType: "local_user" | "mcp_agent" = "local_user"): Promise<Project> {
  const project = await store.getProject(projectId);
  if (!project.recording) {
    throw new Error("Choose a recording before rendering.");
  }
  if (project.scripts.length === 0) {
    throw new Error("Generate scripts before rendering.");
  }
  const job = createJob({
    id: randomUUID(),
    projectId,
    kind: "render",
    now: new Date().toISOString(),
    userMessage: "Waiting to render selected drafts."
  });
  await store.appendJob(projectId, job, actorType);
  enqueueRenderJob(projectId, job.id);
  return store.getProject(projectId);
}

async function recoverInterruptedJobsAtStartup(): Promise<void> {
  const jobs = await store.recoverInterruptedJobs();
  for (const job of jobs) {
    if (job.kind === "analysis") {
      enqueueAnalysisJob(job.projectId, job.id);
      continue;
    }
    if (job.kind === "render") {
      enqueueRenderJob(job.projectId, job.id);
      continue;
    }
    console.warn(`Recovered queued ${job.kind} job ${job.id}, but no local runner is wired for that job kind.`);
  }
}

function enqueueAnalysisJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue({
      id: jobId,
      projectId,
      kind: "analysis",
      run: () => runAnalysisJob(projectId, jobId)
    })
    .catch((error) => {
      console.error(`Analysis job ${jobId} failed outside normal job handling.`, error);
    });
}

function enqueueRenderJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue({
      id: jobId,
      projectId,
      kind: "render",
      run: () => runRenderJob(projectId, jobId)
    })
    .catch((error) => {
      console.error(`Render job ${jobId} failed outside normal job handling.`, error);
    });
}

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
  job = startJob(job, new Date().toISOString(), "Analyzing recording evidence.");
  await store.updateJob(projectId, job);
  await store.appendJobEvent(projectId, {
    jobId,
    kind: "started",
    stage: "queued",
    message: "Analysis job started.",
    progress: job.progress
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
    const analyzed = await store.runAnalysis(projectId, (analysisProject, moments) =>
      runAnalysisPipeline(analysisProject, moments, store.projectDir(projectId))
    );
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "stage",
      stage: "usage",
      message: "Recording provider usage for analysis.",
      progress: job.progress,
      metadata: { providerRuns: analyzed.providerRuns.length }
    });
    await recordAnalysisUsage(projectId, analyzed, analyzed.providerRuns.slice(providerRunStartCount));
    if (await finishIfCancelRequested(projectId, jobId)) {
      return store.getProject(projectId);
    }
    job = await store.getJob(projectId, jobId);
    job = succeedJob(job, new Date().toISOString(), "Analysis completed.");
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "succeeded",
      stage: "finalize",
      message: "Analysis completed.",
      progress: job.progress,
      metadata: { moments: analyzed.moments.length, frameEvidence: analyzed.frameEvidence.length }
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
  const selectedConcepts = project.concepts.filter((concept) => concept.selected);
  const scripts = project.scripts.filter((script) =>
    selectedConcepts.some((concept) => concept.id === script.conceptId)
  );
  if (scripts.length === 0) {
    throw new Error("Generate scripts before rendering.");
  }
  let job = await store.getJob(projectId, jobId);
  if (job.status === "canceled") {
    return project;
  }
  job = startJob(job, new Date().toISOString(), "Rendering selected drafts.");
  await store.updateJob(projectId, job);
  await store.appendJobEvent(projectId, {
    jobId,
    kind: "started",
    stage: "queued",
    message: "Render job started.",
    progress: job.progress
  });
  const renders: RenderedVideo[] = [];
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
      const createdAt = new Date().toISOString();
      job = await advanceJobStage(
        projectId,
        jobId,
        "tts",
        index + 2,
        scriptsToRender.length + 3,
        `Generating voiceover for draft ${index + 1}/${scriptsToRender.length}.`
      );
      const voiceoverPath = await createProviderVoiceover(projectId, script);
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
        const rendered = await renderDraft({
          projectId,
          projectDir: store.projectDir(projectId),
          profile: project.profile,
          recording: project.recording,
          script,
          moment,
          title: concept?.title ?? script.hook,
          voiceoverPath: voiceoverPath ?? undefined
        });
        renders.push({
          id: randomUUID(),
          scriptId: script.id,
          title: concept?.title ?? script.hook,
          status: "completed",
          outputPath: rendered.outputPath,
          outputUrl: rendered.outputUrl,
          validation: rendered.validation,
          createdAt
        });
      } catch (error) {
        renders.push({
          id: randomUUID(),
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
    await store.replaceRenders(projectId, renders);
    await store.appendJobEvent(projectId, {
      jobId,
      kind: "stage",
      stage: "usage",
      message: "Recording render usage.",
      progress: job.progress,
      metadata: { renders: renders.length }
    });
    await recordRenderUsage(projectId, renders);
    job = await store.getJob(projectId, jobId);
    job = renders.some((render) => render.status === "failed")
      ? failJob(job, new Date().toISOString(), "One or more render drafts failed.")
      : succeedJob(job, new Date().toISOString(), "Rendering completed.");
    await store.appendJobEvent(projectId, {
      jobId,
      kind: job.status === "failed" ? "failed" : "succeeded",
      stage: "finalize",
      message: job.userMessage,
      progress: job.progress,
      metadata: { completed: renders.filter((render) => render.status === "completed").length, failed: renders.filter((render) => render.status === "failed").length }
    });
    return store.updateJob(projectId, job);
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
  job = updateJobStage(job, stage, { current, total, unit: "stage" }, new Date().toISOString(), message);
  await store.updateJob(projectId, job);
  await store.appendJobEvent(projectId, {
    jobId,
    kind: "stage",
    stage,
    message,
    progress: job.progress
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
  const failed = failJob(latest, new Date().toISOString(), safeProviderError(error));
  await store.appendJobEvent(projectId, {
    jobId,
    kind: "failed",
    stage: "finalize",
    message: failed.safeError ?? "Job failed.",
    progress: failed.progress,
    metadata: { retryable: failed.retryable }
  });
  return store.updateJob(projectId, failed);
}

async function createProviderVoiceover(projectId: string, script: ScriptDraft): Promise<string | null> {
  const config = loadProviderConfig();
  const provider = new OpenAiProvider({ config: config.openai });
  if (!provider.isConfigured()) {
    return null;
  }
  const startedAt = new Date().toISOString();
  const outputPath = path.join(store.projectDir(projectId), "voiceovers", `${script.id}.wav`);
  try {
    await store.assertUsageAvailable(projectId, "tts_characters", script.voiceoverText.length);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await provider.synthesizeSpeech({
      text: script.voiceoverText,
      instructions: "Speak in a clear product demo voice. Keep pacing natural and concise.",
      outputPath
    });
    await store.appendProviderRuns(projectId, [
      {
        id: randomUUID(),
        kind: "tts",
        provider: "openai",
        model: result.model,
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString()
      }
    ]);
    await store.recordUsage(projectId, {
      metric: "tts_characters",
      quantity: script.voiceoverText.length,
      unit: "character",
      source: "tts",
      idempotencyKey: `tts:${projectId}:${script.id}:${startedAt}`
    });
    return result.outputPath;
  } catch (error) {
    await store.appendProviderRuns(projectId, [
      {
        id: randomUUID(),
        kind: "tts",
        provider: "openai",
        model: config.openai.ttsModel,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: safeProviderError(error)
      }
    ]);
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
    await store.recordUsage(projectId, {
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
    await store.recordUsage(projectId, {
      metric: "llm_runs",
      quantity: completedAnalysisRuns,
      unit: "count",
      source: "analysis",
      idempotencyKey: `analysis:${projectId}:${providerRuns.find((run) => run.kind === "analysis")?.id ?? randomUUID()}`
    });
  }

  const completedOcrFrames = project.frameEvidence.filter((frame) => frame.ocrProvider === "openai").length;
  if (completedOcrFrames > 0) {
    await store.recordUsage(projectId, {
      metric: "llm_runs",
      quantity: completedOcrFrames,
      unit: "count",
      source: "ocr",
      idempotencyKey: `ocr:${projectId}:${providerRuns.find((run) => run.kind === "ocr")?.id ?? randomUUID()}`
    });
  }
}

async function recordRenderUsage(projectId: string, renders: RenderedVideo[]): Promise<void> {
  for (const render of renders) {
    if (render.status !== "completed" || !render.validation) {
      continue;
    }
    await store.recordUsage(projectId, {
      metric: "render_minutes",
      quantity: minutesForDuration(render.validation.durationMs),
      unit: "minute",
      source: "render",
      idempotencyKey: `render:${projectId}:${render.id}`
    });
  }
}

function normalizeUploadFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (normalized.length < 1 || normalized.length > 255) {
    throw new Error("Upload filename must be 1–255 characters.");
  }
  if (!/\.(mp4|mov|webm)$/i.test(normalized)) {
    throw new Error("Recording uploads must be MP4, MOV, or WebM files.");
  }
  return normalized;
}

function normalizeUploadByteSize(byteSize: number): number {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error("Upload byte size must be a positive integer.");
  }
  return byteSize;
}

function toRecordingUploadSession(session: DirectUploadSession): RecordingUploadSession {
  return {
    id: session.id,
    recordingId: session.id,
    provider: session.provider,
    uploadUrl: session.uploadUrl,
    method: session.method,
    headers: session.headers,
    expiresAt: session.expiresAt,
    maxBytes: session.maxBytes,
    contentType: session.contentType,
    originalFileName: session.originalFileName
  };
}

function minutesForDuration(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}
