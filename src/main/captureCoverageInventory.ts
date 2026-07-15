import { createHash } from "node:crypto";
import type { CapturePersona, CoverageDimensionKey, CoverageFreshness, CoverageRevisionBasis, CoverageSnapshot, ProductFlowRevision } from "../shared/productFlowCapture";
import { stableSerialize } from "./productFlowCompiler";

export type CaptureCoverageInventoryDimensionKey = Exclude<CoverageDimensionKey, "goal" | "approved_flow">;
export type CaptureCoverageInventorySourceKind =
  | "manifest_declared"
  | "repository_routes"
  | "rendered_navigation"
  | "imported_tests"
  | "requested_personas"
  | "declared_starting_states"
  | "privacy_thresholded_usage"
  | "declared_feature_flags"
  | "declared_outcomes"
  | "declared_failure_states";

export interface CaptureCoverageInventorySource {
  kind: CaptureCoverageInventorySourceKind;
  revision: string;
  ids: string[];
}

export interface CaptureCoverageInventoryDimensionInput {
  key: CaptureCoverageInventoryDimensionKey;
  trustworthyDenominator: boolean;
  sources: CaptureCoverageInventorySource[];
  excluded?: Array<{ id: string; reason: string }>;
  blocked?: Array<{ id: string; code: string }>;
}

export interface CaptureCoverageInventoryDimension {
  key: CaptureCoverageInventoryDimensionKey;
  denominatorStatus: "known" | "unknown";
  sourceRevision: string;
  sources: Array<{ kind: CaptureCoverageInventorySourceKind; revision: string; itemCount: number }>;
  knownIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  blocked: Array<{ id: string; code: string }>;
}

export interface CaptureCoverageInventory {
  schemaVersion: "1";
  inventoryVersion: "capture-coverage-inventory-v1";
  revision: number;
  dimensions: CaptureCoverageInventoryDimension[];
  inventoryHash: string;
  createdAt: string;
}

const dimensionKeys: CaptureCoverageInventoryDimensionKey[] = ["persona", "route", "state", "usage_sequence", "feature_flag", "outcome", "failure_state"];
const sourceKinds: CaptureCoverageInventorySourceKind[] = ["manifest_declared", "repository_routes", "rendered_navigation", "imported_tests", "requested_personas", "declared_starting_states", "privacy_thresholded_usage", "declared_feature_flags", "declared_outcomes", "declared_failure_states"];

export function compileCaptureCoverageInventory(input: {
  revision: number;
  dimensions: CaptureCoverageInventoryDimensionInput[];
  now?: () => string;
}): CaptureCoverageInventory {
  if (!Number.isInteger(input.revision) || input.revision < 1 || input.revision > 1_000_000) throw new Error("Capture coverage inventory revision is invalid.");
  if (!Array.isArray(input.dimensions) || input.dimensions.length > dimensionKeys.length) throw new Error("Capture coverage inventory dimensions are invalid.");
  const seen = new Set<CaptureCoverageInventoryDimensionKey>();
  const supplied = new Map(input.dimensions.map((dimension) => {
    if (!dimensionKeys.includes(dimension.key) || seen.has(dimension.key)) throw new Error("Capture coverage inventory dimension identity is invalid.");
    seen.add(dimension.key);
    return [dimension.key, dimension] as const;
  }));
  const dimensions = dimensionKeys.map((key): CaptureCoverageInventoryDimension => {
    const dimension = supplied.get(key);
    if (!dimension) return { key, denominatorStatus: "unknown", sourceRevision: hash({ key, sources: [] }), sources: [], knownIds: [], excluded: [], blocked: [] };
    if (typeof dimension.trustworthyDenominator !== "boolean" || !Array.isArray(dimension.sources) || dimension.sources.length > 20) throw new Error(`Capture coverage inventory ${key} sources are invalid.`);
    const sources = dimension.sources.map((source, index) => {
      if (!sourceKinds.includes(source.kind) || !boundedText(source.revision, 200) || !Array.isArray(source.ids) || source.ids.length > 5_000) throw new Error(`Capture coverage inventory ${key} source ${index} is invalid.`);
      return { kind: source.kind, revision: source.revision, ids: uniqueIds(source.ids, `${key} source ${index}`) };
    });
    const excluded = uniqueEntries(dimension.excluded ?? [], "reason", `${key} exclusions`);
    const blocked = uniqueEntries(dimension.blocked ?? [], "code", `${key} blockers`);
    const knownIds = dedupeIds([...sources.flatMap((source) => source.ids), ...excluded.map((item) => item.id), ...blocked.map((item) => item.id)], `${key} known IDs`).sort();
    const sourceSummary = sources.map((source) => ({ kind: source.kind, revision: source.revision, itemCount: source.ids.length })).sort((left, right) => `${left.kind}:${left.revision}`.localeCompare(`${right.kind}:${right.revision}`));
    return {
      key,
      denominatorStatus: dimension.trustworthyDenominator && sourceSummary.length > 0 ? "known" : "unknown",
      sourceRevision: hash({ key, sources: sourceSummary, knownIds, excluded, blocked }),
      sources: sourceSummary,
      knownIds,
      excluded,
      blocked
    };
  });
  const semantic = { schemaVersion: "1" as const, inventoryVersion: "capture-coverage-inventory-v1" as const, revision: input.revision, dimensions };
  return { ...semantic, inventoryHash: hash(semantic), createdAt: input.now?.() ?? new Date().toISOString() };
}

export function createCoverageRevisionBasis(input: {
  inventory: CaptureCoverageInventory;
  environmentVersionId: string;
  policyFingerprint: string;
  fixtureRevision: string;
  personas: CapturePersona[];
  flows: ProductFlowRevision[];
}): CoverageRevisionBasis {
  for (const [label, value] of [["environment version", input.environmentVersionId], ["policy fingerprint", input.policyFingerprint], ["fixture revision", input.fixtureRevision]] as const) if (!boundedText(value, 200)) throw new Error(`Coverage ${label} is invalid.`);
  if (!/^[a-f0-9]{64}$/.test(input.inventory.inventoryHash)) throw new Error("Coverage inventory hash is invalid.");
  return {
    schemaVersion: "1",
    inventoryVersion: input.inventory.inventoryVersion,
    inventoryRevision: input.inventory.revision,
    inventoryHash: input.inventory.inventoryHash,
    environmentVersionId: input.environmentVersionId,
    policyFingerprint: input.policyFingerprint,
    fixtureRevision: input.fixtureRevision,
    personaRevisionHash: hash(input.personas.map((persona) => `${persona.id}:${persona.revision}:${persona.status}`).sort()),
    flowRevisionHash: hash(input.flows.map((flow) => `${flow.id}:${flow.revision}:${flow.approval.status}:${flow.approval.approvedRevision ?? 0}`).sort())
  };
}

export function assessCoverageFreshness(snapshot: CoverageSnapshot, current: CoverageRevisionBasis | null, now: () => string = () => new Date().toISOString()): CoverageFreshness {
  if (!snapshot.basis) return { status: "unknown", reasons: ["legacy_snapshot"], evaluatedAt: now() };
  if (!current) return { status: "unknown", reasons: ["basis_unavailable"], evaluatedAt: now() };
  const reasons: CoverageFreshness["reasons"] = [];
  if (snapshot.basis.inventoryHash !== current.inventoryHash || snapshot.basis.inventoryRevision !== current.inventoryRevision) reasons.push("inventory");
  if (snapshot.basis.environmentVersionId !== current.environmentVersionId) reasons.push("environment");
  if (snapshot.basis.policyFingerprint !== current.policyFingerprint) reasons.push("policy");
  if (snapshot.basis.fixtureRevision !== current.fixtureRevision) reasons.push("fixture");
  if (snapshot.basis.personaRevisionHash !== current.personaRevisionHash) reasons.push("persona");
  if (snapshot.basis.flowRevisionHash !== current.flowRevisionHash) reasons.push("flow");
  return { status: reasons.length > 0 ? "stale" : "current", reasons, evaluatedAt: now() };
}

export function inventoryDimension(inventory: CaptureCoverageInventory, key: CaptureCoverageInventoryDimensionKey): CaptureCoverageInventoryDimension {
  const dimension = inventory.dimensions.find((candidate) => candidate.key === key);
  if (!dimension) throw new Error(`Capture coverage inventory is missing ${key}.`);
  return dimension;
}

function uniqueIds(values: unknown[], label: string): string[] {
  const output = values.map((value) => {
    if (!boundedText(value, 500) || value.includes("\0")) throw new Error(`Capture coverage inventory ${label} contains an invalid ID.`);
    return value.trim();
  });
  if (new Set(output).size !== output.length) throw new Error(`Capture coverage inventory ${label} contains duplicate IDs.`);
  return output;
}

function dedupeIds(values: unknown[], label: string): string[] {
  const output = values.map((value) => {
    if (!boundedText(value, 500) || value.includes("\0")) throw new Error(`Capture coverage inventory ${label} contains an invalid ID.`);
    return value.trim();
  });
  return [...new Set(output)];
}

function uniqueEntries<K extends "reason" | "code">(values: Array<{ id: string } & Record<K, string>>, field: K, label: string): Array<{ id: string } & Record<K, string>> {
  if (!Array.isArray(values) || values.length > 5_000) throw new Error(`Capture coverage inventory ${label} are invalid.`);
  const output = values.map((entry) => {
    if (!entry || !boundedText(entry.id, 500) || !boundedText(entry[field], 500)) throw new Error(`Capture coverage inventory ${label} contain an invalid entry.`);
    return { id: entry.id.trim(), [field]: entry[field].trim() } as { id: string } & Record<K, string>;
  });
  if (new Set(output.map((entry) => entry.id)).size !== output.length) throw new Error(`Capture coverage inventory ${label} contain duplicate IDs.`);
  return output;
}

function boundedText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function hash(value: unknown): string { return createHash("sha256").update(stableSerialize(value)).digest("hex"); }
