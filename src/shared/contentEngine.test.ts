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
    expect(concepts.some((concept) => concept.templateKey === "saves_you_time")).toBe(true);
    expect(concepts.find((concept) => concept.templateKey === "saves_you_time")?.hookDirection).toContain("slow part");
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

  it("generates creator-native time-savings scripts from the saves-you-time template", () => {
    let counter = 0;
    const moments = createMoments(profile, recording, () => `moment-${++counter}`);
    const [concept] = generateConcepts(profile, moments, () => `concept-${++counter}`)
      .filter((candidate) => candidate.templateKey === "saves_you_time")
      .map((candidate) => ({ ...candidate, selected: true }));
    expect(concept).toBeDefined();

    const [script] = generateScripts(
      profile,
      [concept!],
      moments,
      () => `script-${++counter}`,
      () => "2026-06-24T00:00:00.000Z"
    );

    expect(script?.templateKey).toBe("saves_you_time");
    expect(script?.hook).toContain("slow part");
    expect(script?.voiceoverText).toMatch(/slow step|saved time/i);
    expect(script?.visualBeats.map((beat) => beat.purpose)).toEqual(
      expect.arrayContaining(["hook", "problem", "demo", "proof", "payoff", "cta"])
    );
  });

  it("adapts creator-native script openings to supported tones", () => {
    const moments = createMoments(profile, recording, () => "moment-1");
    const [concept] = generateConcepts(profile, moments, () => "concept-1");
    const voices = new Map<string, string>();

    (["direct", "casual", "founder", "educational", "bold"] as const).forEach((preferredTone) => {
      const [script] = generateScripts(
        { ...profile, preferredTone },
        [{ ...concept!, selected: true }],
        moments,
        () => `script-${preferredTone}`,
        () => "2026-07-10T00:00:00.000Z"
      );
      voices.set(preferredTone, script!.voiceoverText);
    });

    expect(voices.get("direct")).toContain("this is the part that matters");
    expect(voices.get("casual")).toContain("Okay, watch");
    expect(voices.get("founder")).toContain("I built this");
    expect(voices.get("educational")).toContain("Here is what");
    expect(voices.get("bold")).toContain("Stop doing the slow part by hand");
  });

  it("replaces forbidden generic marketing phrases", () => {
    expect(sanitizeMarketingCopy("This revolutionary platform is a game-changing solution.")).not.toMatch(
      /revolutionary platform|game-changing solution/i
    );
  });
});
