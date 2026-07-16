import { createHash } from "node:crypto";
import { assertFlowStepVisualEvidence } from "../shared/productFlowCapture";
import type { PlaywrightCaptureExecutorInput, PlaywrightCaptureResult } from "./playwrightCaptureExecutor";
import { assertCaptureMaskingReceipt, validateCaptureMaskingPolicy, type CaptureMaskingPolicy } from "./captureMasking";
import type { CaptureBrowserRuntime } from "./captureRunWorker";
import { stableSerialize, verifyCompiledFlowPlan } from "./productFlowCompiler";
import { assertCaptureEvidenceIsRedacted } from "./captureSupportBundle";

export interface IsolatedCaptureManifest {
  schemaVersion: "1";
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
  manifestHash: string;
}

export interface IsolatedCaptureClient {
  isolation: "container" | "microvm";
  expectedImageDigest: `sha256:${string}`;
  prepareFixtureGrant?(input: { executionId: string; workspaceId: string; values: Readonly<Record<string, string>> }): Promise<{ grantId: string }>;
  revokeFixtureGrant?(input: { executionId: string; workspaceId: string; grantId: string }): Promise<void>;
  execute(manifest: IsolatedCaptureManifest): Promise<{
    result: PlaywrightCaptureResult;
    attestation: {
      schemaVersion: "1";
      manifestHash: string;
      isolation: "container" | "microvm";
      runtimeInstanceId: string;
      imageDigest: `sha256:${string}`;
      completedAt: string;
    };
  }>;
}

export function createIsolatedCaptureRuntime(client: IsolatedCaptureClient): CaptureBrowserRuntime {
  assertImageDigest(client.expectedImageDigest);
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
        schemaVersion: "1" as const,
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
        outputHandle: `capture-output:${input.id}`
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

function assertOpaqueFixtureGrant(value: string): string {
  if (typeof value !== "string" || !/^fixture:[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value) || /password|secret|token|credential|cookie/i.test(value)) throw new Error("Isolated capture fixture grant is invalid.");
  return value;
}

function assertAttestation(attestation: Awaited<ReturnType<IsolatedCaptureClient["execute"]>>["attestation"], manifest: IsolatedCaptureManifest, client: IsolatedCaptureClient): void {
  if (attestation.schemaVersion !== "1" || attestation.manifestHash !== manifest.manifestHash) throw new Error("Isolated capture attestation does not match the submitted manifest.");
  if (attestation.isolation !== client.isolation || attestation.imageDigest !== client.expectedImageDigest) throw new Error("Isolated capture attestation does not match the pinned runtime.");
  if (!/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(attestation.runtimeInstanceId) || !Number.isFinite(Date.parse(attestation.completedAt))) throw new Error("Isolated capture attestation is invalid.");
  assertImageDigest(attestation.imageDigest);
}

function assertImageDigest(value: string): asserts value is `sha256:${string}` {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Isolated capture runtime image digest must be a pinned SHA-256 digest.");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
