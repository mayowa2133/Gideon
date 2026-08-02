import { describe, expect, it } from "vitest";
import { auditSolomonCreatorStoryV7, createSolomonCreatorStoryV7Manifest } from "./solomonCreatorStoryV7";

const paths = { jobs: "/private/jobs.webm", tracker: "/private/tracker.webm", contacts: "/private/contacts.webm", outreach: "/private/outreach.webm" };

describe("Solomon-only creator story V7", () => {
  it("uses Solomon as the only public brand and proves both hook atoms by 2.2 seconds", () => {
    const manifest = createSolomonCreatorStoryV7Manifest(paths);
    const audit = auditSolomonCreatorStoryV7(manifest);
    expect(audit.passed).toBe(true);
    expect(audit.lateHookClaims).toEqual([]);
    expect(audit.publicGideonReferences).toEqual([]);
    expect(manifest.distributionObjective).toMatchObject({ primaryBrand: "Solomon", publicFacingBrands: ["Solomon"], desiredAction: "platform_save", commentAutomationVerified: false, publicUrlVerified: false });
    expect(manifest.sources.find(({ id }) => id === "outreach")?.privacyMasks).toContainEqual({ x: .39, y: .13, width: .6, height: .13, label: "PRIVATE RECIPIENT" });
  });

  it("does not let status evidence satisfy a promised contact", () => {
    const manifest = createSolomonCreatorStoryV7Manifest(paths);
    const contact = manifest.claims.find(({ id }) => id === "contact_surfaced")!;
    Object.assign(contact, { assetId: "tracker", proofStartFrame: 90 });
    expect(auditSolomonCreatorStoryV7(manifest).lateHookClaims).toEqual(["contact_surfaced"]);
  });

  it("rejects Gideon branding and unsupported delivery CTAs", () => {
    const manifest = createSolomonCreatorStoryV7Manifest(paths);
    manifest.captions[0] = { ...manifest.captions[0]!, text: "FOLLOW GIDEON" };
    expect(auditSolomonCreatorStoryV7(manifest).publicGideonReferences).toHaveLength(1);
    const delivery = createSolomonCreatorStoryV7Manifest(paths);
    delivery.distributionObjective.ctaText = "COMMENT SOLOMON AND I'LL DM YOU" as "SAVE THIS SOLOMON WORKFLOW";
    expect(auditSolomonCreatorStoryV7(delivery).unsupportedCta).toBe(true);
  });
});
