import { describe, expect, it } from "vitest";
import { auditRobotPerformance, parseCtaPolicy, parseEvidenceBindings } from "./gideonRobotV6";

describe("Gideon V6 robot contracts", () => {
  it("fails closed on unsupported CTA delivery promises", () => {
    expect(() => parseCtaPolicy({ actionCount: 1, text: "Comment SOLOMON and I'll send you the demo", destination: "platform_follow", destinationVerified: true, publicUrlImplied: false, deliveryPromised: false })).toThrow(/delivery path/);
  });

  it("fails closed when evidence leaves the approved source region", () => {
    expect(() => parseEvidenceBindings(Array.from({ length: 4 }, (_, index) => ({
      claimId: `c${index}`, claim: "claim", assetId: "jobs", sourceSha256: "a".repeat(64),
      verifiedInterval: { startMs: 0, endMs: 1000 }, visibleRegion: { x: 0.9, y: 0, width: 0.2, height: 0.2 }, approved: true
    })))).toThrow(/inside the source/);
  });

  it("reports insufficient robot performance variety", () => {
    const performance = { emotion: "focused", gaze: "camera", gesture: "neutral", framing: "medium", speechState: "medium", energy: 0.5, lean: 0, headTurn: 0, gestureLeadFrames: 3, gazeLeadFrames: 2, semantic: true } as const;
    expect(auditRobotPerformance([{ id: "one", kind: "presenter", performance }]).passed).toBe(false);
  });
});
