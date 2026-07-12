import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  copyExport,
  getToolAvailability,
  probeRecording
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
import { isWorkerQueueCanceledError, loadLocalWorkerQueueOptions, LocalWorkerQueue } from "./jobQueue";
import { startGideonControlServer } from "./controlServer";
import { createGideonJobExecutor } from "./jobExecutor";
import { createExecutorWorkerQueueTask } from "./jobExecutorAdapter";
import type {
  AddWorkspaceMemberInput,
  AppState,
  CompleteRecordingUploadSessionInput,
  ContentConcept,
  CreateRecordingUploadSessionInput,
  CreateWorkspaceInput,
  DetectedMoment,
  JobRecord,
  Project,
  RecordingUploadSession,
  RemoveWorkspaceMemberInput,
  ScriptDraft,
  UpdateWorkspaceBillingPlanInput,
  UpdateWorkspaceMemberRoleInput
} from "../shared/types";
import { loadProviderConfig } from "./providers/config";
import { createJob, findActiveJob } from "../shared/jobState";
import { hasBlockingScriptWarnings } from "../shared/renderTemplates";
import { validateAvatarSourceImage } from "./avatarSource";

const store = new GideonStore();
const workerQueue = new LocalWorkerQueue(loadLocalWorkerQueueOptions());
const jobExecutor = createGideonJobExecutor({ store });
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
    queue: workerQueue.stats(),
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
  ipcMain.handle("workspace:update-billing-plan", async (_event, input: UpdateWorkspaceBillingPlanInput) => {
    await store.updateWorkspaceBillingPlan(input);
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
    const options: OpenDialogOptions = {
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
  ipcMain.handle("voiceover:regenerate", async (_event, projectId: string, scriptId: string) =>
    enqueueVoiceoverFromControl(projectId, scriptId)
  );
  ipcMain.handle("avatar:generate", async (_event, projectId: string, scriptId: string) =>
    enqueueAvatarFromControl(projectId, scriptId)
  );
  ipcMain.handle("avatar:import-source", async (_event, projectId: string, consentAttested: boolean) => {
    if (consentAttested !== true) {
      throw new Error("Confirm that you own or are authorized to use this likeness before importing it.");
    }
    const project = await store.getProject(projectId);
    const options: OpenDialogOptions = {
      title: "Choose your authorized avatar portrait",
      properties: ["openFile"],
      filters: [{ name: "Portrait images", extensions: ["png", "jpg", "jpeg"] }]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    const sourcePath = result.filePaths[0];
    if (result.canceled || !sourcePath) {
      return null;
    }
    const validation = await validateAvatarSourceImage(sourcePath);
    await store.assertUsageAvailable(projectId, "storage_bytes", validation.byteSize);
    const stored = await createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
      workspaceId: project.workspaceId,
      projectId,
      kind: "avatar_source_image",
      sourcePath,
      originalFileName: path.basename(sourcePath),
      contentType: validation.contentType
    });
    await store.appendArtifact(projectId, stored.artifact);
    await store.recordUsage(projectId, {
      metric: "storage_bytes",
      quantity: stored.artifact.byteSize,
      unit: "byte",
      source: "render",
      idempotencyKey: `avatar-source:${projectId}:${stored.artifact.id}:storage_bytes`
    });
    const importedAt = new Date().toISOString();
    return store.updateProfile(projectId, {
      ...project.profile,
      customAvatarSource: {
        artifactId: stored.artifact.id,
        displayName: path.basename(sourcePath),
        importedAt,
        consent: {
          assetType: "real_likeness",
          status: "granted",
          sourceArtifactId: stored.artifact.id,
          consentVerifiedAt: importedAt
        }
      }
    });
  });
  ipcMain.handle("scripts:generate", async (_event, projectId: string) => store.generateScripts(projectId));
  ipcMain.handle("scripts:regenerate", async (_event, projectId: string, scriptId: string) =>
    store.regenerateScript(projectId, scriptId)
  );
  ipcMain.handle("scripts:update", async (_event, projectId: string, scripts: ScriptDraft[]) =>
    store.updateScripts(projectId, scripts)
  );
  ipcMain.handle("brand:choose-logo", async () => {
    const options: OpenDialogOptions = {
      title: "Choose brand logo",
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg"] }
      ]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const logoPath = result.filePaths[0];
    return {
      logoPath,
      logoUrl: pathToFileURL(logoPath).toString()
    };
  });

  ipcMain.handle("render:selected", async (_event, projectId: string) => {
    return enqueueRenderFromControl(projectId);
  });
  ipcMain.handle(
    "render:script",
    async (_event, projectId: string, scriptId: string, voiceoverMode: "regenerate" | "reuse") =>
      enqueueRenderFromControl(projectId, "local_user", { scriptIds: [scriptId], voiceoverMode })
  );

  ipcMain.handle("job:cancel", async (_event, projectId: string, jobId: string) => {
    const project = await store.requestJobCancel(projectId, jobId);
    if (project.jobs.find((candidate) => candidate.id === jobId)?.status === "canceled") {
      workerQueue.cancel(jobId);
    }
    return project;
  });

  ipcMain.handle("job:retry", async (_event, projectId: string, jobId: string) => {
    const currentJob = await store.getJob(projectId, jobId);
    const project = await store.getProject(projectId);
    const activeJob = findActiveJob(project.jobs, currentJob.kind);
    if (activeJob && activeJob.id !== jobId) {
      throw new Error(`A ${currentJob.kind} job is already ${activeJob.status}. Wait for it to finish or cancel it before retrying.`);
    }
    const job = await store.retryJob(projectId, jobId);
    if (job.kind === "analysis") {
      enqueueAnalysisJob(projectId, job.id);
      return store.getProject(projectId);
    }
    if (job.kind === "render") {
      enqueueRenderJob(projectId, job.id);
      return store.getProject(projectId);
    }
    if (job.kind === "tts") {
      enqueueVoiceoverJob(projectId, job.id);
      return store.getProject(projectId);
    }
    if (job.kind === "avatar") {
      enqueueAvatarJob(projectId, job.id);
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
    const exportSize = (await fs.stat(render.outputPath)).size;
    await store.assertUsageAvailable(projectId, "exports", 1);
    await store.assertUsageAvailable(projectId, "storage_bytes", exportSize);
    const stored = await createPrivateObjectStorage({ localRootDir: store.storageRoot() }).putFile({
      workspaceId: project.workspaceId,
      projectId,
      kind: "export",
      sourcePath: render.outputPath,
      originalFileName: path.basename(result.filePath),
      contentType: "video/mp4"
    });
    await store.appendArtifact(projectId, stored.artifact);
    await store.recordUsage(projectId, {
      metric: "storage_bytes",
      quantity: stored.artifact.byteSize,
      unit: "byte",
      source: "export",
      idempotencyKey: `export:${projectId}:${stored.artifact.id}:storage_bytes`
    });
    await copyExport(stored.filePath, result.filePath);
    await store.recordUsage(projectId, {
      metric: "exports",
      quantity: 1,
      unit: "count",
      source: "export",
      idempotencyKey: `export:${projectId}:${stored.artifact.id}:exports`
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
  const activeJob = findActiveJob(project.jobs, "analysis");
  if (activeJob) {
    return project;
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

async function enqueueRenderFromControl(
  projectId: string,
  actorType: "local_user" | "mcp_agent" = "local_user",
  renderScope?: JobRecord["renderScope"]
): Promise<Project> {
  const project = await store.getProject(projectId);
  if (!project.recording) {
    throw new Error("Choose a recording before rendering.");
  }
  if (project.scripts.length === 0) {
    throw new Error("Generate scripts before rendering.");
  }
  const activeJob = findActiveJob(project.jobs, "render");
  if (activeJob) {
    return project;
  }
  const job = createJob({
    id: randomUUID(),
    projectId,
    kind: "render",
    now: new Date().toISOString(),
    userMessage: renderScope?.scriptIds?.length === 1
      ? "Waiting to render one approved draft."
      : "Waiting to render selected drafts.",
    renderScope
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
    if (job.kind === "tts") {
      enqueueVoiceoverJob(job.projectId, job.id);
      continue;
    }
    if (job.kind === "avatar") {
      enqueueAvatarJob(job.projectId, job.id);
      continue;
    }
    console.warn(`Recovered queued ${job.kind} job ${job.id}, but no local runner is wired for that job kind.`);
  }
}

function enqueueAnalysisJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue(createExecutorWorkerQueueTask(jobExecutor, { kind: "analysis", projectId, jobId }))
    .catch((error) => {
      if (isWorkerQueueCanceledError(error)) {
        return;
      }
      console.error(`Analysis job ${jobId} failed outside normal job handling.`, error);
    });
}

function enqueueRenderJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue(createExecutorWorkerQueueTask(jobExecutor, { kind: "render", projectId, jobId }))
    .catch((error) => {
      if (isWorkerQueueCanceledError(error)) {
        return;
      }
      console.error(`Render job ${jobId} failed outside normal job handling.`, error);
    });
}

async function enqueueVoiceoverFromControl(projectId: string, scriptId: string): Promise<Project> {
  const project = await store.getProject(projectId);
  const script = project.scripts.find((candidate) => candidate.id === scriptId);
  if (!script?.approved || hasBlockingScriptWarnings(script.qualityWarnings)) {
    throw new Error("Choose one approved script without blocking warnings before regenerating voiceover.");
  }
  const activeJob = findActiveJob(project.jobs, "tts");
  if (activeJob) {
    return project;
  }
  const job = createJob({
    id: randomUUID(),
    projectId,
    kind: "tts",
    now: new Date().toISOString(),
    userMessage: "Waiting to regenerate voiceover.",
    renderScope: { scriptIds: [scriptId], voiceoverMode: "regenerate" }
  });
  await store.appendJob(projectId, job);
  enqueueVoiceoverJob(projectId, job.id);
  return store.getProject(projectId);
}

function enqueueVoiceoverJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue(createExecutorWorkerQueueTask(jobExecutor, { kind: "tts", projectId, jobId }))
    .catch((error) => {
      if (!isWorkerQueueCanceledError(error)) {
        console.error(`Voiceover job ${jobId} failed outside normal job handling.`, error);
      }
    });
}

async function enqueueAvatarFromControl(projectId: string, scriptId: string): Promise<Project> {
  const project = await store.getProject(projectId);
  const script = project.scripts.find((candidate) => candidate.id === scriptId);
  if (!script?.approved || hasBlockingScriptWarnings(script.qualityWarnings) || !project.profile.avatarPresenterId || project.profile.avatarPresenterId === "logo_head") {
    throw new Error("Choose an approved script and a fictional catalog presenter before generating an avatar clip.");
  }
  const activeJob = findActiveJob(project.jobs, "avatar");
  if (activeJob) {
    return project;
  }
  const job = createJob({
    id: randomUUID(),
    projectId,
    kind: "avatar",
    now: new Date().toISOString(),
    userMessage: "Waiting to generate a fictional avatar presenter.",
    renderScope: { scriptIds: [scriptId], voiceoverMode: "reuse" }
  });
  await store.appendJob(projectId, job);
  enqueueAvatarJob(projectId, job.id);
  return store.getProject(projectId);
}

function enqueueAvatarJob(projectId: string, jobId: string): void {
  void workerQueue
    .enqueue(createExecutorWorkerQueueTask(jobExecutor, { kind: "avatar", projectId, jobId }))
    .catch((error) => {
      if (!isWorkerQueueCanceledError(error)) {
        console.error(`Avatar job ${jobId} failed outside normal job handling.`, error);
      }
    });
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
