import { describe, expect, it } from "vitest";
import path from "node:path";

// The alignment's contract, tested without running a transcriber. What matters
// offline is everything the timings are built from: that the words on screen
// stay the script's, that a transcript which hears differently still lands its
// timings on the right words, and that an alignment nobody could make is
// reported rather than quietly replaced by an estimate.
const lib = path.join(__dirname, "..", "..", "scripts", "lib", "creator-story-alignment.mjs");
async function alignment() { return import(/* @vite-ignore */ lib); }

const heard = (entries: Array<[string, number, number]>) =>
  entries.map(([text, start, end]) => ({ text, start, end }));

describe("caption alignment", () => {
  // What alignment is actually worth. Character weight is a fair estimator of
  // how long a word takes to say and a blind one about the gaps between them --
  // it spends the whole clip on syllables, so every pause is silently charged to
  // the words around it and every group after the pause is drawn early. Here a
  // 1.1s breath at the comma puts the tail group on screen a quarter of a second
  // -- eight frames -- before the voice reaches it.
  it("times a group from when it is spoken, not from how long it looks", async () => {
    const { alignWordSequences, fillUnmatched } = await alignment();
    const authored = "Review before it reaches Gmail or Outlook".split(" ");
    const spoken = heard([
      ["Review", 0.00, 0.30], ["before", 0.30, 0.56], ["it", 0.56, 0.66], ["reaches", 0.66, 0.95],
      ["Gmail", 2.05, 2.40], ["or", 2.40, 2.52], ["Outlook", 2.52, 3.00]
    ]);
    const times = fillUnmatched(alignWordSequences(authored, spoken), 3.0)!;
    expect(times[4]!.from).toBeCloseTo(2.05, 2);

    const weight = (word: string) => word.replace(/[^A-Za-z0-9]/g, "").length + 1;
    const total = authored.reduce((sum, word) => sum + weight(word), 0);
    const estimatedTailStart = 3.0 * authored.slice(0, 4).reduce((sum, word) => sum + weight(word), 0) / total;
    expect(times[4]!.from - estimatedTailStart).toBeGreaterThan(0.2);
  });

  // Whisper is a source of timings and never of text. It hears "Northstar" as
  // two words and drops a swallowed article, and a caption that followed the
  // transcript would print something no line of the script says.
  it("keeps the script's words when the transcript disagrees", async () => {
    const { alignWordSequences, fillUnmatched } = await alignment();
    const authored = "Solomon names the Head of Marketing at Northstar".split(" ");
    const spoken = heard([
      ["Solomon,", 0.0, 0.4], ["names", 0.4, 0.7], ["Head", 0.9, 1.2], ["of", 1.2, 1.3],
      ["Marketing", 1.3, 1.9], ["at", 1.9, 2.0], ["North", 2.0, 2.3], ["Star", 2.3, 2.6]
    ]);
    const matched = alignWordSequences(authored, spoken);
    // "the" and "Northstar" have no counterpart; everything else lands.
    expect(matched.map((word: { text: string } | null) => word?.text ?? null))
      .toEqual(["Solomon,", "names", null, "Head", "of", "Marketing", "at", null]);
    const times = fillUnmatched(matched, 2.6)!;
    expect(times).toHaveLength(authored.length);
    // Interpolated words sit in the hole their neighbours leave, and the whole
    // sequence still moves forward.
    expect(times[2]!.from).toBeGreaterThanOrEqual(times[1]!.to);
    for (const [index, time] of times.entries()) {
      if (index) expect(time.from, `word ${index}`).toBeGreaterThanOrEqual(times[index - 1]!.from);
      expect(time.to).toBeGreaterThanOrEqual(time.from);
    }
  });

  // A transcript that matches nothing is not an alignment, and interpolating
  // across it drifts unpredictably instead of evenly. The estimate is the right
  // answer there -- but only if it is announced.
  it("refuses an alignment it could not make, and says which beats it estimated", async () => {
    const { alignWordSequences, fillUnmatched, alignClip, MIN_COVERAGE } = await alignment();
    expect(fillUnmatched(alignWordSequences(["alpha", "bravo"], heard([["zulu", 0, 1]])), 1)).toBeNull();
    expect(MIN_COVERAGE).toBeGreaterThan(0.5);

    // No transcriber on the path: the words still come back, timed by the
    // fallback, labelled as the fallback, with the reason attached.
    const result = await alignClip("/nonexistent.wav", "one two three", 1.5, { binary: "definitely-not-a-binary" });
    expect(result.source).toBe("estimated");
    expect(result.words).toHaveLength(3);
    expect(result.reason).toBeTruthy();
    expect(result.words.at(-1)!.to).toBeCloseTo(1.5, 5);
  });
});
