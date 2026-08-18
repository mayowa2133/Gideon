import { describe, expect, it } from "vitest";
import type { FilmCaption } from "./creatorStoryFilm";

// Which words are on screen when, which is a different question from whether a
// caption is on screen at all.
//
// The generated film emitted word groups in clip-relative frames while the
// renderer resolves them against the film's timeline, where V22's own groups
// have always lived. Every caption after the hook therefore began past its own
// last group, matched nothing, and fell through to the last group -- so each
// line rendered as its final two or three words, frozen for the whole scene.
//
// It survived a thirty-six frame review because every frame showed *a* caption:
// legible, uncollided, in the right place, and the wrong words. A picture that
// is wrong only across time is not a picture a still can judge.

/** The renderer's own selection, kept in step with CreatorStoryFilm's CaptionLayer. */
function groupAt(caption: FilmCaption, filmFrame: number) {
  return caption.wordGroups.find((item) => filmFrame >= item.from && filmFrame < item.to)
    ?? [...caption.wordGroups].reverse().find((item) => filmFrame >= item.from)
    ?? caption.wordGroups[0];
}

// A line late in the film, which is where the defect bit: the caption opens at
// frame 900 and its three groups run across the two seconds after that.
const spoken: FilmCaption = {
  id: "proof-review-14",
  from: 900,
  to: 960,
  wordGroups: [
    { from: 900, to: 918, text: "YOU REVIEW IT" },
    { from: 918, to: 940, text: "BEFORE ANYTHING" },
    { from: 940, to: 960, text: "LEAVES." }
  ]
};

describe("caption frame space", () => {
  it("puts every word group inside the window that draws it", () => {
    for (const group of spoken.wordGroups) {
      expect(group.from, group.text).toBeGreaterThanOrEqual(spoken.from);
      expect(group.to, group.text).toBeLessThanOrEqual(spoken.to);
    }
  });

  it("shows the words being said, not the words that end the line", () => {
    // Sampled across the window, not at the boundaries: the defect showed the
    // final group everywhere, so the opening of the line is what catches it.
    expect(groupAt(spoken, 902)!.text).toBe("YOU REVIEW IT");
    expect(groupAt(spoken, 917)!.text).toBe("YOU REVIEW IT");
    expect(groupAt(spoken, 925)!.text).toBe("BEFORE ANYTHING");
    expect(groupAt(spoken, 950)!.text).toBe("LEAVES.");
    // And the line does progress rather than holding one group throughout.
    const shown = [902, 925, 950].map((frame) => groupAt(spoken, frame)!.text);
    expect(new Set(shown).size).toBe(3);
  });

  it("holds the words just said through a gap in the alignment", () => {
    // Forced alignment leaves real silence between groups. During it the screen
    // should carry what was just spoken, not the end of the sentence.
    const gapped: FilmCaption = {
      ...spoken,
      wordGroups: [
        { from: 900, to: 918, text: "YOU REVIEW IT" },
        { from: 930, to: 960, text: "BEFORE ANYTHING LEAVES." }
      ]
    };
    expect(groupAt(gapped, 924)!.text).toBe("YOU REVIEW IT");
  });
});
