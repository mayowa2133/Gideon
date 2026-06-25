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
  AuditAction,
  AuditActorType,
  AuditEvent,
  AuditMetadataValue,
  AuditTargetType,
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
import { assertWorkspacePermission, type WorkspaceAction } from "../shared/rbac";

const STORE_FILE = "gideon-store.json";
const MAX_AUDIT_EVENTS = 500;

interface AuditInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  summary: string;
  actorType?: AuditActorType;
  metadata?: Record<string, AuditMetadataValue>;
  createdAt?: string;
}

interface UpdateProjectOptions {
  action?: WorkspaceAction;
  audit?: AuditInput;
}

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
    const workspaceId = state.activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID;
    requireWorkspace(state, workspaceId);
    this.assertWorkspaceAccessInState(state, workspaceId, "project:read");
    return state.projects.filter((project) => project.workspaceId === workspaceId);
  }

  async getActiveProject(): Promise<Project | null> {
    const state = await this.load();
    const workspaceId = state.activeWorkspaceId ?? DEFAULT_LOCAL_WORKSPACE_ID;
    requireWorkspace(state, workspaceId);
    this.assertWorkspaceAccessInState(state, workspaceId, "project:read");
    const workspaceProjects = state.projects.filter((project) => project.workspaceId === workspaceId);
    return workspaceProjects.find((project) => project.id === state.activeProjectId) ?? workspaceProjects[0] ?? null;
  }

  async getProject(projectId: string): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, "project:read");
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
    this.assertWorkspaceAccessInState(state, workspaceId, "project:create");
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
    this.appendAuditToState(state, {
      workspaceId,
      projectId: project.id,
      action: "project.create",
      targetType: "project",
      targetId: project.id,
      summary: `Created project ${project.name}.`,
      metadata: { projectName: project.name }
    });
    await this.save();
    return project;
  }

  async updateProfile(projectId: string, profile: ProductProfile): Promise<Project> {
    const normalized = normalizeProfile(profile);
    return this.updateProject(
      projectId,
      (project) => {
        project.profile = normalized;
        project.name = project.name.trim() || project.profile.productName;
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "project.update_profile",
          targetType: "project",
          targetId: projectId,
          summary: `Updated product context for ${normalized.productName}.`,
          metadata: { productName: normalized.productName }
        }
      }
    );
  }

  async attachRecording(projectId: string, recording: RecordingMetadata): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
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
      },
      {
        audit: {
          action: "recording.attach",
          targetType: "recording",
          targetId: recording.artifactId,
          summary: `Attached recording ${recording.fileName}.`,
          metadata: { fileName: recording.fileName, durationMs: recording.durationMs, sizeBytes: recording.sizeBytes }
        }
      }
    );
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
    return this.updateProject(
      projectId,
      (draft) => {
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
      },
      {
        audit: {
          action: "analysis.complete",
          targetType: "project",
          targetId: projectId,
          summary: `Completed analysis with ${analysis.moments.length} moments.`,
          metadata: {
            moments: analysis.moments.length,
            transcriptStatus: analysis.transcript?.status ?? null,
            frameEvidence: analysis.frameEvidence?.length ?? 0,
            providerRuns: analysis.providerRuns?.length ?? 0
          }
        }
      }
    );
  }

  async updateMoments(projectId: string, moments: DetectedMoment[], actorType: AuditActorType = "local_user"): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.moments = moments;
        project.analysisSummary = undefined;
        project.concepts = [];
        project.scripts = [];
        project.renders = [];
        project.status = "analyzed";
        project.updatedAt = new Date().toISOString();
      },
      {
        action: actorType === "mcp_agent" ? "mcp:write" : "project:update",
        audit: {
          actorType,
          action: "moments.update",
          targetType: "moment",
          summary: `Updated ${moments.length} detected moments.`,
          metadata: { moments: moments.length }
        }
      }
    );
  }

  async generateConcepts(projectId: string): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        if (project.moments.length === 0) {
          throw new Error("Run analysis before generating concepts.");
        }
        project.concepts = generateConcepts(project.profile, project.moments, randomUUID);
        project.scripts = [];
        project.renders = [];
        project.status = "concept_review";
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "concepts.generate",
          targetType: "concept",
          summary: "Generated content concepts."
        }
      }
    );
  }

  async updateConcepts(projectId: string, concepts: ContentConcept[], changedId: string): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.concepts = enforceSelectionLimit(concepts, changedId);
        project.scripts = [];
        project.renders = [];
        project.status = "concept_review";
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "concepts.update",
          targetType: "concept",
          targetId: changedId,
          summary: "Updated concept selections.",
          metadata: { changedId, selected: concepts.filter((concept) => concept.selected).length }
        }
      }
    );
  }

  async generateScripts(projectId: string): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        if (project.concepts.filter((concept) => concept.selected).length === 0) {
          throw new Error("Select up to three concepts before generating scripts.");
        }
        project.scripts = generateScripts(project.profile, project.concepts, project.moments, randomUUID, () =>
          new Date().toISOString()
        );
        project.renders = [];
        project.status = "script_review";
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "scripts.generate",
          targetType: "script",
          summary: "Generated script drafts."
        }
      }
    );
  }

  async updateScripts(projectId: string, scripts: ScriptDraft[], actorType: AuditActorType = "local_user"): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.scripts = scripts.map((script) => ({ ...script, updatedAt: new Date().toISOString() }));
        project.renders = [];
        project.status = "script_review";
        project.updatedAt = new Date().toISOString();
      },
      {
        action: actorType === "mcp_agent" ? "mcp:write" : "project:update",
        audit: {
          actorType,
          action: "scripts.update",
          targetType: "script",
          summary: `Updated ${scripts.length} script drafts.`,
          metadata: { scripts: scripts.length }
        }
      }
    );
  }

  async replaceRenders(projectId: string, renders: RenderedVideo[]): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.renders = renders;
        project.providerRuns = project.providerRuns ?? [];
        project.status = renders.some((render) => render.status === "failed") ? "failed" : "ready";
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          actorType: "system",
          action: "render.complete",
          targetType: "render",
          summary: `Stored ${renders.length} render results.`,
          metadata: {
            renders: renders.length,
            completed: renders.filter((render) => render.status === "completed").length,
            failed: renders.filter((render) => render.status === "failed").length
          }
        }
      }
    );
  }

  async appendProviderRuns(projectId: string, providerRuns: ProviderRun[]): Promise<Project> {
    return this.updateProject(projectId, (project) => {
      project.providerRuns = [...(project.providerRuns ?? []), ...providerRuns];
      project.updatedAt = new Date().toISOString();
    });
  }

  async appendArtifact(projectId: string, artifact: ArtifactRecord): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.artifacts = [...(project.artifacts ?? []), artifact];
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "artifact.create",
          targetType: "artifact",
          targetId: artifact.id,
          summary: `Stored ${artifact.kind} artifact ${artifact.originalFileName}.`,
          metadata: { kind: artifact.kind, byteSize: artifact.byteSize, provider: artifact.provider }
        }
      }
    );
  }

  async assertProjectPermission(projectId: string, action: WorkspaceAction): Promise<void> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, action);
  }

  async assertUsageAvailable(projectId: string, metric: UsageMetric, additionalQuantity: number): Promise<void> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, "project:read");
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
    this.assertProjectAccessInState(state, project, input.source === "export" ? "export:create" : "project:update");
    const now = input.createdAt ?? new Date().toISOString();
    const nextUsageEvents = mergeUsageEvent(state.usageEvents, {
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
    if (nextUsageEvents.length !== state.usageEvents.length) {
      this.appendAuditToState(state, {
        workspaceId: project.workspaceId,
        projectId,
        action: "usage.record",
        targetType: "usage",
        summary: `Recorded ${input.quantity} ${input.unit} of ${input.metric}.`,
        metadata: { metric: input.metric, quantity: input.quantity, unit: input.unit, source: input.source },
        createdAt: now
      });
    }
    state.usageEvents = nextUsageEvents;
    project.updatedAt = now;
    await this.save();
    return project;
  }

  async appendJob(projectId: string, job: JobRecord, actorType: AuditActorType = "local_user"): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.jobs = [...(project.jobs ?? []), job];
        project.updatedAt = new Date().toISOString();
      },
      {
        action: "job:write",
        audit: {
          actorType,
          action: "job.create",
          targetType: "job",
          targetId: job.id,
          summary: `Queued ${job.kind} job.`,
          metadata: { jobKind: job.kind, status: job.status }
        }
      }
    );
  }

  async updateJob(projectId: string, job: JobRecord, options: UpdateProjectOptions = { action: "job:write" }): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        const jobs = project.jobs ?? [];
        project.jobs = jobs.some((candidate) => candidate.id === job.id)
          ? jobs.map((candidate) => (candidate.id === job.id ? job : candidate))
          : [...jobs, job];
        project.updatedAt = new Date().toISOString();
      },
      { action: options.action ?? "job:write", audit: options.audit }
    );
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
    return this.updateJob(projectId, requestJobCancelState(job, new Date().toISOString()), {
      action: "job:write",
      audit: {
        action: "job.cancel",
        targetType: "job",
        targetId: jobId,
        summary: `Requested cancel for ${job.kind} job.`,
        metadata: { jobKind: job.kind, status: job.status }
      }
    });
  }

  async finishJobCancel(projectId: string, jobId: string): Promise<Project> {
    const job = await this.getJob(projectId, jobId);
    return this.updateJob(projectId, finishJobCancelState(job, new Date().toISOString()));
  }

  async retryJob(projectId: string, jobId: string): Promise<JobRecord> {
    const job = await this.getJob(projectId, jobId);
    const retried = retryJobState(job, new Date().toISOString());
    await this.updateJob(projectId, retried, {
      action: "job:write",
      audit: {
        action: "job.retry",
        targetType: "job",
        targetId: jobId,
        summary: `Retried ${job.kind} job.`,
        metadata: { jobKind: job.kind, nextAttempt: retried.attempt }
      }
    });
    return retried;
  }

  async setActiveProject(projectId: string): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, "project:read");
    state.activeProjectId = projectId;
    await this.save();
    return project;
  }

  async deleteProject(projectId: string): Promise<AppState> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, "project:delete");
    this.appendAuditToState(state, {
      workspaceId: project.workspaceId,
      projectId,
      action: "project.delete",
      targetType: "project",
      targetId: projectId,
      summary: `Deleted project ${project.name}.`,
      metadata: { projectName: project.name }
    });
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

  private async updateProject(projectId: string, updater: (project: Project) => void, options: UpdateProjectOptions = {}): Promise<Project> {
    const state = await this.load();
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    this.assertProjectAccessInState(state, project, options.action ?? "project:update");
    updater(project);
    state.activeProjectId = project.id;
    if (options.audit) {
      this.appendAuditToState(state, {
        ...options.audit,
        workspaceId: project.workspaceId,
        projectId
      });
    }
    await this.save();
    return project;
  }

  private assertWorkspaceAccessInState(state: AppState, workspaceId: string, action: WorkspaceAction): void {
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId,
      userId: state.activeUserId,
      action
    });
  }

  private assertProjectAccessInState(state: AppState, project: Project, action: WorkspaceAction): void {
    requireWorkspace(state, project.workspaceId);
    this.assertWorkspaceAccessInState(state, project.workspaceId, action);
  }

  private appendAuditToState(
    state: AppState,
    input: AuditInput & { workspaceId: string; projectId?: string }
  ): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actorUserId: state.activeUserId ?? DEFAULT_LOCAL_USER_ID,
      actorType: input.actorType ?? "local_user",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata,
      createdAt: input.createdAt ?? new Date().toISOString()
    };
    state.auditEvents = [...(state.auditEvents ?? []), event].slice(-MAX_AUDIT_EVENTS);
    return event;
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
    auditEvents: raw.auditEvents ?? [],
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
    auditEvents: [],
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
