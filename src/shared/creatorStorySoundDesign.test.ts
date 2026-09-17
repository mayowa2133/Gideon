import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAngleBrief, type ScriptBeat } from "./angleBrief";
import { compileAngleBlueprint } from "./angleBlueprint";
import { selectClaims } from "./claimSelection";
import { buildFilmScenes, type FilmScene } from "./creatorStoryFilm";
import { SPEECH_RATE_BAND } from "./creatorStoryQuality";
import { MAX_SOUND_CUES, MIN_CUE_GAP_FRAMES, SOUND_DESIGN_GAIN_DB, planSoundDesign } from "./creatorStorySoundDesign";
import type { ScreenInventory } from "./screenInventory";
import type { CreativeBlueprint } from "./types";

// The same compile the angle-blueprint tests run, so the plan is checked
// against a film the compiler actually produces rather than a hand-drawn one.
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", name), "utf8"));
const inventory = fixture("solomon-screen-inventory.json") as ScreenInventory;
const reference = fixture("solomon-v22.blueprint.json") as CreativeBlueprint;
const { claims } = selectClaims(inventory, { maxClaims: 4 });
const brief = buildAngleBrief({
  topic: "land a marketing internship",
  product: "Solomon",
  claims,
  filmFrames: 1155,
  speechRateBand: SPEECH_RATE_BAND,
  beats: [
    { id: "hook", purpose: "name the change", energy: "high", spoken: true },
    ...claims.map((claim, index) => ({ id: `proof${index}`, purpose: "show it happening", energy: "medium" as const, spoken: index !== 1, claimId: claim.id })),
    { id: "cta", purpose: "one instruction", energy: "high", spoken: true }
  ]
});
const script: ScriptBeat[] = brief.beats.map((slot) => ({
  id: slot.id,
  vo: slot.spoken
    ? [...Array.from({ length: slot.wordBudget[0] + (slot.claimId ? 0 : 1) }, () => "solomon"),
       ...(slot.claimId ? [claims.find(({ id }) => id === slot.claimId)!.requiredReadableText[0]!] : [])].join(" ")
    : "",
  claimId: slot.claimId
}));
const { blueprint } = compileAngleBlueprint({ brief, script, claims, inventory, reference });
const scenes = buildFilmScenes(blueprint);

describe("creator-story sound design plan", () => {
  const plan = planSoundDesign(blueprint, scenes);

  it("puts every cue inside the film, on a scene the film draws, at that scene's own frames", () => {
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(MAX_SOUND_CUES);
    const total = scenes.at(-1)!.to;
    for (const cue of plan) {
      const scene = scenes.find(({ id }) => id === cue.sceneId)!;
      expect(scene, cue.id).toBeDefined();
      expect(cue.frame).toBeGreaterThanOrEqual(scene.from);
      expect(cue.frame).toBeLessThan(scene.to);
      expect(cue.frame).toBeLessThan(total);
      expect(cue.startMs).toBe(Math.round((cue.frame / 30) * 1000));
      expect(cue.gainDb).toBe(SOUND_DESIGN_GAIN_DB[cue.kind]);
    }
    // In film order, and never two hits on top of each other.
    for (let index = 1; index < plan.length; index += 1) {
      expect(plan[index]!.frame - plan[index - 1]!.frame).toBeGreaterThanOrEqual(MIN_CUE_GAP_FRAMES);
    }
  });

  it("leaves the hook silent, lands a card on every product entrance, and stings the CTA", () => {
    expect(plan.find((cue) => cue.sceneId === scenes[0]!.id)).toBeUndefined();
    const productScenes = scenes.slice(1, -1).filter((scene) => scene.productCrops.length > 0 && scene.contentPattern !== "big_number");
    expect(productScenes.length).toBeGreaterThan(0);
    for (const scene of productScenes) {
      const card = plan.find((cue) => cue.sceneId === scene.id && cue.kind === "card");
      expect(card, scene.id).toBeDefined();
      expect(card!.frame).toBe(scene.from);
    }
    const last = scenes.at(-1)!;
    expect(blueprint.scenes.at(-1)!.purpose).toBe("cta");
    const sting = plan.filter((cue) => cue.kind === "sting");
    expect(sting).toHaveLength(1);
    expect(sting[0]!.sceneId).toBe(last.id);
    expect(sting[0]!.frame).toBe(last.from);
  });

  it("moves a cue when its scene's realized boundary moves", () => {
    // Realized narration lengthens the hook by twenty frames; every later
    // scene shifts, and every cue must shift with its scene. This is the
    // check that would have caught a track copied from another film.
    const shifted = buildFilmScenes(blueprint, blueprint.scenes.map((scene, index) => {
      const bounds = scenes[index]!;
      const delta = index === 0 ? 0 : 20;
      const ms = (frames: number) => Math.round((frames / 30) * 1000);
      return { id: scene.id, startMs: ms(bounds.from + delta), endMs: ms(bounds.to + (index === 0 ? 20 : 20)) };
    }));
    const moved = planSoundDesign(blueprint, shifted);
    expect(moved.map(({ id }) => id)).toEqual(plan.map(({ id }) => id));
    for (const [index, cue] of moved.entries()) {
      const before = plan[index]!;
      const scene = shifted.find(({ id }) => id === cue.sceneId)!;
      const original = scenes.find(({ id }) => id === cue.sceneId)!;
      expect(cue.frame - before.frame, cue.id).toBe(scene.from - original.from);
    }
  });

  it("ends in silence when the last scene is a held face rather than a CTA card", () => {
    const quiet: CreativeBlueprint = { ...blueprint, scenes: blueprint.scenes.map((scene, index) => index === blueprint.scenes.length - 1 ? { ...scene, purpose: "payoff", typography: [], contentPattern: "ambient", productCrops: [], productCrop: undefined } : scene) };
    const film = buildFilmScenes(quiet).map((scene, index, all): FilmScene => index === all.length - 1 ? { ...scene, labels: [], productCrops: [], contentPattern: "ambient" } : scene);
    const ending = planSoundDesign(quiet, film);
    expect(ending.find((cue) => cue.sceneId === film.at(-1)!.id)).toBeUndefined();
    expect(ending.filter((cue) => cue.kind === "sting")).toHaveLength(0);
  });

  it("refuses a film scene the blueprint does not know", () => {
    expect(() => planSoundDesign(blueprint, [...scenes, { ...scenes.at(-1)!, id: "ghost", from: scenes.at(-1)!.to, to: scenes.at(-1)!.to + 30 }])).toThrow("ghost");
  });
});
