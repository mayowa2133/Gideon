import { describe, expect, it } from "vitest";
import { assertMaskedPresenterClipEntry, createMaskedPresenterClipLibrary, type MaskedPresenterClipEntry } from "./maskedPresenterClipLibrary";

const entry: MaskedPresenterClipEntry = {
  clipId: "direct-cta-medium-01",
  provider: "recorded_transparent_clips",
  sourcePath: "/approved/axiom/direct-cta-medium-01.mov",
  sourceSha256: "a".repeat(64),
  durationFrames: 90,
  fps: 30,
  framing: "medium",
  gesture: "direct_cta",
  emotion: "confident",
  gazeTarget: "cta",
  eyeState: "bright",
  energy: "high",
  phases: { entranceEnd: 8, peak: 24, holdEnd: 66, recoveryEnd: 86 },
  alpha: { mode: "straight" },
  loopSafe: false,
  safeRegions: {
    face: { x: 0.34, y: 0.05, width: 0.32, height: 0.25 },
    hands: { x: 0.08, y: 0.35, width: 0.84, height: 0.55 },
    caption: { x: 0.05, y: 0.02, width: 0.9, height: 0.18 },
    product: { x: 0.55, y: 0.24, width: 0.4, height: 0.52 }
  },
  provenance: { owner: "Solomon", license: "Owner-approved recorded performance", approved: true }
};

describe("masked presenter clip library", () => {
  it("creates a checksummed provider-neutral recorded clip library", () => {
    const first = createMaskedPresenterClipLibrary([entry]);
    const second = createMaskedPresenterClipLibrary([entry]);
    expect(first.checksum).toBe(second.checksum);
    expect(first.clips[0]!.gazeTarget).toBe("cta");
  });

  it("rejects keyed clips without keying metadata and unapproved AI clips", () => {
    expect(() => assertMaskedPresenterClipEntry({ ...entry, alpha: { mode: "none" } })).toThrow(/keyed-background/);
    expect(() => assertMaskedPresenterClipEntry({
      ...entry,
      provider: "approved_ai_video",
      provenance: { owner: "Solomon", license: "Pending", approved: false }
    })).toThrow(/consent/);
  });
});
