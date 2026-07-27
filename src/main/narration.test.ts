import { describe, expect, it } from "vitest";
import { assertNarrationRequest, narrationCacheKey, prepareNarrationText } from "./narration";

const base = {
  outputDir: "/tmp/narration",
  beats: [{ id: "hook", approvedText: "Meet Solomon", startMs: 0, endMs: 2_000, energy: "high" as const }],
  language: "en" as const,
  voice: { mode: "model_default" as const },
  seed: 7
};

describe("narration contract", () => {
  it("preserves approved text while preparing deterministic punctuation", () => {
    expect(prepareNarrationText("  Meet   Solomon  ", "medium")).toBe("Meet Solomon.");
    expect(base.beats[0]?.approvedText).toBe("Meet Solomon");
  });
  it("requires matching consent for reference voices", () => {
    expect(() => assertNarrationRequest(base)).not.toThrow();
    expect(() => assertNarrationRequest({ ...base, voice: { mode: "approved_reference", referencePath: "/tmp/ref.wav", referenceSha256: "a" } })).toThrow(/consent/i);
  });
  it("changes content keys when inference inputs change", () => {
    const common = { provider: "chatterbox_local" as const, providerVersion: "1", model: "turbo", device: "mps" as const, seed: 7, beatId: "hook", preparedText: "Meet Solomon.", voice: base.voice };
    expect(narrationCacheKey(common)).not.toBe(narrationCacheKey({ ...common, seed: 8 }));
  });
});
