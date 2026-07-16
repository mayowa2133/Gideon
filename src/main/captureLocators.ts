import type { LocatorSpec } from "../shared/productFlowCapture";
import { stableSerialize } from "./productFlowCompiler";

export interface LocatorControlEvidence {
  role: NonNullable<LocatorSpec["role"]>;
  name: string;
  label?: string;
  testId?: string;
  placeholder?: string;
  destinationPath?: string;
  scopeRole?: NonNullable<LocatorSpec["scopeRole"]>;
  scopeName?: string;
}

export interface RankedLocatorCandidate {
  locator: LocatorSpec;
  durabilityScore: number;
  matchCount: number;
  status: "unique" | "ambiguous" | "missing";
  rationale: string;
}

export function rankDurableLocatorCandidates(target: LocatorControlEvidence, pageControls: LocatorControlEvidence[]): RankedLocatorCandidate[] {
  validateControl(target);
  if (!Array.isArray(pageControls) || pageControls.length > 2_000) throw new Error("Locator control inventory is invalid.");
  pageControls.forEach(validateControl);
  const candidates: Array<{ locator: LocatorSpec; score: number; rationale: string }> = [];
  if (target.label) candidates.push({ locator: { strategy: "label", value: target.label, exact: true }, score: 100, rationale: "Stable associated form label." });
  if (target.role === "link" && target.destinationPath) candidates.push({ locator: { strategy: "stable_link", value: target.name, destinationPath: normalizedPath(target.destinationPath), exact: true }, score: 98, rationale: "Accessible link name plus bounded destination path." });
  candidates.push({ locator: { strategy: "role", role: target.role, value: target.name, exact: true }, score: 95, rationale: "Accessible role and exact name." });
  if (target.testId) candidates.push({ locator: { strategy: "test_id", value: target.testId, exact: true }, score: 90, rationale: "Explicit test identifier." });
  if (target.scopeRole && target.scopeName) candidates.push({ locator: { strategy: "structural", scopeRole: target.scopeRole, scopeName: target.scopeName, role: target.role, value: target.name, exact: true }, score: 85, rationale: "Accessible target scoped to a stable landmark." });
  if (target.placeholder) candidates.push({ locator: { strategy: "placeholder", value: target.placeholder, exact: true }, score: 60, rationale: "Placeholder fallback." });
  candidates.push({ locator: { strategy: "text", value: target.name, exact: true }, score: 40, rationale: "Visible-text fallback." });
  const unique = new Map(candidates.map((candidate) => [stableSerialize(candidate.locator), candidate]));
  return [...unique.values()].map((candidate) => {
    const matchCount = pageControls.filter((control) => locatorMatches(candidate.locator, control)).length;
    return { locator: candidate.locator, durabilityScore: candidate.score - Math.max(0, matchCount - 1) * 50, matchCount, status: matchCount === 1 ? "unique" : matchCount > 1 ? "ambiguous" : "missing", rationale: candidate.rationale } as RankedLocatorCandidate;
  }).sort((left, right) => right.durabilityScore - left.durabilityScore || strategyRank(left.locator.strategy) - strategyRank(right.locator.strategy));
}

export function selectDurableLocator(target: LocatorControlEvidence, pageControls: LocatorControlEvidence[]): RankedLocatorCandidate {
  const ranked = rankDurableLocatorCandidates(target, pageControls);
  const selected = ranked.find((candidate) => candidate.status === "unique");
  if (!selected) throw new Error(ranked.some((candidate) => candidate.status === "ambiguous") ? "No unambiguous durable locator is available." : "No durable locator matches the rendered control inventory.");
  return selected;
}

export function assessLocatorAgainstInventory(locator: LocatorSpec, pageControls: LocatorControlEvidence[]): Pick<RankedLocatorCandidate, "matchCount" | "status"> {
  const matchCount = pageControls.filter((control) => locatorMatches(locator, control)).length;
  return { matchCount, status: matchCount === 1 ? "unique" : matchCount > 1 ? "ambiguous" : "missing" };
}

function locatorMatches(locator: LocatorSpec, control: LocatorControlEvidence): boolean {
  const value = normalize(locator.value);
  if (locator.strategy === "label") return normalize(control.label) === value;
  if (locator.strategy === "test_id") return normalize(control.testId) === value;
  if (locator.strategy === "placeholder") return normalize(control.placeholder) === value;
  if (locator.strategy === "text") return normalize(control.name) === value;
  if (locator.strategy === "stable_link") return control.role === "link" && normalize(control.name) === value && normalizedPath(control.destinationPath ?? "/") === locator.destinationPath;
  if (locator.strategy === "structural") return control.role === locator.role && normalize(control.name) === value && control.scopeRole === locator.scopeRole && normalize(control.scopeName) === normalize(locator.scopeName);
  return control.role === locator.role && normalize(control.name) === value;
}

function validateControl(control: LocatorControlEvidence): void {
  const roles = ["button", "link", "textbox", "combobox", "checkbox", "radio", "tab", "menuitem", "heading"];
  const scopeRoles = ["navigation", "region", "dialog", "form", "main"];
  if (!control || !roles.includes(control.role) || !bounded(control.name, 300)) throw new Error("Locator control evidence is invalid.");
  if (control.scopeRole !== undefined && !scopeRoles.includes(control.scopeRole)) throw new Error("Locator control evidence is invalid.");
  if ((control.scopeRole === undefined) !== (control.scopeName === undefined)) throw new Error("Locator structural evidence is incomplete.");
  for (const value of [control.label, control.testId, control.placeholder, control.scopeName]) if (value !== undefined && !bounded(value, 300)) throw new Error("Locator control evidence is invalid.");
  if (control.destinationPath !== undefined) normalizedPath(control.destinationPath);
}

function normalizedPath(value: string): string {
  const url = new URL(value, "https://capture.invalid");
  if (!url.pathname.startsWith("/") || url.pathname.length > 2_000) throw new Error("Locator destination path is invalid.");
  return url.pathname;
}

function normalize(value: string | undefined): string { return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase(); }
function bounded(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function strategyRank(value: LocatorSpec["strategy"]): number { return ["label", "stable_link", "role", "test_id", "structural", "placeholder", "text"].indexOf(value); }
