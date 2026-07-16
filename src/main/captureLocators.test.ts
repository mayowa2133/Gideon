import { describe, expect, it } from "vitest";
import { assessLocatorAgainstInventory, rankDurableLocatorCandidates, selectDurableLocator, type LocatorControlEvidence } from "./captureLocators";

describe("durable capture locators", () => {
  it("prefers an associated label and preserves stable accessible fallbacks", () => {
    const control: LocatorControlEvidence = { role: "textbox", name: "Project name", label: "Project name", testId: "project-name", placeholder: "Name" };
    const ranked = rankDurableLocatorCandidates(control, [control]);
    expect(ranked.map((candidate) => candidate.locator.strategy)).toEqual(["label", "role", "test_id", "placeholder", "text"]);
    expect(ranked.every((candidate) => candidate.status === "unique")).toBe(true);
  });

  it("uses stable link destinations and landmark structure to resolve duplicate names", () => {
    const controls: LocatorControlEvidence[] = [
      { role: "link", name: "Settings", destinationPath: "/personal/settings", scopeRole: "navigation", scopeName: "Personal" },
      { role: "link", name: "Settings", destinationPath: "/workspace/settings", scopeRole: "navigation", scopeName: "Workspace" }
    ];
    const selected = selectDurableLocator(controls[1]!, controls);
    expect(selected).toMatchObject({ locator: { strategy: "stable_link", destinationPath: "/workspace/settings" }, status: "unique" });
    expect(assessLocatorAgainstInventory({ strategy: "role", role: "link", value: "Settings", exact: true }, controls)).toEqual({ matchCount: 2, status: "ambiguous" });
  });

  it("rejects inventories with no unique durable candidate", () => {
    const target: LocatorControlEvidence = { role: "button", name: "Continue" };
    expect(() => selectDurableLocator(target, [target, { ...target }])).toThrow("No unambiguous durable locator");
  });
});
