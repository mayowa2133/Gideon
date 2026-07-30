import { describe, expect, it } from "vitest";
import {
  approvedNarrationMatchesAlignedTokens,
  mergeAlignedTokensIntoSurfaceWords,
  narrationAlignmentTokens,
  narrationSurfaceWords
} from "./narrationWordAlignment";

describe("narration word alignment", () => {
  it("matches Whisper tokenization without changing approved hyphenated surface words", () => {
    const approved = "Stop rebuilding job-search decisions and next-move evidence.";
    const aligned = ["Stop", "rebuilding", "job", "search", "decisions", "and", "next", "move", "evidence."];
    expect(narrationSurfaceWords(approved)).toHaveLength(7);
    expect(narrationAlignmentTokens(approved)).toHaveLength(9);
    expect(approvedNarrationMatchesAlignedTokens(approved, aligned)).toBe(true);
  });

  it("merges split timing tokens back onto the exact approved surface word", () => {
    const words = mergeAlignedTokensIntoSurfaceWords("job-search works", [
      { text: "job", startMs: 100, endMs: 240 },
      { text: "search", startMs: 250, endMs: 460 },
      { text: "works", startMs: 500, endMs: 720 }
    ]);
    expect(words).toEqual([
      { text: "job-search", startMs: 100, endMs: 460 },
      { text: "works", startMs: 500, endMs: 720 }
    ]);
  });

  it("fails closed when the actual narration changes", () => {
    expect(approvedNarrationMatchesAlignedTokens("job-search works", ["job", "search", "fails"])).toBe(false);
    expect(() => mergeAlignedTokensIntoSurfaceWords("job-search works", [
      { text: "job", startMs: 100, endMs: 240 },
      { text: "search", startMs: 250, endMs: 460 },
      { text: "fails", startMs: 500, endMs: 720 }
    ])).toThrow(/differ from the approved text/i);
  });
});
