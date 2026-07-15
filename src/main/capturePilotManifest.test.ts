import { describe, expect, it } from "vitest";
import { assertCapturePilotAdapters, parseCapturePilotManifest, type CapturePilotAdapterRegistry } from "./capturePilotManifest";

describe("capture pilot manifest", () => {
  it("parses a loopback-only manifest with declarative workflows", () => {
    const manifest = parseCapturePilotManifest(validManifest());
    expect(manifest.environment).toMatchObject({ type: "local_preview", baseUrl: "http://127.0.0.1:5173", allowedDomains: ["127.0.0.1"] });
    expect(manifest.workflows[0]).toMatchObject({ id: "complete-onboarding", goalId: "complete-onboarding", resetAdapterId: "nexusreach-onboarding" });
  });

  it.each([
    ["remote host", { environment: { ...validManifest().environment, baseUrl: "https://example.com", allowedDomains: ["example.com"] } }],
    ["production type", { environment: { ...validManifest().environment, type: "production_sandbox" } }],
    ["embedded credentials", { environment: { ...validManifest().environment, baseUrl: "http://user:password@127.0.0.1:5173" } }],
    ["domain drift", { environment: { ...validManifest().environment, allowedDomains: ["localhost"] } }],
    ["relative repository", { repository: { ...validManifest().repository, rootDir: "../NexusReach" } }],
    ["manifest command", { command: "rm -rf /" }]
  ])("rejects %s", (_label, patch) => {
    expect(() => parseCapturePilotManifest({ ...validManifest(), ...patch })).toThrow();
  });

  it("requires every executable boundary to be registered in trusted code", () => {
    const manifest = parseCapturePilotManifest(validManifest());
    const empty: CapturePilotAdapterRegistry = { startup: {}, reset: {}, verification: {} };
    expect(() => assertCapturePilotAdapters(manifest, empty)).toThrow("startup adapter");
    const registered: CapturePilotAdapterRegistry = {
      startup: { "nexusreach-demo": { approvedRepositoryRoot: "/Users/mayowaadesanya/Documents/Projects/NexusReach", approvedBaseUrl: "http://127.0.0.1:5173", async assertReady() {} } },
      reset: { "nexusreach-onboarding": { async reset() {} } },
      verification: { "nexusreach-onboarding": { async verify() { return {}; } } }
    };
    expect(() => assertCapturePilotAdapters(manifest, registered)).not.toThrow();
  });

  it("rejects unsafe or ambiguous framing configuration", () => {
    const value = validManifest();
    expect(() => parseCapturePilotManifest({ ...value, presentation: { ...value.presentation, verticalOutput: { ...value.presentation.verticalOutput, framing: { mode: "automatic_focus", maxZoom: 3, transitionMs: 650 } } } })).toThrow("maxZoom");
    expect(() => parseCapturePilotManifest({ ...value, presentation: { ...value.presentation, verticalOutput: { ...value.presentation.verticalOutput, framing: { mode: "manual", maxZoom: 1.5, transitionMs: 0, manualFocus: { x: 0.8, y: 0, width: 0.3, height: 1 } } } } })).toThrow("inside the normalized frame");
  });
});

function validManifest() {
  return {
    schemaVersion: "1",
    key: "nexusreach",
    workspaceId: "local-workspace",
    projectId: "nexusreach-pilot",
    name: "NexusReach capture pilot",
    artifactDirectoryName: "nexusreach",
    repository: { rootDir: "/Users/mayowaadesanya/Documents/Projects/NexusReach", maxFiles: 2_000, maxBytes: 10_000_000 },
    environment: { name: "NexusReach safe demo", type: "local_preview", baseUrl: "http://127.0.0.1:5173", allowedDomains: ["127.0.0.1"], startupAdapterId: "nexusreach-demo" },
    persona: { key: "jordan-demo", displayName: "Jordan Demo", roleDescription: "Synthetic job seeker.", fixtureProfileId: "nexusreach:onboarding", fixtureValues: { "profile.full_name": "Jordan Demo" } },
    presentation: { viewport: { width: 1440, height: 900 }, initialHoldMs: 1500, beforeActionMs: 450, afterActionMs: 900, finalHoldMs: 2000, showPointer: true, pointerMoveMs: 350, typingDelayMs: 45, verticalOutput: { enabled: true, narration: "none", framing: { mode: "automatic_focus", maxZoom: 1.6, transitionMs: 650 }, quality: { minimumSourceTextPx: 12 } } },
    workflows: [{
      id: "complete-onboarding", goalId: "complete-onboarding", resetAdapterId: "nexusreach-onboarding", verificationAdapterId: "nexusreach-onboarding",
      scenario: { id: "complete-onboarding", framework: "playwright", title: "Complete onboarding", entryPath: "/dashboard", sourcePath: "e2e/onboarding.spec.ts", steps: [{ intent: "Wait for dashboard.", action: { type: "wait_for", assertion: { type: "url", path: "/dashboard" } }, riskClass: "observe" }], finalAssertions: [{ type: "url", path: "/dashboard" }] }
    }]
  };
}
