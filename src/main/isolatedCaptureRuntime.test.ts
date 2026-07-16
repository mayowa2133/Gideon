import { describe, expect, it } from "vitest";
import { createFlowExecutionReceipt } from "../shared/productFlowCapture";
import { createIsolatedCaptureRuntime, type IsolatedCaptureManifest } from "./isolatedCaptureRuntime";
import { compileProductFlow } from "./productFlowCompiler";
import { browserPolicyForEnvironment } from "./captureService";
import { captureMaskingPolicyHash, defaultCaptureMaskingPolicy } from "./captureMasking";

describe("isolated capture runtime boundary", () => {
  it("sends a hashed declarative manifest with no secret callbacks", async () => {
    let manifest: IsolatedCaptureManifest | undefined;
    const grants: string[] = [];
    const plan = compiledPlan();
    const imageDigest = `sha256:${"d".repeat(64)}` as const;
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: imageDigest, async prepareFixtureGrant(input) { grants.push(`prepare:${input.values.project_name}`); return { grantId: "fixture:grant-1" }; }, async revokeFixtureGrant(input) { grants.push(`revoke:${input.grantId}`); }, async execute(input) { manifest = input; return { result: { receipt: receipt(plan), maskingReceipt: maskingReceipt(), networkReceipts: [] }, attestation: attestation(input, "container", imageDigest) }; } });
    await runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { project_name: "Demo" }, outputDir: "/ignored", recordVideo: false, capturePacing: { afterActionMs: 750 }, capturePresentation: { showPointer: true, pointerMoveMs: 300, typingDelayMs: 35 } });
    expect(manifest).toMatchObject({ schemaVersion: "1", outputHandle: "capture-output:execution-1", fixtureGrantId: "fixture:grant-1", fixtureKeys: ["project_name"], capturePacing: { afterActionMs: 750 }, capturePresentation: { showPointer: true, pointerMoveMs: 300, typingDelayMs: 35 }, maskingPolicy: { categories: ["password", "token", "payment", "email", "personal_data", "canvas"] }, manifestHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(manifest)).not.toContain("useCredential");
    expect(JSON.stringify(manifest)).not.toContain("Demo");
    expect(grants).toEqual(["prepare:Demo", "revoke:fixture:grant-1"]);
  });

  it("rejects credential-like fixture keys before remote execution", async () => {
    const plan = compiledPlan();
    const runtime = createIsolatedCaptureRuntime({ isolation: "microvm", expectedImageDigest: `sha256:${"d".repeat(64)}`, async execute() { throw new Error("must not call"); } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { password: "bad" }, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("credential-like");
  });

  it("requires opaque fixture grants and revokes staged fixture data after worker failure", async () => {
    const plan = compiledPlan();
    const revoked: string[] = [];
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: `sha256:${"d".repeat(64)}`, async prepareFixtureGrant() { return { grantId: "fixture:temporary-1" }; }, async revokeFixtureGrant(input) { revoked.push(input.grantId); }, async execute() { throw new Error("worker unavailable"); } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { project_name: "Demo" }, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("worker unavailable");
    expect(revoked).toEqual(["fixture:temporary-1"]);

    const unsafe = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: `sha256:${"d".repeat(64)}`, async prepareFixtureGrant() { return { grantId: "fixture:token-secret" }; }, async revokeFixtureGrant() {}, async execute() { throw new Error("must not execute"); } });
    await expect(unsafe.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: { project_name: "Demo" }, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("fixture grant is invalid");
  });

  it("rejects a response that is not tied to the submitted manifest and pinned image", async () => {
    const plan = compiledPlan();
    const imageDigest = `sha256:${"d".repeat(64)}` as const;
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: imageDigest, async execute(input) { return { result: { receipt: receipt(plan), maskingReceipt: maskingReceipt(), networkReceipts: [] }, attestation: { ...attestation(input, "container", imageDigest), manifestHash: "a".repeat(64) } }; } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: {}, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("attestation does not match");
  });

  it("revalidates visual evidence returned by the untrusted worker", async () => {
    const plan = compiledPlan();
    const imageDigest = `sha256:${"d".repeat(64)}` as const;
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: imageDigest, async execute(input) {
      const remoteReceipt = receipt(plan);
      remoteReceipt.steps[0]!.visualEvidence = { schemaVersion: "1", viewport: { width: 960, height: 600, scrollX: 0, scrollY: 0 }, actionTarget: { x: 950, y: 0, width: 50, height: 10 } };
      return { result: { receipt: remoteReceipt, maskingReceipt: maskingReceipt(), networkReceipts: [] }, attestation: attestation(input, "container", imageDigest) };
    } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: {}, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("outside the viewport");
  });

  it("rejects missing or mismatched remote masking evidence", async () => {
    const plan = compiledPlan();
    const imageDigest = `sha256:${"d".repeat(64)}` as const;
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: imageDigest, async execute(input) { return { result: { receipt: receipt(plan), maskingReceipt: { ...maskingReceipt(), policyHash: "a".repeat(64) }, networkReceipts: [] }, attestation: attestation(input, "container", imageDigest) }; } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: {}, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("masking receipt is invalid");
  });

  it("rejects sensitive values returned inside an untrusted worker receipt", async () => {
    const plan = compiledPlan();
    const imageDigest = `sha256:${"d".repeat(64)}` as const;
    const runtime = createIsolatedCaptureRuntime({ isolation: "container", expectedImageDigest: imageDigest, async execute(input) {
      const privateReceipt = receipt(plan);
      privateReceipt.finalAssertions[0]!.assertion = { type: "text", target: { strategy: "text", value: "founder@example.test" }, value: "founder@example.test" };
      return { result: { receipt: privateReceipt, maskingReceipt: maskingReceipt(), networkReceipts: [] }, attestation: attestation(input, "container", imageDigest) };
    } });
    await expect(runtime.execute({ id: "execution-1", workspaceId: "workspace-1", plan, policy: policy(), fixtureValues: {}, outputDir: "/ignored", recordVideo: false })).rejects.toThrow("sensitive-shaped data");
  });
});

function policy() { return browserPolicyForEnvironment({ id: "environment-1", workspaceId: "workspace-1", projectId: "project-1", name: "Demo", type: "staging", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: "version-1", createdAt: "2026-07-14T10:00:00.000Z", updatedAt: "2026-07-14T10:00:00.000Z" }); }
function compiledPlan() { return compileProductFlow({ schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Projects", goal: "Open projects.", startingState: { entryPath: "/" }, steps: [{ id: "step-1", intent: "Open projects.", action: { type: "navigate", path: "/projects" }, riskClass: "navigate" }], finalAssertions: [{ type: "url", path: "/projects" }], approval: { status: "approved", approvedBy: "user-1", approvedAt: "2026-07-14T10:00:00.000Z", approvedRevision: 2 }, sourceEvidenceIds: ["goal-1"] }, policy()); }
function receipt(plan: ReturnType<typeof compiledPlan>) { return createFlowExecutionReceipt({ id: "receipt-1", workspaceId: "workspace-1", projectId: "project-1", flowId: plan.flowId, flowRevision: plan.flowRevision, environmentVersionId: plan.environmentVersionId, compiledPlanHash: plan.compiledPlanHash, steps: [{ stepId: "step-1", status: "succeeded", policyDecision: plan.steps[0]!.policyDecision, assertions: [], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z" }], finalAssertions: [{ assertion: { type: "url", path: "/projects" }, passed: true, safeMessage: "passed" }], startedAt: "2026-07-14T10:00:00.000Z", completedAt: "2026-07-14T10:00:01.000Z" }); }
function attestation(manifest: IsolatedCaptureManifest, isolation: "container" | "microvm", imageDigest: `sha256:${string}`) { return { schemaVersion: "1" as const, manifestHash: manifest.manifestHash, isolation, runtimeInstanceId: "worker-1", imageDigest, completedAt: "2026-07-14T10:00:01.000Z" }; }
function maskingReceipt() { return { schemaVersion: "1" as const, policyHash: captureMaskingPolicyHash(defaultCaptureMaskingPolicy()), frameCount: 1, matchedElementCount: 0, visibleSensitiveElementCount: 0, overlayCount: 0, canvasCount: 0, hiddenSensitiveElementCount: 0, status: "active" as const }; }
