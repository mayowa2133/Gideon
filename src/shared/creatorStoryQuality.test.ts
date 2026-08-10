import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as quality from "./creatorStoryQuality";
import { contractExpectations } from "./creatorStoryQuality";
import type { CreativeBlueprint } from "./types";

const blueprint = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", "solomon-v22.blueprint.json"), "utf8")
) as CreativeBlueprint;

describe("shared creator-story quality surface", () => {
  it("offers the film-level rules a generated blueprint needs", () => {
    for (const name of [
      "MOTION_BANDS", "SHOT_BANDS", "PALETTE_BANDS", "PRESENTER_OCCUPANCY_BAND", "SPEECH_RATE_BAND", "MIN_SCENE_FRAMES",
      "evaluateMotionBands", "evaluateShotBands", "evaluatePaletteBands",
      "auditSceneDurations", "auditPresenterOccupancy", "auditRenderedBounds", "auditLayout", "auditTransitions",
      "auditCaptions", "auditBackdropCadence", "auditBackdropLuma", "auditPhoneScale",
      "mascotBoxForScene", "cameraTransform", "backdropCssLuma"
    ]) {
      expect(quality, name).toHaveProperty(name);
    }
  });

  // The reason this module exists is that a generated film must not have to
  // import a story to check its own pacing. If a story-specific audit is ever
  // re-exported here, that has quietly stopped being true.
  it("stays free of anything that knows the product", () => {
    const source = readFileSync(path.join(__dirname, "creatorStoryQuality.ts"), "utf8");
    for (const storySpecific of ["StoryConsistency", "BannedStrings", "NumeralAnchors", "Hook", "Cta ", "auditCta"]) {
      expect(source, `${storySpecific} is about one film's content, not about films`).not.toContain(storySpecific);
    }
    for (const name of Object.keys(quality)) expect(name, "exported name still carries a version").not.toMatch(/V\d+/);
  });

  // The bands are reference-derived and are the thing a second angle inherits.
  // Pinning them here means a future edit that loosens one to make a film pass
  // shows up as a test change rather than as a quiet re-calibration.
  it("carries the reference-calibrated bands unchanged", () => {
    expect(quality.SHOT_BANDS.decodedShotCount).toEqual([13, 20]);
    expect(quality.PALETTE_BANDS.colouredPixelFraction).toEqual([.13, .24]);
    expect(quality.PALETTE_BANDS.dominantFamilyShare).toEqual([.65, .90]);
    expect(quality.PRESENTER_OCCUPANCY_BAND).toEqual([.18, .28]);
    expect(quality.SPEECH_RATE_BAND).toEqual([170, 192]);
    expect(quality.MIN_SCENE_FRAMES).toBe(30);
  });

  it("derives a contract from a film's own length", () => {
    const solomon = contractExpectations(1155, quality.SPEECH_RATE_BAND);
    expect(solomon.words).toEqual([109, 124]);
    // A longer film gets a proportionally larger band from the same rule, which
    // is the whole point: the old contract asserted 112-122 words for any film.
    const longer = contractExpectations(2310, quality.SPEECH_RATE_BAND);
    expect(longer.words[0]).toBeGreaterThan(solomon.words[1]);
  });

  it("runs its audits against a blueprint without a manifest", () => {
    // Per scene, not flattened: rects from different shots are not on screen
    // together, so comparing them across scenes reports collisions that no
    // viewer could ever see.
    for (const scene of blueprint.scenes) {
      expect(quality.auditLayout((scene.layoutRects ?? []) as never).passed, scene.id).toBe(true);
    }
    const cadence = quality.auditBackdropCadence(blueprint.scenes.map((scene) => ({ id: scene.id, backdrop: scene.backdrop!.token as never })));
    expect(cadence.failures).toEqual([]);
    expect(quality.auditBackdropLuma().passed).toBe(true);
  });
});
