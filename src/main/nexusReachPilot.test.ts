import { describe, expect, it } from "vitest";
import { parseProductFlowRevision } from "../shared/productFlowCapture";
import { createNexusReachOnboardingScenario } from "./nexusReachPilot";
import { importTestScenarioFlows } from "./testScenarioImport";

describe("NexusReach local capture pilot", () => {
  it("imports only the approved synthetic onboarding workflow", () => {
    const scenario = createNexusReachOnboardingScenario();
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
  });

  it("does not include discovery, outreach, export, deletion, or production actions", () => {
    const serialized = JSON.stringify(createNexusReachOnboardingScenario()).toLowerCase();
    for (const forbidden of ["start discovery", "send outreach", "export", "delete", "production"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
