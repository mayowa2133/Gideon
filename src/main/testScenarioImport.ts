import { randomUUID } from "node:crypto";
import { parseProductFlowRevision, type BrowserActionRisk, type ProductFlowAction, type ProductFlowRevision } from "../shared/productFlowCapture";

export interface ImportedTestScenario {
  id: string;
  framework: "playwright" | "cypress";
  title: string;
  entryPath: string;
  steps: Array<{ intent: string; action: ProductFlowAction; riskClass: BrowserActionRisk }>;
  finalAssertions: ProductFlowRevision["finalAssertions"];
  sourcePath: string;
}

export function importTestScenarioFlows(input: {
  projectId: string;
  environmentVersionId: string;
  personaId: string;
  scenarios: unknown[];
  maxScenarios?: number;
  makeId?: () => string;
}): ProductFlowRevision[] {
  const max = input.maxScenarios ?? 100;
  if (input.scenarios.length > max) throw new Error("Test import exceeds the scenario budget.");
  const makeId = input.makeId ?? randomUUID;
  return input.scenarios.map((raw, scenarioIndex) => {
    const scenario = parseScenario(raw, scenarioIndex);
    return parseProductFlowRevision({
      schemaVersion: "1",
      id: makeId(),
      revision: 1,
      projectId: input.projectId,
      environmentVersionId: input.environmentVersionId,
      personaId: input.personaId,
      title: scenario.title,
      goal: `Reproduce the imported ${scenario.framework} scenario: ${scenario.title}.`,
      startingState: { entryPath: scenario.entryPath },
      steps: scenario.steps.map((step, index) => ({ id: `imported-step-${index + 1}`, ...step })),
      finalAssertions: scenario.finalAssertions,
      approval: { status: "draft" },
      sourceEvidenceIds: [`${scenario.framework}:${scenario.sourcePath}:${scenario.id}`]
    });
  });
}

function parseScenario(value: unknown, index: number): ImportedTestScenario {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Test scenario ${index} must be an object.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(["id", "framework", "title", "entryPath", "steps", "finalAssertions", "sourcePath"]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Test scenario ${index}.${unknown} is not supported.`);
  if (record.framework !== "playwright" && record.framework !== "cypress") throw new Error(`Test scenario ${index} framework is invalid.`);
  if (!Array.isArray(record.steps) || record.steps.length < 1 || record.steps.length > 100) throw new Error(`Test scenario ${index} steps are invalid.`);
  const steps = record.steps.map((step, stepIndex) => parseStep(step, index, stepIndex));
  if (!Array.isArray(record.finalAssertions) || record.finalAssertions.length < 1) throw new Error(`Test scenario ${index} requires final assertions.`);
  return {
    id: text(record.id, 200, `scenario ${index} id`), framework: record.framework,
    title: text(record.title, 160, `scenario ${index} title`), entryPath: pathValue(record.entryPath, `scenario ${index} entryPath`),
    steps, finalAssertions: record.finalAssertions as ProductFlowRevision["finalAssertions"], sourcePath: text(record.sourcePath, 500, `scenario ${index} sourcePath`)
  };
}

function parseStep(value: unknown, scenario: number, index: number): ImportedTestScenario["steps"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Test scenario ${scenario} step ${index} is invalid.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(["intent", "action", "riskClass"]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Test scenario ${scenario} step ${index}.${unknown} is not supported.`);
  return { intent: text(record.intent, 500, "step intent"), action: record.action as ProductFlowAction, riskClass: text(record.riskClass, 50, "risk class") as BrowserActionRisk };
}

function text(value: unknown, max: number, label: string): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is invalid.`); return value.trim(); }
function pathValue(value: unknown, label: string): string { const result = text(value, 2_000, label); if (!result.startsWith("/") || result.startsWith("//")) throw new Error(`${label} is invalid.`); return result; }
