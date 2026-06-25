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
  ArtifactRecord,
  ContentConcept,
  CreateProjectInput,
  DetectedMoment,
  JobRecord,
  FrameEvidence,
  ProviderRun,
  ProductProfile,
  Project,
  RecordingMetadata,
  RenderedVideo,
  ScriptDraft,
  TranscriptArtifact,
  UsageEvent,
  UsageMetric
} from "../shared/types";
import {
  assertWithinEntitlement,
  createLocalUserWorkspace,
  DEFAULT_LOCAL_USER_ID,
  DEFAULT_LOCAL_WORKSPACE_ID,
  defaultLocalEntitlements,
  mergeUsageEvent,
  summarizeUsage
} from "../shared/usage";
import {
  finishJobCancel as finishJobCancelState,
  requestJobCancel as requestJobCancelState,
  retryJob as retryJobState
} from "../shared/jobState";

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
      this.state = createInitialAppState();
      await this.save();
    }
    return this.state;
  }

  async listProjects(): Promise<Project[]> {
    const state = await this.load();
    return state.projects.filter((project) => project.workspaceId === state.activeWorkspaceId);
  }

  async getActiveProject(): Promise<Project | null> {
    const state = await this.load();
    const workspaceProjects = state.projects.filter((project) => project.workspaceId === state.activeWorkspaceId);
    return workspaceProjects.find((project) => project.id === state.activeProjectId) ?? workspaceProjects[0] ?? null;
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
    const state = await this.load();
    const workspaceId = state.activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID;
    const workspace = requireWorkspace(state, workspaceId);
    const workspaceProjectCount = state.projects.filter((project) => project.workspaceId === workspaceId).length;
    if (workspaceProjectCount >= workspace.entitlements.maxProjects) {
      throw new Error(`Project limit exceeded. This workspace allows ${workspace.entitlements.maxProjects} projects.`);
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      workspaceId,
      name: input.name.trim() || profile.productName,
      status: "draft",
      profile,
      moments: [],
      frameEvidence: [],
      concepts: [],
      scripts: [],
      renders: [],
      artifacts: [],
      providerRuns: [],
      jobs: [],
      createdAt: now,
      updatedAt: now
    };
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
      project.frameEvidence = [];
      project.moments = [];
      project.concepts = [];
      project.scripts = [];
      project.renders = [];
      project.artifacts = project.artifacts ?? [];
      project.providerRuns = project.providerRuns ?? [];
      project.jobs = project.jobs ?? [];
      project.updatedAt = new Date().toISOString();
    });
  }

  async runAnalysis(
    projectId: string,
    enrich: (project: Project, moments: DetectedMoment[]) => Promise<{
      moments: DetectedMoment[];
      transcript?: TranscriptArtifact;
      analysisSummary?: string;
      frameEvidence?: FrameEvidence[];
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
      draft.frameEvidence = analysis.frameEvidence ?? [];
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

  async appendArtifact(projectId: string, artifact: ArtifactRecord): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.artifacts = [...(project.artifacts ?? []), artifact];
      project.updatedAt = new Date().toISOString();
    });
  }

  async assertUsageAvailable(projectId: string, metric: UsageMetric, additionalQuantity: number): Promise<void> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    const workspace = requireWorkspace(state, project.workspaceId);
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric,
      additionalQuantity
    });
  }

  async recordUsage(
    projectId: string,
    input: Omit<UsageEvent, "id" | "workspaceId" | "projectId" | "createdAt"> & { createdAt?: string }
  ): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    const now = input.createdAt ?? new Date().toISOString();
    state.usageEvents = mergeUsageEvent(state.usageEvents, {
      id: randomUUID(),
      workspaceId: project.workspaceId,
      projectId,
      metric: input.metric,
      quantity: input.quantity,
      unit: input.unit,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      createdAt: now
    });
    project.updatedAt = now;
    await this.save();
    return project;
  }

  async appendJob(projectId: string, job: JobRecord): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.jobs = [...(project.jobs ?? []), job];
      project.updatedAt = new Date().toISOString();
    });
  }

  async updateJob(projectId: string, job: JobRecord): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      const jobs = project.jobs ?? [];
      project.jobs = jobs.some((candidate) => candidate.id === job.id)
        ? jobs.map((candidate) => (candidate.id === job.id ? job : candidate))
        : [...jobs, job];
      project.updatedAt = new Date().toISOString();
    });
  }

  async getJob(projectId: string, jobId: string): Promise<JobRecord> {
    const project = await this.getProject(projectId);
    const job = project.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      throw new Error("Job not found.");
    }
    return job;
  }

  async requestJobCancel(projectId: string, jobId: string): Promise<Project> {
    const job = await this.getJob(projectId, jobId);
    return this.updateJob(projectId, requestJobCancelState(job, new Date().toISOString()));
  }

  async finishJobCancel(projectId: string, jobId: string): Promise<Project> {
    const job = await this.getJob(projectId, jobId);
    return this.updateJob(projectId, finishJobCancelState(job, new Date().toISOString()));
  }

  async retryJob(projectId: string, jobId: string): Promise<JobRecord> {
    const job = await this.getJob(projectId, jobId);
    const retried = retryJobState(job, new Date().toISOString());
    await this.updateJob(projectId, retried);
    return retried;
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
      state.activeProjectId =
        state.projects.find((project) => project.workspaceId === state.activeWorkspaceId)?.id ?? null;
    }
    await this.save();
    return state;
  }

  projectDir(projectId: string): string {
    return path.join(app.getPath("userData"), "projects", projectId);
  }

  storageRoot(): string {
    return path.join(app.getPath("userData"), "private-storage");
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
  const raw = state as Partial<AppState>;
  const local = createLocalUserWorkspace();
  const users = raw.users?.length ? raw.users : local.users;
  const workspaces = raw.workspaces?.length
    ? raw.workspaces.map((workspace) => ({
        ...workspace,
        entitlements: {
          ...defaultLocalEntitlements,
          ...workspace.entitlements
        }
      }))
    : local.workspaces;
  const workspaceMembers = raw.workspaceMembers?.length ? raw.workspaceMembers : local.workspaceMembers;
  const activeUserId = raw.activeUserId ?? users[0]?.id ?? DEFAULT_LOCAL_USER_ID;
  const activeWorkspaceId = raw.activeWorkspaceId ?? workspaces[0]?.id ?? DEFAULT_LOCAL_WORKSPACE_ID;
  return {
    users,
    workspaces,
    workspaceMembers,
    usageEvents: raw.usageEvents ?? [],
    activeUserId,
    activeWorkspaceId,
    activeProjectId: raw.activeProjectId ?? null,
    projects: (raw.projects ?? []).map((project) => ({
      ...project,
      workspaceId: project.workspaceId ?? activeWorkspaceId,
      moments: project.moments ?? [],
      frameEvidence: project.frameEvidence ?? [],
      concepts: project.concepts ?? [],
      scripts: project.scripts ?? [],
      renders: project.renders ?? [],
      artifacts: project.artifacts ?? [],
      providerRuns: project.providerRuns ?? [],
      jobs: project.jobs ?? []
    }))
  };
}

function createInitialAppState(): AppState {
  return {
    ...createLocalUserWorkspace(),
    usageEvents: [],
    projects: [],
    activeProjectId: null
  };
}

function requireWorkspace(state: AppState, workspaceId: string) {
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }
  return workspace;
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
