import path from "node:path";
import type { ImportedTestScenario } from "./testScenarioImport";
import { importTestScenarioFlows } from "./testScenarioImport";

export interface CapturePilotManifest {
  schemaVersion: "1";
  key: string;
  workspaceId: string;
  projectId: string;
  name: string;
  artifactDirectoryName: string;
  repository: {
    rootDir: string;
    maxFiles: number;
    maxBytes: number;
  };
  environment: {
    name: string;
    type: "local_preview";
    baseUrl: string;
    allowedDomains: string[];
    startupAdapterId: string;
  };
  persona: {
    key: string;
    displayName: string;
    roleDescription: string;
    fixtureProfileId: string;
    fixtureValues: Record<string, string>;
  };
  presentation: {
    viewport: { width: number; height: number };
    initialHoldMs: number;
    beforeActionMs: number;
    afterActionMs: number;
    finalHoldMs: number;
    showPointer: boolean;
    pointerMoveMs: number;
    typingDelayMs: number;
    verticalOutput: {
      enabled: boolean;
      narration: "none" | "provider";
      framing: {
        mode: "full_frame" | "automatic_focus" | "manual";
        maxZoom: number;
        transitionMs: number;
        manualFocus?: { x: number; y: number; width: number; height: number };
      };
      quality: { minimumSourceTextPx: number };
    };
  };
  coverageInventory?: {
    revision: number;
    fixtureRevision: string;
    dimensions: Array<{
      key: "route" | "state" | "usage_sequence" | "feature_flag" | "outcome" | "failure_state";
      trustworthyDenominator: boolean;
      items: Array<{ id: string; workflowIds: string[] }>;
      excluded: Array<{ id: string; reason: string }>;
      blocked: Array<{ id: string; code: string }>;
    }>;
  };
  workflows: Array<{
    id: string;
    goalId: string;
    resetAdapterId: string;
    verificationAdapterId: string;
    scenario: ImportedTestScenario;
  }>;
}

export interface CapturePilotAdapterRegistry {
  startup: Record<string, { approvedRepositoryRoot: string; approvedBaseUrl: string; assertReady(input: { manifest: CapturePilotManifest }): Promise<void> }>;
  reset: Record<string, { reset(input: { manifest: CapturePilotManifest; workflowId: string }): Promise<void> }>;
  verification: Record<string, { verify(input: { manifest: CapturePilotManifest; workflowId: string }): Promise<unknown> }>;
}

const rootKeys = ["schemaVersion", "key", "workspaceId", "projectId", "name", "artifactDirectoryName", "repository", "environment", "persona", "presentation", "workflows"];

export function parseCapturePilotManifest(value: unknown): CapturePilotManifest {
  const root = record(value, "manifest");
  exactOptionalKeys(root, rootKeys, ["coverageInventory"], "manifest");
  if (root.schemaVersion !== "1") throw new Error("Capture pilot manifest schemaVersion must be 1.");
  const repository = parseRepository(root.repository);
  const environment = parseEnvironment(root.environment);
  const persona = parsePersona(root.persona);
  const presentation = parsePresentation(root.presentation);
  const workflows = parseWorkflows(root.workflows);
  const coverageInventory = root.coverageInventory === undefined ? undefined : parseCoverageInventory(root.coverageInventory, workflows.map((workflow) => workflow.id));
  const manifest: CapturePilotManifest = {
    schemaVersion: "1",
    key: identifier(root.key, "manifest.key"),
    workspaceId: identifier(root.workspaceId, "manifest.workspaceId"),
    projectId: identifier(root.projectId, "manifest.projectId"),
    name: text(root.name, "manifest.name", 160),
    artifactDirectoryName: identifier(root.artifactDirectoryName, "manifest.artifactDirectoryName"),
    repository,
    environment,
    persona,
    presentation,
    ...(coverageInventory ? { coverageInventory } : {}),
    workflows
  };
  validateScenarioContracts(manifest);
  return structuredClone(manifest);
}

function parseCoverageInventory(value: unknown, workflowIds: string[]): NonNullable<CapturePilotManifest["coverageInventory"]> {
  const input = record(value, "manifest.coverageInventory");
  exactKeys(input, ["revision", "fixtureRevision", "dimensions"], "manifest.coverageInventory");
  if (!Array.isArray(input.dimensions) || input.dimensions.length > 6) throw new Error("Capture pilot coverage inventory dimensions are invalid.");
  const dimensionKeys = ["route", "state", "usage_sequence", "feature_flag", "outcome", "failure_state"] as const;
  const seen = new Set<string>();
  const dimensions = input.dimensions.map((raw, index) => {
    const dimension = record(raw, `manifest.coverageInventory.dimensions[${index}]`);
    exactKeys(dimension, ["key", "trustworthyDenominator", "items", "excluded", "blocked"], `manifest.coverageInventory.dimensions[${index}]`);
    if (!dimensionKeys.includes(dimension.key as typeof dimensionKeys[number]) || seen.has(String(dimension.key))) throw new Error(`Capture pilot coverage inventory dimension ${index} is invalid.`);
    seen.add(String(dimension.key));
    if (typeof dimension.trustworthyDenominator !== "boolean") throw new Error(`Capture pilot coverage inventory dimension ${index} trust is invalid.`);
    if (!Array.isArray(dimension.items) || dimension.items.length > 500 || !Array.isArray(dimension.excluded) || dimension.excluded.length > 500 || !Array.isArray(dimension.blocked) || dimension.blocked.length > 500) throw new Error(`Capture pilot coverage inventory dimension ${index} items are invalid.`);
    const itemIds = new Set<string>();
    const items = dimension.items.map((rawItem, itemIndex) => {
      const item = record(rawItem, `manifest.coverageInventory.dimensions[${index}].items[${itemIndex}]`);
      exactKeys(item, ["id", "workflowIds"], `manifest.coverageInventory.dimensions[${index}].items[${itemIndex}]`);
      const id = text(item.id, `manifest.coverageInventory.dimensions[${index}].items[${itemIndex}].id`, 500);
      const mappedWorkflows = optionalStringArray(item.workflowIds, `manifest.coverageInventory.dimensions[${index}].items[${itemIndex}].workflowIds`, 50);
      if (itemIds.has(id) || mappedWorkflows.some((workflowId) => !workflowIds.includes(workflowId))) throw new Error(`Capture pilot coverage inventory item ${id} is invalid.`);
      itemIds.add(id);
      return { id, workflowIds: mappedWorkflows };
    });
    const excluded = dimension.excluded.map((rawEntry, entryIndex) => parseCoverageEntry(rawEntry, "reason", `manifest.coverageInventory.dimensions[${index}].excluded[${entryIndex}]`));
    const blocked = dimension.blocked.map((rawEntry, entryIndex) => parseCoverageEntry(rawEntry, "code", `manifest.coverageInventory.dimensions[${index}].blocked[${entryIndex}]`));
    const allIds = [...items.map((item) => item.id), ...excluded.map((item) => item.id), ...blocked.map((item) => item.id)];
    if (new Set(allIds).size !== allIds.length) throw new Error(`Capture pilot coverage inventory dimension ${dimension.key} contains duplicate IDs.`);
    return { key: dimension.key as typeof dimensionKeys[number], trustworthyDenominator: dimension.trustworthyDenominator, items, excluded, blocked };
  });
  return { revision: integer(input.revision, "manifest.coverageInventory.revision", 1, 1_000_000), fixtureRevision: identifier(input.fixtureRevision, "manifest.coverageInventory.fixtureRevision"), dimensions };
}

function parseCoverageEntry<K extends "reason" | "code">(value: unknown, field: K, label: string): { id: string } & Record<K, string> {
  const input = record(value, label);
  exactKeys(input, ["id", field], label);
  return { id: text(input.id, `${label}.id`, 500), [field]: text(input[field], `${label}.${field}`, 500) } as { id: string } & Record<K, string>;
}

export function assertCapturePilotAdapters(manifest: CapturePilotManifest, registry: CapturePilotAdapterRegistry): void {
  const startup = registry.startup[manifest.environment.startupAdapterId];
  if (!startup) throw new Error(`Capture pilot startup adapter ${manifest.environment.startupAdapterId} is not registered.`);
  if (path.resolve(startup.approvedRepositoryRoot) !== manifest.repository.rootDir || new URL(startup.approvedBaseUrl).origin !== manifest.environment.baseUrl) {
    throw new Error("Capture pilot manifest target does not match the registered startup adapter.");
  }
  for (const workflow of manifest.workflows) {
    if (!registry.reset[workflow.resetAdapterId]) throw new Error(`Capture pilot reset adapter ${workflow.resetAdapterId} is not registered.`);
    if (!registry.verification[workflow.verificationAdapterId]) throw new Error(`Capture pilot verification adapter ${workflow.verificationAdapterId} is not registered.`);
  }
}

function parseRepository(value: unknown): CapturePilotManifest["repository"] {
  const input = record(value, "manifest.repository");
  exactKeys(input, ["rootDir", "maxFiles", "maxBytes"], "manifest.repository");
  const rootDir = text(input.rootDir, "manifest.repository.rootDir", 2_000);
  if (!path.isAbsolute(rootDir) || rootDir.includes("\0")) throw new Error("Capture pilot repository rootDir must be an absolute path.");
  return {
    rootDir: path.resolve(rootDir),
    maxFiles: integer(input.maxFiles, "manifest.repository.maxFiles", 1, 10_000),
    maxBytes: integer(input.maxBytes, "manifest.repository.maxBytes", 1, 100_000_000)
  };
}

function parseEnvironment(value: unknown): CapturePilotManifest["environment"] {
  const input = record(value, "manifest.environment");
  exactKeys(input, ["name", "type", "baseUrl", "allowedDomains", "startupAdapterId"], "manifest.environment");
  if (input.type !== "local_preview") throw new Error("Capture pilots support local_preview environments only.");
  const baseUrl = text(input.baseUrl, "manifest.environment.baseUrl", 2_000);
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:" || !isLoopbackHostname(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Capture pilot baseUrl must be a credential-free loopback HTTP origin.");
  }
  const allowedDomains = stringArray(input.allowedDomains, "manifest.environment.allowedDomains", 10).map((domain) => domain.toLowerCase());
  if (allowedDomains.length !== 1 || allowedDomains[0] !== parsed.hostname.toLowerCase()) throw new Error("Capture pilot allowedDomains must contain only the exact baseUrl hostname.");
  return {
    name: text(input.name, "manifest.environment.name", 160),
    type: "local_preview",
    baseUrl: parsed.origin,
    allowedDomains,
    startupAdapterId: identifier(input.startupAdapterId, "manifest.environment.startupAdapterId")
  };
}

function parsePersona(value: unknown): CapturePilotManifest["persona"] {
  const input = record(value, "manifest.persona");
  exactKeys(input, ["key", "displayName", "roleDescription", "fixtureProfileId", "fixtureValues"], "manifest.persona");
  const fixtureInput = record(input.fixtureValues, "manifest.persona.fixtureValues");
  if (Object.keys(fixtureInput).length < 1 || Object.keys(fixtureInput).length > 100) throw new Error("Capture pilot fixtureValues must contain 1–100 entries.");
  const fixtureValues: Record<string, string> = {};
  for (const [key, raw] of Object.entries(fixtureInput)) fixtureValues[identifier(key, `manifest.persona.fixtureValues.${key}`)] = text(raw, `manifest.persona.fixtureValues.${key}`, 10_000);
  return {
    key: identifier(input.key, "manifest.persona.key"),
    displayName: text(input.displayName, "manifest.persona.displayName", 160),
    roleDescription: text(input.roleDescription, "manifest.persona.roleDescription", 1_000),
    fixtureProfileId: identifier(input.fixtureProfileId, "manifest.persona.fixtureProfileId"),
    fixtureValues
  };
}

function parsePresentation(value: unknown): CapturePilotManifest["presentation"] {
  const input = record(value, "manifest.presentation");
  exactKeys(input, ["viewport", "initialHoldMs", "beforeActionMs", "afterActionMs", "finalHoldMs", "showPointer", "pointerMoveMs", "typingDelayMs", "verticalOutput"], "manifest.presentation");
  const viewport = record(input.viewport, "manifest.presentation.viewport");
  exactKeys(viewport, ["width", "height"], "manifest.presentation.viewport");
  const verticalOutput = record(input.verticalOutput, "manifest.presentation.verticalOutput");
  exactKeys(verticalOutput, ["enabled", "narration", "framing", "quality"], "manifest.presentation.verticalOutput");
  const framing = record(verticalOutput.framing, "manifest.presentation.verticalOutput.framing");
  const mode = framing.mode;
  if (!["full_frame", "automatic_focus", "manual"].includes(String(mode))) throw new Error("Capture pilot presentation framing mode is invalid.");
  exactKeys(framing, mode === "manual" ? ["mode", "maxZoom", "transitionMs", "manualFocus"] : ["mode", "maxZoom", "transitionMs"], "manifest.presentation.verticalOutput.framing");
  let manualFocus: { x: number; y: number; width: number; height: number } | undefined;
  if (mode === "manual") {
    const region = record(framing.manualFocus, "manifest.presentation.verticalOutput.framing.manualFocus");
    exactKeys(region, ["x", "y", "width", "height"], "manifest.presentation.verticalOutput.framing.manualFocus");
    manualFocus = {
      x: finiteNumber(region.x, "manifest.presentation.verticalOutput.framing.manualFocus.x", 0, 1),
      y: finiteNumber(region.y, "manifest.presentation.verticalOutput.framing.manualFocus.y", 0, 1),
      width: finiteNumber(region.width, "manifest.presentation.verticalOutput.framing.manualFocus.width", 0.001, 1),
      height: finiteNumber(region.height, "manifest.presentation.verticalOutput.framing.manualFocus.height", 0.001, 1)
    };
    if (manualFocus.x + manualFocus.width > 1 || manualFocus.y + manualFocus.height > 1) throw new Error("Capture pilot manual focus must be inside the normalized frame.");
  }
  const quality = record(verticalOutput.quality, "manifest.presentation.verticalOutput.quality");
  exactKeys(quality, ["minimumSourceTextPx"], "manifest.presentation.verticalOutput.quality");
  if (typeof input.showPointer !== "boolean") throw new Error("Capture pilot presentation.showPointer must be boolean.");
  if (typeof verticalOutput.enabled !== "boolean" || !["none", "provider"].includes(String(verticalOutput.narration))) throw new Error("Capture pilot presentation.verticalOutput is invalid.");
  return {
    viewport: { width: integer(viewport.width, "manifest.presentation.viewport.width", 640, 3_840), height: integer(viewport.height, "manifest.presentation.viewport.height", 480, 2_160) },
    initialHoldMs: integer(input.initialHoldMs, "manifest.presentation.initialHoldMs", 0, 5_000),
    beforeActionMs: integer(input.beforeActionMs, "manifest.presentation.beforeActionMs", 0, 5_000),
    afterActionMs: integer(input.afterActionMs, "manifest.presentation.afterActionMs", 0, 5_000),
    finalHoldMs: integer(input.finalHoldMs, "manifest.presentation.finalHoldMs", 0, 5_000),
    showPointer: input.showPointer,
    pointerMoveMs: integer(input.pointerMoveMs, "manifest.presentation.pointerMoveMs", 0, 2_000),
    typingDelayMs: integer(input.typingDelayMs, "manifest.presentation.typingDelayMs", 0, 250),
    verticalOutput: {
      enabled: verticalOutput.enabled,
      narration: verticalOutput.narration as "none" | "provider",
      framing: {
        mode: mode as "full_frame" | "automatic_focus" | "manual",
        maxZoom: finiteNumber(framing.maxZoom, "manifest.presentation.verticalOutput.framing.maxZoom", 1, 2),
        transitionMs: integer(framing.transitionMs, "manifest.presentation.verticalOutput.framing.transitionMs", 0, 2_000),
        ...(manualFocus ? { manualFocus } : {})
      },
      quality: { minimumSourceTextPx: integer(quality.minimumSourceTextPx, "manifest.presentation.verticalOutput.quality.minimumSourceTextPx", 8, 32) }
    }
  };
}

function parseWorkflows(value: unknown): CapturePilotManifest["workflows"] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Capture pilot workflows must contain 1–50 items.");
  const ids = new Set<string>();
  const goals = new Set<string>();
  return value.map((raw, index) => {
    const input = record(raw, `manifest.workflows[${index}]`);
    exactKeys(input, ["id", "goalId", "resetAdapterId", "verificationAdapterId", "scenario"], `manifest.workflows[${index}]`);
    const id = identifier(input.id, `manifest.workflows[${index}].id`);
    const goalId = identifier(input.goalId, `manifest.workflows[${index}].goalId`);
    if (ids.has(id)) throw new Error(`Capture pilot workflow id ${id} is duplicated.`);
    if (goals.has(goalId)) throw new Error(`Capture pilot goalId ${goalId} is duplicated.`);
    ids.add(id);
    goals.add(goalId);
    return {
      id,
      goalId,
      resetAdapterId: identifier(input.resetAdapterId, `manifest.workflows[${index}].resetAdapterId`),
      verificationAdapterId: identifier(input.verificationAdapterId, `manifest.workflows[${index}].verificationAdapterId`),
      scenario: structuredClone(input.scenario) as ImportedTestScenario
    };
  });
}

function validateScenarioContracts(manifest: CapturePilotManifest): void {
  for (const workflow of manifest.workflows) {
    if (workflow.scenario.id !== workflow.id) throw new Error(`Capture pilot workflow ${workflow.id} must match its scenario id.`);
    importTestScenarioFlows({ projectId: manifest.projectId, environmentVersionId: "manifest-validation", personaId: manifest.persona.key, scenarios: [workflow.scenario], makeId: () => workflow.id });
  }
}

function isLoopbackHostname(hostname: string): boolean { return hostname === "127.0.0.1" || hostname === "localhost"; }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string): void { const unknown = Object.keys(value).find((key) => !allowed.includes(key)); if (unknown) throw new Error(`${label}.${unknown} is not supported.`); const missing = allowed.find((key) => !(key in value)); if (missing) throw new Error(`${label}.${missing} is required.`); }
function exactOptionalKeys(value: Record<string, unknown>, required: string[], optional: string[], label: string): void { const unknown = Object.keys(value).find((key) => !required.includes(key) && !optional.includes(key)); if (unknown) throw new Error(`${label}.${unknown} is not supported.`); const missing = required.find((key) => !(key in value)); if (missing) throw new Error(`${label}.${missing} is required.`); }
function text(value: unknown, label: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is invalid.`); return value.trim(); }
function identifier(value: unknown, label: string): string { const result = text(value, label, 200); if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) throw new Error(`${label} must be an identifier.`); return result; }
function integer(value: unknown, label: string, min: number, max: number): number { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`); return value as number; }
function finiteNumber(value: unknown, label: string, min: number, max: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number from ${min} to ${max}.`); return value; }
function stringArray(value: unknown, label: string, max: number): string[] { if (!Array.isArray(value) || value.length < 1 || value.length > max) throw new Error(`${label} must contain 1–${max} strings.`); return value.map((item, index) => text(item, `${label}[${index}]`, 253)); }
function optionalStringArray(value: unknown, label: string, max: number): string[] { if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must contain 0–${max} strings.`); const output = value.map((item, index) => identifier(item, `${label}[${index}]`)); if (new Set(output).size !== output.length) throw new Error(`${label} must not contain duplicates.`); return output; }
