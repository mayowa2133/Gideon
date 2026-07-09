import { describe, expect, it } from "vitest";
import {
  createMoments,
  enforceSelectionLimit,
  generateConcepts,
  generateScripts,
  sanitizeMarketingCopy,
  validateProfile
} from "./contentEngine";
import type { ProductProfile, RecordingMetadata } from "./types";
import { createDefaultBrandKit } from "./renderTemplates";

const profile: ProductProfile = {
  productName: "LeadPilot",
  targetCustomer: "B2B SaaS founders",
  productDescription: "Finds qualified leads, researches account context, and drafts personalized outreach.",
  preferredTone: "direct",
  toneGuidance: "Plain founder voice.",
  platforms: ["tiktok", "instagram_reels", "youtube_shorts", "linkedin"],
  walkthroughNotes: "Show setup, generated leads, personalized draft, and success state.",
  defaultTemplateKey: "hidden_feature_reveal",
  brandPresenterEnabled: true,
  brandKit: {
    ...createDefaultBrandKit("LeadPilot"),
    tagline: "Outbound proof in one workflow."
  }
};

const recording: RecordingMetadata = {
  filePath: "/tmp/example.mp4",
  fileUrl: "file:///tmp/example.mp4",
  fileName: "example.mp4",
  sizeBytes: 1024,
  durationMs: 92_000,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  validatedAt: "2026-06-24T00:00:00.000Z"
};

describe("content engine", () => {
  it("validates required product context", () => {
    expect(validateProfile(profile)).toEqual([]);
    expect(validateProfile({ ...profile, productDescription: "short" })).toContain(
      "Product description must be 10–600 characters."
    );
  });

  it("creates evidence-backed moments inside recording bounds", () => {
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    expect(moments).toHaveLength(5);
    expect(moments.every((moment) => moment.startMs >= 0 && moment.endMs <= recording.durationMs)).toBe(true);
    expect(moments.every((moment) => moment.evidence.includes("LeadPilot"))).toBe(true);
  });

  it("generates exactly ten concepts and initially selects three", () => {
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    const concepts = generateConcepts(profile, moments, () => `concept-${++counter}`);
    expect(concepts).toHaveLength(10);
    expect(concepts.filter((concept) => concept.selected)).toHaveLength(3);
    expect(new Set(concepts.map((concept) => concept.formatFamily)).size).toBeGreaterThanOrEqual(4);
    expect(concepts.every((concept) => concept.templateKey)).toBe(true);
    expect(concepts[0]?.templateKey).toBe("hidden_feature_reveal");
  });

  it("enforces the three-concept selection limit", () => {
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    const concepts = generateConcepts(profile, moments, () => `concept-${++counter}`).map((concept) => ({
      ...concept,
      selected: true
    }));
    const limited = enforceSelectionLimit(concepts, concepts[9]!.id);
    expect(limited.filter((concept) => concept.selected)).toHaveLength(3);
    expect(limited.find((concept) => concept.id === concepts[9]!.id)?.selected).toBe(true);
  });

  it("generates scripts without blocked generic phrases", () => {
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    const concepts = generateConcepts(profile, moments, () => `concept-${++counter}`);
    const scripts = generateScripts(profile, concepts, moments, () => `script-${++counter}`, () => "2026-06-24T00:00:00.000Z");
    expect(scripts).toHaveLength(3);
    expect(scripts.every((script) => script.captions.length > 0)).toBe(true);
    expect(scripts.every((script) => script.captions.every((caption) => caption.words && caption.words.length > 0))).toBe(true);
    expect(scripts.every((script) => script.visualBeats.length > 0)).toBe(true);
    expect(scripts.every((script) => script.visualBeats.length >= 4)).toBe(true);
    expect(scripts.every((script) => script.voiceoverText.split(".").filter(Boolean).every((line) => line.trim().split(/\s+/).length <= 16))).toBe(true);
    expect(scripts.every((script) => script.editDecisionList?.schemaVersion === "2")).toBe(true);
    expect(scripts.every((script) => (script.editDecisionList?.zooms.length ?? 0) > 0)).toBe(true);
    expect(scripts.every((script) => (script.editDecisionList?.callouts.length ?? 0) > 0)).toBe(true);
    expect(scripts.every((script) => (script.evidenceClaims?.length ?? 0) > 0)).toBe(true);
    expect(scripts.every((script) => script.approved === false)).toBe(true);
    expect(
      scripts.some((script) => /revolutionary platform|game-changing solution/i.test(script.voiceoverText))
    ).toBe(false);
  });

  it("replaces forbidden generic marketing phrases", () => {
    expect(sanitizeMarketingCopy("This revolutionary platform is a game-changing solution.")).not.toMatch(
      /revolutionary platform|game-changing solution/i
    );
  });
});
