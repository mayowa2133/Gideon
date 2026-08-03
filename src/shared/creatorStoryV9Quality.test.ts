import { describe, expect, it } from "vitest";
import { auditV9Composite, auditV9Cta, auditV9Hook, auditV9Layout, auditV9SemanticMotion, auditV9Transitions } from "./creatorStoryV9Quality";

describe("Creator Story V9 quality gates", () => {
  it("rejects robot/caption and robot/product collisions", () => {
    const report = auditV9Layout([
      { id: "robot", kind: "robot", left: .1, top: .5, right: .5, bottom: .9 },
      { id: "caption", kind: "caption", left: .2, top: .7, right: .8, bottom: .8 },
      { id: "proof", kind: "product_ocr", left: .4, top: .2, right: .9, bottom: .7 }
    ]);
    expect(report.passed).toBe(false);
    expect(report.collisionCount).toBe(2);
  });

  it("rejects a mismatched spoken and visible hook", () => {
    expect(auditV9Hook("This job just moved to interviewing.", "Your job search just changed.").passed).toBe(false);
    expect(auditV9Hook("This job just moved to interviewing.", "This job just moved to interviewing.").passed).toBe(true);
  });

  it("rejects occlusion, empty highlights, truncated messages, zeros, and masks over proof", () => {
    const report = auditV9Composite({
      cleanText: ["Senior Product Engineer", "Faire", "complete message"],
      composedText: ["Faire"],
      requiredText: ["Senior Product Engineer", "Faire"],
      highlightedRegions: [{ id: "reasoning", hasContent: false }],
      messageStartsAtBeginning: false,
      heroZeroValues: 1,
      privacyMaskOverPrimaryProof: true
    });
    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining(["required_text_occluded", "empty_highlight", "message_truncated", "hero_zero_value", "privacy_mask_over_proof"]));
  });

  it("does not let decorative motion satisfy semantic cadence", () => {
    expect(auditV9SemanticMotion([{ frame: 0, kind: "decorative", description: "glow" }, { frame: 15, kind: "decorative", description: "bob" }], 0, 30).passed).toBe(false);
    expect(auditV9SemanticMotion([{ frame: 9, kind: "semantic", description: "status changes" }, { frame: 27, kind: "semantic", description: "contact appears" }], 0, 30).passed).toBe(true);
  });

  it("enforces the dissolve budget", () => {
    expect(auditV9Transitions(Array.from({ length: 3 }, () => ({ type: "dissolve" as const, purpose: "soften" })))).toMatchObject({ passed: false, dissolveCount: 3 });
  });

  it("rejects unsupported CTA promises", () => {
    expect(auditV9Cta({ brand: "Solomon", action: "save", text: "Comment SOLOMON and I’ll DM you", destinationVerified: false, commentDeliveryVerified: false, accountIdentity: "SOLOMON" }).passed).toBe(false);
    expect(auditV9Cta({ brand: "Solomon", action: "save", text: "SAVE THIS FOR YOUR NEXT JOB SEARCH", destinationVerified: false, commentDeliveryVerified: false, accountIdentity: "SOLOMON" }).passed).toBe(true);
  });
});
