import { createHash } from "node:crypto";
import type { PlaywrightCaptureExecutorInput, PlaywrightCaptureResult } from "./playwrightCaptureExecutor";
import type { CaptureBrowserRuntime } from "./captureRunWorker";
import { stableSerialize, verifyCompiledFlowPlan } from "./productFlowCompiler";

export interface IsolatedCaptureManifest {
  schemaVersion: "1";
  executionId: string;
  workspaceId: string;
  plan: PlaywrightCaptureExecutorInput["plan"];
  policy: PlaywrightCaptureExecutorInput["policy"];
  fixtureValues: Record<string, string>;
  recordVideo: boolean;
  viewport: { width: number; height: number };
  outputHandle: string;
  manifestHash: string;
}

export interface IsolatedCaptureClient {
  isolation: "container" | "microvm";
  execute(manifest: IsolatedCaptureManifest): Promise<PlaywrightCaptureResult>;
}

export function createIsolatedCaptureRuntime(client: IsolatedCaptureClient): CaptureBrowserRuntime {
  return {
    isolation: client.isolation,
    async execute(input) {
      verifyCompiledFlowPlan(input.plan);
      if (Object.keys(input.fixtureValues).some((key) => /password|secret|token|credential|cookie/i.test(key))) {
        throw new Error("Fixture values must not contain credential-like fields.");
      }
      const withoutHash = {
        schemaVersion: "1" as const,
        executionId: input.id,
        workspaceId: input.workspaceId,
        plan: structuredClone(input.plan),
        policy: structuredClone(input.policy),
        fixtureValues: structuredClone(input.fixtureValues),
        recordVideo: input.recordVideo,
        viewport: input.viewport ?? { width: 1440, height: 900 },
        outputHandle: `capture-output:${input.id}`
      };
      const manifest: IsolatedCaptureManifest = { ...withoutHash, manifestHash: sha256(stableSerialize(withoutHash)) };
      const result = await client.execute(manifest);
      if (result.receipt.compiledPlanHash !== input.plan.compiledPlanHash || result.receipt.workspaceId !== input.workspaceId) {
        throw new Error("Isolated capture receipt does not match the submitted manifest.");
      }
      if (input.recordVideo && result.receipt.status === "verified" && !result.rawCapture) {
        throw new Error("Isolated capture did not return a recording artifact.");
      }
      return result;
    }
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
