import { describe, expect, it } from "vitest";
import { auditAdjacentSimilarity, auditCollisions, auditCta, auditNarrationGaps, auditOcr, auditRegression, auditStaticWindows, auditTransientJumps, deriveStaticWindows } from "./creatorStoryDecodedQuality";

describe("creator-story decoded-output quality gates", () => {
  it("fails true static scenes but passes active internal animation", () => {
    const frozen = deriveStaticWindows(Array.from({ length: 20 }, (_, index) => ({ timeSeconds: index / 5, difference: .02 })), .2);
    expect(auditStaticWindows(frozen, 2.5).passed).toBe(false);
    const active = deriveStaticWindows(Array.from({ length: 20 }, (_, index) => ({ timeSeconds: index / 5, difference: index % 3 === 0 ? 2 : .05 })), .2);
    expect(auditStaticWindows(active, 2.5).passed).toBe(true);
  });

  it("fails dead air while allowing a declared outro exception", () => {
    expect(auditNarrationGaps([{ startSeconds: 8, endSeconds: 8.4 }], 35).passed).toBe(false);
    expect(auditNarrationGaps([{ startSeconds: 35.2, endSeconds: 36 }], 35).passed).toBe(true);
    expect(auditNarrationGaps([{ startSeconds: 8, endSeconds: 8.8, declared: true }], 35).passed).toBe(true);
  });

  it("detects click-like onset jumps", () => expect(auditTransientJumps([{ timeSeconds: .8, jumpDb: 19 }])).toMatchObject({ passed: false, clickCount: 1 }));

  it("rejects caption and robot overlap with required product text", () => {
    const required = { id: "proof", kind: "required_ocr" as const, left: 20, top: 20, right: 100, bottom: 100 };
    expect(auditCollisions([required, { id: "caption", kind: "caption", left: 60, top: 40, right: 130, bottom: 90 }]).passed).toBe(false);
    expect(auditCollisions([required, { id: "robot", kind: "robot", left: 30, top: 30, right: 80, bottom: 80 }]).passed).toBe(false);
  });

  it("rejects adjacent-scene similarity, missing proof OCR, and private OCR", () => {
    expect(auditAdjacentSimilarity([{ firstSceneId: "a", secondSceneId: "b", similarity: .81 }]).passed).toBe(false);
    expect(auditOcr("SOLOMON", [["Interviewing"], ["Relevant contact"]], [], 1).passed).toBe(false);
    expect(auditOcr("Interviewing Relevant contact Pat Example", [["Interviewing"], ["Relevant contact"]], [/Pat Example/i], 1).passed).toBe(false);
  });

  it("fails unsupported CTA promises and regression below a previous floor", () => {
    expect(auditCta("COMMENT SOLOMON AND I WILL DM YOU", { brand: "Solomon", action: "comment", destinationVerified: false, commentDeliveryVerified: false }).passed).toBe(false);
    expect(auditRegression({ motion: 4, staticSeconds: 3 }, { motion: 5, staticSeconds: 2.5 }, ["motion"]).passed).toBe(false);
  });
});
