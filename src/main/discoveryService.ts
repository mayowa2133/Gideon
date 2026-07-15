import { randomUUID } from "node:crypto";
import type { CaptureEnvironment, CaptureEnvironmentVersion, CapturePersona, DiscoveryRun, ProductFlowRevision } from "../shared/productFlowCapture";
import { createDiscoveryEvidenceBundle, discoverDeterministicFlows, type RenderedPageEvidence, type RepositoryEvidence, type UsageSequenceEvidence } from "./flowDiscovery";

export interface DiscoveryServiceRepository {
  getEnvironment(input: { workspaceId: string; environmentId: string }): Promise<CaptureEnvironment | null>;
  getEnvironmentVersion(input: { workspaceId: string; versionId: string }): Promise<CaptureEnvironmentVersion | null>;
  listProjectPersonas(input: { workspaceId: string; projectId: string; limit?: number }): Promise<CapturePersona[]>;
  upsertDiscoveryRun(run: DiscoveryRun): Promise<DiscoveryRun>;
  upsertFlowRevision(input: { workspaceId: string; environmentId: string; flow: ProductFlowRevision; createdAt: string }): Promise<ProductFlowRevision>;
}

export function createDeterministicDiscoveryService(options: {
  repository: DiscoveryServiceRepository;
  makeId?: () => string;
  now?: () => string;
}) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async run(input: {
      workspaceId: string;
      projectId: string;
      environmentId: string;
      goals: Array<{ id: string; text: string; priority: number }>;
      renderedPages: RenderedPageEvidence[];
      repository?: RepositoryEvidence;
      usageSequences?: UsageSequenceEvidence[];
      maxCandidates?: number;
      jobId: string;
      discoveryRunId?: string;
    }): Promise<{ run: DiscoveryRun; flows: ProductFlowRevision[] }> {
      const environment = await options.repository.getEnvironment({ workspaceId: input.workspaceId, environmentId: input.environmentId });
      if (!environment || environment.projectId !== input.projectId || environment.status !== "ready" || !environment.currentVersionId) throw new Error("Capture environment is not current and ready.");
      const version = await options.repository.getEnvironmentVersion({ workspaceId: input.workspaceId, versionId: environment.currentVersionId });
      if (!version || version.projectId !== input.projectId || version.environmentId !== environment.id) throw new Error("Capture environment version was not found.");
      const personas = (await options.repository.listProjectPersonas({ workspaceId: input.workspaceId, projectId: input.projectId, limit: 20 })).filter((persona) => persona.environmentId === environment.id && persona.status === "active");
      if (!personas.length) throw new Error("Discovery requires an active capture persona.");
      const createdAt = now();
      let run: DiscoveryRun = {
        id: input.discoveryRunId ?? makeId(), workspaceId: input.workspaceId, projectId: input.projectId, environmentVersionId: version.id,
        jobId: input.jobId, status: "inventory", promptVersion: "deterministic-v1", maxSteps: 500,
        maxScreenshots: 0, maxDurationMs: 300_000, createdAt, updatedAt: createdAt
      };
      await options.repository.upsertDiscoveryRun(run);
      try {
        const bundle = createDiscoveryEvidenceBundle({ environmentVersionId: version.id, projectId: input.projectId, goals: input.goals, personas: personas.map(({ id, key, displayName, roleDescription }) => ({ id, key, displayName, roleDescription })), renderedPages: input.renderedPages, repository: input.repository, usageSequences: input.usageSequences, allowedRisks: ["observe", "navigate", "synthetic_write"], maxCandidates: input.maxCandidates ?? 30 });
        const candidates = discoverDeterministicFlows(bundle, makeId);
        const flows: ProductFlowRevision[] = [];
        for (const candidate of candidates) {
          flows.push(await options.repository.upsertFlowRevision({ workspaceId: input.workspaceId, environmentId: environment.id, flow: candidate.flow, createdAt: now() }));
        }
        run = await options.repository.upsertDiscoveryRun({ ...run, status: "ready_for_review", updatedAt: now() });
        return { run, flows };
      } catch (error) {
        await options.repository.upsertDiscoveryRun({ ...run, status: "failed", safeErrorCode: "discovery_failed", updatedAt: now() }).catch(() => undefined);
        throw error;
      }
    }
  };
}
