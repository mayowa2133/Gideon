import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import type {
  AppState,
  BillingStatus,
  BrandKit,
  CaptionStylePreset,
  ContentConcept,
  CreatorTemplateKey,
  CtaStylePreset,
  DetectedMoment,
  JobKind,
  MusicMood,
  Platform,
  PlatformInfo,
  ProductProfile,
  Project,
  RecordingUploadSession,
  RenderFocusPoint,
  ScriptDraft,
  UsageMetric,
  WorkspacePlan,
  WorkspaceRole
} from "../shared/types";
import { platformLabels, toneLabels } from "../shared/types";
import { createDefaultProfile, splitCaptionSegments } from "../shared/contentEngine";
import {
  createDefaultBrandKit,
  creatorTemplatePack,
  fictionalAvatarPresenterCatalog,
  hasBlockingScriptWarnings
} from "../shared/renderTemplates";
import {
  createLocalUserWorkspace,
  entitlementLimit,
  formatQuantity,
  summarizeUsage,
  usageMetricLabels,
  workspacePlanDefinitions
} from "../shared/usage";
import "./styles.css";

type BusyAction =
  | "loading"
  | "saving"
  | "recording"
  | "analysis"
  | "concepts"
  | "scripts"
  | "rendering"
  | "avatar"
  | "exporting"
  | "job"
  | null;

const platforms: Platform[] = ["tiktok", "instagram_reels", "youtube_shorts", "linkedin", "other"];
const captionStyles: CaptionStylePreset[] = ["kinetic_bold", "clean_founder", "educational_stack"];
const ctaStyles: CtaStylePreset[] = ["soft_try", "direct_signup", "learn_more"];
const musicMoods: MusicMood[] = ["none", "clean_tech", "upbeat"];
const presenterPositions = ["lower_right", "lower_left"] as const;
const presenterMotions = ["caption_sync", "idle_bob"] as const;
const fictionalAvatarPreviewUrls: Partial<Record<NonNullable<ProductProfile["avatarPresenterId"]>, string>> = {
  orbit: new URL("../../assets/avatar-catalog/orbit.png", import.meta.url).toString(),
  nova: new URL("../../assets/avatar-catalog/nova.png", import.meta.url).toString()
};

function App(): JSX.Element {
  const [state, setState] = useState<AppState>(() => createEmptyAppState());
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [busy, setBusy] = useState<BusyAction>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    if (!activeProject || !hasActiveJobs(activeProject)) {
      return;
    }
    const activeProjectId = activeProject.id;
    const timer = window.setInterval(() => {
      void refreshState(activeProjectId);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeProject?.id, activeProject?.jobs.map((job) => `${job.id}:${job.status}:${job.updatedAt}`).join("|")]);

  const refreshProject = (project: Project): void => {
    setActiveProject(project);
    setState((current) => ({
      ...current,
      activeProjectId: project.id,
      projects: [project, ...current.projects.filter((candidate) => candidate.id !== project.id)]
    }));
    void window.gideon
      .listProjects()
      .then((nextState) => setState(nextState))
      .catch(() => undefined);
  };

  const applyAppState = (nextState: AppState, preferredProjectId?: string): void => {
    setState(nextState);
    const active =
      nextState.projects.find((project) => project.id === preferredProjectId) ??
      nextState.projects.find((project) => project.id === nextState.activeProjectId) ??
      nextState.projects[0] ??
      null;
    setActiveProject(active);
  };

  async function loadInitialState(): Promise<void> {
    setBusy("loading");
    setError(null);
    try {
      const [projects, info] = await Promise.all([window.gideon.listProjects(), window.gideon.platformInfo()]);
      applyAppState(projects);
      setPlatformInfo(info);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setBusy(null);
    }
  }

  async function refreshState(preferredProjectId?: string): Promise<void> {
    try {
      const projects = await window.gideon.listProjects();
      applyAppState(projects, preferredProjectId);
    } catch {
      // Background polling should not interrupt the user's current edit.
    }
  }

  async function createProject(profile: ProductProfile): Promise<void> {
    setBusy("saving");
    setError(null);
    try {
      const project = await window.gideon.createProject({
        name: profile.productName ? `${profile.productName} campaign` : "Untitled campaign",
        profile
      });
      refreshProject(project);
    } catch (createError) {
      setError(messageFromError(createError));
    } finally {
      setBusy(null);
    }
  }

  async function chooseProject(projectId: string): Promise<void> {
    setBusy("loading");
    setError(null);
    try {
      const project = await window.gideon.setActiveProject(projectId);
      setActiveProject(project);
      setState((current) => ({ ...current, activeProjectId: projectId }));
    } catch (chooseError) {
      setError(messageFromError(chooseError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Projects">
        <div className="brand-lockup">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Gideon Desktop</p>
            <h1>Walkthrough to short-form videos</h1>
          </div>
        </div>
        <button className="primary full-width" onClick={() => setActiveProject(null)} type="button">
          New project
        </button>
        <ProjectList
          projects={state.projects}
          activeProjectId={activeProject?.id ?? null}
          onSelect={(projectId) => void chooseProject(projectId)}
        />
        <WorkspacePanel state={state} />
        <BillingPanel
          state={state}
          busy={busy === "saving"}
          onState={applyAppState}
          setBusy={setBusy}
          setError={setError}
        />
        <TeamPanel
          state={state}
          busy={busy === "saving"}
          onState={applyAppState}
          setBusy={setBusy}
          setError={setError}
        />
        <AuditPanel state={state} />
        <RuntimePanel info={platformInfo} />
      </aside>

      <section className="workspace">
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        {busy === "loading" ? (
          <div className="empty-state">Loading Gideon workspace…</div>
        ) : activeProject ? (
          <ProjectWorkspace
            project={activeProject}
            platformInfo={platformInfo}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onProject={refreshProject}
          />
        ) : (
          <NewProjectPanel onCreate={(profile) => void createProject(profile)} busy={busy === "saving"} />
        )}
      </section>
    </main>
  );
}

function createEmptyAppState(): AppState {
  return {
    ...createLocalUserWorkspace(),
    usageEvents: [],
    auditEvents: [],
    projects: [],
    activeProjectId: null
  };
}

function hasActiveJobs(project: Project): boolean {
  return project.jobs.some((job) => job.status === "queued" || job.status === "running" || job.status === "canceling");
}

function ProjectList({
  projects,
  activeProjectId,
  onSelect
}: {
  projects: Project[];
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
}): JSX.Element {
  if (projects.length === 0) {
    return <div className="muted-card">No projects yet. Create one, choose a recording, then render drafts.</div>;
  }
  return (
    <div className="project-list">
      {projects.map((project) => (
        <button
          key={project.id}
          className={`project-card ${project.id === activeProjectId ? "active" : ""}`}
          onClick={() => onSelect(project.id)}
          type="button"
        >
          <strong>{project.name}</strong>
          <span>{project.status.replace(/_/g, " ")}</span>
          <small>{new Date(project.updatedAt).toLocaleString()}</small>
        </button>
      ))}
    </div>
  );
}

function RuntimePanel({ info }: { info: PlatformInfo | null }): JSX.Element {
  if (!info) {
    return <div className="runtime-panel">Checking local media tools…</div>;
  }
  return (
    <div className="runtime-panel">
      <p className="eyebrow">Local runtime</p>
      <StatusDot ok={info.ffmpegAvailable} label="FFmpeg" />
      <StatusDot ok={info.ffprobeAvailable} label="ffprobe" />
      <StatusDot ok={info.sayAvailable} label="macOS voiceover" />
      <StatusDot ok={info.openAiConfigured} label="OpenAI providers" />
      <StatusDot
        ok={info.storageProvider === "local_private" || info.cloudStorageConfigured}
        label={`Storage: ${info.storageProvider.replace(/_/g, " ")}`}
      />
      {info.openAiConfigured ? (
        <small>
          LLM: {info.openAiLlmModel} · ASR: {info.openAiTranscriptionModel} · TTS: {info.openAiTtsModel}
        </small>
      ) : (
        <small>Set OPENAI_API_KEY or GIDEON_OPENAI_API_KEY before launching to enable real AI, ASR, and provider TTS.</small>
      )}
      {info.storageProvider !== "local_private" && !info.cloudStorageConfigured ? (
        <small>Cloud storage is selected but missing endpoint, bucket, or credentials.</small>
      ) : null}
      <small>
        Queue: {info.queue.active}/{info.queue.concurrency} active · {info.queue.pending} pending
        {formatQueueKinds(info.queue.activeByKind) ? ` · active ${formatQueueKinds(info.queue.activeByKind)}` : ""}
      </small>
      {formatQueueKinds(info.queue.concurrencyByKind) ? <small>Queue lanes: {formatQueueKinds(info.queue.concurrencyByKind)}</small> : null}
      <small>Data folder: {info.userDataPath}</small>
    </div>
  );
}

function WorkspacePanel({ state }: { state: AppState }): JSX.Element | null {
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId) ?? state.workspaces[0];
  if (!workspace) {
    return null;
  }
  const summary = summarizeUsage(state.usageEvents, workspace.id);
  const metrics: UsageMetric[] = ["source_minutes", "llm_runs", "tts_characters", "render_minutes", "exports"];
  return (
    <div className="workspace-panel">
      <p className="eyebrow">Workspace</p>
      <strong>{workspace.name}</strong>
      <small>
        {workspace.plan.replace(/_/g, " ")} · billing {workspace.billingStatus.replace(/_/g, " ")}
      </small>
      <div className="usage-list">
        {metrics.map((metric) => (
          <span key={metric}>
            {usageMetricLabels[metric]}: {formatQuantity(summary[metric], metric)} /{" "}
            {formatQuantity(entitlementLimit(workspace.entitlements, metric), metric)}
          </span>
        ))}
      </div>
    </div>
  );
}

function BillingPanel({
  state,
  busy,
  onState,
  setBusy,
  setError
}: {
  state: AppState;
  busy: boolean;
  onState: (state: AppState, preferredProjectId?: string) => void;
  setBusy: (busy: BusyAction) => void;
  setError: (error: string | null) => void;
}): JSX.Element | null {
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId) ?? state.workspaces[0];
  const [plan, setPlan] = useState<WorkspacePlan>(workspace?.plan ?? "local_mvp");
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(workspace?.billingStatus ?? "not_configured");

  useEffect(() => {
    if (!workspace) {
      return;
    }
    setPlan(workspace.plan);
    setBillingStatus(workspace.billingStatus);
  }, [workspace?.id, workspace?.plan, workspace?.billingStatus]);

  if (!workspace) {
    return null;
  }

  const activeWorkspace = workspace;
  const selectedDefinition =
    workspacePlanDefinitions.find((candidate) => candidate.id === plan) ?? workspacePlanDefinitions[0]!;
  const currentMembership = state.workspaceMembers.find(
    (member) => member.workspaceId === activeWorkspace.id && member.userId === state.activeUserId
  );
  const canManageBilling = currentMembership?.role === "owner" || currentMembership?.role === "admin";

  async function savePlan(): Promise<void> {
    setBusy("saving");
    setError(null);
    try {
      const next = await window.gideon.updateWorkspaceBillingPlan({
        workspaceId: activeWorkspace.id,
        plan,
        billingStatus
      });
      onState(next);
    } catch (billingError) {
      setError(messageFromError(billingError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="billing-panel">
      <p className="eyebrow">Billing and quotas</p>
      <label>
        <span>Plan</span>
        <select
          value={plan}
          disabled={busy || !canManageBilling}
          onChange={(event) => {
            const nextPlan = event.target.value as WorkspacePlan;
            setPlan(nextPlan);
            const definition = workspacePlanDefinitions.find((candidate) => candidate.id === nextPlan);
            if (definition) {
              setBillingStatus(definition.billingStatus);
            }
          }}
        >
          {workspacePlanDefinitions.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select
          value={billingStatus}
          disabled={busy || !canManageBilling}
          onChange={(event) => setBillingStatus(event.target.value as BillingStatus)}
        >
          {billingStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <small>{selectedDefinition.description}</small>
      <small>
        {selectedDefinition.monthlyPriceCents === null
          ? "Provider billing not configured"
          : `$${(selectedDefinition.monthlyPriceCents / 100).toFixed(0)}/month placeholder`}
      </small>
      <button
        className="secondary compact"
        disabled={busy || !canManageBilling || (plan === activeWorkspace.plan && billingStatus === activeWorkspace.billingStatus)}
        onClick={() => void savePlan()}
        type="button"
      >
        Save plan
      </button>
      {!canManageBilling ? <small>Only workspace owners and admins can change billing settings.</small> : null}
    </div>
  );
}

function TeamPanel({
  state,
  busy,
  onState,
  setBusy,
  setError
}: {
  state: AppState;
  busy: boolean;
  onState: (state: AppState, preferredProjectId?: string) => void;
  setBusy: (busy: BusyAction) => void;
  setError: (error: string | null) => void;
}): JSX.Element | null {
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("editor");
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId) ?? state.workspaces[0];
  if (!workspace) {
    return null;
  }
  const members = state.workspaceMembers.filter((member) => member.workspaceId === workspace.id);
  const currentUserId = state.activeUserId;

  async function runTeamAction(action: () => Promise<AppState>): Promise<void> {
    setBusy("saving");
    setError(null);
    try {
      onState(await action());
    } catch (teamError) {
      setError(messageFromError(teamError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="team-panel">
      <p className="eyebrow">Team</p>
      <label>
        <span>Workspace</span>
        <select
          value={workspace.id}
          disabled={busy}
          onChange={(event) => void runTeamAction(() => window.gideon.setActiveWorkspace(event.target.value))}
        >
          {state.workspaces.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <div className="team-inline-form">
        <input
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          placeholder="New workspace"
          disabled={busy}
        />
        <button
          className="secondary compact"
          disabled={busy || workspaceName.trim().length < 2}
          onClick={() =>
            void runTeamAction(async () => {
              const next = await window.gideon.createWorkspace({ name: workspaceName });
              setWorkspaceName("");
              return next;
            })
          }
          type="button"
        >
          Create
        </button>
      </div>
      <div className="member-list">
        {members.map((member) => {
          const user = state.users.find((candidate) => candidate.id === member.userId);
          return (
            <div key={member.id} className="member-row">
              <div>
                <strong>{user?.displayName ?? user?.email ?? member.userId}</strong>
                <small>{user?.email ?? member.userId}</small>
              </div>
              <select
                value={member.role}
                disabled={busy}
                onChange={(event) =>
                  void runTeamAction(() =>
                    window.gideon.updateWorkspaceMemberRole({
                      workspaceId: workspace.id,
                      userId: member.userId,
                      role: event.target.value as WorkspaceRole
                    })
                  )
                }
              >
                {workspaceRoles.map((candidateRole) => (
                  <option key={candidateRole} value={candidateRole}>
                    {candidateRole}
                  </option>
                ))}
              </select>
              <button
                className="ghost compact"
                disabled={busy || member.userId === currentUserId}
                onClick={() =>
                  void runTeamAction(() =>
                    window.gideon.removeWorkspaceMember({
                      workspaceId: workspace.id,
                      userId: member.userId
                    })
                  )
                }
                type="button"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      <div className="team-add-form">
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@email.com" disabled={busy} />
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" disabled={busy} />
        <select value={role} disabled={busy} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
          {workspaceRoles.map((candidateRole) => (
            <option key={candidateRole} value={candidateRole}>
              {candidateRole}
            </option>
          ))}
        </select>
        <button
          className="secondary compact"
          disabled={busy || !email.trim()}
          onClick={() =>
            void runTeamAction(async () => {
              const next = await window.gideon.addWorkspaceMember({
                workspaceId: workspace.id,
                email,
                displayName,
                role
              });
              setEmail("");
              setDisplayName("");
              setRole("editor");
              return next;
            })
          }
          type="button"
        >
          Add member
        </button>
      </div>
    </div>
  );
}

const workspaceRoles: WorkspaceRole[] = ["owner", "admin", "editor", "viewer"];
const billingStatuses: BillingStatus[] = ["not_configured", "trialing", "active", "past_due", "canceled"];

function DirectUploadSessionCard({
  platformInfo,
  busy,
  uploadFile,
  uploadSession,
  uploadStatus,
  onFile,
  onCreate,
  onUpload
}: {
  platformInfo: PlatformInfo | null;
  busy: boolean;
  uploadFile: File | null;
  uploadSession: RecordingUploadSession | null;
  uploadStatus: string | null;
  onFile: (file: File | null) => void;
  onCreate: () => void;
  onUpload: () => void;
}): JSX.Element {
  if (!platformInfo?.cloudStorageConfigured) {
    return (
      <div className="direct-upload-card muted-card">
        <p className="eyebrow">Direct cloud upload</p>
        <small>
          Configure S3/R2 storage env vars to create browser-to-cloud upload sessions. Local “Choose recording” remains the
          complete import path.
        </small>
      </div>
    );
  }

  return (
    <div className="direct-upload-card">
      <p className="eyebrow">Direct cloud upload</p>
      <small>
        Uploads directly to {platformInfo.storageProvider}, then Gideon downloads the private object into its processing
        cache, probes it, attaches it, and meters usage.
      </small>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        disabled={busy}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      {uploadFile ? (
        <small>
          Selected {uploadFile.name} · {formatBytes(uploadFile.size)}
        </small>
      ) : null}
      <button className="secondary compact" disabled={busy || !uploadFile} onClick={onCreate} type="button">
        {uploadSession ? "Create new session" : "Create upload session"}
      </button>
      {uploadSession ? (
        <div className="upload-session-details">
          <strong>Session ready</strong>
          <small>
            {uploadSession.method} {uploadSession.provider.toUpperCase()} · expires{" "}
            {new Date(uploadSession.expiresAt).toLocaleTimeString()}
          </small>
          <small>Header: Content-Type {uploadSession.headers["Content-Type"]}</small>
          <code>{uploadSession.uploadUrl.slice(0, 96)}…</code>
          <button className="primary compact" disabled={busy || !uploadFile} onClick={onUpload} type="button">
            Upload file and finish import
          </button>
        </div>
      ) : null}
      {uploadStatus ? <small>{uploadStatus}</small> : null}
    </div>
  );
}

function AuditPanel({ state }: { state: AppState }): JSX.Element | null {
  const workspaceId = state.activeWorkspaceId ?? state.workspaces[0]?.id;
  if (!workspaceId) {
    return null;
  }
  const events = state.auditEvents
    .filter((event) => event.workspaceId === workspaceId)
    .slice(-6)
    .reverse();
  return (
    <div className="audit-panel">
      <p className="eyebrow">Audit trail</p>
      {events.length === 0 ? (
        <small>No tracked changes yet.</small>
      ) : (
        <div className="audit-list">
          {events.map((event) => (
            <div key={event.id} className="audit-event">
              <strong>{event.action.replace(/\./g, " ")}</strong>
              <span>{event.summary}</span>
              <small>
                {event.actorType.replace(/_/g, " ")} · {new Date(event.createdAt).toLocaleString()}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span className="status-dot">
      <span className={ok ? "dot ok" : "dot warn"} />
      {label}
    </span>
  );
}

function NewProjectPanel({ onCreate, busy }: { onCreate: (profile: ProductProfile) => void; busy: boolean }): JSX.Element {
  const [profile, setProfile] = useState<ProductProfile>(() => ({
    ...createDefaultProfile(),
    productName: "LeadPilot",
    targetCustomer: "B2B SaaS founders and growth teams",
    productDescription: "Finds qualified leads, researches context, and drafts personalized outreach from one workflow.",
    preferredTone: "direct",
    toneGuidance: "Plain founder voice. No hype.",
    walkthroughNotes: "Focus on the setup, lead research, generated draft, and final success state."
  }));
  return (
    <section className="hero-panel">
      <p className="eyebrow">Create campaign</p>
      <h2>Turn one product recording into three editable vertical video drafts.</h2>
      <p>
        Gideon runs locally on your Mac. It stores project state in your application data folder and renders private MP4
        files with local FFmpeg.
      </p>
      <ProfileForm profile={profile} onChange={setProfile} />
      <button className="primary" onClick={() => onCreate(profile)} disabled={busy} type="button">
        {busy ? "Creating…" : "Create project"}
      </button>
    </section>
  );
}

function ProjectWorkspace({
  project,
  platformInfo,
  busy,
  setBusy,
  setError,
  onProject
}: {
  project: Project;
  platformInfo: PlatformInfo | null;
  busy: BusyAction;
  setBusy: (busy: BusyAction) => void;
  setError: (error: string | null) => void;
  onProject: (project: Project) => void;
}): JSX.Element {
  const [profile, setProfile] = useState<ProductProfile>(project.profile);
  const [scripts, setScripts] = useState<ScriptDraft[]>(project.scripts);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSession, setUploadSession] = useState<RecordingUploadSession | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [avatarConsentAttested, setAvatarConsentAttested] = useState(false);

  useEffect(() => {
    setProfile(project.profile);
    setScripts(project.scripts);
  }, [project]);

  useEffect(() => {
    setUploadFile(null);
    setUploadSession(null);
    setUploadStatus(null);
  }, [project.id]);

  async function runAction(action: BusyAction, callback: () => Promise<Project | null>): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const updated = await callback();
      if (updated) {
        onProject(updated);
      }
    } catch (actionError) {
      setError(messageFromError(actionError));
    } finally {
      setBusy(null);
    }
  }

  async function createDirectUploadSession(): Promise<void> {
    if (!uploadFile) {
      return;
    }
    setBusy("recording");
    setError(null);
    try {
      const session = await window.gideon.createRecordingUploadSession({
        projectId: project.id,
        fileName: uploadFile.name,
        byteSize: uploadFile.size,
        contentType: uploadFile.type || undefined
      });
      setUploadSession(session);
      setUploadStatus("Session created. Upload the file to finish importing it.");
      onProject(await window.gideon.setActiveProject(project.id));
    } catch (sessionError) {
      setError(messageFromError(sessionError));
    } finally {
      setBusy(null);
    }
  }

  async function uploadDirectRecording(): Promise<void> {
    if (!uploadFile || !uploadSession) {
      return;
    }
    setBusy("recording");
    setError(null);
    setUploadStatus("Uploading directly to private object storage…");
    try {
      const response = await fetch(uploadSession.uploadUrl, {
        method: uploadSession.method,
        headers: uploadSession.headers,
        body: uploadFile
      });
      if (!response.ok) {
        throw new Error(`Cloud upload failed with HTTP ${response.status}. Check bucket CORS and storage credentials.`);
      }
      setUploadStatus("Upload complete. Validating and attaching recording…");
      const projectWithRecording = await window.gideon.completeRecordingUploadSession({
        projectId: project.id,
        sessionId: uploadSession.id
      });
      setUploadFile(null);
      setUploadSession(null);
      setUploadStatus(null);
      onProject(projectWithRecording);
    } catch (uploadError) {
      setError(messageFromError(uploadError));
      setUploadStatus("Upload did not finish.");
    } finally {
      setBusy(null);
    }
  }

  const selectedConceptCount = project.concepts.filter((concept) => concept.selected).length;
  const selectedConceptIds = new Set(project.concepts.filter((concept) => concept.selected).map((concept) => concept.id));
  const approvedSelectedScriptCount = project.scripts.filter(
    (script) => script.approved && selectedConceptIds.has(script.conceptId) && !hasBlockingScriptWarnings(script.qualityWarnings)
  ).length;
  const readyAvatarScriptIds = new Set(project.artifacts
    .filter((artifact) =>
      artifact.kind === "avatar_presenter" &&
      artifact.avatarModelReceipt?.avatarId === project.profile.avatarPresenterId &&
      artifact.avatarModelReceipt?.avatarProvenance === "gideon_fictional_catalog"
    )
    .flatMap((artifact) => {
      const script = project.scripts.find((candidate) => candidate.id === artifact.avatarPresenterLineage?.sourceScriptId);
      return script && artifact.avatarPresenterLineage?.sourceScriptUpdatedAt === script.updatedAt ? [script.id] : [];
    }));

  return (
    <div className="project-workspace">
      <header className="project-header">
        <div>
          <p className="eyebrow">Project</p>
          <h2>{project.name}</h2>
          <p>{project.profile.productDescription}</p>
        </div>
        <div className="header-metrics">
          <Metric label="Moments" value={project.moments.length} />
          <Metric label="Concepts" value={project.concepts.length} />
          <Metric label="Scripts" value={project.scripts.length} />
          <Metric label="Renders" value={project.renders.filter((render) => render.status === "completed").length} />
          <Metric label="Artifacts" value={project.artifacts.length} />
        </div>
      </header>

      <Stepper project={project} />
      <JobHistory
        project={project}
        busy={busy !== null}
        onCancel={(jobId) => void runAction("job", () => window.gideon.cancelJob(project.id, jobId))}
        onRetry={(jobId) => void runAction("job", () => window.gideon.retryJob(project.id, jobId))}
      />

      <section className="grid two">
        <Panel title="1. Product context" eyebrow="Grounding">
          <ProfileForm profile={profile} onChange={setProfile} />
          <div className="avatar-consent-control">
            <label className="checkbox-row">
              <input
                checked={avatarConsentAttested}
                onChange={(event) => setAvatarConsentAttested(event.target.checked)}
                type="checkbox"
              />
              I own this likeness or have explicit permission to use it as an AI presenter.
            </label>
            <button
              className="secondary"
              disabled={!avatarConsentAttested || busy === "avatar"}
              onClick={() => void runAction("avatar", () => window.gideon.importCustomAvatarSource(project.id, avatarConsentAttested))}
              type="button"
            >
              {project.profile.customAvatarSource ? "Replace self avatar" : "Import self avatar"}
            </button>
            {project.profile.customAvatarSource ? (
              <small>Authorized source: {project.profile.customAvatarSource.displayName}</small>
            ) : null}
          </div>
          <button
            className="secondary"
            disabled={busy === "saving"}
            onClick={() => void runAction("saving", () => window.gideon.updateProfile(project.id, profile))}
            type="button"
          >
            Save context
          </button>
        </Panel>

        <Panel title="2. Recording" eyebrow="Input media">
          {project.recording ? (
            <div className="recording-card">
              <video src={project.recording.fileUrl} controls />
              <div>
                <strong>{project.recording.fileName}</strong>
                <p>
                  {project.recording.width}×{project.recording.height} · {Math.round(project.recording.durationMs / 1000)}s ·{" "}
                  {project.recording.videoCodec}
                  {project.recording.audioCodec ? ` + ${project.recording.audioCodec}` : " · no audio"}
                </p>
                {project.recording.storageKey ? (
                  <small>
                    Private storage: {project.recording.storageKey}
                    {project.recording.sha256 ? ` · sha256 ${project.recording.sha256.slice(0, 12)}…` : ""}
                  </small>
                ) : (
                  <small>Legacy local source path; replace the recording to import it into private storage.</small>
                )}
              </div>
            </div>
          ) : (
            <p className="muted">Choose an MP4, MOV, or WebM product walkthrough.</p>
          )}
          <button
            className="secondary"
            disabled={busy === "recording"}
            onClick={() => void runAction("recording", () => window.gideon.chooseRecording(project.id))}
            type="button"
          >
            {project.recording ? "Replace recording" : "Choose recording"}
          </button>
          <DirectUploadSessionCard
            platformInfo={platformInfo}
            busy={busy === "recording"}
            uploadFile={uploadFile}
            uploadSession={uploadSession}
            uploadStatus={uploadStatus}
            onFile={(file) => {
              setUploadFile(file);
              setUploadSession(null);
              setUploadStatus(null);
            }}
            onCreate={() => void createDirectUploadSession()}
            onUpload={() => void uploadDirectRecording()}
          />
        </Panel>
      </section>

      <Panel title="3. Analysis and moments" eyebrow="Evidence">
        <div className="action-row">
          <button
            className="primary"
            disabled={!project.recording || busy === "analysis"}
            onClick={() => void runAction("analysis", () => window.gideon.runAnalysis(project.id))}
            type="button"
          >
            {busy === "analysis" ? "Analyzing…" : "Analyze recording"}
          </button>
          <p className="muted">Gideon queues analysis work, samples representative frames, and creates editable moments from the timeline.</p>
        </div>
        <MomentGrid
          moments={project.moments}
          onChange={(moments) => void runAction("saving", () => window.gideon.updateMoments(project.id, moments))}
        />
        <AnalysisEvidence project={project} />
      </Panel>

      <Panel title="4. Concepts" eyebrow="10 angles">
        <div className="action-row">
          <button
            className="primary"
            disabled={project.moments.length === 0 || busy === "concepts"}
            onClick={() => void runAction("concepts", () => window.gideon.generateConcepts(project.id))}
            type="button"
          >
            {busy === "concepts" ? "Generating…" : "Generate 10 concepts"}
          </button>
          <p className="muted">Select up to three. Current selection: {selectedConceptCount}/3.</p>
        </div>
        <ConceptGrid
          concepts={project.concepts}
          moments={project.moments}
          onChange={(concepts, changedId) =>
            void runAction("saving", () => window.gideon.updateConcepts(project.id, concepts, changedId))
          }
        />
      </Panel>

      <Panel title="5. Scripts and captions" eyebrow="Review gate">
        <div className="action-row">
          <button
            className="primary"
            disabled={selectedConceptCount === 0 || busy === "scripts"}
            onClick={() => void runAction("scripts", () => window.gideon.generateScripts(project.id))}
            type="button"
          >
            {busy === "scripts" ? "Writing…" : "Generate scripts"}
          </button>
          <button
            className="secondary"
            disabled={scripts.length === 0 || busy === "saving"}
            onClick={() => void runAction("saving", () => window.gideon.updateScripts(project.id, scripts))}
            type="button"
          >
            Save script edits
          </button>
        </div>
        <ScriptEditor
          scripts={scripts}
          setScripts={setScripts}
          onRegenerate={(scriptId) =>
            void runAction("scripts", () => window.gideon.regenerateScript(project.id, scriptId))
          }
          onRenderScript={(scriptId, voiceoverMode) =>
            void runAction("rendering", () => window.gideon.renderScript(project.id, scriptId, voiceoverMode))
          }
          onRegenerateVoiceover={(scriptId) =>
            void runAction("rendering", () => window.gideon.regenerateVoiceover(project.id, scriptId))
          }
          onGenerateAvatarPresenter={(scriptId) =>
            void runAction("rendering", () => window.gideon.generateAvatarPresenter(project.id, scriptId))
          }
          canGenerateAvatarPresenter={project.profile.avatarPresenterId === "orbit" || project.profile.avatarPresenterId === "nova"}
          readyAvatarScriptIds={readyAvatarScriptIds}
        />
      </Panel>

      <Panel title="6. Render and export" eyebrow="Downloadable MP4">
        <div className="action-row">
          <button
            className="primary"
            disabled={project.scripts.length === 0 || approvedSelectedScriptCount === 0 || busy === "rendering"}
            onClick={() => void runAction("rendering", () => window.gideon.renderSelected(project.id))}
            type="button"
          >
            {busy === "rendering"
              ? "Rendering MP4 drafts…"
              : approvedSelectedScriptCount === 0
                ? "Approve drafts before render"
                : "Render selected drafts"}
          </button>
          <p className="muted">
            {approvedSelectedScriptCount} approved selected draft{approvedSelectedScriptCount === 1 ? "" : "s"} ready
            for local 1080×1920 H.264/AAC rendering.
          </p>
        </div>
        <RenderGallery
          project={project}
          exporting={busy === "exporting"}
          onExport={(renderId) =>
            void runAction("exporting", async () => {
              const exported = await window.gideon.exportVideo(project.id, renderId);
              if (exported) {
                await window.gideon.revealPath(exported);
              }
              return project;
            })
          }
        />
      </Panel>
    </div>
  );
}

function JobHistory({
  project,
  busy,
  onCancel,
  onRetry
}: {
  project: Project;
  busy: boolean;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}): JSX.Element | null {
  if (project.jobs.length === 0) {
    return null;
  }
  return (
    <section className="job-history" aria-label="Job history">
      <div>
        <p className="eyebrow">Jobs</p>
        <h2>Recent processing</h2>
      </div>
      <div className="job-list">
        {project.jobs.slice(-5).map((job) => (
          <article key={job.id} className={`job-pill ${job.status}`}>
            <strong>{job.kind.replace(/_/g, " ")}</strong>
            <span>{job.status}</span>
            <small>
              attempt {job.attempt}/{job.maxAttempts} · {job.userMessage}
            </small>
            <div className="job-event-list">
              {project.jobEvents
                .filter((event) => event.jobId === job.id)
                .slice(-3)
                .map((event) => (
                  <small key={event.id}>
                    {event.stage.replace(/_/g, " ")} · {event.message}
                  </small>
                ))}
            </div>
            <div className="job-actions">
              {job.cancelable && (job.status === "queued" || job.status === "running") ? (
                <button className="ghost compact" disabled={busy} onClick={() => onCancel(job.id)} type="button">
                  Cancel
                </button>
              ) : null}
              {job.retryable && (job.status === "failed" || job.status === "canceled") ? (
                <button className="secondary compact" disabled={busy} onClick={() => onRetry(job.id)} type="button">
                  Retry
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalysisEvidence({ project }: { project: Project }): JSX.Element | null {
  if (!project.analysisSummary && !project.transcript && project.frameEvidence.length === 0 && project.providerRuns.length === 0) {
    return null;
  }
  const ocrFrames = project.frameEvidence.filter((frame) => frame.ocrText?.trim());
  return (
    <div className="analysis-evidence">
      {project.analysisSummary ? (
        <div>
          <strong>Analysis summary</strong>
          <p>{project.analysisSummary}</p>
        </div>
      ) : null}
      {project.transcript ? (
        <div>
          <strong>Transcript</strong>
          <p>
            {project.transcript.status} · {project.transcript.provider}
            {project.transcript.model ? ` · ${project.transcript.model}` : ""}
          </p>
          {project.transcript.text ? <blockquote>{project.transcript.text.slice(0, 600)}</blockquote> : null}
          {project.transcript.error ? <small>{project.transcript.error}</small> : null}
        </div>
      ) : null}
      {project.frameEvidence.length > 0 ? (
        <div>
          <strong>Visual evidence</strong>
          <p>
            {project.frameEvidence.length} sampled frames · {ocrFrames.length} with readable UI text
          </p>
          <div className="frame-evidence-list">
            {project.frameEvidence.slice(0, 6).map((frame) => (
              <article key={frame.id} className="frame-evidence-card">
                {frame.imageUrl ? <img src={frame.imageUrl} alt="" /> : null}
                <span>{formatMs(frame.timestampMs)}</span>
                <small>
                  {frame.ocrProvider ?? "none"}
                  {typeof frame.confidence === "number" ? ` · ${Math.round(frame.confidence * 100)}%` : ""}
                </small>
                {frame.ocrText ? <blockquote>{frame.ocrText.slice(0, 240)}</blockquote> : <p>No readable UI text captured.</p>}
                {frame.uiElements && frame.uiElements.length > 0 ? (
                  <ul className="ui-evidence-list">
                    {frame.uiElements.slice(0, 4).map((element) => (
                      <li key={element.id}>
                        <span>{element.kind}</span>
                        <em>{element.text}</em>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {project.providerRuns.length > 0 ? (
        <div className="provider-run-list">
          {project.providerRuns.slice(-6).map((run) => (
            <span key={run.id} className={`provider-run ${run.status}`}>
              {run.kind}: {run.provider} · {run.status}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileForm({
  profile,
  onChange
}: {
  profile: ProductProfile;
  onChange: (profile: ProductProfile) => void;
}): JSX.Element {
  function update<K extends keyof ProductProfile>(key: K, value: ProductProfile[K]): void {
    onChange({ ...profile, [key]: value });
  }

  function brandKit(): BrandKit {
    return profile.brandKit ?? createDefaultBrandKit(profile.productName);
  }

  function updateBrandKit(patch: Partial<BrandKit>): void {
    update("brandKit", {
      ...brandKit(),
      ...patch
    });
  }

  async function chooseLogo(): Promise<void> {
    const selected = await window.gideon.chooseBrandLogo();
    if (selected) {
      updateBrandKit(selected);
    }
  }

  function togglePlatform(platform: Platform): void {
    const next = profile.platforms.includes(platform)
      ? profile.platforms.filter((candidate) => candidate !== platform)
      : [...profile.platforms, platform];
    update("platforms", next);
  }

  const selectedAvatarId = profile.avatarPresenterId ?? "logo_head";
  const selectedAvatar = fictionalAvatarPresenterCatalog.find((avatar) => avatar.id === selectedAvatarId);
  const avatarPreviewUrl = fictionalAvatarPreviewUrls[selectedAvatarId];

  return (
    <form className="profile-form">
      <label>
        Product name
        <input value={profile.productName} onChange={(event) => update("productName", event.target.value)} />
      </label>
      <label>
        Target customer
        <textarea value={profile.targetCustomer} onChange={(event) => update("targetCustomer", event.target.value)} rows={2} />
      </label>
      <label>
        Product outcome
        <textarea
          value={profile.productDescription}
          onChange={(event) => update("productDescription", event.target.value)}
          rows={3}
        />
      </label>
      <label>
        Tone
        <select value={profile.preferredTone} onChange={(event) => update("preferredTone", event.target.value as ProductProfile["preferredTone"])}>
          {Object.entries(toneLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tone guidance
        <input value={profile.toneGuidance} onChange={(event) => update("toneGuidance", event.target.value)} />
      </label>
      <label>
        Walkthrough notes
        <textarea
          value={profile.walkthroughNotes}
          onChange={(event) => update("walkthroughNotes", event.target.value)}
          rows={3}
        />
      </label>
      <label>
        Creator template
        <select
          value={profile.defaultTemplateKey ?? "problem_demo_payoff"}
          onChange={(event) => update("defaultTemplateKey", event.target.value as CreatorTemplateKey)}
        >
          {creatorTemplatePack.map((template) => (
            <option key={template.key} value={template.key}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-row">
        <input
          checked={Boolean(profile.brandPresenterEnabled)}
          onChange={(event) => update("brandPresenterEnabled", event.target.checked)}
          type="checkbox"
        />
        Brand presenter
      </label>
      <label>
        Presenter avatar
        <select
          disabled={!profile.brandPresenterEnabled}
          value={profile.avatarPresenterId ?? "logo_head"}
          onChange={(event) => update("avatarPresenterId", event.target.value as ProductProfile["avatarPresenterId"])}
        >
          {fictionalAvatarPresenterCatalog.map((avatar) => (
            <option key={avatar.id} value={avatar.id}>
              {avatar.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="avatar-preview" aria-label="Selected fictional presenter">
        {avatarPreviewUrl ? <img src={avatarPreviewUrl} alt="" /> : <span>{initials(profile.productName || "G")}</span>}
        <div>
          <strong>{selectedAvatar?.displayName ?? "Brand logo host"}</strong>
          <small>AI-generated brand presenter</small>
        </div>
      </div>
      <label>
        Presenter side
        <select
          disabled={!profile.brandPresenterEnabled}
          value={profile.brandPresenterPosition ?? "lower_right"}
          onChange={(event) => update("brandPresenterPosition", event.target.value as ProductProfile["brandPresenterPosition"])}
        >
          {presenterPositions.map((position) => (
            <option key={position} value={position}>
              {position.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Presenter motion
        <select
          disabled={!profile.brandPresenterEnabled}
          value={profile.brandPresenterMotion ?? "caption_sync"}
          onChange={(event) => update("brandPresenterMotion", event.target.value as ProductProfile["brandPresenterMotion"])}
        >
          {presenterMotions.map((motion) => (
            <option key={motion} value={motion}>
              {motion.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-row">
        <input
          checked={Boolean(profile.soundDesignEnabled)}
          onChange={(event) => update("soundDesignEnabled", event.target.checked)}
          type="checkbox"
        />
        Sound design
      </label>
      <label>
        Music mood
        <select
          disabled={!profile.soundDesignEnabled}
          value={profile.musicMood ?? "none"}
          onChange={(event) => update("musicMood", event.target.value as MusicMood)}
        >
          {musicMoods.map((mood) => (
            <option key={mood} value={mood}>
              {mood.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="brand-kit-controls">
        <label>
          Primary color
          <input
            type="color"
            value={brandKit().primaryColor}
            onChange={(event) => updateBrandKit({ primaryColor: event.target.value })}
          />
        </label>
        <label>
          Accent color
          <input
            type="color"
            value={brandKit().accentColor}
            onChange={(event) => updateBrandKit({ accentColor: event.target.value })}
          />
        </label>
        <label>
          Background
          <input
            type="color"
            value={brandKit().backgroundColor}
            onChange={(event) => updateBrandKit({ backgroundColor: event.target.value })}
          />
        </label>
        <label>
          Captions
          <select
            value={brandKit().captionStyle}
            onChange={(event) => updateBrandKit({ captionStyle: event.target.value as CaptionStylePreset })}
          >
            {captionStyles.map((style) => (
              <option key={style} value={style}>
                {style.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          CTA style
          <select value={brandKit().ctaStyle} onChange={(event) => updateBrandKit({ ctaStyle: event.target.value as CtaStylePreset })}>
            {ctaStyles.map((style) => (
              <option key={style} value={style}>
                {style.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tagline
          <input value={brandKit().tagline ?? ""} onChange={(event) => updateBrandKit({ tagline: event.target.value })} />
        </label>
        <div className="logo-picker">
          {brandKit().logoUrl ? <img src={brandKit().logoUrl} alt="" /> : <span>{initials(profile.productName || "G")}</span>}
          <button className="secondary compact" onClick={() => void chooseLogo()} type="button">
            Choose logo
          </button>
        </div>
      </div>
      <div className="platform-picker" aria-label="Platforms">
        {platforms.map((platform) => (
          <button
            key={platform}
            className={profile.platforms.includes(platform) ? "chip selected" : "chip"}
            onClick={(event) => {
              event.preventDefault();
              togglePlatform(platform);
            }}
            type="button"
          >
            {platformLabels[platform]}
          </button>
        ))}
      </div>
    </form>
  );
}

function Stepper({ project }: { project: Project }): JSX.Element {
  const steps = [
    ["Context", Boolean(project.profile.productName)],
    ["Recording", Boolean(project.recording)],
    ["Moments", project.moments.length > 0],
    ["Concepts", project.concepts.length === 10],
    ["Scripts", project.scripts.length > 0],
    ["Renders", project.renders.some((render) => render.status === "completed")]
  ] as const;
  return (
    <ol className="stepper">
      {steps.map(([label, complete]) => (
        <li key={label} className={complete ? "complete" : ""}>
          <span>{complete ? "✓" : "•"}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function MomentGrid({
  moments,
  onChange
}: {
  moments: DetectedMoment[];
  onChange: (moments: DetectedMoment[]) => void;
}): JSX.Element {
  if (moments.length === 0) {
    return <div className="empty-inline">No moments yet. Analyze a validated recording first.</div>;
  }
  return (
    <div className="moment-grid">
      {moments.map((moment) => (
        <article className={`moment-card ${moment.enabled ? "" : "disabled"}`} key={moment.id}>
          {moment.thumbnailUrl ? <img src={moment.thumbnailUrl} alt="" /> : <div className="thumbnail-placeholder" />}
          <input
            value={moment.label}
            onChange={(event) =>
              onChange(moments.map((candidate) => (candidate.id === moment.id ? { ...candidate, label: event.target.value } : candidate)))
            }
          />
          <p>{formatMs(moment.startMs)}–{formatMs(moment.endMs)}</p>
          <small>
            {moment.visualRole ? `${moment.visualRole} · ` : ""}
            {typeof moment.proofScore === "number" ? `${Math.round(moment.proofScore * 100)}% proof` : "proof pending"}
          </small>
          {moment.interactionHint ? (
            <small>
              {moment.interactionHint.kind.replace(/_/g, " ")} · {Math.round(moment.interactionHint.confidence * 100)}%
            </small>
          ) : null}
          <small>{moment.evidence}</small>
          <div className="focus-control-grid">
            <label>
              Focus X
              <input
                max="1"
                min="0"
                onChange={(event) =>
                  onChange(
                    moments.map((candidate) =>
                      candidate.id === moment.id
                        ? { ...candidate, focus: { ...(candidate.focus ?? { x: 0.5, y: 0.5, scale: 1.16 }), x: Number(event.target.value) } }
                        : candidate
                    )
                  )
                }
                step="0.01"
                type="range"
                value={moment.focus?.x ?? 0.5}
              />
            </label>
            <label>
              Focus Y
              <input
                max="1"
                min="0"
                onChange={(event) =>
                  onChange(
                    moments.map((candidate) =>
                      candidate.id === moment.id
                        ? { ...candidate, focus: { ...(candidate.focus ?? { x: 0.5, y: 0.5, scale: 1.16 }), y: Number(event.target.value) } }
                        : candidate
                    )
                  )
                }
                step="0.01"
                type="range"
                value={moment.focus?.y ?? 0.5}
              />
            </label>
            <label>
              Zoom
              <input
                max="1.45"
                min="1"
                onChange={(event) =>
                  onChange(
                    moments.map((candidate) =>
                      candidate.id === moment.id
                        ? { ...candidate, focus: { ...(candidate.focus ?? { x: 0.5, y: 0.5, scale: 1.16 }), scale: Number(event.target.value) } }
                        : candidate
                    )
                  )
                }
                step="0.01"
                type="range"
                value={moment.focus?.scale ?? 1.16}
              />
            </label>
          </div>
          <button
            className="chip"
            onClick={() =>
              onChange(moments.map((candidate) => (candidate.id === moment.id ? { ...candidate, enabled: !candidate.enabled } : candidate)))
            }
            type="button"
          >
            {moment.enabled ? "Use moment" : "Hidden"}
          </button>
        </article>
      ))}
    </div>
  );
}

function ConceptGrid({
  concepts,
  moments,
  onChange
}: {
  concepts: ContentConcept[];
  moments: DetectedMoment[];
  onChange: (concepts: ContentConcept[], changedId: string) => void;
}): JSX.Element {
  if (concepts.length === 0) {
    return <div className="empty-inline">Generate concepts after reviewing moments.</div>;
  }
  return (
    <div className="concept-grid">
      {concepts.map((concept) => (
        <article className={`concept-card ${concept.selected ? "selected" : ""}`} key={concept.id}>
          <div className="card-topline">
            <span>{concept.formatFamily}</span>
            <span>{concept.templateKey?.replace(/_/g, " ") ?? "auto template"}</span>
            <label className="select-toggle">
              <input
                type="checkbox"
                checked={concept.selected}
                onChange={(event) =>
                  onChange(
                    concepts.map((candidate) =>
                      candidate.id === concept.id ? { ...candidate, selected: event.target.checked } : candidate
                    ),
                    concept.id
                  )
                }
              />
              Select
            </label>
          </div>
          <h3>{concept.title}</h3>
          <p>{concept.brief}</p>
          <small>{concept.hookDirection}</small>
          <div className="proof-list">
            {concept.proofMomentIds.map((momentId) => (
              <span key={momentId}>{moments.find((moment) => moment.id === momentId)?.label ?? "Moment"}</span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function ScriptEditor({
  scripts,
  setScripts,
  onRegenerate,
  onRenderScript,
  onRegenerateVoiceover,
  onGenerateAvatarPresenter,
  canGenerateAvatarPresenter,
  readyAvatarScriptIds
}: {
  scripts: ScriptDraft[];
  setScripts: (scripts: ScriptDraft[]) => void;
  onRegenerate: (scriptId: string) => void;
  onRenderScript: (scriptId: string, voiceoverMode: "regenerate" | "reuse") => void;
  onRegenerateVoiceover: (scriptId: string) => void;
  onGenerateAvatarPresenter: (scriptId: string) => void;
  canGenerateAvatarPresenter: boolean;
  readyAvatarScriptIds: Set<string>;
}): JSX.Element {
  if (scripts.length === 0) {
    return <div className="empty-inline">Generate scripts from selected concepts, then edit voiceover and CTA before render.</div>;
  }

  function updateScript(scriptId: string, patch: Partial<ScriptDraft>): void {
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        const next = { ...script, ...patch };
        if (patch.voiceoverText) {
          const currentDuration = script.captions.length ? Math.max(...script.captions.map((caption) => caption.endMs)) : 30_000;
          next.captions = splitCaptionSegments(patch.voiceoverText, Math.max(currentDuration, 30_000));
        }
        return next;
      })
    );
  }

  function updateVisualBeatFocus(
    scriptId: string,
    beatIndex: number,
    axis: keyof RenderFocusPoint,
    value: number
  ): void {
    const normalizedValue = axis === "scale" ? clamp(value, 1, 2.2) : clamp(value, 0, 1);
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) =>
            index === beatIndex
              ? {
                  ...beat,
                  focus: {
                    ...(beat.focus ?? { x: 0.5, y: 0.5, scale: 1.16 }),
                    [axis]: normalizedValue
                  }
                }
              : beat
          )
        };
      })
    );
  }

  function updateVisualBeatSource(scriptId: string, beatIndex: number, key: "sourceStartMs" | "sourceEndMs", valueSec: number): void {
    const nextValueMs = Math.round(clamp(valueSec, 0, 600) * 1000);
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) => {
            if (index !== beatIndex) {
              return beat;
            }
            const currentStartMs = beat.sourceStartMs ?? 0;
            const currentEndMs = beat.sourceEndMs ?? Math.max(currentStartMs + 1000, currentStartMs);
            if (key === "sourceStartMs") {
              return {
                ...beat,
                sourceStartMs: Math.min(nextValueMs, currentEndMs - 500),
                sourceEndMs: currentEndMs
              };
            }
            return {
              ...beat,
              sourceStartMs: currentStartMs,
              sourceEndMs: Math.max(nextValueMs, currentStartMs + 500)
            };
          })
        };
      })
    );
  }

  function updateVisualBeatCallout(scriptId: string, beatIndex: number, callout: string): void {
    const normalizedCallout = callout.replace(/\s+/g, " ").trimStart().slice(0, 72);
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) =>
            index === beatIndex
              ? {
                  ...beat,
                  callout: normalizedCallout
                }
              : beat
          )
        };
      })
    );
  }

  function updateVisualBeatTransition(scriptId: string, beatIndex: number, value: "auto" | "off" | "snap_cut" | "match_cut" | "wipe"): void {
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) =>
            index === beatIndex
              ? {
                  ...beat,
                  transitionIn: value === "auto"
                    ? undefined
                    : {
                        enabled: value !== "off",
                        kind: value === "off" ? beat.transitionIn?.kind : value
                      }
                }
              : beat
          )
        };
      })
    );
  }

  function updateVisualBeatCursor(scriptId: string, beatIndex: number, value: "auto" | "off" | "click_target" | "cursor_candidate"): void {
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) =>
            index === beatIndex
              ? {
                  ...beat,
                  cursorEmphasis: value === "auto"
                    ? undefined
                    : {
                        enabled: value !== "off",
                        kind: value === "off" ? beat.cursorEmphasis?.kind : value,
                        label: beat.cursorEmphasis?.label
                      }
                }
              : beat
          )
        };
      })
    );
  }

  function updateVisualBeatCursorLabel(scriptId: string, beatIndex: number, label: string): void {
    const normalizedLabel = label.replace(/\s+/g, " ").trimStart().slice(0, 64);
    setScripts(
      scripts.map((script) => {
        if (script.id !== scriptId) {
          return script;
        }
        return {
          ...script,
          visualBeats: script.visualBeats.map((beat, index) =>
            index === beatIndex
              ? {
                  ...beat,
                  cursorEmphasis: {
                    enabled: beat.cursorEmphasis?.enabled ?? true,
                    kind: beat.cursorEmphasis?.kind,
                    label: normalizedLabel
                  }
                }
              : beat
          )
        };
      })
    );
  }

  return (
    <div className="script-stack">
      {scripts.map((script, index) => {
        const hasBlockingWarnings = hasBlockingScriptWarnings(script.qualityWarnings);
        return (
          <article className="script-card" key={script.id}>
            <p className="eyebrow">Draft {index + 1}</p>
            <div className="action-row">
              <button className="secondary compact" onClick={() => onRegenerate(script.id)} type="button">
                Regenerate script
              </button>
              <button
                className="secondary compact"
                disabled={!script.approved || hasBlockingWarnings}
                onClick={() => onRegenerateVoiceover(script.id)}
                type="button"
              >
                Regenerate voice
              </button>
              <button
                className="secondary compact"
                disabled={!canGenerateAvatarPresenter || !script.approved || hasBlockingWarnings}
                onClick={() => onGenerateAvatarPresenter(script.id)}
                type="button"
              >
                {readyAvatarScriptIds.has(script.id) ? "Regenerate avatar clip" : "Generate avatar clip"}
              </button>
              <button
                className="secondary compact"
                disabled={!script.approved || hasBlockingWarnings}
                onClick={() => onRenderScript(script.id, "reuse")}
                type="button"
              >
                Re-render
              </button>
              <button
                className="secondary compact"
                disabled={!script.approved || hasBlockingWarnings}
                onClick={() => onRenderScript(script.id, "regenerate")}
                type="button"
              >
                New voice + render
              </button>
            </div>
            <label className="checkbox-row">
              <input
                checked={script.approved && !hasBlockingWarnings}
                disabled={hasBlockingWarnings}
                onChange={(event) => updateScript(script.id, { approved: event.target.checked })}
                type="checkbox"
              />
              {hasBlockingWarnings ? "Fix blocking warnings before render" : "Approved for render"}
            </label>
            <label>
              Template
              <select
                value={script.templateKey ?? "problem_demo_payoff"}
                onChange={(event) => updateScript(script.id, { templateKey: event.target.value as CreatorTemplateKey })}
              >
                {creatorTemplatePack.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hook
              <input value={script.hook} onChange={(event) => updateScript(script.id, { hook: event.target.value })} />
            </label>
            <label>
              Voiceover
              <textarea
                value={script.voiceoverText}
                onChange={(event) => updateScript(script.id, { voiceoverText: event.target.value })}
                rows={6}
              />
            </label>
            <label>
              CTA
              <input value={script.cta} onChange={(event) => updateScript(script.id, { cta: event.target.value })} />
            </label>
            <div className="caption-preview">
              {script.captions.slice(0, 4).map((caption) => (
                <span key={`${script.id}-${caption.startMs}`}>{caption.text}</span>
              ))}
            </div>
            <div className="render-plan-summary">
              <span>{script.editDecisionList?.zooms.length ?? script.visualBeats.length} punch-ins</span>
              <span>{script.editDecisionList?.transitions.length ?? Math.max(0, script.visualBeats.length - 1)} cuts</span>
              <span>{script.editDecisionList?.callouts.length ?? script.visualBeats.length} callouts</span>
              <span>{script.editDecisionList?.cursorCues.length ?? 0} cursor cues</span>
              <span>{script.editDecisionList?.presenter.enabled ? "presenter on" : "presenter off"}</span>
              <span>{readyAvatarScriptIds.has(script.id) ? "avatar clip ready" : "static presenter"}</span>
              <span>{script.approved ? "approved" : "needs approval"}</span>
            </div>
            {script.visualBeats.length > 0 ? (
              <div className="visual-beat-focus-list">
                {script.visualBeats.slice(0, 6).map((beat, beatIndex) => {
                  const focus = beat.focus ?? { x: 0.5, y: 0.5, scale: 1.16 };
                  return (
                    <div className="visual-beat-focus" key={`${script.id}-${beat.momentId}-${beat.startMs}`}>
                      <div>
                        <span>{beat.purpose ?? "beat"}</span>
                        <small>{beat.instruction}</small>
                      </div>
                      <div className="focus-control-grid">
                        <label className="wide-control">
                          Callout
                          <input
                            maxLength={72}
                            onChange={(event) => updateVisualBeatCallout(script.id, beatIndex, event.target.value)}
                            value={beat.callout ?? ""}
                          />
                        </label>
                        {beatIndex > 0 ? (
                          <label>
                            Cut
                            <select
                              onChange={(event) =>
                                updateVisualBeatTransition(
                                  script.id,
                                  beatIndex,
                                  event.target.value as "auto" | "off" | "snap_cut" | "match_cut" | "wipe"
                                )
                              }
                              value={
                                beat.transitionIn
                                  ? beat.transitionIn.enabled === false
                                    ? "off"
                                    : beat.transitionIn.kind ?? "auto"
                                  : "auto"
                              }
                            >
                              <option value="auto">Template</option>
                              <option value="snap_cut">Snap</option>
                              <option value="match_cut">Match</option>
                              <option value="wipe">Wipe</option>
                              <option value="off">Off</option>
                            </select>
                          </label>
                        ) : null}
                        <label>
                          Cursor
                          <select
                            onChange={(event) =>
                              updateVisualBeatCursor(script.id, beatIndex, event.target.value as "auto" | "off" | "click_target" | "cursor_candidate")
                            }
                            value={
                              beat.cursorEmphasis
                                ? beat.cursorEmphasis.enabled === false
                                  ? "off"
                                  : beat.cursorEmphasis.kind ?? "cursor_candidate"
                                : "auto"
                            }
                          >
                            <option value="auto">Detected</option>
                            <option value="click_target">Click</option>
                            <option value="cursor_candidate">Cursor</option>
                            <option value="off">Off</option>
                          </select>
                        </label>
                        <label className="wide-control">
                          Cursor label
                          <input
                            maxLength={64}
                            onChange={(event) => updateVisualBeatCursorLabel(script.id, beatIndex, event.target.value)}
                            value={beat.cursorEmphasis?.label ?? ""}
                          />
                        </label>
                        <label>
                          In
                          <input
                            min="0"
                            onChange={(event) => updateVisualBeatSource(script.id, beatIndex, "sourceStartMs", Number(event.target.value))}
                            step="0.1"
                            type="number"
                            value={((beat.sourceStartMs ?? 0) / 1000).toFixed(1)}
                          />
                        </label>
                        <label>
                          Out
                          <input
                            min="0"
                            onChange={(event) => updateVisualBeatSource(script.id, beatIndex, "sourceEndMs", Number(event.target.value))}
                            step="0.1"
                            type="number"
                            value={((beat.sourceEndMs ?? beat.endMs) / 1000).toFixed(1)}
                          />
                        </label>
                        <label>
                          X
                          <input
                            max="1"
                            min="0"
                            onChange={(event) => updateVisualBeatFocus(script.id, beatIndex, "x", Number(event.target.value))}
                            step="0.01"
                            type="range"
                            value={focus.x}
                          />
                        </label>
                        <label>
                          Y
                          <input
                            max="1"
                            min="0"
                            onChange={(event) => updateVisualBeatFocus(script.id, beatIndex, "y", Number(event.target.value))}
                            step="0.01"
                            type="range"
                            value={focus.y}
                          />
                        </label>
                        <label>
                          Zoom
                          <input
                            max="2.2"
                            min="1"
                            onChange={(event) => updateVisualBeatFocus(script.id, beatIndex, "scale", Number(event.target.value))}
                            step="0.01"
                            type="range"
                            value={focus.scale}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {script.qualityWarnings && script.qualityWarnings.length > 0 ? (
              <div className="quality-warning-list">
                {script.qualityWarnings.map((warning) => (
                  <small key={`${script.id}-${warning.code}`}>{warning.message}</small>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function RenderGallery({
  project,
  exporting,
  onExport
}: {
  project: Project;
  exporting: boolean;
  onExport: (renderId: string) => void;
}): JSX.Element {
  if (project.renders.length === 0) {
    return <div className="empty-inline">No renders yet. Render selected drafts to create local MP4 files.</div>;
  }
  return (
    <div className="render-grid">
      {project.renders.map((render) => (
        <article className="render-card" key={render.id}>
          <h3>{render.title}</h3>
          {render.status === "completed" && render.outputUrl ? (
            <video src={render.outputUrl} controls />
          ) : (
            <div className="render-error">{render.error ?? "Render failed."}</div>
          )}
          {render.validation ? (
            <p>
              {render.validation.width}×{render.validation.height} · {Math.round(render.validation.durationMs / 1000)}s ·{" "}
              {render.validation.videoCodec}/{render.validation.audioCodec}
            </p>
          ) : null}
          {render.storageKey ? <p className="storage-key">Private storage: {render.storageKey}</p> : null}
          <div className="action-row">
            <button className="secondary" disabled={render.status !== "completed" || exporting} onClick={() => onExport(render.id)} type="button">
              Export MP4
            </button>
            {render.outputPath ? (
              <button className="ghost" onClick={() => void window.gideon.revealPath(render.outputPath!)} type="button">
                Show file
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function initials(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "G";
  }
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatQueueKinds(counts: Partial<Record<JobKind, number>>): string {
  return Object.entries(counts)
    .filter(([, value]) => value && value > 0)
    .map(([kind, value]) => `${kind.replace(/_/g, " ")} ${value}`)
    .join(", ");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

createRoot(document.getElementById("root")!).render(<App />);
