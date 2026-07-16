import type { RenderedPageEvidence } from "./flowDiscovery";
import type { FlowRepairPageComparison } from "./flowRepair";

/**
 * Converts two already-sanitized page inventories into the bounded evidence a
 * repair provider may see. Screenshot pixels remain inside the capture runtime;
 * only their hashes and a locally computed similarity score cross the boundary.
 */
export function createSafeRepairPageComparison(input: {
  failureCode: FlowRepairPageComparison["failureCode"];
  approved: RenderedPageEvidence;
  current: RenderedPageEvidence;
  screenshotSimilarity?: number;
}): FlowRepairPageComparison {
  const approvedScreenshotHash = requiredHash(input.approved.screenshotHash, "approved screenshot");
  const currentScreenshotHash = requiredHash(input.current.screenshotHash, "current screenshot");
  const screenshotSimilarity = approvedScreenshotHash === currentScreenshotHash ? 1 : similarity(input.screenshotSimilarity, "screenshot");
  return {
    failureCode: input.failureCode,
    approved: {
      path: normalizedPath(input.approved.url),
      accessibleTreeHash: requiredHash(input.approved.accessibleTreeHash, "approved accessibility tree"),
      domStructureHash: requiredHash(input.approved.domStructureHash, "approved DOM structure"),
      screenshotHash: approvedScreenshotHash
    },
    current: {
      path: normalizedPath(input.current.url),
      accessibleTreeHash: requiredHash(input.current.accessibleTreeHash, "current accessibility tree"),
      domStructureHash: requiredHash(input.current.domStructureHash, "current DOM structure"),
      screenshotHash: currentScreenshotHash
    },
    accessibilitySimilarity: accessibilitySimilarity(input.approved, input.current),
    screenshotSimilarity
  };
}

function accessibilitySimilarity(left: RenderedPageEvidence, right: RenderedPageEvidence): number {
  if (!left.controls.length && !right.controls.length) return 1;
  const directed = (source: RenderedPageEvidence["controls"], target: RenderedPageEvidence["controls"]) => source.reduce((sum, control) => {
    const matches = target.filter((candidate) => candidate.role === control.role && compatibleDestination(control.destinationPath, candidate.destinationPath));
    const best = Math.max(0, ...matches.map((candidate) => 0.5 + tokenJaccard(control.name, candidate.name) * 0.5));
    return sum + best;
  }, 0) / Math.max(1, source.length);
  return (directed(left.controls, right.controls) + directed(right.controls, left.controls)) / 2;
}

function tokenJaccard(leftValue: string, rightValue: string): number {
  const left = new Set(normalizedText(leftValue).split(" ").filter(Boolean));
  const right = new Set(normalizedText(rightValue).split(" ").filter(Boolean));
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function compatibleDestination(left: string | undefined, right: string | undefined): boolean {
  return left === undefined || right === undefined || normalizedPath(left) === normalizedPath(right);
}

function similarity(value: number | undefined, label: string): number {
  if (!Number.isFinite(value) || value === undefined || value < 0 || value > 1) throw new Error(`A safe ${label} similarity score is required when fingerprints differ.`);
  return value;
}

function requiredHash(value: string | undefined, label: string): string {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`The ${label} hash is invalid.`);
  return value;
}

function normalizedPath(value: string): string { return new URL(value, "https://capture.invalid").pathname; }
function normalizedText(value: string): string { return value.trim().replace(/\s+/g, " ").toLowerCase(); }
