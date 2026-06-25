import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import type {
  AppState,
  ContentConcept,
  DetectedMoment,
  Platform,
  PlatformInfo,
  ProductProfile,
  Project,
  ScriptDraft,
  UsageMetric
} from "../shared/types";
import { platformLabels, toneLabels } from "../shared/types";
import { createDefaultProfile, splitCaptionSegments } from "../shared/contentEngine";
import {
  createLocalUserWorkspace,
  entitlementLimit,
  formatQuantity,
  summarizeUsage,
  usageMetricLabels
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
  | "exporting"
  | "job"
  | null;

const platforms: Platform[] = ["tiktok", "instagram_reels", "youtube_shorts", "linkedin", "other"];

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

  async function loadInitialState(): Promise<void> {
    setBusy("loading");
    setError(null);
    try {
      const [projects, info] = await Promise.all([window.gideon.listProjects(), window.gideon.platformInfo()]);
      setState(projects);
      setPlatformInfo(info);
      const active = projects.projects.find((project) => project.id === projects.activeProjectId) ?? projects.projects[0] ?? null;
      setActiveProject(active);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setBusy(null);
    }
  }

  async function refreshState(preferredProjectId?: string): Promise<void> {
    try {
      const projects = await window.gideon.listProjects();
      setState(projects);
      const active =
        projects.projects.find((project) => project.id === preferredProjectId) ??
        projects.projects.find((project) => project.id === projects.activeProjectId) ??
        projects.projects[0] ??
        null;
      setActiveProject(active);
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
          <ProjectWorkspace project={activeProject} busy={busy} setBusy={setBusy} setError={setError} onProject={refreshProject} />
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
  busy,
  setBusy,
  setError,
  onProject
}: {
  project: Project;
  busy: BusyAction;
  setBusy: (busy: BusyAction) => void;
  setError: (error: string | null) => void;
  onProject: (project: Project) => void;
}): JSX.Element {
  const [profile, setProfile] = useState<ProductProfile>(project.profile);
  const [scripts, setScripts] = useState<ScriptDraft[]>(project.scripts);

  useEffect(() => {
    setProfile(project.profile);
    setScripts(project.scripts);
  }, [project]);

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

  const selectedConceptCount = project.concepts.filter((concept) => concept.selected).length;

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
        <ScriptEditor scripts={scripts} setScripts={setScripts} />
      </Panel>

      <Panel title="6. Render and export" eyebrow="Downloadable MP4">
        <div className="action-row">
          <button
            className="primary"
            disabled={project.scripts.length === 0 || busy === "rendering"}
            onClick={() => void runAction("rendering", () => window.gideon.renderSelected(project.id))}
            type="button"
          >
            {busy === "rendering" ? "Rendering MP4 drafts…" : "Render selected drafts"}
          </button>
          <p className="muted">Render jobs run through the local worker queue and output 1080×1920 H.264/AAC MP4 files.</p>
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

  function togglePlatform(platform: Platform): void {
    const next = profile.platforms.includes(platform)
      ? profile.platforms.filter((candidate) => candidate !== platform)
      : [...profile.platforms, platform];
    update("platforms", next);
  }

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
          <small>{moment.evidence}</small>
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
  setScripts
}: {
  scripts: ScriptDraft[];
  setScripts: (scripts: ScriptDraft[]) => void;
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
          next.captions = splitCaptionSegments(patch.voiceoverText, Math.max(...script.captions.map((caption) => caption.endMs), 30_000));
        }
        return next;
      })
    );
  }

  return (
    <div className="script-stack">
      {scripts.map((script, index) => (
        <article className="script-card" key={script.id}>
          <p className="eyebrow">Draft {index + 1}</p>
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
        </article>
      ))}
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

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

createRoot(document.getElementById("root")!).render(<App />);
