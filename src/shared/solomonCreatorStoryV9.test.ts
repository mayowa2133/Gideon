import { describe, expect, it } from "vitest";
import { auditSolomonCreatorStoryV9, createSolomonCreatorStoryV9Manifest } from "./solomonCreatorStoryV9";

const paths = { jobs:"jobs", tracker:"tracker", contacts:"contacts", outreach:"outreach" } as const;

describe("Solomon Creator Story V9", () => {
  it("is isolated, exact-script, proof-bound, performance-led, and safe", () => {
    const manifest = createSolomonCreatorStoryV9Manifest(paths);
    const audit = auditSolomonCreatorStoryV9(manifest);
    expect(audit.passed).toBe(true);
    expect(audit.wordsPerMinute).toBe(220);
    expect(audit.mascotGeometry.ratios.headHeight).toBeGreaterThanOrEqual(.45);
    expect(audit.mascotPerformance.silhouetteCount).toBeGreaterThanOrEqual(6);
    expect(manifest.scenes.find(({id}) => id === "contact")?.from).toBeLessThanOrEqual(66);
    expect(manifest.claims.find(({id}) => id === "draft")?.resultFrame).toBe(540);
    expect(manifest.release.publicReleaseApproved).toBe(false);
  });

  it("fails decorative-only scene motion", () => {
    const manifest = createSolomonCreatorStoryV9Manifest(paths);
    manifest.scenes[5]!.semanticEvents = manifest.scenes[5]!.semanticEvents.map((event) => ({...event, kind:"decorative"}));
    expect(auditSolomonCreatorStoryV9(manifest).passed).toBe(false);
  });

  it("fails a hook disagreement", () => {
    const manifest = createSolomonCreatorStoryV9Manifest(paths);
    manifest.captions[0]!.text = "YOUR JOB SEARCH JUST CHANGED";
    expect(auditSolomonCreatorStoryV9(manifest).hook.passed).toBe(false);
  });

  it("fails an unsafe CTA", () => {
    const manifest = createSolomonCreatorStoryV9Manifest(paths);
    Reflect.set(manifest.distributionObjective, "ctaText", "COMMENT SOLOMON AND I WILL DM YOU");
    expect(auditSolomonCreatorStoryV9(manifest).cta.passed).toBe(false);
  });
});
