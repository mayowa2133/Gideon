import { describe, expect, it } from "vitest";
import { compileSolomonCreatorStoryV22, SOLOMON_CREATOR_STORY_V22_BEATS } from "./solomonCreatorStoryV22Beats";

describe("Solomon Creator Story V22 beat compiler", () => {
  const compiled = compileSolomonCreatorStoryV22();

  it("compiles one source of truth for script, captions, headlines, and TTS beats", () => {
    expect(compiled.script).toBe(SOLOMON_CREATOR_STORY_V22_BEATS.filter(({ vo }) => vo).map(({ vo }) => vo).join(" "));
    expect(compiled.hook).toBe(SOLOMON_CREATOR_STORY_V22_BEATS[0]!.vo);
    expect(compiled.ttsBeats.map(({ text }) => text).join(" ")).toBe(compiled.script);
    for (const caption of compiled.captions) {
      const beat = SOLOMON_CREATOR_STORY_V22_BEATS.find(({ id }) => id === caption.id);
      expect(beat?.chip?.beatText).toBe(caption.beatText);
    }
  });

  it("anchors every declared numeral to a spoken token", () => {
    for (const anchor of compiled.numeralAnchors) {
      expect(compiled.script.toLowerCase()).toContain(anchor.spokenToken.toLowerCase());
    }
    expect(compiled.numeralAnchors.some(({ graphic }) => graphic === "5×")).toBe(true);
  });

  it("keeps the hook viewer-outcome and the CTA comment-gated", () => {
    expect(compiled.hook.toLowerCase()).toMatch(/\byour?\b/);
    expect(compiled.hook.startsWith("This")).toBe(false);
    expect(compiled.ctaSpoken.toLowerCase()).toContain("comment solomon");
    expect(compiled.ctaDisplay).toContain(compiled.ctaKeyword);
  });

  it("keeps every chip at four words or fewer, uppercase, with substring highlights", () => {
    for (const caption of compiled.captions) {
      const words = caption.beatText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
      expect(words.length).toBeLessThanOrEqual(4);
      expect(caption.beatText).toBe(caption.beatText.toUpperCase());
      if (caption.highlight) expect(caption.beatText.toLowerCase()).toContain(caption.highlight.toLowerCase());
    }
  });
});

describe("V22 kinetic word groups", () => {
  const compiled = compileSolomonCreatorStoryV22();
  it("swaps 1-2 word groups at roughly reference cadence", () => {
    for (const caption of compiled.captions) {
      expect(caption.wordGroups.length).toBeGreaterThan(0);
      for (const group of caption.wordGroups) {
        expect(group.text.split(/\s+/).length).toBeLessThanOrEqual(3);
        expect(group.to).toBeGreaterThan(group.from);
      }
      // contiguous and inside the caption window
      expect(caption.wordGroups[0]!.from).toBe(caption.from);
      expect(caption.wordGroups.at(-1)!.to).toBe(caption.to);
      caption.wordGroups.forEach((group, index) => { if (index > 0) expect(group.from).toBe(caption.wordGroups[index - 1]!.to); });
    }
  });
  it("keeps the average group near the reference 0.3-0.5s cadence", () => {
    const spans = compiled.captions.flatMap((caption) => caption.wordGroups.map((group) => group.to - group.from));
    const mean = spans.reduce((sum, span) => sum + span, 0) / spans.length;
    expect(mean).toBeGreaterThanOrEqual(9);
    expect(mean).toBeLessThanOrEqual(20);
  });
});
