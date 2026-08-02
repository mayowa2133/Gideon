import { describe, expect, it } from "vitest";
import { auditSolomonCreatorStoryV6, createSolomonCreatorStoryV6Manifest } from "./solomonCreatorStoryV6";

const paths = { jobs: "/private/jobs.webm", tracker: "/private/tracker.webm", contacts: "/private/contacts.webm", outreach: "/private/outreach.webm" };

describe("Solomon creator story V6 robot edition", () => {
  it("builds an isolated 36-second high-density user story", () => {
    const manifest = createSolomonCreatorStoryV6Manifest(paths);
    const audit = auditSolomonCreatorStoryV6(manifest);
    expect(audit.passed).toBe(true);
    expect(audit.wordsPerMinute).toBeGreaterThanOrEqual(205);
    expect(audit.wordsPerMinute).toBeLessThanOrEqual(225);
    expect(audit.productOccupancy).toBeGreaterThanOrEqual(.3);
    expect(audit.productOccupancy).toBeLessThanOrEqual(.45);
    expect(audit.proofByFrame).toBeLessThanOrEqual(66);
    expect(manifest.scenes).toHaveLength(19);
    expect(new Set(manifest.captions.map(({ role }) => role))).toEqual(new Set(["spoken_emphasis", "editorial_takeover", "proof_label", "cta"]));
  });

  it("fails closed on unsupported evidence and timing drift", () => {
    const missingEvidence = createSolomonCreatorStoryV6Manifest(paths);
    missingEvidence.scenes[1] = { ...missingEvidence.scenes[1]!, evidenceClaimIds: ["invented"] };
    expect(auditSolomonCreatorStoryV6(missingEvidence).missingClaims).toEqual(["invented"]);

    const drift = createSolomonCreatorStoryV6Manifest(paths);
    drift.beatBindings[0] = { ...drift.beatBindings[0]!, visualProofFrame: 10 };
    expect(auditSolomonCreatorStoryV6(drift).beatTimingViolations).toEqual(["hook"]);
  });

  it("uses a single truthful CTA without implying delivery", () => {
    const { cta, script } = createSolomonCreatorStoryV6Manifest(paths);
    expect(cta).toMatchObject({ actionCount: 1, destination: "platform_follow", destinationVerified: true, publicUrlImplied: false, deliveryPromised: false });
    expect(`${cta.text} ${script}`).not.toMatch(/comment|send you|link in bio/i);
  });
});
