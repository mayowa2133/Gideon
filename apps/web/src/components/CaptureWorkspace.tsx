"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CaptureApi, CaptureApiError, type CaptureCapabilities, type CaptureEnvironmentDto, type CapturePersonaDto, type CaptureRunDto, type CoverageSnapshotDto, type DiscoveryRunDto, type FlowExecutionDto, type ProductFlowDto } from "@/lib/captureApi";
import { mergeFlowDrafts } from "@/lib/flowDrafts";

type View = "setup" | "discover" | "review" | "capture" | "results";
const api = new CaptureApi();
const terminalDiscovery = new Set(["ready_for_review", "failed", "canceled"]);
const terminalCapture = new Set(["completed", "needs_review", "failed", "canceled"]);

export function CaptureWorkspace({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>("setup");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [environments, setEnvironments] = useState<CaptureEnvironmentDto[]>([]);
  const [personas, setPersonas] = useState<CapturePersonaDto[]>([]);
  const [flows, setFlows] = useState<ProductFlowDto[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryRunDto | null>(null);
  const [captureRun, setCaptureRun] = useState<CaptureRunDto | null>(null);
  const [executions, setExecutions] = useState<FlowExecutionDto[]>([]);
  const [coverage, setCoverage] = useState<CoverageSnapshotDto | null>(null);
  const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);
  const [assemblyIds, setAssemblyIds] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const [nextEnvironments, nextPersonas, nextFlows] = await Promise.all([api.listEnvironments(projectId), api.listPersonas(projectId), api.listFlows(projectId)]);
    setEnvironments(nextEnvironments); setPersonas(nextPersonas); setFlows(nextFlows);
    setEnvironmentId((current) => current || nextEnvironments.find((item) => item.status === "ready")?.id || nextEnvironments[0]?.id || "");
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await api.session();
        if (!active) return;
        setAuthenticated(session.authenticated);
        if (!session.authenticated) return;
        const nextCapabilities = await api.capabilities();
        if (!active) return;
        setCapabilities(nextCapabilities);
        if (nextCapabilities.available) {
          await refreshCatalog();
          const savedDiscoveryId = window.localStorage.getItem(runStorageKey(projectId, "discovery"));
          const savedCaptureId = window.localStorage.getItem(runStorageKey(projectId, "capture"));
          const [savedDiscovery, savedCapture] = await Promise.all([
            savedDiscoveryId ? api.getDiscovery(projectId, savedDiscoveryId).catch(() => null) : null,
            savedCaptureId ? api.getCapture(projectId, savedCaptureId).catch(() => null) : null
          ]);
          if (!active) return;
          if (savedDiscovery) { setDiscovery(savedDiscovery); if (savedDiscovery.status === "ready_for_review") setView("review"); }
          if (savedCapture) { setCaptureRun(savedCapture.captureRun); setExecutions(savedCapture.executions); setView(terminalCapture.has(savedCapture.captureRun.status) ? "results" : "capture"); }
        }
      } catch (reason) { if (active) setError(message(reason)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [refreshCatalog]);

  useEffect(() => {
    if (!discovery || terminalDiscovery.has(discovery.status)) return;
    const timer = window.setInterval(() => void api.getDiscovery(projectId, discovery.id).then((run) => {
      setDiscovery(run);
      if (run.status === "ready_for_review") void refreshCatalog().then(() => setView("review"));
    }).catch((reason) => setError(message(reason))), 2000);
    return () => window.clearInterval(timer);
  }, [discovery, projectId, refreshCatalog]);

  useEffect(() => {
    if (!captureRun || terminalCapture.has(captureRun.status)) return;
    const timer = window.setInterval(() => void api.getCapture(projectId, captureRun.id).then((result) => {
      setCaptureRun(result.captureRun); setExecutions(result.executions);
      if (result.captureRun.status === "completed" || result.captureRun.status === "needs_review") setView("results");
    }).catch((reason) => setError(message(reason))), 2000);
    return () => window.clearInterval(timer);
  }, [captureRun, projectId]);

  useEffect(() => {
    const verified = executions.filter((item) => item.status === "verified").map((item) => item.id);
    setAssemblyIds((current) => current.length ? current.filter((id) => verified.includes(id)) : verified);
    if (captureRun?.status === "completed") void api.latestCoverage(projectId).then(setCoverage).catch(() => undefined);
  }, [captureRun?.status, executions, projectId]);

  const environment = environments.find((item) => item.id === environmentId) ?? null;
  const environmentPersonas = personas.filter((item) => item.environmentId === environmentId && item.status === "active");
  const currentFlows = flows.filter((flow) => !environment?.currentVersionId || flow.environmentVersionId === environment.currentVersionId);
  const approvedFlows = currentFlows.filter((flow) => flow.approval.status === "approved" && flow.approval.approvedRevision === flow.revision);

  async function act(label: string, operation: () => Promise<void>) {
    setBusy(label); setError(null); setNotice(null);
    try { await operation(); } catch (reason) { setError(message(reason)); } finally { setBusy(null); }
  }

  if (loading) return <CenteredState title="Checking capture readiness…" detail="Verifying your session and deployment dependencies." />;
  if (!authenticated) return <CenteredState title="Sign in to Gideon" detail="This capture workspace requires an active hosted Gideon session." tone="warning" />;
  if (!capabilities?.available) return <Unavailable capabilities={capabilities} />;

  return (
    <main className="capture-shell">
      <header className="topbar">
        <div className="brand-row"><span className="brand-mark small" aria-hidden="true">G</span><div><p className="eyebrow">Gideon capture</p><strong>Project {shortId(projectId)}</strong></div></div>
        <div className="privacy-pill"><span /> Safe demo environments only</div>
      </header>
      <div className="capture-layout">
        <aside className="step-rail" aria-label="Capture workflow">
          <p className="rail-title">Workflow</p>
          {(["setup", "discover", "review", "capture", "results"] as View[]).map((item, index) => (
            <button key={item} className={view === item ? "rail-step active" : "rail-step"} onClick={() => setView(item)} type="button">
              <span>{index + 1}</span><div><strong>{labels[item]}</strong><small>{descriptions[item]}</small></div>
            </button>
          ))}
          <div className="rail-note"><strong>Human approval stays required.</strong><p>Discovery can propose. Only you can approve a flow or activate an assembly.</p></div>
        </aside>
        <section className="content-column">
          {error ? <div className="banner error" role="alert"><strong>Couldn’t complete that action.</strong><span>{error}</span></div> : null}
          {notice ? <div className="banner success" role="status">{notice}</div> : null}
          {view === "setup" ? <SetupPanel projectId={projectId} environments={environments} personas={personas} environmentId={environmentId} setEnvironmentId={setEnvironmentId} busy={busy} act={act} refresh={refreshCatalog} setNotice={setNotice} /> : null}
          {view === "discover" ? <DiscoveryPanel environment={environment} personas={environmentPersonas} discovery={discovery} busy={busy} act={act} onStart={(run) => { setDiscovery(run); window.localStorage.setItem(runStorageKey(projectId, "discovery"), run.id); }} onCancel={(run) => setDiscovery(run)} projectId={projectId} /> : null}
          {view === "review" ? <ReviewPanel flows={currentFlows} busy={busy} act={act} projectId={projectId} refresh={refreshCatalog} /> : null}
          {view === "capture" ? <CapturePanel environment={environment} approvedFlows={approvedFlows} selected={selectedFlowIds} setSelected={setSelectedFlowIds} run={captureRun} busy={busy} act={act} projectId={projectId} onRun={(run) => { setCaptureRun(run); setExecutions([]); window.localStorage.setItem(runStorageKey(projectId, "capture"), run.id); }} /> : null}
          {view === "results" ? <ResultsPanel projectId={projectId} run={captureRun} executions={executions} flows={flows} coverage={coverage} previews={previews} setPreviews={setPreviews} assemblyIds={assemblyIds} setAssemblyIds={setAssemblyIds} busy={busy} act={act} setNotice={setNotice} onRetry={(run) => { setCaptureRun(run); setExecutions([]); setView("capture"); window.localStorage.setItem(runStorageKey(projectId, "capture"), run.id); }} /> : null}
        </section>
      </div>
    </main>
  );
}

function SetupPanel(props: { projectId: string; environments: CaptureEnvironmentDto[]; personas: CapturePersonaDto[]; environmentId: string; setEnvironmentId(value: string): void; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; refresh(): Promise<void>; setNotice(value: string): void }) {
  const [environmentForm, setEnvironmentForm] = useState({ name: "Product demo", type: "staging" as CaptureEnvironmentDto["type"], baseUrl: "", allowedDomains: "", resetAdapter: "fixture_api" });
  const [personaForm, setPersonaForm] = useState({ key: "admin", displayName: "Demo admin", roleDescription: "Administrator using synthetic demo data." });
  const [credential, setCredential] = useState({ username: "", password: "", hours: 4 });
  const selected = props.environments.find((item) => item.id === props.environmentId);
  const selectedPersonas = props.personas.filter((item) => item.environmentId === props.environmentId);
  return <PanelHeading eyebrow="Connect safely" title="Prepare a resettable product environment" detail="Gideon validates domains and network destinations before discovery. Use synthetic data and a disposable account." aside={<StatusBadge status={selected?.status ?? "not_connected"} />}>
    <div className="two-column">
      <form className="card form-card" onSubmit={(event) => { event.preventDefault(); void props.act("create-environment", async () => { const environment = await api.createEnvironment(props.projectId, { ...environmentForm, allowedDomains: splitList(environmentForm.allowedDomains) }); props.setEnvironmentId(environment.id); await props.refresh(); props.setNotice("Environment saved. Validate it before adding personas."); }); }}>
        <div className="card-title"><span className="icon-box">01</span><div><h3>Environment</h3><p>Staging, demo, or a managed local preview.</p></div></div>
        <label>Name<input value={environmentForm.name} onChange={(event) => setEnvironmentForm({ ...environmentForm, name: event.target.value })} required /></label>
        <label>Environment type<select value={environmentForm.type} onChange={(event) => setEnvironmentForm({ ...environmentForm, type: event.target.value as CaptureEnvironmentDto["type"] })}><option value="staging">Staging</option><option value="demo">Demo</option><option value="production_sandbox">Production-like sandbox</option><option value="local_preview">Managed local preview</option></select></label>
        <label>Base URL<input type="url" placeholder="https://demo.example.com" value={environmentForm.baseUrl} onChange={(event) => setEnvironmentForm({ ...environmentForm, baseUrl: event.target.value })} required /></label>
        <label>Allowed domains<textarea rows={2} placeholder="demo.example.com, api.example.com" value={environmentForm.allowedDomains} onChange={(event) => setEnvironmentForm({ ...environmentForm, allowedDomains: event.target.value })} required /></label>
        <label>Reset strategy<select value={environmentForm.resetAdapter} onChange={(event) => setEnvironmentForm({ ...environmentForm, resetAdapter: event.target.value })}><option value="fixture_api">Fixture API</option><option value="http_endpoint">Reset endpoint</option><option value="disposable_account">Disposable account</option><option value="manual">Manual reset</option><option value="none">No mutation</option></select></label>
        <button className="button secondary" disabled={Boolean(props.busy)} type="submit">Save environment</button>
        {props.environments.length ? <label>Current environment<select value={props.environmentId} onChange={(event) => props.setEnvironmentId(event.target.value)}>{props.environments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label> : null}
        {selected && selected.status !== "ready" ? <button className="button primary" disabled={Boolean(props.busy)} type="button" onClick={() => void props.act("validate-environment", async () => { await api.validateEnvironment(props.projectId, selected.id); props.setNotice("Validation queued. Refreshing readiness…"); await pollEnvironment(props.projectId, selected.id, props.refresh); })}>{props.busy === "validate-environment" ? "Queueing…" : "Validate environment"}</button> : null}
      </form>
      <div className="stack">
        <form className="card form-card" onSubmit={(event) => { event.preventDefault(); if (!selected) return; void props.act("create-persona", async () => { await api.createPersona(props.projectId, { environmentId: selected.id, ...personaForm }); await props.refresh(); props.setNotice("Persona added. Add a disposable login only if the product requires one."); }); }}>
          <div className="card-title"><span className="icon-box">02</span><div><h3>Personas</h3><p>Roles Gideon should represent.</p></div></div>
          <label>Persona key<input value={personaForm.key} onChange={(event) => setPersonaForm({ ...personaForm, key: event.target.value })} required /></label>
          <label>Display name<input value={personaForm.displayName} onChange={(event) => setPersonaForm({ ...personaForm, displayName: event.target.value })} required /></label>
          <label>Role description<textarea rows={2} value={personaForm.roleDescription} onChange={(event) => setPersonaForm({ ...personaForm, roleDescription: event.target.value })} required /></label>
          <button className="button secondary" disabled={!selected || selected.status !== "ready" || Boolean(props.busy)} type="submit">Add persona</button>
          <div className="tag-row">{selectedPersonas.map((persona) => <span className="tag" key={persona.id}>{persona.displayName}{persona.credentialGrantId ? " · login ready" : ""}</span>)}</div>
        </form>
        <form className="card form-card sensitive" onSubmit={(event) => { event.preventDefault(); const persona = selectedPersonas[0]; if (!selected || !persona) return; void props.act("create-credential", async () => { const grant = await api.createCredential(props.projectId, { environmentId: selected.id, personaId: persona.id, kind: "username_password", secret: { username: credential.username, password: credential.password }, expiresAt: new Date(Date.now() + credential.hours * 3_600_000).toISOString() }); await api.updatePersona(props.projectId, persona, { credentialGrantId: grant.id }); setCredential({ ...credential, password: "" }); await props.refresh(); props.setNotice("Disposable login stored in the configured vault. Gideon never returns it to the browser."); }); }}>
          <div className="card-title"><span className="icon-box lock">◆</span><div><h3>Disposable login</h3><p>Sent once to the configured vault.</p></div></div>
          <label>Username<input autoComplete="off" value={credential.username} onChange={(event) => setCredential({ ...credential, username: event.target.value })} /></label>
          <label>Password<input type="password" autoComplete="new-password" value={credential.password} onChange={(event) => setCredential({ ...credential, password: event.target.value })} /></label>
          <label>Expires in<select value={credential.hours} onChange={(event) => setCredential({ ...credential, hours: Number(event.target.value) })}><option value={1}>1 hour</option><option value={4}>4 hours</option><option value={12}>12 hours</option><option value={24}>24 hours</option></select></label>
          <button className="button ghost" disabled={!selectedPersonas.length || !credential.username || !credential.password || Boolean(props.busy)} type="submit">Store disposable login</button>
        </form>
      </div>
    </div>
  </PanelHeading>;
}

function DiscoveryPanel(props: { environment: CaptureEnvironmentDto | null; personas: CapturePersonaDto[]; discovery: DiscoveryRunDto | null; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; onStart(run: DiscoveryRunDto): void; onCancel(run: DiscoveryRunDto): void; projectId: string }) {
  const [goals, setGoals] = useState("Show the primary product outcome\nShow the most convincing proof state");
  const running = props.discovery && !terminalDiscovery.has(props.discovery.status);
  return <PanelHeading eyebrow="Discover" title="Tell Gideon what matters" detail="Gideon inventories visible navigation and proposes bounded workflows. It will not submit forms during deterministic discovery." aside={<StatusBadge status={props.discovery?.status ?? "not_started"} />}>
    <div className="card wide-card">
      <label>Product outcomes, one per line<textarea rows={6} value={goals} onChange={(event) => setGoals(event.target.value)} placeholder="Create a campaign&#10;Review an analytics report" /></label>
      <div className="proof-grid"><Proof title="Rendered UI" detail="Visible same-origin routes and accessible controls" /><Proof title="Declared goals" detail="Your priorities guide ranking, not authorization" /><Proof title="Existing tests" detail="Optional imported scenarios remain drafts" /></div>
      <div className="action-row">
        <button className="button primary" disabled={!props.environment || props.environment.status !== "ready" || !props.personas.length || Boolean(props.busy) || Boolean(running)} onClick={() => void props.act("start-discovery", async () => {
          const lines = splitLines(goals);
          const result = await api.startDiscovery(props.projectId, {
            environmentId: props.environment!.id,
            goals: lines.map((text, index) => ({ id: `goal-${index + 1}`, text, priority: Math.max(20, 100 - index * 10) }))
          });
          props.onStart(result.discoveryRun);
        })} type="button">{running ? "Discovery running…" : "Discover workflows"}</button>
        {running ? <button className="button ghost" onClick={() => void props.act("cancel-discovery", async () => props.onCancel(await api.cancelDiscovery(props.projectId, props.discovery!.id)))} type="button">Cancel</button> : null}
      </div>
      {!props.environment ? <InlineWarning text="Connect an environment first." /> : props.environment.status !== "ready" ? <InlineWarning text="Validate the selected environment before discovery." /> : !props.personas.length ? <InlineWarning text="Add at least one active persona." /> : null}
      {props.discovery ? <Progress status={props.discovery.status} stages={["queued", "inventory", "exploring", "synthesizing", "validating", "ready_for_review"]} /> : null}
    </div>
  </PanelHeading>;
}

function ReviewPanel(props: { flows: ProductFlowDto[]; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; projectId: string; refresh(): Promise<void> }) {
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const mergeFlows = props.flows.filter((flow) => mergeIds.includes(flow.id));
  const canMerge = mergeFlows.length >= 2 && mergeFlows.every((flow) => flow.personaId === mergeFlows[0]?.personaId && flow.environmentVersionId === mergeFlows[0]?.environmentVersionId);
  return <PanelHeading eyebrow="Review" title="Approve the workflows worth recording" detail="Check the starting state, steps, expected result, and risk class. Approval is bound to this exact revision." aside={<span className="count-pill">{props.flows.length} proposals</span>}>
    {mergeIds.length ? <div className="merge-bar"><span>{mergeIds.length} selected</span><button className="button secondary compact" disabled={!canMerge || Boolean(props.busy)} onClick={() => void props.act("merge-flows", async () => { await api.createFlow(props.projectId, mergeFlowDrafts(mergeFlows)); setMergeIds([]); await props.refresh(); })} type="button">Merge as new draft</button><button className="button ghost compact" onClick={() => setMergeIds([])} type="button">Clear</button>{!canMerge && mergeIds.length >= 2 ? <small>Merge candidates must use the same environment version and persona.</small> : null}</div> : null}
    <div className="flow-list">{props.flows.length ? props.flows.map((flow) => <FlowReviewCard key={`${flow.id}:${flow.revision}`} flow={flow} mergeSelected={mergeIds.includes(flow.id)} onMergeSelect={() => setMergeIds(toggle(mergeIds, flow.id))} {...props} />) : <Empty title="No proposed workflows yet" detail="Run discovery or add a declarative flow before review." />}</div>
  </PanelHeading>;
}

function FlowReviewCard(props: { flow: ProductFlowDto; mergeSelected: boolean; onMergeSelect(): void; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; projectId: string; refresh(): Promise<void> }) {
  const { flow } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: flow.title, goal: flow.goal, entryPath: flow.startingState.entryPath });
  return <article className="card flow-card">
    <div className="flow-head"><div><p className="eyebrow">Revision {flow.revision}</p><h3>{flow.title}</h3><p>{flow.goal}</p></div><StatusBadge status={flow.approval.status} /></div>
    <div className="step-list"><div><span>Start</span><p>{flow.startingState.entryPath}</p></div>{flow.steps.map((step, index) => <div key={step.id}><span>{index + 1}</span><p>{step.intent}</p><em>{step.riskClass.replace(/_/g, " ")}</em></div>)}<div><span>✓</span><p>{flow.finalAssertions.length} final assertion{flow.finalAssertions.length === 1 ? "" : "s"}</p></div></div>
    <div className="source-line">Evidence: {flow.sourceEvidenceIds.slice(0, 4).join(" · ")}</div>
    <label className="merge-select"><input checked={props.mergeSelected} onChange={props.onMergeSelect} type="checkbox" /> Select for merge</label>
    {editing ? <form className="edit-flow" onSubmit={(event) => { event.preventDefault(); void props.act(`revise-${flow.id}`, async () => { await api.reviseFlow(props.projectId, { ...flow, revision: flow.revision + 1, title: draft.title.trim(), goal: draft.goal.trim(), startingState: { ...flow.startingState, entryPath: draft.entryPath.trim() }, approval: { status: "draft" } }); setEditing(false); await props.refresh(); }); }}>
      <label>Flow title<input maxLength={160} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Goal<textarea maxLength={600} required rows={3} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></label>
      <label>Starting path<input maxLength={500} pattern="/.*" required value={draft.entryPath} onChange={(event) => setDraft({ ...draft, entryPath: event.target.value })} /></label>
      <div className="action-row"><button className="button primary compact" disabled={Boolean(props.busy)} type="submit">Save as new draft revision</button><button className="button ghost compact" onClick={() => setEditing(false)} type="button">Cancel edit</button></div>
    </form> : <div className="action-row"><button className="button primary compact" disabled={Boolean(props.busy) || flow.approval.status === "approved"} onClick={() => void props.act(`approve-${flow.id}`, async () => { await api.setFlowApproval(props.projectId, flow.id, flow.revision, "approve"); await props.refresh(); })} type="button">Approve revision {flow.revision}</button><button className="button secondary compact" disabled={Boolean(props.busy)} onClick={() => setEditing(true)} type="button">Edit proposal</button><button className="button ghost compact" disabled={Boolean(props.busy)} onClick={() => void props.act(`reject-${flow.id}`, async () => { await api.setFlowApproval(props.projectId, flow.id, flow.revision, "reject"); await props.refresh(); })} type="button">Reject revision {flow.revision}</button></div>}
  </article>;
}

function CapturePanel(props: { environment: CaptureEnvironmentDto | null; approvedFlows: ProductFlowDto[]; selected: string[]; setSelected(ids: string[]): void; run: CaptureRunDto | null; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; projectId: string; onRun(run: CaptureRunDto): void }) {
  const running = props.run && !terminalCapture.has(props.run.status);
  return <PanelHeading eyebrow="Capture" title="Record approved flows in a clean browser" detail="Every flow resets, dry-runs, records, normalizes, and verifies before it can become a usable clip." aside={<StatusBadge status={props.run?.status ?? "not_started"} />}>
    <div className="card wide-card"><div className="selection-list">{props.approvedFlows.map((flow) => <label className="selection-row" key={flow.id}><input type="checkbox" checked={props.selected.includes(flow.id)} onChange={() => props.setSelected(toggle(props.selected, flow.id))} /><div><strong>{flow.title}</strong><small>{flow.steps.length} steps · revision {flow.revision}</small></div></label>)}</div>{!props.approvedFlows.length ? <InlineWarning text="Approve at least one current flow before capture." /> : null}<div className="action-row"><button className="button primary" disabled={!props.environment || !props.selected.length || Boolean(props.busy) || Boolean(running)} onClick={() => void props.act("start-capture", async () => { const result = await api.startCapture(props.projectId, { environmentId: props.environment!.id, flowIds: props.selected }); props.onRun(result.captureRun); })} type="button">{running ? "Capture in progress…" : `Capture ${props.selected.length || "selected"} flow${props.selected.length === 1 ? "" : "s"}`}</button>{running ? <button className="button ghost" onClick={() => void props.act("cancel-capture", async () => props.onRun(await api.cancelCapture(props.projectId, props.run!.id)))} type="button">Cancel safely</button> : null}</div>{props.run ? <><Progress status={props.run.status} stages={["queued", "provisioning", "resetting", "authenticating", "dry_running", "recording", "normalizing", "verifying", "completed"]} /><p className="estimate">Initial estimate: about {Math.max(1, Math.ceil(props.run.estimatedBrowserSeconds / 60))} browser minute(s).</p></> : null}</div>
  </PanelHeading>;
}

function ResultsPanel(props: { projectId: string; run: CaptureRunDto | null; executions: FlowExecutionDto[]; flows: ProductFlowDto[]; coverage: CoverageSnapshotDto | null; previews: Record<string, { url: string; expiresAt: string }>; setPreviews(value: Record<string, { url: string; expiresAt: string }>): void; assemblyIds: string[]; setAssemblyIds(ids: string[]): void; busy: string | null; act(label: string, operation: () => Promise<void>): Promise<void>; setNotice(value: string): void; onRetry(run: CaptureRunDto): void }) {
  const [assemblyJob, setAssemblyJob] = useState<import("@/lib/captureApi").JobDto | null>(null);
  const verified = props.executions.filter((item) => item.status === "verified");
  const flowName = (id: string) => props.flows.find((flow) => flow.id === id)?.title ?? id;
  useEffect(() => {
    if (!assemblyJob || !["queued", "running"].includes(assemblyJob.status)) return;
    const timer = window.setInterval(() => void api.getJob(assemblyJob.id).then((job) => { setAssemblyJob(job); if (job.status === "succeeded") props.setNotice("Assembly activated as the project source recording."); }).catch(() => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [assemblyJob, props.setNotice]);
  return <PanelHeading eyebrow="Results" title="Review clips, coverage, and the final source" detail="Preview verified clips, choose their order, and explicitly activate one assembly for the existing analysis pipeline." aside={<span className="count-pill">{verified.length}/{props.executions.length} verified</span>}>
    {!props.run ? <Empty title="No capture results yet" detail="Complete a capture run to review its clips." /> : <><div className="result-grid">{props.executions.map((execution) => { const repairReview = Boolean(execution.blockerCode && /(?:repair|locator|material_application_change)/.test(execution.blockerCode)); return <article className="card result-card" key={execution.id}><div className="flow-head"><div><p className="eyebrow">Attempt {execution.attempt}</p><h3>{flowName(execution.flowId)}</h3></div><StatusBadge status={execution.status} /></div>{execution.quality ? <QualitySummary quality={execution.quality} /> : null}{repairReview ? <InlineWarning text={`Repair review required: ${(execution.blockerCode ?? "flow_changed").replace(/_/g, " ")}. Review the latest draft before approving another revision.`} /> : null}{props.previews[execution.id] ? <><video controls preload="metadata" src={props.previews[execution.id]!.url} /><small className="framing-note">Framing preview: full source frame, fit contained, no crop. Vertical reframing happens only in the approved video edit.</small></> : <div className="preview-placeholder"><span>▶</span><small>{execution.status === "verified" ? "Private preview available" : execution.blockerCode?.replace(/_/g, " ") ?? "No verified clip"}</small></div>}<div className="action-row">{execution.status === "verified" ? <button className="button secondary compact" onClick={() => void props.act(`preview-${execution.id}`, async () => { const preview = await api.createPreview(props.projectId, execution.id); props.setPreviews({ ...props.previews, [execution.id]: preview }); })} type="button">{props.previews[execution.id] ? "Refresh preview" : "Load framing preview"}</button> : <button className="button ghost compact" disabled={Boolean(props.busy)} onClick={() => void props.act(`retry-${execution.id}`, async () => { const result = await api.retryExecution(props.projectId, execution.id); props.onRetry(result.captureRun); props.setNotice(`Retry queued as run ${shortId(result.captureRun.id)}. Tracking the new attempt now.`); })} type="button">{props.busy === `retry-${execution.id}` ? "Queuing retry…" : "Retry flow"}</button>}</div></article>; })}</div><div className="two-column results-bottom"><section className="card"><div className="card-title"><span className="icon-box">↕</span><div><h3>Assembly order</h3><p>Only selected verified clips become the source recording.</p></div></div><div className="assembly-list">{props.assemblyIds.map((id, index) => { const execution = props.executions.find((item) => item.id === id)!; return <div className="assembly-row" key={id}><span>{index + 1}</span><strong>{flowName(execution.flowId)}</strong><div><button aria-label="Move clip up" disabled={index === 0} onClick={() => props.setAssemblyIds(move(props.assemblyIds, index, index - 1))}>↑</button><button aria-label="Move clip down" disabled={index === props.assemblyIds.length - 1} onClick={() => props.setAssemblyIds(move(props.assemblyIds, index, index + 1))}>↓</button><button aria-label="Exclude clip" onClick={() => props.setAssemblyIds(props.assemblyIds.filter((value) => value !== id))}>×</button></div></div>; })}</div>{assemblyJob ? <div className="assembly-status"><span>Assembly</span><StatusBadge status={assemblyJob.status} /><small>{assemblyJob.userMessage}</small></div> : null}<button className="button primary full" disabled={!props.run || !props.assemblyIds.length || Boolean(props.busy) || Boolean(assemblyJob && ["queued", "running"].includes(assemblyJob.status))} onClick={() => void props.act("assemble", async () => { const result = await api.createAssembly(props.projectId, props.run!.id, props.assemblyIds); setAssemblyJob(result.job); props.setNotice("Assembly queued. Gideon will activate it only after deterministic media processing succeeds."); })} type="button">Activate selected assembly</button></section><CoverageCard coverage={props.coverage} /></div></>}
  </PanelHeading>;
}

function QualitySummary({ quality }: { quality: NonNullable<FlowExecutionDto["quality"]> }) {
  const findings = quality.checks.filter((check) => check.status !== "pass");
  return <div className={`quality-summary ${quality.status}`} role={quality.status === "ready" ? undefined : "status"}><div><strong>Video quality</strong><StatusBadge status={quality.status} /></div><small>{findings.length ? findings.map((finding) => finding.code.replace(/_/g, " ")).join(" · ") : "All automated checks passed"}</small></div>;
}

function CoverageCard({ coverage }: { coverage: CoverageSnapshotDto | null }) {
  if (!coverage) return <section className="card"><div className="card-title"><span className="icon-box">◎</span><div><h3>Bounded coverage</h3><p>Percentages describe a versioned inventory, never all possible product flows.</p></div></div><p className="muted">Coverage appears after a completed capture run.</p></section>;
  const freshness = coverage.freshness?.status ?? "unknown";
  const freshnessDetail = freshness === "stale"
    ? `Changed: ${coverage.freshness?.reasons.join(", ") || "revision basis"}`
    : coverage.inventory ? `${coverage.inventory.version} · revision ${coverage.inventory.revision}` : "No versioned revision basis is available";
  return <section className="card">
    <div className="card-title"><span className="icon-box">◎</span><div><h3>Bounded coverage</h3><p>Percentages describe a versioned inventory, never all possible product flows.</p></div></div>
    <div className={`coverage-freshness ${freshness}`} role={freshness === "current" ? undefined : "status"}>
      <strong>{freshness === "current" ? "Inventory current" : freshness === "stale" ? "Coverage is stale" : "Freshness unknown"}</strong>
      <small>{freshnessDetail}</small>
    </div>
    <div className="coverage-list">{coverage.dimensions.map((dimension) => {
      const denominator = dimension.denominator;
      const percent = freshness === "current" && typeof denominator === "number" && denominator > 0 ? Math.round(dimension.coveredIds.length / denominator * 100) : null;
      const label = freshness === "stale" ? "Stale" : percent === null ? "Unknown" : `${percent}%`;
      const sources = dimension.denominatorSources?.length ? dimension.denominatorSources.join(" · ") : dimension.denominatorSource?.replace(/_/g, " ") ?? "No trustworthy denominator";
      return <div key={dimension.key}>
        <div><strong>{dimension.key.replace(/_/g, " ")}</strong><span>{label}</span></div>
        <div className="meter"><i style={{ width: `${percent ?? 0}%` }} /></div>
        <small>{dimension.coveredIds.length} covered · {typeof denominator === "number" ? denominator : "unknown"} known · {sources}{dimension.inventoryRevision ? ` · inventory r${dimension.inventoryRevision}` : ""}</small>
        {Boolean(dimension.excluded.length || dimension.blocked.length) ? <small>{dimension.excluded.length} excluded · {dimension.blocked.length} blocked</small> : null}
      </div>;
    })}</div>
  </section>;
}

function PanelHeading({ eyebrow, title, detail, aside, children }: { eyebrow: string; title: string; detail: string; aside?: React.ReactNode; children: React.ReactNode }) { return <><div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{detail}</p></div>{aside}</div>{children}</>; }
function StatusBadge({ status }: { status: string }) { const tone = /(?:ready|approved|verified|completed|succeeded)/.test(status) ? "good" : /(?:failed|blocked|rejected|revoked)/.test(status) ? "bad" : "neutral"; return <span className={`status-badge ${tone}`}>{status.replace(/_/g, " ")}</span>; }
function Progress({ status, stages }: { status: string; stages: string[] }) { const current = stages.indexOf(status); return <div className="progress-track" aria-label={`Current stage: ${status}`}>{stages.map((stage, index) => <div className={index < current ? "done" : index === current ? "current" : ""} key={stage}><i /><small>{stage.replace(/_/g, " ")}</small></div>)}</div>; }
function Proof({ title, detail }: { title: string; detail: string }) { return <div className="proof"><span>✓</span><div><strong>{title}</strong><small>{detail}</small></div></div>; }
function InlineWarning({ text }: { text: string }) { return <p className="inline-warning">{text}</p>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty"><span>◇</span><h3>{title}</h3><p>{detail}</p></div>; }
function CenteredState({ title, detail, tone = "default" }: { title: string; detail: string; tone?: "default" | "warning" }) { return <main className="landing-shell"><section className={`landing-card ${tone}`}><div className="brand-mark">G</div><p className="eyebrow">Gideon product capture</p><h1>{title}</h1><p className="lede">{detail}</p></section></main>; }
function Unavailable({ capabilities }: { capabilities: CaptureCapabilities | null }) { const missing = capabilities ? Object.entries(capabilities).filter(([key, value]) => key !== "available" && !value).map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase()) : ["capability check"]; return <main className="landing-shell"><section className="landing-card warning"><div className="brand-mark">G</div><p className="eyebrow">Capture unavailable</p><h1>This deployment isn’t ready to record products safely.</h1><p className="lede">The entry point stays disabled until every required dependency is configured.</p><div className="missing-list">{missing.map((item) => <span key={item}>Missing: {item}</span>)}</div></section></main>; }

const labels: Record<View, string> = { setup: "Setup", discover: "Discover", review: "Review", capture: "Capture", results: "Results" };
const descriptions: Record<View, string> = { setup: "Environment & roles", discover: "Propose workflows", review: "Approve intent", capture: "Record clean takes", results: "Assemble source" };
function splitList(value: string) { return [...new Set(value.split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))]; }
function splitLines(value: string) { return value.split(/\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 50); }
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function move(values: string[], from: number, to: number) { const next = [...values]; const [item] = next.splice(from, 1); if (item) next.splice(to, 0, item); return next; }
function shortId(value: string) { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function runStorageKey(projectId: string, kind: "discovery" | "capture") { return `gideon:capture:${projectId}:${kind}:run`; }
function message(reason: unknown) { if (reason instanceof CaptureApiError) return `${reason.message}${reason.requestId ? ` (request ${reason.requestId})` : ""}`; return reason instanceof Error ? reason.message : "Unexpected error."; }
async function pollEnvironment(projectId: string, environmentId: string, refresh: () => Promise<void>) { for (let attempt = 0; attempt < 30; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 1000)); const environments = await api.listEnvironments(projectId); const environment = environments.find((item) => item.id === environmentId); if (!environment || environment.status === "ready" || environment.status === "failed") { await refresh(); return; } } await refresh(); }
