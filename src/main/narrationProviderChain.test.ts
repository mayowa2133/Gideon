import { describe, expect, it } from "vitest";
import { NarrationProviderChain } from "./narrationProviderChain";
import type { NarrationProvider, NarrationRequest, NarrationResult } from "./narration";

const request: NarrationRequest = { outputDir: "/tmp/x", beats: [{ id: "x", approvedText: "x", startMs: 0, endMs: 1_000, energy: "low" }], language: "en", voice: { mode: "model_default" }, seed: 1 };
function provider(kind: "chatterbox_local" | "macos_say", fail = false): NarrationProvider {
  return { kind, providerVersion: "1", isAvailable: async () => true, synthesize: async () => {
    if (fail) throw new Error("failed");
    return { provider: kind, beats: [], provenance: { schemaVersion: "1", provider: kind, providerVersion: "1", model: "x", device: kind === "macos_say" ? "macos" : "cpu", seed: 1, voiceMode: "model_default", generatedAt: "now", watermark: "none" } } satisfies NarrationResult;
  } };
}
describe("narration provider chain", () => {
  it("records an explicit fallback", async () => {
    const result = await new NarrationProviderChain(provider("chatterbox_local", true), provider("macos_say")).synthesize(request);
    expect(result.provider).toBe("macos_say");
    expect(result.provenance.fallbackFrom).toBe("chatterbox_local");
  });
});
