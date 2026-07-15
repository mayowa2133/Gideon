import type { ProductFlowDto } from "./captureApi";

export function mergeFlowDrafts(flows: ProductFlowDto[], id = globalThis.crypto.randomUUID()): ProductFlowDto {
  const first = flows[0];
  const last = flows.at(-1);
  if (!first || !last || flows.length < 2) throw new Error("Select at least two flows to merge.");
  if (!flows.every((flow) => flow.projectId === first.projectId && flow.environmentVersionId === first.environmentVersionId && flow.personaId === first.personaId)) throw new Error("Merged flows must share a project, environment version, and persona.");
  return {
    schemaVersion: "1",
    id,
    revision: 1,
    projectId: first.projectId,
    environmentVersionId: first.environmentVersionId,
    personaId: first.personaId,
    title: flows.map((flow) => flow.title).join(" + ").slice(0, 160),
    goal: flows.map((flow) => flow.goal).join(" Then ").slice(0, 600),
    startingState: first.startingState,
    steps: flows.flatMap((flow, flowIndex) => flow.steps.map((step, stepIndex) => ({ ...step, id: `merge-${flowIndex + 1}-${stepIndex + 1}` }))).slice(0, 100),
    finalAssertions: last.finalAssertions,
    approval: { status: "draft" },
    sourceEvidenceIds: [...new Set(flows.flatMap((flow) => flow.sourceEvidenceIds))].slice(0, 200)
  };
}
