import { describe, expect, it } from "vitest";
import type { RenderedPageEvidence } from "./flowDiscovery";
import { createSafeRepairPageComparison } from "./capturePageComparison";

describe("safe capture page comparison", () => {
  it("compares bounded accessibility signatures and local screenshot scores", () => {
    const result = createSafeRepairPageComparison({
      failureCode: "locator_not_found",
      approved: page("a", ["Projects", "New project"]),
      current: page("b", ["Projects", "Create project"]),
      screenshotSimilarity: 0.91
    });
    expect(result.accessibilitySimilarity).toBeCloseTo(5 / 6);
    expect(result).toMatchObject({ screenshotSimilarity: 0.91, approved: { path: "/projects" }, current: { path: "/projects" } });
    expect(result).not.toHaveProperty("approved.controls");
  });

  it("uses exact screenshot equality without requiring pixels or a supplied score", () => {
    const approved = page("a", ["Projects"]);
    expect(createSafeRepairPageComparison({ failureCode: "locator_not_visible", approved, current: structuredClone(approved) }).screenshotSimilarity).toBe(1);
  });

  it("fails closed when changed screenshots lack a runtime-computed score", () => {
    expect(() => createSafeRepairPageComparison({ failureCode: "locator_ambiguous", approved: page("a", []), current: page("b", []) })).toThrow("similarity score is required");
  });
});

function page(screenshot: string, names: string[]): RenderedPageEvidence {
  return { id: `page-${screenshot}`, url: "/projects?secret=removed", title: "Projects", controls: names.map((name) => ({ role: "button", name })), accessibleTreeHash: "a".repeat(64), domStructureHash: "b".repeat(64), screenshotHash: screenshot.repeat(64) };
}
