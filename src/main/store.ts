import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createDefaultProfile,
  createMoments,
  enforceSelectionLimit,
  generateConcepts,
  generateScripts,
  validateProfile
} from "../shared/contentEngine";
import type {
  AppState,
  ContentConcept,
  CreateProjectInput,
  DetectedMoment,
  ProviderRun,
  ProductProfile,
  Project,
  RecordingMetadata,
  RenderedVideo,
  ScriptDraft,
  TranscriptArtifact
} from "../shared/types";

const STORE_FILE = "gideon-store.json";

export class GideonStore {
  private state: AppState | null = null;

  async load(): Promise<AppState> {
    if (this.state) {
      return this.state;
    }

    const filePath = this.storePath();
    try {
      const raw = await fs.readFile(filePath, "utf8");
      this.state = normalizeAppState(JSON.parse(raw) as AppState);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.state = { projects: [], activeProjectId: null };
      await this.save();
    }
    return this.state;
  }

  async listProjects(): Promise<Project[]> {
    const state = await this.load();
    return state.projects;
  }

  async getActiveProject(): Promise<Project | null> {
    const state = await this.load();
    return state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0] ?? null;
  }

  async getProject(projectId: string): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    return project;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const profile = normalizeProfile(input.profile);
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name.trim() || profile.productName,
      status: "draft",
      profile,
      moments: [],
      concepts: [],
      scripts: [],
      renders: [],
      providerRuns: [],
      createdAt: now,
      updatedAt: now
    };
    const state = await this.load();
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    await this.save();
    return project;
  }

  async updateProfile(projectId: string, profile: ProductProfile): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.profile = normalizeProfile(profile);
      project.name = project.name.trim() || project.profile.productName;
      project.updatedAt = new Date().toISOString();
    });
  }

  async attachRecording(projectId: string, recording: RecordingMetadata): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.recording = recording;
      project.status = "recording_ready";
      project.transcript = undefined;
      project.analysisSummary = undefined;
      project.moments = [];
      project.concepts = [];
      project.scripts = [];
      project.renders = [];
      project.providerRuns = project.providerRuns ?? [];
      project.updatedAt = new Date().toISOString();
    });
  }

  async runAnalysis(
    projectId: string,
    enrich: (project: Project, moments: DetectedMoment[]) => Promise<{
      moments: DetectedMoment[];
      transcript?: TranscriptArtifact;
      analysisSummary?: string;
      providerRuns?: ProviderRun[];
    }>
  ): Promise<Project> {
    const project = await this.getProject(projectId);
    if (!project.recording) {
      throw new Error("Choose and validate a recording before analysis.");
    }
    const moments = createMoments(project.profile, project.recording, randomUUID);
    const analysis = await enrich(project, moments);
    return this.updateProject(projectId, (draft) => {
      draft.moments = analysis.moments;
      draft.transcript = analysis.transcript;
      draft.analysisSummary = analysis.analysisSummary;
      draft.concepts = [];
      draft.scripts = [];
      draft.renders = [];
      draft.providerRuns = [...(draft.providerRuns ?? []), ...(analysis.providerRuns ?? [])];
      draft.status = "analyzed";
      draft.updatedAt = new Date().toISOString();
    });
  }

  async updateMoments(projectId: string, moments: DetectedMoment[]): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.moments = moments;
      project.analysisSummary = undefined;
      project.concepts = [];
      project.scripts = [];
      project.renders = [];
      project.status = "analyzed";
      project.updatedAt = new Date().toISOString();
    });
  }

  async generateConcepts(projectId: string): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      if (project.moments.length === 0) {
        throw new Error("Run analysis before generating concepts.");
      }
      project.concepts = generateConcepts(project.profile, project.moments, randomUUID);
      project.scripts = [];
      project.renders = [];
      project.status = "concept_review";
      project.updatedAt = new Date().toISOString();
    });
  }

  async updateConcepts(projectId: string, concepts: ContentConcept[], changedId: string): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.concepts = enforceSelectionLimit(concepts, changedId);
      project.scripts = [];
      project.renders = [];
      project.status = "concept_review";
      project.updatedAt = new Date().toISOString();
    });
  }

  async generateScripts(projectId: string): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      if (project.concepts.filter((concept) => concept.selected).length === 0) {
        throw new Error("Select up to three concepts before generating scripts.");
      }
      project.scripts = generateScripts(project.profile, project.concepts, project.moments, randomUUID, () =>
        new Date().toISOString()
      );
      project.renders = [];
      project.status = "script_review";
      project.updatedAt = new Date().toISOString();
    });
  }

  async updateScripts(projectId: string, scripts: ScriptDraft[]): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.scripts = scripts.map((script) => ({ ...script, updatedAt: new Date().toISOString() }));
      project.renders = [];
      project.status = "script_review";
      project.updatedAt = new Date().toISOString();
    });
  }

  async replaceRenders(projectId: string, renders: RenderedVideo[]): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.renders = renders;
      project.providerRuns = project.providerRuns ?? [];
      project.status = renders.some((render) => render.status === "failed") ? "failed" : "ready";
      project.updatedAt = new Date().toISOString();
    });
  }

  async appendProviderRuns(projectId: string, providerRuns: ProviderRun[]): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.providerRuns = [...(project.providerRuns ?? []), ...providerRuns];
      project.updatedAt = new Date().toISOString();
    });
  }

  async setActiveProject(projectId: string): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    state.activeProjectId = projectId;
    await this.save();
    return project;
  }

  async deleteProject(projectId: string): Promise<AppState> {
    const state = await this.load();
    state.projects = state.projects.filter((project) => project.id !== projectId);
    if (state.activeProjectId === projectId) {
      state.activeProjectId = state.projects[0]?.id ?? null;
    }
    await this.save();
    return state;
  }

  projectDir(projectId: string): string {
    return path.join(app.getPath("userData"), "projects", projectId);
  }

  private async updateProject(projectId: string, updater: (project: Project) => void): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    updater(project);
    state.activeProjectId = project.id;
    await this.save();
    return project;
  }

  private async save(): Promise<void> {
    if (!this.state) {
      return;
    }
    const filePath = this.storePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.state, null, 2));
    await fs.rename(temporaryPath, filePath);
  }

  private storePath(): string {
    return path.join(app.getPath("userData"), STORE_FILE);
  }
}

function normalizeAppState(state: AppState): AppState {
  return {
    activeProjectId: state.activeProjectId ?? null,
    projects: (state.projects ?? []).map((project) => ({
      ...project,
      moments: project.moments ?? [],
      concepts: project.concepts ?? [],
      scripts: project.scripts ?? [],
      renders: project.renders ?? [],
      providerRuns: project.providerRuns ?? []
    }))
  };
}

export function newProjectTemplate(): CreateProjectInput {
  return {
    name: "",
    profile: createDefaultProfile()
  };
}

function normalizeProfile(profile: ProductProfile): ProductProfile {
  return {
    productName: profile.productName.trim(),
    targetCustomer: profile.targetCustomer.trim(),
    productDescription: profile.productDescription.trim(),
    preferredTone: profile.preferredTone,
    toneGuidance: profile.toneGuidance.trim(),
    platforms: [...new Set(profile.platforms)],
    walkthroughNotes: profile.walkthroughNotes.trim()
  };
}
