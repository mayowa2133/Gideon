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
    expect(issues.filter(({ reason }) => reason !== "too_few_beats_for_pace" && reason !== "claim_illegible_at_crop")).toEqual([]);
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

  // An unreadable proof is not a weaker proof, it is a shot claiming to show
  // something the viewer cannot see. Three of the four claims the Solomon
  // inventory offers land between 7 and 19 pixels once their crop is drawn, so
  // they are reported and not rendered.
  //
  // This replaces a test that asserted the opposite -- that non-claim beats
  // establish the screen a proof is heading for. That behaviour was measured out
  // rather than argued out: a 1.8x pull-back around a region grading 22px lands
  // at 12px, and a shot that looks like content and carries none is worse than
  // the backdrop it replaced.
  it("does not draw a claim it cannot draw legibly", () => {
    const paced = buildAngleBrief({
      topic: "paced", product: "Solomon", claims, filmFrames: FILM_FRAMES, speechRateBand: SPEECH_RATE_BAND,
      beats: planBeats({ beatCount: 18, claimIds: claims.map(({ id }) => id) })
    });
    const written = paced.beats.map((slot) => ({ id: slot.id, vo: slot.spoken ? Array.from({ length: slot.wordBudget[0] }, () => "solomon").join(" ") : "", claimId: slot.claimId }));
    const { blueprint: film } = compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference });

    const shown = film.scenes.filter(({ productCrop }) => productCrop);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(claims.length);
    // A dropped picture drops its claim with it: a scene must never keep a claim
    // whose evidence it no longer shows.
    for (const scene of film.scenes) {
      expect(scene.supportedClaimIds.length > 0, scene.id).toBe(Boolean(scene.productCrop));
    }
    // And every drop is reported, never silent.
    const dropped = claims.length - shown.length;
    expect(compileAngleBlueprint({ brief: paced, script: written, claims, inventory, reference })
      .issues.filter(({ reason }) => reason === "claim_illegible_at_crop")).toHaveLength(dropped);

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

  it("never inherits the reference film's copy", () => {
    // Words on screen that no line in this script supports are the same defect
    // as a caption nobody speaks. The reference scene's arrangement transfers;
    // its chips and headlines do not.
    for (const scene of blueprint.scenes) {
      for (const key of ["labels", "pills", "headline", "lines"]) {
        expect(scene.contentOptions, `${scene.id}.${key}`).not.toHaveProperty(key);
      }
    }
    // The reference does carry that copy, so this is a real subtraction.
    expect(reference.scenes.some(({ contentOptions }) => "labels" in contentOptions || "pills" in contentOptions)).toBe(true);
  });

  // The gap that made every other gate here meaningless: the compiler wrote one
  // crop, the renderer read a different field, and nothing compared them.
  it("hands the renderer the crop it resolved, not the reference film's", () => {
    for (const scene of blueprint.scenes) {
      const drawn = buildFilmScenes(blueprint).find((entry) => entry.id === scene.id)!.productCrops;
      expect(drawn.map(({ assetId }) => assetId), scene.id).toEqual(scene.productCrop ? [scene.productCrop.assetId] : []);
      if (scene.productCrop) expect(drawn[0], scene.id).toEqual(scene.productCrop);
    }
    // And the reference really does carry crops that would otherwise win.
    expect(reference.scenes.some((scene) => (scene.productCrops?.length ?? 0) > 1)).toBe(true);
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
