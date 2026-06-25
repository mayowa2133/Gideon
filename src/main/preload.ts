import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  ContentConcept,
  CreateProjectInput,
  DetectedMoment,
  PlatformInfo,
  ProductProfile,
  Project,
  ScriptDraft
} from "../shared/types";

const api = {
  platformInfo: (): Promise<PlatformInfo> => ipcRenderer.invoke("platform:info"),
  listProjects: (): Promise<AppState> => ipcRenderer.invoke("project:list"),
  setActiveProject: (projectId: string): Promise<Project> => ipcRenderer.invoke("project:set-active", projectId),
  createProject: (input: CreateProjectInput): Promise<Project> => ipcRenderer.invoke("project:create", input),
  updateProfile: (projectId: string, profile: ProductProfile): Promise<Project> =>
    ipcRenderer.invoke("project:update-profile", projectId, profile),
  deleteProject: (projectId: string): Promise<AppState> => ipcRenderer.invoke("project:delete", projectId),
  chooseRecording: (projectId: string): Promise<Project | null> => ipcRenderer.invoke("recording:choose", projectId),
  runAnalysis: (projectId: string): Promise<Project> => ipcRenderer.invoke("analysis:run", projectId),
  updateMoments: (projectId: string, moments: DetectedMoment[]): Promise<Project> =>
    ipcRenderer.invoke("analysis:update-moments", projectId, moments),
  generateConcepts: (projectId: string): Promise<Project> => ipcRenderer.invoke("concepts:generate", projectId),
  updateConcepts: (projectId: string, concepts: ContentConcept[], changedId: string): Promise<Project> =>
    ipcRenderer.invoke("concepts:update", projectId, concepts, changedId),
  generateScripts: (projectId: string): Promise<Project> => ipcRenderer.invoke("scripts:generate", projectId),
  updateScripts: (projectId: string, scripts: ScriptDraft[]): Promise<Project> =>
    ipcRenderer.invoke("scripts:update", projectId, scripts),
  renderSelected: (projectId: string): Promise<Project> => ipcRenderer.invoke("render:selected", projectId),
  exportVideo: (projectId: string, renderId: string): Promise<string | null> =>
    ipcRenderer.invoke("export:video", projectId, renderId),
  revealPath: (filePath: string): Promise<void> => ipcRenderer.invoke("shell:reveal", filePath)
};

contextBridge.exposeInMainWorld("gideon", api);

export type GideonApi = typeof api;

