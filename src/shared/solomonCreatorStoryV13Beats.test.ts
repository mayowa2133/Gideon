import { describe, expect, it } from "vitest";
import { compileSolomonCreatorStoryV13, SOLOMON_CREATOR_STORY_V13_BEATS } from "./solomonCreatorStoryV13Beats";

describe("Solomon Creator Story V13 beat compiler", () => {
  const compiled = compileSolomonCreatorStoryV13();

  it("compiles one source of truth for script, captions, headlines, and TTS beats", () => {
    expect(compiled.script).toBe(SOLOMON_CREATOR_STORY_V13_BEATS.filter(({ vo }) => vo).map(({ vo }) => vo).join(" "));
    expect(compiled.hook).toBe(SOLOMON_CREATOR_STORY_V13_BEATS[0]!.vo);
    expect(compiled.ttsBeats.map(({ text }) => text).join(" ")).toBe(compiled.script);
    for (const caption of compiled.captions) {
      const beat = SOLOMON_CREATOR_STORY_V13_BEATS.find(({ id }) => id === caption.id);
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
