import { describe, expect, it } from "vitest";
import { assertCapturePilotAdapters } from "./capturePilotManifest";
import { createSignalDraftPilotAdapters, loadSignalDraftPilotManifest, parseSignalDraftPilotArguments } from "./signalDraftPilot";

describe("SignalDraft local capture pilot", () => {
  it("registers two review-safe workflows against a second real product", async () => {
    const manifest = await loadSignalDraftPilotManifest();
    expect(manifest.repository.rootDir).toBe("/Users/mayowaadesanya/Documents/Projects/SignalDraft");
    expect(manifest.workflows.map((workflow) => workflow.id)).toEqual(["analyze-recruiter-outreach", "review-sensitive-compensation"]);
    expect(() => assertCapturePilotAdapters(manifest, createSignalDraftPilotAdapters())).not.toThrow();
  });

  it("never declares approval, rejection, mock-send, or external navigation actions", async () => {
    const manifest = await loadSignalDraftPilotManifest();
    const mutatingActions = manifest.workflows.flatMap((workflow) => workflow.scenario.steps.map((step) => step.action)).filter((action) => action.type !== "wait_for");
    const serialized = JSON.stringify(mutatingActions).toLowerCase();
    for (const forbidden of ["approve draft", "reject draft", "mock-send", "mock send", "http://", "https://"]) expect(serialized).not.toContain(forbidden);
    expect(manifest.workflows.flatMap((workflow) => workflow.scenario.steps).every((step) => ["observe", "synthetic_write"].includes(step.riskClass))).toBe(true);
  });

  it("parses explicit targeted workflow retries only", () => {
    expect(parseSignalDraftPilotArguments([])).toEqual({});
    expect(parseSignalDraftPilotArguments(["--", "--workflow", "review-sensitive-compensation"])).toEqual({ workflowIds: ["review-sensitive-compensation"] });
    expect(() => parseSignalDraftPilotArguments(["--workflow"])).toThrow("requires a registered workflow id");
    expect(() => parseSignalDraftPilotArguments(["--all"])).toThrow("Unsupported capture pilot argument");
  });
});
