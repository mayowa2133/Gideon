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
import { LocalPrivateObjectStorage } from "./storage";
import type { AppState, ContentConcept, DetectedMoment, Project, ProviderRun, RenderedVideo, ScriptDraft } from "../shared/types";
import { runAnalysisPipeline, safeProviderError } from "./analysisPipeline";
import { loadProviderConfig } from "./providers/config";
import { OpenAiProvider } from "./providers/openai";
import { createJob, failJob, startJob, succeedJob } from "../shared/jobState";

const store = new GideonStore();
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
  ipcMain.handle("platform:info", async () => ({
    appVersion: app.getVersion(),
    userDataPath: app.getPath("userData"),
    openAiConfigured: Boolean(loadProviderConfig().openai.apiKey),
    openAiLlmModel: loadProviderConfig().openai.apiKey ? loadProviderConfig().openai.llmModel : null,
    openAiTranscriptionModel: loadProviderConfig().openai.apiKey ? loadProviderConfig().openai.transcriptionModel : null,
    openAiTtsModel: loadProviderConfig().openai.apiKey ? loadProviderConfig().openai.ttsModel : null,
    ...(await getToolAvailability())
  }));

  ipcMain.handle("project:list", async () => activeWorkspaceState());

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
    const stored = await new LocalPrivateObjectStorage(store.storageRoot()).putFile({
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

  ipcMain.handle("analysis:run", async (_event, projectId: string) => {
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
    await store.appendJob(projectId, job);
    return runAnalysisJob(projectId, job.id);
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
    const job = createJob({
      id: randomUUID(),
      projectId,
      kind: "render",
      now: new Date().toISOString(),
      userMessage: "Waiting to render selected drafts."
    });
    await store.appendJob(projectId, job);
    return runRenderJob(projectId, job.id);
  });

  ipcMain.handle("job:cancel", async (_event, projectId: string, jobId: string) => store.requestJobCancel(projectId, jobId));

  ipcMain.handle("job:retry", async (_event, projectId: string, jobId: string) => {
    const job = await store.retryJob(projectId, jobId);
    if (job.kind === "analysis") {
      return runAnalysisJob(projectId, job.id);
    }
    if (job.kind === "render") {
      return runRenderJob(projectId, job.id);
    }
    throw new Error(`Retry is not wired for ${job.kind} jobs yet.`);
  });

  ipcMain.handle("export:video", async (_event, projectId: string, renderId: string) => {
    const project = await store.getProject(projectId);
    const render = project.renders.find((candidate) => candidate.id === renderId);
    if (!render?.outputPath) {
      throw new Error("Rendered video not found.");
    }
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

async function activeWorkspaceState(): Promise<AppState> {
  const state = await store.load();
  const activeProject = await store.getActiveProject();
  return {
    ...state,
    projects: await store.listProjects(),
    activeProjectId: activeProject?.id ?? null
  };
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
  try {
    await assertAnalysisQuota(project);
    if (await finishIfCancelRequested(projectId, jobId)) {
      return store.getProject(projectId);
    }
    const analyzed = await store.runAnalysis(projectId, (analysisProject, moments) =>
      runAnalysisPipeline(analysisProject, moments, store.projectDir(projectId))
    );
    await recordAnalysisUsage(projectId, analyzed, analyzed.providerRuns.slice(providerRunStartCount));
    if (await finishIfCancelRequested(projectId, jobId)) {
      return store.getProject(projectId);
    }
    job = await store.getJob(projectId, jobId);
    job = succeedJob(job, new Date().toISOString(), "Analysis completed.");
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
  const renders: RenderedVideo[] = [];
  try {
    await store.assertUsageAvailable(projectId, "render_minutes", scripts.length);
    for (const script of scripts.slice(0, 3)) {
      if (await finishIfCancelRequested(projectId, jobId)) {
        return store.getProject(projectId);
      }
      const concept = project.concepts.find((candidate) => candidate.id === script.conceptId);
      const moment = concept?.proofMomentIds
        .map((momentId) => project.moments.find((candidate) => candidate.id === momentId))
        .find(Boolean);
      const createdAt = new Date().toISOString();
      const voiceoverPath = await createProviderVoiceover(projectId, script);
      if (await finishIfCancelRequested(projectId, jobId)) {
        return store.getProject(projectId);
      }
      try {
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
    await store.replaceRenders(projectId, renders);
    await recordRenderUsage(projectId, renders);
    job = await store.getJob(projectId, jobId);
    job = renders.some((render) => render.status === "failed")
      ? failJob(job, new Date().toISOString(), "One or more render drafts failed.")
      : succeedJob(job, new Date().toISOString(), "Rendering completed.");
    return store.updateJob(projectId, job);
  } catch (error) {
    return failOrCancelJob(projectId, jobId, error);
  }
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
  return store.updateJob(projectId, failJob(latest, new Date().toISOString(), safeProviderError(error)));
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

function minutesForDuration(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}
