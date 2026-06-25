import { contextBridge, ipcRenderer } from "electron";
import type {
  AddWorkspaceMemberInput,
  AppState,
  ContentConcept,
  CreateProjectInput,
  CreateWorkspaceInput,
  DetectedMoment,
  PlatformInfo,
  ProductProfile,
  Project,
  RemoveWorkspaceMemberInput,
  ScriptDraft,
  UpdateWorkspaceMemberRoleInput
} from "../shared/types";

const api = {
  platformInfo: (): Promise<PlatformInfo> => ipcRenderer.invoke("platform:info"),
  listProjects: (): Promise<AppState> => ipcRenderer.invoke("project:list"),
  createWorkspace: (input: CreateWorkspaceInput): Promise<AppState> => ipcRenderer.invoke("workspace:create", input),
  setActiveWorkspace: (workspaceId: string): Promise<AppState> => ipcRenderer.invoke("workspace:set-active", workspaceId),
  addWorkspaceMember: (input: AddWorkspaceMemberInput): Promise<AppState> =>
    ipcRenderer.invoke("workspace:add-member", input),
  updateWorkspaceMemberRole: (input: UpdateWorkspaceMemberRoleInput): Promise<AppState> =>
    ipcRenderer.invoke("workspace:update-member-role", input),
  removeWorkspaceMember: (input: RemoveWorkspaceMemberInput): Promise<AppState> =>
    ipcRenderer.invoke("workspace:remove-member", input),
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
  cancelJob: (projectId: string, jobId: string): Promise<Project> => ipcRenderer.invoke("job:cancel", projectId, jobId),
  retryJob: (projectId: string, jobId: string): Promise<Project> => ipcRenderer.invoke("job:retry", projectId, jobId),
  exportVideo: (projectId: string, renderId: string): Promise<string | null> =>
    ipcRenderer.invoke("export:video", projectId, renderId),
  revealPath: (filePath: string): Promise<void> => ipcRenderer.invoke("shell:reveal", filePath)
};

contextBridge.exposeInMainWorld("gideon", api);

export type GideonApi = typeof api;
