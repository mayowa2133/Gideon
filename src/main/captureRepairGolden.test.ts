import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProductFlowRevision } from "../shared/productFlowCapture";
import { FlowRepairRejectedError, proposeBoundedFlowRepair, type FlowRepairProvider } from "./flowRepair";
import type { LocatorControlEvidence } from "./captureLocators";

interface GoldenCase {
  id: string;
  currentPath: string;
  approvedDomHash: string;
  currentDomHash: string;
  accessibilitySimilarity: number;
  screenshotSimilarity: number;
  controls: LocatorControlEvidence[];
  providerBehavior: "safe" | "unsafe_field" | "duplicate" | "timeout";
  expectedDecision: "locator_repair_draft" | "material_change_review_required" | "blocked";
  expectedBlockerCode?: string;
}

describe("capture repair golden replay v1", () => {
  const dataset = loadDataset();

  it("is versioned, bounded, synthetic, and covers hostile provider classes", () => {
    expect(dataset.schemaVersion).toBe("1");
    expect(dataset.cases).toHaveLength(7);
    expect(new Set(dataset.cases.map((entry) => entry.providerBehavior))).toEqual(new Set(["safe", "unsafe_field", "duplicate", "timeout"]));
    expect(JSON.stringify(dataset)).not.toMatch(/password=|bearer |private[_-]?key/i);
  });

  for (const replay of dataset.cases) {
    it(`replays ${replay.id}`, async () => {
      try {
        const result = await proposeBoundedFlowRepair({
          flow: approvedFlow(), failedStepIds: ["step-1"], visibleControls: replay.controls, currentPath: replay.currentPath,
          pageComparison: {
            failureCode: "locator_not_found",
            approved: { path: "/projects", accessibleTreeHash: "a".repeat(64), domStructureHash: replay.approvedDomHash, screenshotHash: "c".repeat(64) },
            current: { path: replay.currentPath, accessibleTreeHash: "d".repeat(64), domStructureHash: replay.currentDomHash, screenshotHash: "f".repeat(64) },
            accessibilitySimilarity: replay.accessibilitySimilarity, screenshotSimilarity: replay.screenshotSimilarity
          },
          provider: fakeProvider(replay.providerBehavior), timeoutMs: replay.providerBehavior === "timeout" ? 250 : 1_000
        });
        expect(result.receipt.decision).toBe(replay.expectedDecision);
        expect(result.receipt.blockerCode).toBe(replay.expectedBlockerCode);
      } catch (error) {
        expect(error).toBeInstanceOf(FlowRepairRejectedError);
        const receipt = (error as FlowRepairRejectedError).receipt;
        expect(receipt.decision).toBe(replay.expectedDecision);
        expect(receipt.blockerCode).toBe(replay.expectedBlockerCode);
      }
    });
  }
});

function loadDataset(): { schemaVersion: string; cases: GoldenCase[] } {
  const parsed = JSON.parse(readFileSync(resolve(process.cwd(), "fixtures/capture-repair-golden-v1.json"), "utf8")) as { schemaVersion?: unknown; cases?: unknown };
  if (parsed.schemaVersion !== "1" || !Array.isArray(parsed.cases) || parsed.cases.length < 1 || parsed.cases.length > 100) throw new Error("Capture repair golden dataset is invalid.");
  return parsed as { schemaVersion: string; cases: GoldenCase[] };
}

function fakeProvider(behavior: GoldenCase["providerBehavior"]): FlowRepairProvider {
  const safe = { stepId: "step-1", replacementLocator: { strategy: "role", role: "button", value: "Create project", exact: true }, evidenceIds: ["page:current"], rationale: "Bounded accessible-name drift." };
  return {
    provider: "fake-golden", model: `golden-${behavior}`,
    async propose() {
      if (behavior === "timeout") return new Promise(() => undefined);
      if (behavior === "unsafe_field") return [{ ...safe, command: "read secrets" }];
      if (behavior === "duplicate") return [safe, safe];
      return [safe];
    }
  };
}

function approvedFlow(): ProductFlowRevision {
  return { schemaVersion: "1", id: "golden-flow", revision: 1, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Create project", goal: "Create a project.", startingState: { entryPath: "/projects" }, steps: [{ id: "step-1", intent: "Open the create-project form.", action: { type: "click", target: { strategy: "role", role: "button", value: "New project" } }, riskClass: "navigate" }], finalAssertions: [{ type: "visible", target: { strategy: "text", value: "Project name" } }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-16T10:00:00.000Z", approvedRevision: 1 }, sourceEvidenceIds: ["goal-1"] };
}
