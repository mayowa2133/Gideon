import { describe, expect, it } from "vitest";
import { parseProductFlowRevision } from "../shared/productFlowCapture";
import { createNexusReachPilotAdapters, loadNexusReachPilotManifest } from "./nexusReachPilot";
import { assertCapturePilotAdapters } from "./capturePilotManifest";
import { importTestScenarioFlows } from "./testScenarioImport";

describe("NexusReach local capture pilot", () => {
  it("imports only the approved synthetic onboarding workflow", async () => {
    const manifest = await loadNexusReachPilotManifest();
    const scenario = manifest.workflows[0]!.scenario;
    const [flow] = importTestScenarioFlows({
      projectId: "nexusreach-pilot",
      environmentVersionId: "local-version",
      personaId: "jordan-demo",
      scenarios: [scenario],
      makeId: () => "nexusreach-complete-onboarding"
    });

    expect(flow).toBeDefined();
    expect(scenario).toMatchObject({
      id: "complete-onboarding",
      entryPath: "/dashboard",
      sourcePath: "e2e/tests-real/onboarding-happy-path.spec.ts"
    });
    expect(flow?.approval.status).toBe("draft");
    expect(flow?.steps.at(-1)?.action).toEqual({ type: "wait_for", assertion: { type: "url", path: "/profile" } });
    expect(flow?.finalAssertions).toContainEqual({ type: "value", target: { strategy: "label", value: "Full Name" }, valueRef: "fixture:profile.full_name" });
    expect(() => parseProductFlowRevision(flow)).not.toThrow();
    expect(() => assertCapturePilotAdapters(manifest, createNexusReachPilotAdapters())).not.toThrow();
  });

  it("declares all five approved workflows without forbidden action targets", async () => {
    const manifest = await loadNexusReachPilotManifest();
    expect(manifest.workflows.map((workflow) => workflow.id)).toEqual(["complete-onboarding", "browse-filter-jobs", "review-saved-contacts", "update-job-tracker", "review-draft-outreach"]);
    const actions = manifest.workflows.flatMap((workflow) => workflow.scenario.steps.map((step) => step.action));
    const serializedTargets = actions.map((action) => JSON.stringify(action).toLowerCase());
    for (const forbidden of ["find people", "apply now", "get email", "verify email", "generate draft", "stage in gmail", "stage in outlook", "send", "delete", "oauth", "linkedin"]) {
      expect(serializedTargets.some((target) => target.includes(forbidden))).toBe(false);
    }
    expect(actions.filter((action) => action.type === "navigate").every((action) => action.type !== "navigate" || action.path.startsWith("/") && !action.path.startsWith("//"))).toBe(true);
  });
});
