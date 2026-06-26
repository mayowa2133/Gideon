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
  AddWorkspaceMemberInput,
  ApplyBillingSubscriptionInput,
  ArtifactRecord,
  ContentConcept,
  CreateProjectInput,
  CreateWorkspaceInput,
  DetectedMoment,
  JobEvent,
  JobRecord,
  FrameEvidence,
  ProviderRun,
  ProductProfile,
  Project,
  RecordingMetadata,
  RecordingUploadSessionRecord,
  RemoveWorkspaceMemberInput,
  RenderedVideo,
  ScriptDraft,
  SyncAuthenticatedUserInput,
  TranscriptArtifact,
  UpdateWorkspaceBillingPlanInput,
  UpdateWorkspaceMemberRoleInput,
  UserAccount,
  UsageEvent,
  UsageMetric,
  Workspace,
  WorkspaceMember
} from "../shared/types";
import {
  assertWithinEntitlement,
  createLocalUserWorkspace,
  DEFAULT_LOCAL_USER_ID,
  DEFAULT_LOCAL_WORKSPACE_ID,
  defaultLocalEntitlements,
  entitlementsForPlan,
  mergeUsageEvent,
  summarizeUsage,
  workspacePlanDefinition
} from "../shared/usage";
import {
  createJobEvent,
  finishJobCancel as finishJobCancelState,
  recoverInterruptedJob,
  requestJobCancel as requestJobCancelState,
  retryJob as retryJobState
} from "../shared/jobState";
import {
  assertCanManageWorkspaceRole,
  assertWorkspacePermission,
  countWorkspaceOwners,
  type WorkspaceAction
} from "../shared/rbac";

const STORE_FILE = "gideon-store.json";
const MAX_AUDIT_EVENTS = 500;
const MAX_PROJECT_JOB_EVENTS = 300;

interface AuditInput {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  summary: string;
  actorUserId?: string;
  actorType?: AuditActorType;
  metadata?: Record<string, AuditMetadataValue>;
  createdAt?: string;
}

interface UpdateProjectOptions {
  action?: WorkspaceAction;
  audit?: AuditInput;
}

type JobEventInput = Omit<JobEvent, "id" | "createdAt" | "projectId"> & { createdAt?: string };

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

  async syncAuthenticatedUser(input: SyncAuthenticatedUserInput): Promise<AppState> {
    const state = await this.load();
    const now = input.now ?? new Date().toISOString();
    const authSubject = normalizeAuthSubject(input.authSubject);
    const email = normalizeEmail(input.email);
    const identityProvider = input.identityProvider ?? "oidc";
    let user = state.users.find((candidate) => candidate.authSubject === authSubject);
    if (!user) {
      user = state.users.find((candidate) => !candidate.authSubject && candidate.email.toLowerCase() === email);
    }
    const displayName = normalizeDisplayName(input.displayName ?? user?.displayName, email);
    if (user) {
      user.email = email;
      user.displayName = displayName;
      user.authSubject = authSubject;
      user.identityProvider = identityProvider;
      user.lastSignedInAt = now;
    } else {
      user = {
        id: randomUUID(),
        email,
        displayName,
        authSubject,
        identityProvider,
        lastSignedInAt: now,
        createdAt: now
      };
      state.users = [...state.users, user];
    }

    let membership = state.workspaceMembers.find((candidate) => candidate.userId === user.id);
    if (!membership || !state.workspaces.some((workspace) => workspace.id === membership?.workspaceId)) {
      state.activeUserId = user.id;
      const workspaceName = normalizeWorkspaceName(input.defaultWorkspaceName ?? `${user.displayName}'s workspace`);
      const workspace: Workspace = {
        id: randomUUID(),
        name: workspaceName,
        slug: uniqueWorkspaceSlug(state.workspaces, workspaceName),
        plan: "local_mvp",
        billingStatus: "not_configured",
        billingProvider: "manual",
        entitlements: entitlementsForPlan("local_mvp"),
        createdAt: now,
        updatedAt: now
      };
      membership = {
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
        createdAt: now,
        updatedAt: now
      };
      state.workspaces = [...state.workspaces, workspace];
      state.workspaceMembers = [...state.workspaceMembers, membership];
      state.activeWorkspaceId = workspace.id;
      state.activeProjectId = null;
      this.appendAuditToState(state, {
        workspaceId: workspace.id,
        actorType: "system",
        action: "workspace.create",
        targetType: "workspace",
        targetId: workspace.id,
        summary: `Created default workspace for ${user.email}.`,
        metadata: { workspaceName: workspace.name, identityProvider }
      });
    }

    state.activeUserId = user.id;
    state.activeWorkspaceId = membership.workspaceId;
    state.activeProjectId = state.projects.find((project) => project.workspaceId === membership.workspaceId)?.id ?? null;
    this.appendAuditToState(state, {
      workspaceId: membership.workspaceId,
      actorType: "system",
      action: "auth.user.sync",
      targetType: "user",
      targetId: user.id,
      summary: `Synced authenticated user ${user.email}.`,
      metadata: { identityProvider, authSubject },
      createdAt: now
    });
    await this.save();
    return state;
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<AppState> {
    const state = await this.load();
    if (!state.activeUserId) {
      throw new Error("No active user is selected.");
    }
    const now = new Date().toISOString();
    const slug = uniqueWorkspaceSlug(state.workspaces, input.slug || input.name);
    const workspace: Workspace = {
      id: randomUUID(),
      name: normalizeWorkspaceName(input.name),
      slug,
      plan: "local_mvp",
      billingStatus: "not_configured",
      billingProvider: "manual",
      entitlements: entitlementsForPlan("local_mvp"),
      createdAt: now,
      updatedAt: now
    };
    const membership: WorkspaceMember = {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: state.activeUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now
    };
    state.workspaces = [...state.workspaces, workspace];
    state.workspaceMembers = [...state.workspaceMembers, membership];
    state.activeWorkspaceId = workspace.id;
    state.activeProjectId = null;
    this.appendAuditToState(state, {
      workspaceId: workspace.id,
      action: "workspace.create",
      targetType: "workspace",
      targetId: workspace.id,
      summary: `Created workspace ${workspace.name}.`,
      metadata: { workspaceName: workspace.name, slug: workspace.slug }
    });
    await this.save();
    return state;
  }

  async setActiveWorkspace(workspaceId: string): Promise<AppState> {
    const state = await this.load();
    requireWorkspace(state, workspaceId);
    this.assertWorkspaceAccessInState(state, workspaceId, "project:read");
    state.activeWorkspaceId = workspaceId;
    state.activeProjectId = state.projects.find((project) => project.workspaceId === workspaceId)?.id ?? null;
    this.appendAuditToState(state, {
      workspaceId,
      action: "workspace.switch",
      targetType: "workspace",
      targetId: workspaceId,
      summary: "Switched active workspace."
    });
    await this.save();
    return state;
  }

  async addWorkspaceMember(input: AddWorkspaceMemberInput): Promise<AppState> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    const actor = this.assertWorkspaceAccessInState(state, input.workspaceId, "workspace:admin");
    assertCanManageWorkspaceRole({ actorRole: actor.role, targetRole: input.role, action: "add" });
    const now = new Date().toISOString();
    const user = upsertUserByEmail(state.users, input.email, input.displayName, now);
    state.users = user.users;
    if (state.workspaceMembers.some((member) => member.workspaceId === input.workspaceId && member.userId === user.account.id)) {
      throw new Error("User is already a member of this workspace.");
    }
    const membership: WorkspaceMember = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: user.account.id,
      role: input.role,
      createdAt: now,
      updatedAt: now
    };
    state.workspaceMembers = [...state.workspaceMembers, membership];
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      action: "workspace.member.add",
      targetType: "member",
      targetId: membership.id,
      summary: `Added ${user.account.email} as ${input.role}.`,
      metadata: { email: user.account.email, role: input.role }
    });
    await this.save();
    return state;
  }

  async updateWorkspaceMemberRole(input: UpdateWorkspaceMemberRoleInput): Promise<AppState> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    const actor = this.assertWorkspaceAccessInState(state, input.workspaceId, "workspace:admin");
    const existing = requireWorkspaceMember(state, input.workspaceId, input.userId);
    assertCanManageWorkspaceRole({ actorRole: actor.role, targetRole: existing.role, action: "update" });
    assertCanManageWorkspaceRole({ actorRole: actor.role, targetRole: input.role, action: "update" });
    if (existing.role === "owner" && input.role !== "owner" && countWorkspaceOwners(state.workspaceMembers, input.workspaceId) <= 1) {
      throw new Error("Workspace must keep at least one owner.");
    }
    const now = new Date().toISOString();
    state.workspaceMembers = state.workspaceMembers.map((member) =>
      member.workspaceId === input.workspaceId && member.userId === input.userId
        ? { ...member, role: input.role, updatedAt: now }
        : member
    );
    const user = state.users.find((candidate) => candidate.id === input.userId);
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      action: "workspace.member.update_role",
      targetType: "member",
      targetId: existing.id,
      summary: `Updated ${user?.email ?? input.userId} from ${existing.role} to ${input.role}.`,
      metadata: { userId: input.userId, previousRole: existing.role, role: input.role }
    });
    await this.save();
    return state;
  }

  async removeWorkspaceMember(input: RemoveWorkspaceMemberInput): Promise<AppState> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    const actor = this.assertWorkspaceAccessInState(state, input.workspaceId, "workspace:admin");
    const existing = requireWorkspaceMember(state, input.workspaceId, input.userId);
    if (input.userId === state.activeUserId) {
      throw new Error("Cannot remove the active user from the current workspace.");
    }
    assertCanManageWorkspaceRole({ actorRole: actor.role, targetRole: existing.role, action: "remove" });
    if (existing.role === "owner" && countWorkspaceOwners(state.workspaceMembers, input.workspaceId) <= 1) {
      throw new Error("Workspace must keep at least one owner.");
    }
    const user = state.users.find((candidate) => candidate.id === input.userId);
    state.workspaceMembers = state.workspaceMembers.filter(
      (member) => !(member.workspaceId === input.workspaceId && member.userId === input.userId)
    );
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      action: "workspace.member.remove",
      targetType: "member",
      targetId: existing.id,
      summary: `Removed ${user?.email ?? input.userId} from the workspace.`,
      metadata: { userId: input.userId, previousRole: existing.role }
    });
    await this.save();
    return state;
  }

  async updateWorkspaceBillingPlan(input: UpdateWorkspaceBillingPlanInput): Promise<AppState> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    this.assertWorkspaceAccessInState(state, input.workspaceId, "billing:manage");
    const definition = workspacePlanDefinition(input.plan);
    const now = new Date().toISOString();
    workspace.plan = definition.id;
    workspace.billingStatus = input.billingStatus ?? definition.billingStatus;
    workspace.billingProvider = "manual";
    workspace.entitlements = entitlementsForPlan(definition.id);
    workspace.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: workspace.id,
      action: "billing.plan.update",
      targetType: "billing",
      targetId: workspace.id,
      summary: `Updated billing plan to ${definition.label}.`,
      metadata: {
        plan: definition.id,
        billingStatus: workspace.billingStatus,
        monthlyPriceCents: definition.monthlyPriceCents
      },
      createdAt: now
    });
    await this.save();
    return state;
  }

  async applyBillingSubscriptionUpdate(input: ApplyBillingSubscriptionInput): Promise<AppState> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    const alreadyApplied = state.auditEvents.some(
      (event) => event.action === "billing.webhook.apply" && event.targetId === input.providerEventId
    );
    if (alreadyApplied) {
      return state;
    }
    const definition = workspacePlanDefinition(input.plan);
    const now = input.appliedAt ?? new Date().toISOString();
    workspace.plan = definition.id;
    workspace.billingStatus = input.billingStatus;
    workspace.billingProvider = input.provider;
    workspace.billingCustomerId = input.providerCustomerId;
    workspace.billingSubscriptionId = input.providerSubscriptionId;
    workspace.billingCurrentPeriodEnd = input.currentPeriodEnd;
    workspace.billingCancelAtPeriodEnd = input.cancelAtPeriodEnd;
    workspace.billingLastEventId = input.providerEventId;
    workspace.entitlements = entitlementsForPlan(definition.id);
    workspace.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: workspace.id,
      actorType: "system",
      action: "billing.webhook.apply",
      targetType: "billing",
      targetId: input.providerEventId,
      summary: `Applied ${input.provider} billing event for ${definition.label}.`,
      metadata: compactAuditMetadata({
        provider: input.provider,
        providerCustomerId: input.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId,
        plan: definition.id,
        billingStatus: input.billingStatus,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd
      }),
      createdAt: now
    });
    await this.save();
    return state;
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
      uploadSessions: [],
      providerRuns: [],
      jobs: [],
      jobEvents: [],
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

  async listProjectsForSession(input: { userId: string; workspaceId: string }): Promise<Project[]> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:read"
    });
    return state.projects.filter((project) => project.workspaceId === input.workspaceId);
  }

  async createProjectForSession(input: CreateProjectInput & { userId: string; workspaceId: string }): Promise<Project> {
    const profile = normalizeProfile(input.profile);
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:create"
    });
    const workspaceProjectCount = state.projects.filter((project) => project.workspaceId === input.workspaceId).length;
    if (workspaceProjectCount >= workspace.entitlements.maxProjects) {
      throw new Error(`Project limit exceeded. This workspace allows ${workspace.entitlements.maxProjects} projects.`);
    }
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name.trim() || profile.productName,
      status: "draft",
      profile,
      moments: [],
      frameEvidence: [],
      concepts: [],
      scripts: [],
      renders: [],
      artifacts: [],
      uploadSessions: [],
      providerRuns: [],
      jobs: [],
      jobEvents: [],
      createdAt: now,
      updatedAt: now
    };
    state.projects.unshift(project);
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
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
        project.jobEvents = project.jobEvents ?? [];
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

  async createRecordingUploadSessionRecord(
    projectId: string,
    session: Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt">
  ): Promise<Project> {
    const now = new Date().toISOString();
    return this.updateProject(
      projectId,
      (project) => {
        project.uploadSessions = [
          ...(project.uploadSessions ?? []).filter((candidate) => candidate.id !== session.id),
          {
            ...session,
            createdAt: now,
            updatedAt: now
          }
        ];
        project.updatedAt = now;
      },
      {
        audit: {
          action: "recording.upload_session.create",
          targetType: "recording",
          targetId: session.artifactId,
          summary: `Created direct upload session for ${session.originalFileName}.`,
          metadata: {
            provider: session.provider,
            contentType: session.contentType,
            byteSize: session.byteSize,
            expiresAt: session.expiresAt
          }
        }
      }
    );
  }

  async getRecordingUploadSession(projectId: string, sessionId: string): Promise<RecordingUploadSessionRecord> {
    const project = await this.getProject(projectId);
    const session = (project.uploadSessions ?? []).find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new Error("Recording upload session not found.");
    }
    return session;
  }

  async completeRecordingUploadSessionRecord(
    projectId: string,
    sessionId: string,
    artifact: ArtifactRecord
  ): Promise<Project> {
    const now = new Date().toISOString();
    return this.updateProject(
      projectId,
      (project) => {
        const session = (project.uploadSessions ?? []).find((candidate) => candidate.id === sessionId);
        if (!session) {
          throw new Error("Recording upload session not found.");
        }
        if (session.status !== "pending") {
          throw new Error(`Recording upload session is already ${session.status}.`);
        }
        project.uploadSessions = project.uploadSessions.map((candidate) =>
          candidate.id === sessionId ? { ...candidate, status: "completed", updatedAt: now } : candidate
        );
        project.artifacts = [...(project.artifacts ?? []).filter((candidate) => candidate.id !== artifact.id), artifact];
        project.updatedAt = now;
      },
      {
        audit: {
          action: "recording.upload_session.complete",
          targetType: "recording",
          targetId: artifact.id,
          summary: `Completed direct upload for ${artifact.originalFileName}.`,
          metadata: {
            provider: artifact.provider,
            contentType: artifact.contentType,
            byteSize: artifact.byteSize,
            sha256: artifact.sha256
          }
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
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId,
            jobId: job.id,
            kind: "queued",
            stage: "queued",
            message: job.userMessage,
            progress: job.progress,
            now: job.createdAt
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
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

  async appendJobEvent(projectId: string, input: JobEventInput): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        if (!project.jobs.some((job) => job.id === input.jobId)) {
          throw new Error("Job not found.");
        }
        const now = input.createdAt ?? new Date().toISOString();
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId,
            jobId: input.jobId,
            kind: input.kind,
            stage: input.stage,
            message: input.message,
            progress: input.progress,
            metadata: input.metadata,
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      { action: "job:write" }
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
    const now = new Date().toISOString();
    const nextJob = requestJobCancelState(job, now);
    return this.updateProject(
      projectId,
      (project) => {
        project.jobs = project.jobs.map((candidate) => (candidate.id === jobId ? nextJob : candidate));
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId,
            jobId,
            kind: job.status === "queued" ? "canceled" : "cancel_requested",
            stage: "cancel",
            message: nextJob.userMessage,
            progress: nextJob.progress,
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      {
        action: "job:write",
        audit: {
          action: "job.cancel",
          targetType: "job",
          targetId: jobId,
          summary: `Requested cancel for ${job.kind} job.`,
          metadata: { jobKind: job.kind, status: job.status }
        }
      }
    );
  }

  async finishJobCancel(projectId: string, jobId: string): Promise<Project> {
    const job = await this.getJob(projectId, jobId);
    const now = new Date().toISOString();
    const nextJob = finishJobCancelState(job, now);
    return this.updateProject(
      projectId,
      (project) => {
        project.jobs = project.jobs.map((candidate) => (candidate.id === jobId ? nextJob : candidate));
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId,
            jobId,
            kind: "canceled",
            stage: "cancel",
            message: nextJob.userMessage,
            progress: nextJob.progress,
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      { action: "job:write" }
    );
  }

  async retryJob(projectId: string, jobId: string): Promise<JobRecord> {
    const job = await this.getJob(projectId, jobId);
    const now = new Date().toISOString();
    const retried = retryJobState(job, now);
    await this.updateProject(
      projectId,
      (project) => {
        project.jobs = project.jobs.map((candidate) => (candidate.id === jobId ? retried : candidate));
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId,
            jobId,
            kind: "retried",
            stage: "queued",
            message: retried.userMessage,
            progress: retried.progress,
            metadata: { nextAttempt: retried.attempt },
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      {
        action: "job:write",
        audit: {
          action: "job.retry",
          targetType: "job",
          targetId: jobId,
          summary: `Retried ${job.kind} job.`,
          metadata: { jobKind: job.kind, nextAttempt: retried.attempt }
        }
      }
    );
    return retried;
  }

  async recoverInterruptedJobs(): Promise<JobRecord[]> {
    const state = await this.load();
    const now = new Date().toISOString();
    const queuedForRuntime: JobRecord[] = [];
    let changed = false;
    for (const project of state.projects) {
      let projectChanged = false;
      const nextJobs: JobRecord[] = [];
      for (const job of project.jobs ?? []) {
        const recovered = recoverInterruptedJob(job, now);
        if (!recovered) {
          nextJobs.push(job);
          continue;
        }
        changed = true;
        projectChanged = true;
        nextJobs.push(recovered.job);
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId: project.id,
            jobId: job.id,
            kind: recovered.event.kind,
            stage: recovered.event.stage,
            message: recovered.event.message,
            progress: recovered.job.progress,
            metadata: recovered.event.metadata,
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        if (recovered.job.status === "queued") {
          queuedForRuntime.push(recovered.job);
        }
      }
      if (projectChanged) {
        project.jobs = nextJobs;
        project.updatedAt = now;
      }
    }
    if (changed) {
      await this.save();
    }
    return queuedForRuntime;
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

  private assertWorkspaceAccessInState(state: AppState, workspaceId: string, action: WorkspaceAction): WorkspaceMember {
    return assertWorkspacePermission({
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
      actorUserId: input.actorUserId ?? state.activeUserId ?? DEFAULT_LOCAL_USER_ID,
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
        billingProvider: workspace.billingProvider ?? "manual",
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
      uploadSessions: project.uploadSessions ?? [],
      providerRuns: project.providerRuns ?? [],
      jobs: project.jobs ?? [],
      jobEvents: project.jobEvents ?? []
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

function requireWorkspaceMember(state: AppState, workspaceId: string, userId: string): WorkspaceMember {
  const member = state.workspaceMembers.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.userId === userId
  );
  if (!member) {
    throw new Error("Workspace member not found.");
  }
  return member;
}

function normalizeAuthSubject(authSubject: string): string {
  const normalized = authSubject.trim();
  if (normalized.length < 3 || normalized.length > 256) {
    throw new Error("Auth subject must be 3–256 characters.");
  }
  return normalized;
}

function upsertUserByEmail(
  users: UserAccount[],
  email: string,
  displayName: string | undefined,
  now: string
): { users: UserAccount[]; account: UserAccount } {
  const normalizedEmail = normalizeEmail(email);
  const existing = users.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return { users, account: existing };
  }
  const account: UserAccount = {
    id: randomUUID(),
    email: normalizedEmail,
    displayName: normalizeDisplayName(displayName, normalizedEmail),
    createdAt: now
  };
  return { users: [...users, account], account };
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid email address.");
  }
  return normalized;
}

function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const normalized = displayName?.trim();
  if (normalized) {
    return normalized.slice(0, 80);
  }
  return email.split("@")[0] ?? email;
}

function normalizeWorkspaceName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 80) {
    throw new Error("Workspace name must be 2–80 characters.");
  }
  return normalized;
}

function compactAuditMetadata(
  input: Record<string, AuditMetadataValue | undefined>
): Record<string, AuditMetadataValue> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, AuditMetadataValue] => entry[1] !== undefined));
}

function uniqueWorkspaceSlug(workspaces: Workspace[], value: string): string {
  const base = safeSlug(value || "workspace");
  let candidate = base;
  let index = 2;
  const existing = new Set(workspaces.map((workspace) => workspace.slug));
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function safeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "workspace";
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
