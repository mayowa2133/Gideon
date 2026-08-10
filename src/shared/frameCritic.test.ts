import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// The critic's contract, tested without a model. What can be verified offline is
// the part that decides whether the critic is allowed to speak: reply parsing,
// scoring, and the rule that an uncalibrated critic never reports "passed".
const lib = path.join(__dirname, "..", "..", "scripts", "lib", "creator-story-frame-critic.mjs");
const evalDir = path.join(__dirname, "..", "..", "fixtures", "creator-story", "critic-eval");

async function critic() { return import(/* @vite-ignore */ lib); }

describe("frame critic", () => {
  it("rejects a reply it cannot trust", async () => {
    const { parseCriticReply } = await critic();
    // A malformed reply silently accepted reports "no findings" for a frame the
    // critic never actually judged, which is the failure this whole module is
    // written to avoid.
    expect(() => parseCriticReply("looks fine to me")).toThrow(/no JSON/);
    expect(() => parseCriticReply('{"occlusion":true}')).toThrow(/missing boolean/);
    const finding = parseCriticReply('prose {"occlusion":false,"clippedText":true,"illegibleRegion":false,"collision":false,"emptyFrame":false,"notes":"the word Jobs is cut"} more');
    expect(finding.clippedText).toBe(true);
    expect(finding.notes).toContain("cut");
  });

  it("scores recall and precision the way the gate reads them", async () => {
    const { scoreCalibration } = await critic();
    const perfect = scoreCalibration([
      { expectedDefect: true, clean: false }, { expectedDefect: true, clean: false }, { expectedDefect: true, clean: false },
      { expectedDefect: false, clean: true }, { expectedDefect: false, clean: true }
    ]);
    expect(perfect).toMatchObject({ recall: 1, precision: 1, passed: true });
    // Missing defects is the failure that matters; the threshold is strict on
    // recall and forgiving on precision, because a false alarm only costs a look.
    const misses = scoreCalibration([
      { expectedDefect: true, clean: true }, { expectedDefect: true, clean: true }, { expectedDefect: true, clean: false },
      { expectedDefect: false, clean: true }
    ]);
    expect(misses.recall).toBeLessThan(0.8);
    expect(misses.passed).toBe(false);
  });

  it("refuses to report passed without a calibration receipt", async () => {
    const { criticStatus, CRITIC_PROMPT_VERSION } = await critic();
    const missing = await criticStatus(path.join(evalDir, "does-not-exist.json"));
    expect(missing.status).toBe("blocked_calibration");
    expect(missing.reason).toContain("has not been shown to catch anything");
    expect(CRITIC_PROMPT_VERSION).toBeTruthy();
  });

  it("ships a labelled eval set with both outcomes represented", () => {
    const manifest = JSON.parse(readFileSync(path.join(evalDir, "eval-set.json"), "utf8")) as {
      samples: Array<{ file: string; expectedDefect: boolean; provenance: string }>;
    };
    expect(manifest.samples.filter(({ expectedDefect }) => expectedDefect).length).toBeGreaterThan(2);
    expect(manifest.samples.filter(({ expectedDefect }) => !expectedDefect).length).toBeGreaterThan(3);
    for (const sample of manifest.samples) {
      expect(existsSync(path.join(__dirname, "..", "..", sample.file)), sample.file).toBe(true);
    }
    // Good frames must be real. A critic calibrated only on synthetic images has
    // been shown to separate two generators, not to judge a film.
    expect(manifest.samples.filter(({ expectedDefect, provenance }) => !expectedDefect && provenance === "real").length).toBeGreaterThan(3);
  });
});
