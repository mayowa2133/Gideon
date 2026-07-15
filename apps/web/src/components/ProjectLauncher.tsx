"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaptureApi, CaptureApiError, type ProjectSummaryDto } from "@/lib/captureApi";

const api = new CaptureApi();

export function ProjectLauncher() {
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await api.session();
        if (!active) return;
        setAuthenticated(session.authenticated);
        if (session.authenticated) setProjects(await api.listProjects());
      } catch (reason) {
        if (active) setError(reason instanceof CaptureApiError ? reason.message : "Could not load projects.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="muted" role="status">Loading your projects…</p>;
  if (!authenticated) return <p className="inline-warning">Sign in to the hosted Gideon app to choose a project.</p>;
  return <div className="project-launcher">
    {error ? <p className="inline-warning" role="alert">{error}</p> : null}
    {projects.length ? <div className="project-list">{projects.map((project) => <Link className="project-link" href={`/projects/${encodeURIComponent(project.id)}/capture`} key={project.id}><span><strong>{project.name}</strong><small>{project.productName}</small></span><em>Open capture →</em></Link>)}</div> : <p className="muted">No projects were found in this workspace.</p>}
    <form className="project-id-form" onSubmit={(event) => { event.preventDefault(); if (projectId.trim()) window.location.assign(`/projects/${encodeURIComponent(projectId.trim())}/capture`); }}>
      <label>Or enter a project ID<input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="project UUID" /></label>
      <button className="button ghost" disabled={!projectId.trim()} type="submit">Open project</button>
    </form>
  </div>;
}
