import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createDefaultProfile,
  createMoments,
  enforceSelectionLimit,
  estimateScriptDurationMs,
  generateConcepts,
  generateScriptDraft,
  generateScripts,
  splitCaptionSegments,
  validateProfile
} from "../shared/contentEngine";
import { compileCreativeBlueprint, projectBlueprintOntoEditDecisionList } from "../shared/creativeBlueprint";
import {
  buildEditDecisionList,
  buildEvidenceClaims,
  buildVisualBeatsForTemplate,
  hasBlockingScriptWarnings,
  normalizeBrandKit,
  scriptQualityWarnings,
  templateForFormatFamily
} from "../shared/renderTemplates";
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
  JobKind,
  JobRecord,
  JobStatus,
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
  createJob,
  createJobEvent,
  failJob as failJobState,
  finishJobCancel as finishJobCancelState,
  findActiveJob,
  heartbeatJobLease as heartbeatJobLeaseState,
  recoverExpiredJobLease,
  recoverInterruptedJob,
  requestJobCancel as requestJobCancelState,
  retryJob as retryJobState,
  startJobLease as startJobLeaseState
} from "../shared/jobState";
import {
  assertCanManageWorkspaceRole,
  assertWorkspacePermission,
  countWorkspaceOwners,
  type WorkspaceAction
} from "../shared/rbac";
import { FileAppStatePersistence, type AppStatePersistence } from "./persistence";
import type { PersistJobInput } from "./postgresJobArtifactRepository";

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

export interface GideonStoreOptions {
  userDataDir?: string;
  storePath?: string;
  projectsDir?: string;
  storageRoot?: string;
  persistence?: AppStatePersistence;
  relationalMirror?: GideonRelationalMirror;
  relationalReads?: GideonRelationalReads;
  relationalQueueName?: string;
}

export interface GideonRelationalMirror {
  upsertUser?(user: UserAccount): Promise<UserAccount> | UserAccount;
  upsertWorkspace?(workspace: Workspace): Promise<Workspace> | Workspace;
  upsertWorkspaceMember?(member: WorkspaceMember): Promise<WorkspaceMember> | WorkspaceMember;
  upsertProject?(project: Project): Promise<Project> | Project;
  upsertRecordingUploadSession?(
    session: RecordingUploadSessionRecord
  ): Promise<RecordingUploadSessionRecord> | RecordingUploadSessionRecord;
  upsertJob(input: PersistJobInput): Promise<JobRecord> | JobRecord;
  upsertArtifact(artifact: ArtifactRecord): Promise<ArtifactRecord> | ArtifactRecord;
  upsertUsageEvent?(event: UsageEvent): Promise<UsageEvent> | UsageEvent;
  upsertAuditEvent?(event: AuditEvent): Promise<AuditEvent> | AuditEvent;
  close?(): Promise<void> | void;
}

export interface GideonRelationalReads {
  listWorkspaceProjects?(input: { workspaceId: string; limit?: number }): Promise<Project[]> | Project[];
  getProject?(input: { workspaceId: string; projectId: string }): Promise<Project | null> | Project | null;
  getJob?(input: { workspaceId: string; jobId: string }): Promise<JobRecord | null> | JobRecord | null;
  getArtifact?(input: { workspaceId: string; artifactId: string }): Promise<ArtifactRecord | null> | ArtifactRecord | null;
  close?(): Promise<void> | void;
}

export interface JobObservabilitySnapshot {
  generatedAt: string;
  windowMs: number;
  totalJobs: number;
  activeJobs: number;
  queuedJobs: number;
  runningJobs: number;
  cancelingJobs: number;
  terminalJobs: number;
  failedJobs: number;
  retryableFailedJobs: number;
  terminalFailuresInWindow: number;
  recoveredLeaseFailuresInWindow: number;
  expiredRunningLeases: number;
  oldestQueuedAgeMs: number | null;
  oldestRunningAgeMs: number | null;
  terminalFailureRatePerHour: number;
  byStatus: Partial<Record<JobStatus, number>>;
  byKind: Partial<Record<JobKind, number>>;
}

export class GideonStore {
  private state: AppState | null = null;
  private persistence: AppStatePersistence | null = null;

  constructor(private readonly options: GideonStoreOptions = {}) {}

  async load(): Promise<AppState> {
    if (this.state) {
      return this.state;
    }

    const storedState = await this.appStatePersistence().load();
    if (storedState) {
      this.state = normalizeAppState(storedState);
    } else {
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

  async getWorkspaceForBillingSession(input: { userId: string; workspaceId: string }): Promise<Workspace> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "billing:manage"
    });
    return workspace;
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
    if (this.options.relationalReads?.listWorkspaceProjects) {
      return await this.options.relationalReads.listWorkspaceProjects({ workspaceId: input.workspaceId });
    }
    return state.projects.filter((project) => project.workspaceId === input.workspaceId);
  }

  async getProjectForSession(input: { userId: string; workspaceId: string; projectId: string }): Promise<Project> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:read"
    });
    if (this.options.relationalReads?.getProject) {
      const project = await this.options.relationalReads.getProject({
        workspaceId: input.workspaceId,
        projectId: input.projectId
      });
      if (!project) {
        throw new Error("Project not found.");
      }
      return project;
    }
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    return project;
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

  async updateProfileForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    profile: ProductProfile;
  }): Promise<Project> {
    const normalized = normalizeProfile(input.profile);
    const errors = validateProfile(normalized);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:update"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    applyProfileUpdate(project, normalized);
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "project.update_profile",
      targetType: "project",
      targetId: project.id,
      summary: `Updated product context for ${normalized.productName}.`,
      metadata: { productName: normalized.productName }
    });
    await this.save();
    return project;
  }

  async updateProfile(projectId: string, profile: ProductProfile): Promise<Project> {
    const normalized = normalizeProfile(profile);
    return this.updateProject(
      projectId,
      (project) => {
        applyProfileUpdate(project, normalized);
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

  async revokeCustomAvatarSource(projectId: string): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        const source = project.profile.customAvatarSource;
        if (!source) {
          return;
        }
        project.artifacts = project.artifacts.map((artifact) => artifact.id === source.artifactId
          ? {
              ...artifact,
              avatarConsentRecord: {
                ...source.consent,
                status: "revoked"
              }
            }
          : artifact);
        applyProfileUpdate(project, { ...project.profile, customAvatarSource: undefined });
      },
      {
        audit: {
          action: "project.update_profile",
          targetType: "project",
          targetId: projectId,
          summary: "Revoked custom avatar likeness consent."
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

  async createRecordingUploadSessionRecordForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    session: Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt">;
  }): Promise<Project> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:update"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric: "storage_bytes",
      additionalQuantity: input.session.byteSize
    });
    const now = new Date().toISOString();
    project.uploadSessions = [
      ...(project.uploadSessions ?? []).filter((candidate) => candidate.id !== input.session.id),
      {
        ...input.session,
        createdAt: now,
        updatedAt: now
      }
    ];
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "recording.upload_session.create",
      targetType: "recording",
      targetId: input.session.artifactId,
      summary: `Created direct upload session for ${input.session.originalFileName}.`,
      metadata: {
        provider: input.session.provider,
        contentType: input.session.contentType,
        byteSize: input.session.byteSize,
        expiresAt: input.session.expiresAt
      }
    });
    await this.save();
    return project;
  }

  async getRecordingUploadSession(projectId: string, sessionId: string): Promise<RecordingUploadSessionRecord> {
    const project = await this.getProject(projectId);
    const session = (project.uploadSessions ?? []).find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new Error("Recording upload session not found.");
    }
    return session;
  }

  async getRecordingUploadSessionForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
  }): Promise<RecordingUploadSessionRecord> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:read"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const session = (project.uploadSessions ?? []).find((candidate) => candidate.id === input.sessionId);
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

  async completeRecordingUploadForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
    artifact: ArtifactRecord;
    recording: RecordingMetadata;
  }): Promise<Project> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:update"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const session = (project.uploadSessions ?? []).find((candidate) => candidate.id === input.sessionId);
    if (!session) {
      throw new Error("Recording upload session not found.");
    }
    if (session.status !== "pending") {
      throw new Error(`Recording upload session is already ${session.status}.`);
    }
    assertCompletedUploadMatchesSession(session, input.artifact, input.recording);
    const sourceMinutes = minutesForDuration(input.recording.durationMs);
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric: "source_minutes",
      additionalQuantity: sourceMinutes
    });
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric: "storage_bytes",
      additionalQuantity: input.artifact.byteSize
    });
    const now = new Date().toISOString();
    project.uploadSessions = (project.uploadSessions ?? []).map((candidate) =>
      candidate.id === input.sessionId ? { ...candidate, status: "completed", updatedAt: now } : candidate
    );
    project.artifacts = [...(project.artifacts ?? []).filter((candidate) => candidate.id !== input.artifact.id), input.artifact];
    project.recording = input.recording;
    project.status = "recording_ready";
    project.transcript = undefined;
    project.analysisSummary = undefined;
    project.frameEvidence = [];
    project.moments = [];
    project.concepts = [];
    project.scripts = [];
    project.renders = [];
    project.providerRuns = project.providerRuns ?? [];
    project.jobs = project.jobs ?? [];
    project.jobEvents = project.jobEvents ?? [];
    project.updatedAt = now;
    state.usageEvents = mergeUsageEvent(state.usageEvents, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: project.id,
      metric: "source_minutes",
      quantity: sourceMinutes,
      unit: "minute",
      source: "recording",
      idempotencyKey: `recording:${project.id}:${input.artifact.id}:source_minutes`,
      createdAt: now
    });
    state.usageEvents = mergeUsageEvent(state.usageEvents, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: project.id,
      metric: "storage_bytes",
      quantity: input.artifact.byteSize,
      unit: "byte",
      source: "recording",
      idempotencyKey: `recording:${project.id}:${input.artifact.id}:storage_bytes`,
      createdAt: now
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "recording.upload_session.complete",
      targetType: "recording",
      targetId: input.artifact.id,
      summary: `Completed direct upload for ${input.artifact.originalFileName}.`,
      metadata: {
        provider: input.artifact.provider,
        contentType: input.artifact.contentType,
        byteSize: input.artifact.byteSize,
        sha256: input.artifact.sha256
      }
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "recording.attach",
      targetType: "recording",
      targetId: input.recording.artifactId,
      summary: `Attached recording ${input.recording.fileName}.`,
      metadata: {
        fileName: input.recording.fileName,
        durationMs: input.recording.durationMs,
        sizeBytes: input.recording.sizeBytes
      }
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "usage.record",
      targetType: "usage",
      summary: `Recorded ${sourceMinutes} minute of source_minutes.`,
      metadata: { metric: "source_minutes", quantity: sourceMinutes, unit: "minute", source: "recording" },
      createdAt: now
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "usage.record",
      targetType: "usage",
      summary: `Recorded ${input.artifact.byteSize} byte of storage_bytes.`,
      metadata: { metric: "storage_bytes", quantity: input.artifact.byteSize, unit: "byte", source: "recording" },
      createdAt: now
    });
    await this.save();
    return project;
  }

  async activateCapturedAssemblyForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    captureRunId: string;
    sourceArtifact: ArtifactRecord;
    manifestArtifact: ArtifactRecord;
    recording: RecordingMetadata;
  }): Promise<Project> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({ members: state.workspaceMembers, workspaceId: input.workspaceId, userId: input.userId, action: "project:update" });
    const project = state.projects.find((candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId);
    if (!project) throw new Error("Project not found.");
    if (input.sourceArtifact.projectId !== project.id || input.sourceArtifact.workspaceId !== input.workspaceId || input.sourceArtifact.kind !== "source_recording" || input.manifestArtifact.projectId !== project.id || input.manifestArtifact.workspaceId !== input.workspaceId || input.manifestArtifact.kind !== "capture_assembly_manifest") throw new Error("Capture assembly artifacts are outside the project scope.");
    const sourceMinutes = minutesForDuration(input.recording.durationMs);
    assertWithinEntitlement({ entitlements: workspace.entitlements, summary: summarizeUsage(state.usageEvents, workspace.id), metric: "source_minutes", additionalQuantity: sourceMinutes });
    assertWithinEntitlement({ entitlements: workspace.entitlements, summary: summarizeUsage(state.usageEvents, workspace.id), metric: "storage_bytes", additionalQuantity: input.sourceArtifact.byteSize + input.manifestArtifact.byteSize });
    const now = new Date().toISOString();
    const recording: RecordingMetadata = { ...input.recording, artifactId: input.sourceArtifact.id, storageKey: input.sourceArtifact.storageKey, sha256: input.sourceArtifact.sha256, sizeBytes: input.sourceArtifact.byteSize, origin: "captured_assembly", captureRunId: input.captureRunId, assemblyManifestArtifactId: input.manifestArtifact.id };
    project.artifacts = [...(project.artifacts ?? []).filter((artifact) => artifact.id !== input.sourceArtifact.id && artifact.id !== input.manifestArtifact.id), input.sourceArtifact, input.manifestArtifact];
    project.recording = recording;
    project.status = "recording_ready";
    project.transcript = undefined; project.analysisSummary = undefined; project.frameEvidence = []; project.moments = []; project.concepts = []; project.scripts = []; project.renders = []; project.updatedAt = now;
    state.usageEvents = mergeUsageEvent(state.usageEvents, { id: randomUUID(), workspaceId: input.workspaceId, projectId: project.id, metric: "source_minutes", quantity: sourceMinutes, unit: "minute", source: "capture_assembly", idempotencyKey: `capture-assembly:${input.captureRunId}:${input.sourceArtifact.id}:source_minutes`, createdAt: now });
    state.usageEvents = mergeUsageEvent(state.usageEvents, { id: randomUUID(), workspaceId: input.workspaceId, projectId: project.id, metric: "storage_bytes", quantity: input.sourceArtifact.byteSize + input.manifestArtifact.byteSize, unit: "byte", source: "capture_assembly", idempotencyKey: `capture-assembly:${input.captureRunId}:${input.sourceArtifact.id}:storage_bytes`, createdAt: now });
    this.appendAuditToState(state, { workspaceId: input.workspaceId, projectId: project.id, actorUserId: input.userId, action: "recording.attach", targetType: "recording", targetId: input.sourceArtifact.id, summary: "Attached an approved captured assembly as the source recording.", metadata: { captureRunId: input.captureRunId, manifestArtifactId: input.manifestArtifact.id, durationMs: recording.durationMs, sizeBytes: recording.sizeBytes } });
    await this.save();
    return project;
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

  async regenerateScript(projectId: string, scriptId: string): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        const existing = project.scripts.find((script) => script.id === scriptId);
        if (!existing) {
          throw new Error("Script not found.");
        }
        const concept = project.concepts.find((candidate) => candidate.id === existing.conceptId);
        if (!concept) {
          throw new Error("Concept not found for script.");
        }
        const regenerated = {
          ...generateScriptDraft(project.profile, concept, project.moments, randomUUID, () => new Date().toISOString()),
          id: existing.id
        };
        project.scripts = project.scripts.map((script) => (script.id === scriptId ? regenerated : script));
        project.renders = [];
        project.status = "script_review";
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          action: "scripts.generate",
          targetType: "script",
          targetId: scriptId,
          summary: "Regenerated one script draft.",
          metadata: { scriptId }
        }
      }
    );
  }

  async updateScripts(projectId: string, scripts: ScriptDraft[], actorType: AuditActorType = "local_user"): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        project.scripts = scripts.map((script) => normalizeScriptDraft(project, { ...script, updatedAt: new Date().toISOString() }));
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

  async updateScriptForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    scriptId: string;
    expectedRevision?: string;
    hook?: string;
    voiceoverText?: string;
    cta?: string;
  }): Promise<Project> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "mcp:write"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const script = project.scripts.find((candidate) => candidate.id === input.scriptId);
    if (!script) {
      throw new Error("Script not found.");
    }
    if (input.expectedRevision && input.expectedRevision !== script.updatedAt) {
      throw new Error("Revision conflict.");
    }
    const changedFields: string[] = [];
    if (typeof input.hook === "string") {
      script.hook = input.hook.trim();
      changedFields.push("hook");
    }
    if (typeof input.voiceoverText === "string") {
      script.voiceoverText = input.voiceoverText.trim();
      changedFields.push("voiceoverText");
    }
    if (typeof input.cta === "string") {
      script.cta = input.cta.trim();
      changedFields.push("cta");
    }
    if (changedFields.length === 0) {
      throw new Error("At least one script field is required.");
    }
    const now = new Date().toISOString();
    const normalizedScript = normalizeScriptDraft(project, { ...script, updatedAt: now });
    Object.assign(script, normalizedScript);
    script.updatedAt = now;
    project.renders = [];
    project.status = "script_review";
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      actorType: "mcp_agent",
      action: "scripts.update",
      targetType: "script",
      targetId: input.scriptId,
      summary: `MCP updated script ${input.scriptId}.`,
      metadata: { changedFields: changedFields.join(",") }
    });
    await this.save();
    return project;
  }

  async updateMomentForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    momentId: string;
    expectedRevision?: string;
    label?: string;
    evidence?: string;
    enabled?: boolean;
  }): Promise<Project> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "mcp:write"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const moment = project.moments.find((candidate) => candidate.id === input.momentId);
    if (!moment) {
      throw new Error("Moment not found.");
    }
    if (input.expectedRevision && input.expectedRevision !== project.updatedAt) {
      throw new Error("Revision conflict.");
    }
    const changedFields: string[] = [];
    if (typeof input.label === "string") {
      moment.label = input.label.trim();
      changedFields.push("label");
    }
    if (typeof input.evidence === "string") {
      moment.evidence = input.evidence.trim();
      changedFields.push("evidence");
    }
    if (typeof input.enabled === "boolean") {
      moment.enabled = input.enabled;
      changedFields.push("enabled");
    }
    if (changedFields.length === 0) {
      throw new Error("At least one moment field is required.");
    }
    const now = new Date().toISOString();
    project.analysisSummary = undefined;
    project.concepts = [];
    project.scripts = [];
    project.renders = [];
    project.status = "analyzed";
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      actorType: "mcp_agent",
      action: "moments.update",
      targetType: "moment",
      targetId: input.momentId,
      summary: `MCP updated moment ${input.momentId}.`,
      metadata: { changedFields: changedFields.join(",") }
    });
    await this.save();
    return project;
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

  async setRenderFinalApproval(projectId: string, renderId: string, approved: boolean): Promise<Project> {
    return this.updateProject(
      projectId,
      (project) => {
        const render = project.renders.find((candidate) => candidate.id === renderId);
        if (!render || render.status !== "completed") {
          throw new Error("Only a completed render can receive final approval.");
        }
        if (approved && render.qualityReport && !render.qualityReport.publishable) {
          throw new Error("Resolve blocking creator-video quality failures before final approval.");
        }
        render.finalApproval = { approved, approvedAt: approved ? new Date().toISOString() : undefined };
        project.updatedAt = new Date().toISOString();
      },
      {
        audit: {
          actorType: "local_user",
          action: "render.complete",
          targetType: "render",
          targetId: renderId,
          summary: approved ? "User approved the final creator-video export." : "User removed final creator-video approval.",
          metadata: { approved }
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

  async createExportForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    renderId: string;
    artifact: ArtifactRecord;
  }): Promise<Project> {
    const state = await this.load();
    const workspace = requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "export:create"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const render = (project.renders ?? []).find((candidate) => candidate.id === input.renderId);
    if (!render || render.status !== "completed") {
      throw new Error("Completed render not found.");
    }
    assertExportArtifactMatchesProject(input.artifact, project);
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric: "exports",
      additionalQuantity: 1
    });
    assertWithinEntitlement({
      entitlements: workspace.entitlements,
      summary: summarizeUsage(state.usageEvents, workspace.id),
      metric: "storage_bytes",
      additionalQuantity: input.artifact.byteSize
    });
    const now = new Date().toISOString();
    project.artifacts = [...(project.artifacts ?? []).filter((candidate) => candidate.id !== input.artifact.id), input.artifact];
    project.updatedAt = now;
    state.usageEvents = mergeUsageEvent(state.usageEvents, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: project.id,
      metric: "storage_bytes",
      quantity: input.artifact.byteSize,
      unit: "byte",
      source: "export",
      idempotencyKey: `export:${project.id}:${input.artifact.id}:storage_bytes`,
      createdAt: now
    });
    state.usageEvents = mergeUsageEvent(state.usageEvents, {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: project.id,
      metric: "exports",
      quantity: 1,
      unit: "count",
      source: "export",
      idempotencyKey: `export:${project.id}:${input.artifact.id}:exports`,
      createdAt: now
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "artifact.create",
      targetType: "artifact",
      targetId: input.artifact.id,
      summary: `Stored export artifact ${input.artifact.originalFileName}.`,
      metadata: { kind: input.artifact.kind, byteSize: input.artifact.byteSize, provider: input.artifact.provider }
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "usage.record",
      targetType: "usage",
      summary: `Recorded 1 count of exports.`,
      metadata: { metric: "exports", quantity: 1, unit: "count", source: "export" },
      createdAt: now
    });
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "usage.record",
      targetType: "usage",
      summary: `Recorded ${input.artifact.byteSize} byte of storage_bytes.`,
      metadata: { metric: "storage_bytes", quantity: input.artifact.byteSize, unit: "byte", source: "export" },
      createdAt: now
    });
    await this.save();
    return project;
  }

  async getExportArtifactForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    exportId: string;
  }): Promise<ArtifactRecord> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:read"
    });
    if (this.options.relationalReads?.getArtifact && this.options.relationalReads.getProject) {
      const project = await this.options.relationalReads.getProject({
        workspaceId: input.workspaceId,
        projectId: input.projectId
      });
      if (!project) {
        throw new Error("Project not found.");
      }
      const artifact = await this.options.relationalReads.getArtifact({
        workspaceId: input.workspaceId,
        artifactId: input.exportId
      });
      if (!artifact || artifact.projectId !== input.projectId || artifact.kind !== "export") {
        throw new Error("Export artifact not found.");
      }
      return artifact;
    }
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    const artifact = (project.artifacts ?? []).find((candidate) => candidate.id === input.exportId && candidate.kind === "export");
    if (!artifact) {
      throw new Error("Export artifact not found.");
    }
    return artifact;
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

  async createAnalysisJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "job:write"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!project.recording) {
      throw new Error("Choose a recording before analysis.");
    }
    const activeJob = findActiveJob(project.jobs ?? [], "analysis");
    if (activeJob) {
      return { project, job: activeJob, reused: true };
    }
    const now = new Date().toISOString();
    const job = createJob({
      id: randomUUID(),
      projectId: project.id,
      kind: "analysis",
      now,
      userMessage: "Waiting to analyze recording."
    });
    project.jobs = [...(project.jobs ?? []), job];
    project.jobEvents = [
      ...(project.jobEvents ?? []),
      createJobEvent({
        id: randomUUID(),
        projectId: project.id,
        jobId: job.id,
        kind: "queued",
        stage: "queued",
        message: job.userMessage,
        progress: job.progress,
        now
      })
    ].slice(-MAX_PROJECT_JOB_EVENTS);
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "job.create",
      targetType: "job",
      targetId: job.id,
      summary: "Queued analysis job.",
      metadata: { jobKind: job.kind, status: job.status }
    });
    await this.save();
    return { project, job, reused: false };
  }

  async createRenderJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "job:write"
    });
    const project = state.projects.find(
      (candidate) => candidate.id === input.projectId && candidate.workspaceId === input.workspaceId
    );
    if (!project) {
      throw new Error("Project not found.");
    }
    if (!project.recording) {
      throw new Error("Choose a recording before rendering.");
    }
    if ((project.scripts ?? []).length === 0) {
      throw new Error("Generate scripts before rendering.");
    }
    const selectedConceptIds = new Set(
      (project.concepts ?? []).filter((concept) => concept.selected).map((concept) => concept.id)
    );
    if (
      !(project.scripts ?? []).some(
        (script) =>
          script.approved &&
          selectedConceptIds.has(script.conceptId) &&
          !hasBlockingScriptWarnings(script.qualityWarnings)
      )
    ) {
      throw new Error("Approve at least one selected script without blocking warnings before rendering.");
    }
    const activeJob = findActiveJob(project.jobs ?? [], "render");
    if (activeJob) {
      return { project, job: activeJob, reused: true };
    }
    const now = new Date().toISOString();
    const job = createJob({
      id: randomUUID(),
      projectId: project.id,
      kind: "render",
      now,
      userMessage: "Waiting to render selected drafts."
    });
    project.jobs = [...(project.jobs ?? []), job];
    project.jobEvents = [
      ...(project.jobEvents ?? []),
      createJobEvent({
        id: randomUUID(),
        projectId: project.id,
        jobId: job.id,
        kind: "queued",
        stage: "queued",
        message: job.userMessage,
        progress: job.progress,
        now
      })
    ].slice(-MAX_PROJECT_JOB_EVENTS);
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "job.create",
      targetType: "job",
      targetId: job.id,
      summary: "Queued render job.",
      metadata: { jobKind: job.kind, status: job.status }
    });
    await this.save();
    return { project, job, reused: false };
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

  async claimWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    leaseSeconds: number;
    now?: string;
    userMessage?: string;
  }): Promise<JobRecord> {
    const now = input.now ?? new Date().toISOString();
    let leased: JobRecord | null = null;
    await this.updateProject(
      input.projectId,
      (project) => {
        const job = (project.jobs ?? []).find((candidate) => candidate.id === input.jobId);
        if (!job) {
          throw new Error("Job not found.");
        }
        leased = startJobLeaseState(job, {
          now,
          workerId: input.workerId,
          leaseSeconds: input.leaseSeconds,
          userMessage: input.userMessage
        });
        project.jobs = (project.jobs ?? []).map((candidate) => (candidate.id === input.jobId ? leased! : candidate));
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId: input.projectId,
            jobId: input.jobId,
            kind: "started",
            stage: "queued",
            message: leased.userMessage,
            progress: leased.progress,
            metadata: {
              workerId: input.workerId,
              leaseExpiresAt: leased.leaseExpiresAt ?? ""
            },
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      { action: "job:write" }
    );
    if (!leased) {
      throw new Error("Job not found.");
    }
    return leased;
  }

  async heartbeatWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    leaseSeconds: number;
    now?: string;
  }): Promise<JobRecord> {
    const now = input.now ?? new Date().toISOString();
    let heartbeat: JobRecord | null = null;
    await this.updateProject(
      input.projectId,
      (project) => {
        const job = (project.jobs ?? []).find((candidate) => candidate.id === input.jobId);
        if (!job) {
          throw new Error("Job not found.");
        }
        heartbeat = heartbeatJobLeaseState(job, {
          now,
          workerId: input.workerId,
          leaseSeconds: input.leaseSeconds
        });
        project.jobs = (project.jobs ?? []).map((candidate) => (candidate.id === input.jobId ? heartbeat! : candidate));
        project.updatedAt = now;
      },
      { action: "job:write" }
    );
    if (!heartbeat) {
      throw new Error("Job not found.");
    }
    return heartbeat;
  }

  async failWorkerJobLease(input: {
    projectId: string;
    jobId: string;
    workerId: string;
    safeError: string;
    now?: string;
  }): Promise<JobRecord> {
    const now = input.now ?? new Date().toISOString();
    let failed: JobRecord | null = null;
    await this.updateProject(
      input.projectId,
      (project) => {
        const job = (project.jobs ?? []).find((candidate) => candidate.id === input.jobId);
        if (!job) {
          throw new Error("Job not found.");
        }
        if (job.workerId !== input.workerId) {
          throw new Error("Worker lease does not belong to this worker.");
        }
        failed = failJobState(job, now, input.safeError);
        project.jobs = (project.jobs ?? []).map((candidate) => (candidate.id === input.jobId ? failed! : candidate));
        project.jobEvents = [
          ...(project.jobEvents ?? []),
          createJobEvent({
            id: randomUUID(),
            projectId: input.projectId,
            jobId: input.jobId,
            kind: "failed",
            stage: "finalize",
            message: failed.safeError ?? failed.userMessage,
            progress: failed.progress,
            metadata: {
              workerId: input.workerId,
              retryable: failed.retryable
            },
            now
          })
        ].slice(-MAX_PROJECT_JOB_EVENTS);
        project.updatedAt = now;
      },
      { action: "job:write" }
    );
    if (!failed) {
      throw new Error("Job not found.");
    }
    return failed;
  }

  async recoverExpiredWorkerJobLeases(now = new Date().toISOString()): Promise<JobRecord[]> {
    const state = await this.load();
    const recoveredJobs: JobRecord[] = [];
    let changed = false;
    for (const project of state.projects) {
      let projectChanged = false;
      const nextJobs: JobRecord[] = [];
      for (const job of project.jobs ?? []) {
        const recovered = recoverExpiredJobLease(job, now);
        if (!recovered) {
          nextJobs.push(job);
          continue;
        }
        changed = true;
        projectChanged = true;
        recoveredJobs.push(recovered.job);
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
      }
      if (projectChanged) {
        project.jobs = nextJobs;
        project.updatedAt = now;
      }
    }
    if (changed) {
      await this.save();
    }
    return recoveredJobs;
  }

  async getJobObservabilitySnapshot(input: { now?: string; windowMs?: number } = {}): Promise<JobObservabilitySnapshot> {
    const state = await this.load();
    const now = input.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);
    const windowMs = Math.max(1, input.windowMs ?? 60 * 60 * 1000);
    const windowStartMs = nowMs - windowMs;
    const jobs = state.projects.flatMap((project) => project.jobs ?? []);
    const jobEvents = state.projects.flatMap((project) => project.jobEvents ?? []);
    const queuedJobs = jobs.filter((job) => job.status === "queued");
    const runningJobs = jobs.filter((job) => job.status === "running");
    const cancelingJobs = jobs.filter((job) => job.status === "canceling");
    const terminalJobs = jobs.filter((job) => job.status === "succeeded" || job.status === "failed" || job.status === "canceled");
    const failedJobs = jobs.filter((job) => job.status === "failed");
    const terminalFailuresInWindow = failedJobs.filter((job) =>
      timestampInWindow(job.finishedAt ?? job.updatedAt, windowStartMs, nowMs)
    ).length;
    const recoveredLeaseFailuresInWindow = jobEvents.filter(
      (event) =>
        event.kind === "failed" &&
        timestampInWindow(event.createdAt, windowStartMs, nowMs) &&
        typeof event.metadata?.recoveredFromWorkerId === "string"
    ).length;
    const expiredRunningLeases = runningJobs.filter((job) => job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) <= nowMs).length;
    return {
      generatedAt: now,
      windowMs,
      totalJobs: jobs.length,
      activeJobs: queuedJobs.length + runningJobs.length + cancelingJobs.length,
      queuedJobs: queuedJobs.length,
      runningJobs: runningJobs.length,
      cancelingJobs: cancelingJobs.length,
      terminalJobs: terminalJobs.length,
      failedJobs: failedJobs.length,
      retryableFailedJobs: failedJobs.filter((job) => job.retryable).length,
      terminalFailuresInWindow,
      recoveredLeaseFailuresInWindow,
      expiredRunningLeases,
      oldestQueuedAgeMs: oldestAgeMs(queuedJobs, nowMs, (job) => job.createdAt),
      oldestRunningAgeMs: oldestAgeMs(runningJobs, nowMs, (job) => job.startedAt ?? job.updatedAt),
      terminalFailureRatePerHour: terminalFailuresInWindow / (windowMs / (60 * 60 * 1000)),
      byStatus: countJobStatuses(jobs),
      byKind: countJobKinds(jobs)
    };
  }

  async getJobForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "project:read"
    });
    if (this.options.relationalReads?.getJob && this.options.relationalReads.getProject) {
      const job = await this.options.relationalReads.getJob({ workspaceId: input.workspaceId, jobId: input.jobId });
      if (!job) {
        throw new Error("Job not found.");
      }
      const project = await this.options.relationalReads.getProject({
        workspaceId: input.workspaceId,
        projectId: job.projectId
      });
      if (!project) {
        throw new Error("Project not found.");
      }
      return { project, job };
    }
    return this.findJobInWorkspace(state, input.workspaceId, input.jobId);
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

  async requestJobCancelForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "job:write"
    });
    const { project, job } = this.findJobInWorkspace(state, input.workspaceId, input.jobId);
    const now = new Date().toISOString();
    const nextJob = requestJobCancelState(job, now);
    project.jobs = (project.jobs ?? []).map((candidate) => (candidate.id === input.jobId ? nextJob : candidate));
    project.jobEvents = [
      ...(project.jobEvents ?? []),
      createJobEvent({
        id: randomUUID(),
        projectId: project.id,
        jobId: input.jobId,
        kind: job.status === "queued" ? "canceled" : "cancel_requested",
        stage: "cancel",
        message: nextJob.userMessage,
        progress: nextJob.progress,
        now
      })
    ].slice(-MAX_PROJECT_JOB_EVENTS);
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "job.cancel",
      targetType: "job",
      targetId: input.jobId,
      summary: `Requested cancel for ${job.kind} job.`,
      metadata: { jobKind: job.kind, status: job.status }
    });
    await this.save();
    return { project, job: nextJob };
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
    const nextAttempt = retried.attempt + 1;
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
            metadata: { previousAttempt: job.attempt, nextAttempt, maxAttempts: retried.maxAttempts },
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
          metadata: { jobKind: job.kind, previousAttempt: job.attempt, nextAttempt, maxAttempts: retried.maxAttempts }
        }
      }
    );
    return retried;
  }

  async retryJobForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }> {
    const state = await this.load();
    requireWorkspace(state, input.workspaceId);
    assertWorkspacePermission({
      members: state.workspaceMembers,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: "job:write"
    });
    const { project, job } = this.findJobInWorkspace(state, input.workspaceId, input.jobId);
    const now = new Date().toISOString();
    const retried = retryJobState(job, now);
    const nextAttempt = retried.attempt + 1;
    project.jobs = (project.jobs ?? []).map((candidate) => (candidate.id === input.jobId ? retried : candidate));
    project.jobEvents = [
      ...(project.jobEvents ?? []),
      createJobEvent({
        id: randomUUID(),
        projectId: project.id,
        jobId: input.jobId,
        kind: "retried",
        stage: "queued",
        message: retried.userMessage,
        progress: retried.progress,
        metadata: { previousAttempt: job.attempt, nextAttempt, maxAttempts: retried.maxAttempts },
        now
      })
    ].slice(-MAX_PROJECT_JOB_EVENTS);
    project.updatedAt = now;
    this.appendAuditToState(state, {
      workspaceId: input.workspaceId,
      projectId: project.id,
      actorUserId: input.userId,
      action: "job.retry",
      targetType: "job",
      targetId: input.jobId,
      summary: `Retried ${job.kind} job.`,
      metadata: { jobKind: job.kind, previousAttempt: job.attempt, nextAttempt, maxAttempts: retried.maxAttempts }
    });
    await this.save();
    return { project, job: retried };
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
        const recovered =
          recoverExpiredJobLease(job, now) ?? (job.status === "running" && job.leaseExpiresAt ? null : recoverInterruptedJob(job, now));
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
    return path.join(this.options.projectsDir ?? path.join(this.userDataDir(), "projects"), projectId);
  }

  storageRoot(): string {
    return this.options.storageRoot ?? path.join(this.userDataDir(), "private-storage");
  }

  async close(): Promise<void> {
    await this.persistence?.close?.();
    await this.options.relationalMirror?.close?.();
    if (this.options.relationalReads && this.options.relationalReads !== this.options.relationalMirror) {
      await this.options.relationalReads.close?.();
    }
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

  private findJobInWorkspace(state: AppState, workspaceId: string, jobId: string): { project: Project; job: JobRecord } {
    for (const project of state.projects) {
      if (project.workspaceId !== workspaceId) {
        continue;
      }
      const job = (project.jobs ?? []).find((candidate) => candidate.id === jobId);
      if (job) {
        return { project, job };
      }
    }
    throw new Error("Job not found.");
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
    await this.appStatePersistence().save(this.state);
    await this.mirrorRelationalState(this.state);
  }

  private appStatePersistence(): AppStatePersistence {
    if (!this.persistence) {
      this.persistence = this.options.persistence ?? new FileAppStatePersistence(this.storePath());
    }
    return this.persistence;
  }

  private async mirrorRelationalState(state: AppState): Promise<void> {
    if (!this.options.relationalMirror) {
      return;
    }
    for (const user of state.users) {
      await this.options.relationalMirror.upsertUser?.(user);
    }
    for (const workspace of state.workspaces) {
      await this.options.relationalMirror.upsertWorkspace?.(workspace);
    }
    for (const member of state.workspaceMembers) {
      await this.options.relationalMirror.upsertWorkspaceMember?.(member);
    }
    for (const project of state.projects) {
      await this.options.relationalMirror.upsertProject?.(project);
      for (const session of project.uploadSessions ?? []) {
        await this.options.relationalMirror.upsertRecordingUploadSession?.(session);
      }
      for (const job of project.jobs ?? []) {
        await this.options.relationalMirror.upsertJob({
          workspaceId: project.workspaceId,
          job,
          queueName: this.options.relationalQueueName ?? "gideon-hosted-worker-jobs",
          stage: latestJobStage(project, job),
          idempotencyKey: job.id,
          inputJson: { projectId: project.id, jobId: job.id, kind: job.kind }
        });
      }
      for (const artifact of project.artifacts ?? []) {
        await this.options.relationalMirror.upsertArtifact(artifact);
      }
    }
    for (const event of state.usageEvents ?? []) {
      await this.options.relationalMirror.upsertUsageEvent?.(event);
    }
    for (const event of state.auditEvents ?? []) {
      await this.options.relationalMirror.upsertAuditEvent?.(event);
    }
  }

  private storePath(): string {
    return this.options.storePath ?? process.env.GIDEON_STORE_PATH ?? path.join(this.userDataDir(), STORE_FILE);
  }

  private userDataDir(): string {
    const configured = this.options.userDataDir ?? process.env.GIDEON_USER_DATA_DIR;
    if (configured?.trim()) {
      return configured.trim();
    }
    if (process.env.GIDEON_STORE_PATH?.trim()) {
      return path.dirname(process.env.GIDEON_STORE_PATH.trim());
    }
    if (app && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
    throw new Error("GideonStore requires GIDEON_USER_DATA_DIR, GIDEON_STORE_PATH, or an Electron app context.");
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
    projects: (raw.projects ?? []).map((project) => normalizeProject(project as Project, activeWorkspaceId))
  };
}

function normalizeProject(project: Project, activeWorkspaceId: string): Project {
  const normalized: Project = {
    ...project,
    workspaceId: project.workspaceId ?? activeWorkspaceId,
    profile: normalizeProfile(project.profile ?? createDefaultProfile()),
    moments: project.moments ?? [],
    frameEvidence: project.frameEvidence ?? [],
    concepts: (project.concepts ?? []).map((concept, index) => ({
      ...concept,
      templateKey: concept.templateKey ?? templateForFormatFamily(concept.formatFamily, index)
    })),
    scripts: [],
    renders: project.renders ?? [],
    artifacts: project.artifacts ?? [],
    uploadSessions: project.uploadSessions ?? [],
    providerRuns: project.providerRuns ?? [],
    jobs: project.jobs ?? [],
    jobEvents: project.jobEvents ?? []
  };
  normalized.scripts = (project.scripts ?? []).map((script) => normalizeScriptDraft(normalized, script));
  return normalized;
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

function countJobStatuses(jobs: JobRecord[]): Partial<Record<JobStatus, number>> {
  return jobs.reduce<Partial<Record<JobStatus, number>>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
}

function countJobKinds(jobs: JobRecord[]): Partial<Record<JobKind, number>> {
  return jobs.reduce<Partial<Record<JobKind, number>>>((counts, job) => {
    counts[job.kind] = (counts[job.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function latestJobStage(project: Project, job: JobRecord): string {
  return [...(project.jobEvents ?? [])].reverse().find((event) => event.jobId === job.id)?.stage ?? job.status;
}

function oldestAgeMs(jobs: JobRecord[], nowMs: number, timestamp: (job: JobRecord) => string | undefined): number | null {
  const ages = jobs
    .map((job) => timestamp(job))
    .filter((value): value is string => Boolean(value))
    .map((value) => Math.max(0, nowMs - Date.parse(value)))
    .filter((value) => Number.isFinite(value));
  return ages.length ? Math.max(...ages) : null;
}

function timestampInWindow(value: string | undefined, windowStartMs: number, nowMs: number): boolean {
  if (!value) {
    return false;
  }
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) && timestampMs >= windowStartMs && timestampMs <= nowMs;
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

function assertCompletedUploadMatchesSession(
  session: RecordingUploadSessionRecord,
  artifact: ArtifactRecord,
  recording: RecordingMetadata
): void {
  if (artifact.id !== session.artifactId) {
    throw new Error("Uploaded artifact does not match the recording upload session.");
  }
  if (
    artifact.workspaceId !== session.workspaceId ||
    artifact.projectId !== session.projectId ||
    artifact.kind !== "source_recording" ||
    artifact.provider !== session.provider ||
    artifact.storageKey !== session.storageKey ||
    artifact.contentType !== session.contentType ||
    artifact.byteSize !== session.byteSize ||
    artifact.originalFileName !== session.originalFileName
  ) {
    throw new Error("Uploaded artifact metadata does not match the recording upload session.");
  }
  if (
    recording.artifactId !== artifact.id ||
    recording.storageKey !== artifact.storageKey ||
    recording.sha256 !== artifact.sha256 ||
    recording.sizeBytes !== artifact.byteSize ||
    recording.fileName !== artifact.originalFileName
  ) {
    throw new Error("Recording metadata does not match the uploaded artifact.");
  }
}

function assertExportArtifactMatchesProject(artifact: ArtifactRecord, project: Project): void {
  if (
    artifact.workspaceId !== project.workspaceId ||
    artifact.projectId !== project.id ||
    artifact.kind !== "export" ||
    artifact.contentType !== "video/mp4" ||
    artifact.byteSize <= 0 ||
    !artifact.sha256 ||
    !artifact.originalFileName.toLowerCase().endsWith(".mp4")
  ) {
    throw new Error("Export artifact metadata does not match the project.");
  }
}

function minutesForDuration(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

export function newProjectTemplate(): CreateProjectInput {
  return {
    name: "",
    profile: createDefaultProfile()
  };
}

function normalizeProfile(profile: ProductProfile): ProductProfile {
  const productName = (profile.productName ?? "").trim();
  const brandPresenterPosition = profile.brandPresenterPosition === "lower_left" ? "lower_left" : "lower_right";
  const brandPresenterMotion = profile.brandPresenterMotion === "idle_bob" ? "idle_bob" : "caption_sync";
  return {
    productName,
    targetCustomer: (profile.targetCustomer ?? "").trim(),
    productDescription: (profile.productDescription ?? "").trim(),
    preferredTone: profile.preferredTone ?? "direct",
    toneGuidance: (profile.toneGuidance ?? "").trim(),
    platforms: [
      ...new Set<ProductProfile["platforms"][number]>(
        profile.platforms?.length ? profile.platforms : ["tiktok", "instagram_reels", "youtube_shorts"]
      )
    ],
    walkthroughNotes: (profile.walkthroughNotes ?? "").trim(),
    defaultTemplateKey: profile.defaultTemplateKey ?? "problem_demo_payoff",
    brandPresenterEnabled: Boolean(profile.brandPresenterEnabled),
    avatarPresenterId: ["logo_head", "orbit", "nova"].includes(profile.avatarPresenterId ?? "")
      ? profile.avatarPresenterId
      : "logo_head",
    customAvatarSource: normalizeCustomAvatarSource(profile.customAvatarSource),
    brandPresenterPosition,
    brandPresenterMotion,
    soundDesignEnabled: Boolean(profile.soundDesignEnabled),
    musicMood: profile.musicMood ?? "none",
    brandKit: normalizeBrandKit(profile.brandKit, productName)
  };
}

function normalizeCustomAvatarSource(source: ProductProfile["customAvatarSource"]): ProductProfile["customAvatarSource"] {
  if (
    !source?.artifactId?.trim() ||
    source.consent.assetType !== "real_likeness" ||
    source.consent.status !== "granted" ||
    source.consent.sourceArtifactId !== source.artifactId ||
    source.consent.consentPolicyVersion !== "self-avatar-v1" ||
    source.consent.subjectRelationship !== "self" ||
    !source.consent.consentVerifiedAt ||
    !Number.isFinite(Date.parse(source.consent.consentVerifiedAt)) ||
    !Number.isFinite(Date.parse(source.importedAt)) ||
    (source.consent.expiresAt !== undefined && (
      !Number.isFinite(Date.parse(source.consent.expiresAt)) ||
      Date.parse(source.consent.expiresAt) <= Date.now()
    ))
  ) {
    return undefined;
  }
  return {
    artifactId: source.artifactId.trim(),
    displayName: source.displayName.trim().slice(0, 120) || "Custom self avatar",
    importedAt: source.importedAt,
    consent: {
      assetType: "real_likeness",
      status: "granted",
      sourceArtifactId: source.artifactId.trim(),
      consentVerifiedAt: source.consent.consentVerifiedAt,
      consentPolicyVersion: "self-avatar-v1",
      subjectRelationship: "self",
      expiresAt: source.consent.expiresAt
    }
  };
}

function applyProfileUpdate(project: Project, profile: ProductProfile): void {
  if (profile.customAvatarSource && !project.artifacts.some((artifact) =>
    artifact.id === profile.customAvatarSource?.artifactId && artifact.kind === "avatar_source_image"
  )) {
    throw new Error("Custom avatar source must reference a private artifact in this project.");
  }
  project.profile = profile;
  project.name = project.name.trim() || project.profile.productName;
  if (project.scripts.length > 0) {
    project.scripts = project.scripts.map((script) => normalizeScriptDraft(project, script));
    project.renders = [];
    project.status = "script_review";
  } else if (project.renders.length > 0) {
    project.renders = [];
  }
  project.updatedAt = new Date().toISOString();
}

function normalizeScriptDraft(project: Project, script: ScriptDraft): ScriptDraft {
  const concept = project.concepts.find((candidate) => candidate.id === script.conceptId);
  const templateKey = script.templateKey ?? concept?.templateKey ?? templateForFormatFamily(concept?.formatFamily ?? "problem-solution");
  const voiceoverText = script.voiceoverText.trim();
  const durationMs = estimateScriptDurationMs({ voiceoverText });
  const captions = splitCaptionSegments(voiceoverText, durationMs);
  const momentIds = concept?.proofMomentIds?.length
    ? concept.proofMomentIds
    : script.visualBeats?.map((beat) => beat.momentId) ?? [];
  const moments = momentIds
    .map((momentId) => project.moments.find((moment) => moment.id === momentId))
    .filter((moment): moment is DetectedMoment => Boolean(moment));
  const previousRenderDurationMs = script.editDecisionList?.durationMs ?? durationMs;
  const shouldRebuildVisualBeats =
    !script.visualBeats?.length ||
    (script.editDecisionList?.schemaVersion === "2" &&
      (script.editDecisionList.templateKey !== templateKey || Math.abs(previousRenderDurationMs - durationMs) > 1_000));
  const visualBeats = shouldRebuildVisualBeats
    ? buildVisualBeatsForTemplate({ moments, durationMs, templateKey })
    : script.visualBeats;
  const hook = script.hook.trim();
  const cta = script.cta.trim();
  const evidenceClaims = buildEvidenceClaims({ moments, hook, cta, voiceoverText });
  const qualityWarnings = scriptQualityWarnings({ hook, voiceoverText, captions, evidenceClaims });
  const editDecisionList = buildEditDecisionList({
    profile: project.profile,
    templateKey,
    durationMs,
    captions,
    visualBeats,
    hook,
    cta,
    moments
  });
  const normalizedBase: ScriptDraft = {
    ...script,
    templateKey,
    hook,
    voiceoverText,
    captions,
    cta,
    visualBeats,
    editDecisionList,
    evidenceClaims,
    qualityWarnings
  };
  if (!normalizedBase.approved) {
    return { ...normalizedBase, creativeBlueprint: undefined };
  }
  const { blueprint } = compileCreativeBlueprint({
    profile: project.profile,
    script: normalizedBase,
    moments,
    frameEvidence: project.frameEvidence,
    recordingPath: project.recording?.filePath,
    previousBlueprint: script.creativeBlueprint ?? script.editDecisionList?.creativeBlueprint
  });
  return {
    ...normalizedBase,
    creativeBlueprint: blueprint,
    editDecisionList: projectBlueprintOntoEditDecisionList(editDecisionList, blueprint)
  };
}
