import { createHash } from "node:crypto";

export interface ReconciliationArtifact {
  id: string;
  workspaceId: string;
  projectId: string;
  storageKey: string;
  createdAt: string;
}

export interface CaptureArtifactReconciliationPlan {
  schemaVersion: "1";
  workspaceId: string;
  projectId: string;
  retentionDays: number;
  legalHold: boolean;
  expired: ReconciliationArtifact[];
  missingObjectArtifactIds: string[];
  orphanObjectKeys: string[];
  receipt: { databaseArtifacts: number; objects: number; expired: number; missingObjects: number; orphanObjects: number; evidenceHashes: string[] };
}

export function planCaptureArtifactReconciliation(input: { workspaceId: string; projectId: string; databaseArtifacts: ReconciliationArtifact[]; objectKeys: string[]; retentionDays: number; legalHold?: boolean; now?: Date }): CaptureArtifactReconciliationPlan {
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3_650) throw new Error("Capture artifact retention must be 1–3650 days.");
  const prefix = scopedPrefix(input.workspaceId, input.projectId);
  const databaseArtifacts = input.databaseArtifacts.map((artifact) => {
    if (artifact.workspaceId !== input.workspaceId || artifact.projectId !== input.projectId || !artifact.storageKey.startsWith(prefix) || !Number.isFinite(Date.parse(artifact.createdAt))) throw new Error("Capture artifact inventory crosses its authorized scope.");
    return { ...artifact };
  });
  const objectKeys = [...new Set(input.objectKeys)];
  if (objectKeys.some((key) => !key.startsWith(prefix) || key.includes(".."))) throw new Error("Capture object inventory crosses its authorized scope.");
  const databaseKeys = new Set(databaseArtifacts.map((artifact) => artifact.storageKey));
  const objectSet = new Set(objectKeys);
  const cutoff = (input.now ?? new Date()).getTime() - input.retentionDays * 86_400_000;
  const expired = input.legalHold ? [] : databaseArtifacts.filter((artifact) => Date.parse(artifact.createdAt) <= cutoff);
  const missingObjectArtifactIds = databaseArtifacts.filter((artifact) => !objectSet.has(artifact.storageKey)).map((artifact) => artifact.id).sort();
  const orphanObjectKeys = objectKeys.filter((key) => !databaseKeys.has(key)).sort();
  const evidenceHashes = [...missingObjectArtifactIds.map(hash), ...orphanObjectKeys.map(hash)].sort();
  return { schemaVersion: "1", workspaceId: input.workspaceId, projectId: input.projectId, retentionDays: input.retentionDays, legalHold: Boolean(input.legalHold), expired, missingObjectArtifactIds, orphanObjectKeys, receipt: { databaseArtifacts: databaseArtifacts.length, objects: objectKeys.length, expired: expired.length, missingObjects: missingObjectArtifactIds.length, orphanObjects: orphanObjectKeys.length, evidenceHashes } };
}

export async function executeCaptureArtifactRetention(input: { plan: CaptureArtifactReconciliationPlan; objects: { delete(input: { workspaceId: string; projectId: string; storageKey: string }): Promise<void> }; repository: { deleteArtifact(input: { workspaceId: string; projectId: string; artifactId: string }): Promise<void> } }): Promise<{ schemaVersion: "1"; deleted: number; failures: Array<{ artifactId: string; referenceHash: string }> }> {
  const failures: Array<{ artifactId: string; referenceHash: string }> = [];
  let deleted = 0;
  for (const artifact of input.plan.expired) {
    try {
      await input.objects.delete({ workspaceId: input.plan.workspaceId, projectId: input.plan.projectId, storageKey: artifact.storageKey });
      await input.repository.deleteArtifact({ workspaceId: input.plan.workspaceId, projectId: input.plan.projectId, artifactId: artifact.id });
      deleted += 1;
    } catch { failures.push({ artifactId: artifact.id, referenceHash: hash(artifact.storageKey) }); }
  }
  return { schemaVersion: "1", deleted, failures };
}

function scopedPrefix(workspaceId: string, projectId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(workspaceId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(projectId)) throw new Error("Capture artifact reconciliation scope is invalid.");
  return `workspaces/${workspaceId}/projects/${projectId}/`;
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
