import { createHash } from "node:crypto";
import { assertFlowStepVisualEvidence } from "../shared/productFlowCapture";
import type { PlaywrightCaptureExecutorInput, PlaywrightCaptureResult } from "./playwrightCaptureExecutor";
import { assertCaptureMaskingReceipt, validateCaptureMaskingPolicy, type CaptureMaskingPolicy } from "./captureMasking";
import type { CaptureBrowserRuntime } from "./captureRunWorker";
import { stableSerialize, verifyCompiledFlowPlan } from "./productFlowCompiler";
import { assertCaptureEvidenceIsRedacted } from "./captureSupportBundle";

export interface IsolatedCaptureManifest {
  schemaVersion: "2";
  executionId: string;
  workspaceId: string;
  plan: PlaywrightCaptureExecutorInput["plan"];
  policy: PlaywrightCaptureExecutorInput["policy"];
  fixtureGrantId: string;
  fixtureKeys: string[];
  recordVideo: boolean;
  viewport: { width: number; height: number };
  capturePacing?: PlaywrightCaptureExecutorInput["capturePacing"];
  capturePresentation?: PlaywrightCaptureExecutorInput["capturePresentation"];
  maskingPolicy: CaptureMaskingPolicy;
  outputHandle: string;
  runtimePolicyVersion: string;
  runtimePolicyHash: string;
  manifestHash: string;
}

export interface IsolatedCaptureAttestation {
  schemaVersion: "2";
  manifestHash: string;
  workspaceId: string;
  executionId: string;
  isolation: "container" | "microvm";
  runtimeInstanceId: string;
  imageDigest: `sha256:${string}`;
  runtimePolicyVersion: string;
  runtimePolicyHash: string;
  startedAt: string;
  completedAt: string;
  terminalState: "succeeded" | "failed";
  cleanup: { browserProfile: "destroyed"; cookies: "destroyed"; clipboard: "cleared"; cache: "destroyed"; scratch: "destroyed"; runtimeInstance: "destroyed" };
}

export interface IsolatedCaptureClient {
  isolation: "container" | "microvm";
  expectedImageDigest: `sha256:${string}`;
  expectedRuntimePolicyVersion: string;
  expectedRuntimePolicyHash: string;
  prepareFixtureGrant?(input: { executionId: string; workspaceId: string; values: Readonly<Record<string, string>> }): Promise<{ grantId: string }>;
  revokeFixtureGrant?(input: { executionId: string; workspaceId: string; grantId: string }): Promise<void>;
  execute(manifest: IsolatedCaptureManifest): Promise<{
    result: PlaywrightCaptureResult;
    attestation: IsolatedCaptureAttestation;
  }>;
}

export function createIsolatedCaptureRuntime(client: IsolatedCaptureClient): CaptureBrowserRuntime {
  assertImageDigest(client.expectedImageDigest);
  assertPolicyIdentity(client.expectedRuntimePolicyVersion, client.expectedRuntimePolicyHash);
  return {
    isolation: client.isolation,
    async execute(input) {
      verifyCompiledFlowPlan(input.plan);
      const fixtureKeys = Object.keys(input.fixtureValues).sort();
      if (fixtureKeys.some((key) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(key) || /password|secret|token|credential|cookie/i.test(key))) {
        throw new Error("Fixture values must not contain credential-like fields.");
      }
      let fixtureGrantId = "fixture:none";
      let grantPrepared = false;
      if (fixtureKeys.length > 0) {
        if (!client.prepareFixtureGrant || !client.revokeFixtureGrant) throw new Error("Isolated capture fixture grants are not configured.");
        const grant = await client.prepareFixtureGrant({ executionId: input.id, workspaceId: input.workspaceId, values: Object.freeze(structuredClone(input.fixtureValues)) });
        fixtureGrantId = assertOpaqueFixtureGrant(grant.grantId);
        grantPrepared = true;
      }
      const withoutHash = {
        schemaVersion: "2" as const,
        executionId: input.id,
        workspaceId: input.workspaceId,
        plan: structuredClone(input.plan),
        policy: structuredClone(input.policy),
        fixtureGrantId,
        fixtureKeys,
        recordVideo: input.recordVideo,
        viewport: input.viewport ?? { width: 1440, height: 900 },
        capturePacing: input.capturePacing ? structuredClone(input.capturePacing) : undefined,
        capturePresentation: input.capturePresentation ? structuredClone(input.capturePresentation) : undefined,
        maskingPolicy: validateCaptureMaskingPolicy(input.maskingPolicy),
        outputHandle: `capture-output:${input.id}`,
        runtimePolicyVersion: client.expectedRuntimePolicyVersion,
        runtimePolicyHash: client.expectedRuntimePolicyHash
      };
      const manifest: IsolatedCaptureManifest = { ...withoutHash, manifestHash: sha256(stableSerialize(withoutHash)) };
      try {
        const response = await client.execute(manifest);
        assertAttestation(response.attestation, manifest, client);
        const result = response.result;
        assertCaptureEvidenceIsRedacted(result.receipt);
        assertCaptureEvidenceIsRedacted(result.networkReceipts);
        if (result.receipt.compiledPlanHash !== input.plan.compiledPlanHash || result.receipt.workspaceId !== input.workspaceId) {
          throw new Error("Isolated capture receipt does not match the submitted manifest.");
        }
        for (const step of result.receipt.steps) if (step.visualEvidence) assertFlowStepVisualEvidence(step.visualEvidence);
        assertCaptureMaskingReceipt(result.maskingReceipt, manifest.maskingPolicy);
        if (input.recordVideo && result.receipt.status === "verified" && !result.rawCapture) {
          throw new Error("Isolated capture did not return a recording artifact.");
        }
        return result;
      } finally {
        if (grantPrepared) await client.revokeFixtureGrant!({ executionId: input.id, workspaceId: input.workspaceId, grantId: fixtureGrantId });
      }
    }
  };
}

export function verifyIsolatedCaptureManifest(manifest: IsolatedCaptureManifest): void {
  if (!manifest || manifest.schemaVersion !== "2") throw new Error("Isolated capture manifest schema is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(manifest.executionId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(manifest.workspaceId)) throw new Error("Isolated capture manifest scope is invalid.");
  verifyCompiledFlowPlan(manifest.plan);
  validateCaptureMaskingPolicy(manifest.maskingPolicy);
  assertOpaqueFixtureGrant(manifest.fixtureGrantId);
  if (!Array.isArray(manifest.fixtureKeys) || manifest.fixtureKeys.length > 100 || manifest.fixtureKeys.some((key) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(key))) throw new Error("Isolated capture manifest fixture keys are invalid.");
  assertPolicyIdentity(manifest.runtimePolicyVersion, manifest.runtimePolicyHash);
  if (manifest.outputHandle !== `capture-output:${manifest.executionId}`) throw new Error("Isolated capture output handle is invalid.");
  const { manifestHash, ...withoutHash } = manifest;
  if (!/^[a-f0-9]{64}$/.test(manifestHash) || sha256(stableSerialize(withoutHash)) !== manifestHash) throw new Error("Isolated capture manifest hash is invalid.");
}

function assertOpaqueFixtureGrant(value: string): string {
  if (typeof value !== "string" || !/^fixture:[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value) || /password|secret|token|credential|cookie/i.test(value)) throw new Error("Isolated capture fixture grant is invalid.");
  return value;
}

function assertAttestation(attestation: Awaited<ReturnType<IsolatedCaptureClient["execute"]>>["attestation"], manifest: IsolatedCaptureManifest, client: IsolatedCaptureClient): void {
  if (attestation.schemaVersion !== "2" || attestation.manifestHash !== manifest.manifestHash || attestation.workspaceId !== manifest.workspaceId || attestation.executionId !== manifest.executionId) throw new Error("Isolated capture attestation does not match the submitted manifest.");
  if (attestation.isolation !== client.isolation || attestation.imageDigest !== client.expectedImageDigest) throw new Error("Isolated capture attestation does not match the pinned runtime.");
  if (attestation.runtimePolicyVersion !== client.expectedRuntimePolicyVersion || attestation.runtimePolicyHash !== client.expectedRuntimePolicyHash) throw new Error("Isolated capture attestation does not match the runtime policy.");
  if (!/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(attestation.runtimeInstanceId) || !Number.isFinite(Date.parse(attestation.startedAt)) || !Number.isFinite(Date.parse(attestation.completedAt)) || Date.parse(attestation.completedAt) < Date.parse(attestation.startedAt) || attestation.terminalState !== "succeeded") throw new Error("Isolated capture attestation is invalid.");
  if (!attestation.cleanup || Object.keys(attestation.cleanup).sort().join(",") !== "browserProfile,cache,clipboard,cookies,runtimeInstance,scratch" || Object.values(attestation.cleanup).some((status) => status !== "destroyed" && status !== "cleared")) throw new Error("Isolated capture runtime teardown is incomplete.");
  assertImageDigest(attestation.imageDigest);
}

function assertPolicyIdentity(version: string, hash: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(version) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Isolated capture runtime policy identity is invalid.");
}

function assertImageDigest(value: string): asserts value is `sha256:${string}` {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Isolated capture runtime image digest must be a pinned SHA-256 digest.");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
