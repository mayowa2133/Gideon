import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAngleBrief, planBeats, validateAngleScript, type ScriptBeat } from "./angleBrief";
import { compileAngleBlueprint } from "./angleBlueprint";
import { selectClaims } from "./claimSelection";
import { buildFilmScenes } from "./creatorStoryFilm";
import { MIN_SCENE_FRAMES, SPEECH_RATE_BAND } from "./creatorStoryQuality";
import { validateCreativeBlueprint } from "./creativeBlueprint";
import type { ScreenInventory } from "./screenInventory";
import type { CreativeBlueprint } from "./types";

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", name), "utf8"));
const inventory = fixture("solomon-screen-inventory.json") as ScreenInventory;
const reference = fixture("solomon-v22.blueprint.json") as CreativeBlueprint;

const FILM_FRAMES = 1155;
const { claims } = selectClaims(inventory, { maxClaims: 4 });
const brief = buildAngleBrief({
  topic: "land a marketing internship",
  product: "Solomon",
  claims,
  filmFrames: FILM_FRAMES,
  speechRateBand: SPEECH_RATE_BAND,
  beats: [
    { id: "hook", purpose: "name the change", energy: "high", spoken: true },
    ...claims.map((claim, index) => ({ id: `proof${index}`, purpose: "show it happening", energy: "medium" as const, spoken: index !== 1, claimId: claim.id })),
    { id: "cta", purpose: "one instruction", energy: "high", spoken: true }
  ]
});
// Stand-in for the agent's writing: the shape a script has, at the budgets the
// brief set. What is being tested is the compile, not the prose.
const script: ScriptBeat[] = brief.beats.map((slot) => ({
  id: slot.id,
  vo: slot.spoken ? Array.from({ length: slot.wordBudget[0] + 1 }, () => "solomon").join(" ") : "",
  claimId: slot.claimId
}));

describe("angle blueprint", () => {
  const { blueprint, issues } = compileAngleBlueprint({ brief, script, claims, inventory, reference });

  it("compiles a script the brief accepts into a blueprint the validator accepts", () => {
    expect(validateAngleScript(brief, script).filter(({ reason }) => reason !== "film_word_budget")).toEqual([]);
    expect(issues.filter(({ reason }) => reason !== "too_few_beats_for_pace")).toEqual([]);
    expect(validateCreativeBlueprint(blueprint).filter(({ severity }) => severity === "blocking")).toEqual([]);
  });

  it("spends exactly the film's frames, with no scene below the floor", () => {
    const film = buildFilmScenes(blueprint);
    expect(film.at(-1)!.to).toBe(FILM_FRAMES);
    expect(film[0]!.from).toBe(0);
    for (const [index, scene] of film.entries()) {
      expect(scene.from, scene.id).toBe(index === 0 ? 0 : film[index - 1]!.to);
      expect(scene.to - scene.from, scene.id).toBeGreaterThanOrEqual(MIN_SCENE_FRAMES);
    }
  });

  // Time follows speech, but not only speech. Allocating purely by word count
  // gave the one silent proof beat the shortest scene in the film -- one second
  // to read the region it exists to show -- so a claim earns reading time first
  // and shares in the rest after.
  it("holds a claim long enough to read it, silent or not", () => {
    const span = (scene: (typeof blueprint.scenes)[number]) => scene.endMs - scene.startMs;
    const dwell = reference.scenes[0]!.minimumReadableDwellMs;
    for (const scene of blueprint.scenes.filter(({ supportedClaimIds }) => supportedClaimIds.length)) {
      expect(span(scene), scene.id).toBeGreaterThanOrEqual((MIN_SCENE_FRAMES / 30) * 1000 + dwell);
    }
    // And among beats that do speak, the longer line still gets the longer scene.
    const spoken = blueprint.scenes.map((scene, index) => ({ scene, words: script[index]!.vo.split(/\s+/).filter(Boolean).length })).filter(({ words }) => words);
    const ranked = [...spoken].sort((left, right) => right.words - left.words);
    expect(span(ranked[0]!.scene)).toBeGreaterThanOrEqual(span(ranked.at(-1)!.scene));
  });

  it("never runs two backdrops of the same tier together", () => {
    for (const [index, scene] of blueprint.scenes.slice(1).entries()) {
      expect(scene.backdrop.tier, `${blueprint.scenes[index]!.id} -> ${scene.id}`).not.toBe(blueprint.scenes[index]!.backdrop.tier);
    }
  });

  // Every claim has a crop; not every crop has a claim. The reverse used to be
  // asserted here and it was the invariant that kept 13 of 18 scenes empty.
  it("resolves a crop for every claim-bearing scene", () => {
    for (const scene of blueprint.scenes) {
      if (scene.supportedClaimIds.length) expect(scene.productCrop, scene.id).toBeDefined();
      if (!scene.productCrop) continue;
      expect(scene.productCrop.assetId).toBe(scene.productAssetIds[0]);
      expect(scene.productCrop.width, scene.id).toBeGreaterThan(0);
      expect(scene.productCrop.height, scene.id).toBeGreaterThan(0);
    }
  });

  // Claims are the only scenes that assert anything, but binding product
  // presence to claims alone left 13 of 18 scenes as a presenter on a colour.
  it("stays on the product between proofs without claiming anything there", () => {
    const paced = buildAngleBrief({
      topic: "paced", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: claims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({ id: slot.id, vo: slot.spoken ? Array.from({ length: slot.wordBudget[0] }, () => "solomon").join(" ") : "", claimId: slot.claimId }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference });

    const shown = film.scenes.filter(({ productCrop }) => productCrop);
    expect(shown.length).toBeGreaterThan(claims.length);
    // Showing is not claiming. An establishing shot asserts nothing, so nothing
    // is added to what the OCR gate has to find.
    for (const scene of shown.filter(({ supportedClaimIds }) => !supportedClaimIds.length)) {
      expect(scene.productCrop!.width, scene.id).toBeGreaterThan(reference.scenes.find((entry) => entry.productCrop)!.productCrop!.width);
    }
    expect(film.scenes.flatMap(({ supportedClaimIds }) => supportedClaimIds)).toEqual(claims.map(({ id }) => id));

    // Wide then tight is a pair; wide, wide, tight is a still held across a cut.
    for (const [index, scene] of film.scenes.slice(1).entries()) {
      const previous = film.scenes[index]!;
      if (!scene.productCrop || !previous.productCrop) continue;
      expect(
        `${scene.productCrop.assetId}:${scene.productCrop.width}x${scene.productCrop.height}`,
        `${previous.id} -> ${scene.id}`
      ).not.toBe(`${previous.productCrop.assetId}:${previous.productCrop.width}x${previous.productCrop.height}`);
    }
  });

  // A film paced from too few beats is the quiet failure: nothing overflows,
  // every scene just gets longer, and it renders as a slideshow.
  it("reports a beat count that cannot reach the reference pace", () => {
    expect(issues.map(({ reason }) => reason)).toContain("too_few_beats_for_pace");
    const paced = buildAngleBrief({
      topic: "paced", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: Array.from({ length: 18 }, (_, index) => ({ id: `b${index}`, purpose: "x", energy: "medium" as const, spoken: true }))
    });
    const script18 = paced.beats.map((slot) => ({ id: slot.id, vo: Array.from({ length: slot.wordBudget[0] }, () => "solomon").join(" ") }));
    expect(compileAngleBlueprint({ brief: paced, script: script18, claims, inventory, reference }).issues).toEqual([]);
  });

  it("reports rather than truncates when the beats cannot fit the running time", () => {
    const crowded = buildAngleBrief({
      topic: "too much film", product: "Solomon", claims, filmFrames: MIN_SCENE_FRAMES * 3,
      speechRateBand: SPEECH_RATE_BAND,
      beats: brief.beats.map(({ id, purpose, energy, spoken, claimId }) => ({ id, purpose, energy, spoken, claimId }))
    });
    const result = compileAngleBlueprint({ brief: crowded, script, claims, inventory, reference });
    expect(result.issues.map(({ reason }) => reason)).toContain("too_many_beats_for_duration");
  });
});
