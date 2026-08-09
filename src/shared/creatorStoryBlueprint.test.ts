import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditV22BackdropCadence, backdropCssLuma, type V22BackdropToken } from "./creatorStoryV22Quality";
import { buildFilmScenes, MIN_SCENE_FRAMES } from "./creatorStoryFilm";
import { v22MascotPerformanceSchema } from "./solomonMascotV22";
import type { CreativeBlueprint, SceneComposition } from "./types";

// The parity fixture: the V22 film expressed as a CreativeBlueprint, written by
// scripts/blueprint-from-v22.mjs. These tests are the contract the generic
// renderer builds against, and they exist before the renderer does on purpose --
// if the blueprint cannot express this film, the abstraction is wrong and that
// is much cheaper to learn now than after the template library is built.
const blueprint = JSON.parse(
  readFileSync(path.join(__dirname, "..", "..", "fixtures", "creator-story", "solomon-v22.blueprint.json"), "utf8")
) as CreativeBlueprint;

const scenes = blueprint.scenes;

describe("solomon v22 parity blueprint", () => {
  it("describes the film that exists", () => {
    expect(scenes).toHaveLength(18);
    expect(blueprint.targetDurationMs).toBe(38500);
    expect(blueprint.renderPolicy.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("is contiguous and ends where the film ends", () => {
    scenes.forEach((scene, index) => {
      expect(scene.startMs).toBe(index === 0 ? 0 : scenes[index - 1]!.endMs);
      expect(scene.endMs).toBeGreaterThan(scene.startMs);
    });
    expect(scenes.at(-1)!.endMs).toBe(blueprint.targetDurationMs);
  });

  // A blueprint carries authored intent, not the rendered timeline. Scene
  // boundaries are hydrated from realized TTS at render time -- `hook` and
  // `sting` are authored at 867ms and both land at 1.00s once the narration is
  // measured. So the one-second floor that stopped `result` collapsing to 0.57s
  // belongs on the realized timeline, where auditV22SceneDurations enforces it;
  // here the only meaningful check is that no scene is authored as a sliver the
  // hydration would have to invent from nothing.
  it("authors every scene long enough to survive hydration", () => {
    const slivers = scenes.filter((scene) => scene.endMs - scene.startMs < 500);
    expect(slivers.map(({ id }) => id)).toEqual([]);
  });

  it("carries both composition axes on every scene", () => {
    for (const scene of scenes) {
      expect(scene.shotType, scene.id).toBeTruthy();
      expect(scene.contentPattern, scene.id).toBeTruthy();
    }
    // The finding that made contentPattern necessary: four shot types across
    // eighteen scenes, but the film draws them seventeen different ways. If a
    // future edit collapses the patterns back onto shotType this fails.
    expect(new Set(scenes.map(({ shotType }) => shotType)).size).toBe(4);
    expect(new Set(scenes.map(({ contentPattern }) => contentPattern)).size).toBeGreaterThanOrEqual(6);
  });

  it("declares a backdrop whose luma matches its gradient and tier", () => {
    for (const scene of scenes) {
      const backdrop = scene.backdrop!;
      expect(backdrop, scene.id).toBeDefined();
      expect(Math.abs(backdropCssLuma(backdrop.css) - backdrop.luma), `${scene.id} ${backdrop.token}`).toBeLessThanOrEqual(6);
      const band = { bright: [200, 255], mid: [100, 199], deep: [0, 80] }[backdrop.tier]!;
      expect(backdrop.luma, `${scene.id} ${backdrop.token}`).toBeGreaterThanOrEqual(band[0]!);
      expect(backdrop.luma, `${scene.id} ${backdrop.token}`).toBeLessThanOrEqual(band[1]!);
    }
  });

  // Reuses the V22 audit directly rather than restating the rule: no two
  // consecutive scenes may share a token or a tier, which is what makes every
  // boundary register as a cut.
  it("keeps the backdrop cadence that makes boundaries read as cuts", () => {
    const audit = auditV22BackdropCadence(scenes.map((scene) => ({ id: scene.id, backdrop: scene.backdrop!.token as V22BackdropToken })));
    expect(audit.failures).toEqual([]);
  });

  it("resolves every product crop to a declared source asset", () => {
    const assets = new Set(["tracker_before", "tracker_after", "opportunity", "contact", "outreach_blank", "outreach_complete"]);
    for (const scene of scenes) {
      for (const crop of scene.productCrops ?? []) {
        expect(assets.has(crop.assetId), `${scene.id} -> ${crop.assetId}`).toBe(true);
        // Source captures are 1440x900; a crop outside that is a transcription bug.
        expect(crop.x + crop.width, `${scene.id} ${crop.assetId} width`).toBeLessThanOrEqual(1440);
        expect(crop.y + crop.height, `${scene.id} ${crop.assetId} height`).toBeLessThanOrEqual(900);
      }
      // Patterns that draw product must name at least one crop, and patterns
      // that do not must not: `ambient` scenes are presenter and light only.
      const cropCount = scene.productCrops?.length ?? 0;
      if (scene.contentPattern === "ambient" || scene.contentPattern === "comment_card") expect(cropCount, scene.id).toBe(0);
      else expect(cropCount, scene.id).toBeGreaterThan(0);
    }
  });

  it("declares rects for every scene so the collision audit can see them", () => {
    for (const scene of scenes) {
      expect(scene.layoutRects?.length, scene.id).toBeGreaterThan(0);
      for (const rect of scene.layoutRects!) {
        expect(rect.left, `${scene.id} ${rect.id}`).toBeGreaterThanOrEqual(0);
        expect(rect.right, `${scene.id} ${rect.id}`).toBeLessThanOrEqual(1);
        expect(rect.bottom, `${scene.id} ${rect.id}`).toBeGreaterThan(rect.top);
      }
    }
  });

  it("keeps the presenter absent often enough for its return to matter", () => {
    const total = scenes.reduce((sum, scene) => sum + (scene.endMs - scene.startMs), 0);
    const absent = scenes.filter((scene: SceneComposition) => !scene.presenter.visible)
      .reduce((sum, scene) => sum + (scene.endMs - scene.startMs), 0);
    expect(absent / total).toBeGreaterThan(.12);
    expect(absent / total).toBeLessThan(.35);
  });
});

describe("blueprint to film scenes", () => {
  const film = buildFilmScenes(blueprint);

  it("lands on the timeline the film actually renders", () => {
    expect(film).toHaveLength(18);
    expect(film.at(-1)!.to).toBe(1155);
    film.forEach((scene, index) => expect(scene.from, scene.id).toBe(index === 0 ? 0 : film[index - 1]!.to));
  });

  // The bug this pins: adjusting boundaries in place and shifting the tail
  // cannot conserve the total, because a donor earlier in the timeline is never
  // reached by a forward shift. That leaked four frames onto a 1155-frame film.
  it("conserves total frames while lifting every scene to the floor", () => {
    for (const scene of film) expect(scene.to - scene.from, scene.id).toBeGreaterThanOrEqual(MIN_SCENE_FRAMES);
    for (const realizedEndMs of [34_000, 38_500, 41_000, 46_000]) {
      const hydrated = buildFilmScenes(blueprint, realizedEndMs);
      expect(hydrated.at(-1)!.to, `${realizedEndMs}ms`).toBe(Math.round(realizedEndMs / 1000 * 30));
      expect(Math.min(...hydrated.map((scene) => scene.to - scene.from)), `${realizedEndMs}ms`).toBeGreaterThanOrEqual(MIN_SCENE_FRAMES);
      hydrated.forEach((scene, index) => expect(scene.from).toBe(index === 0 ? 0 : hydrated[index - 1]!.to));
    }
  });

  it("derives a mascot performance the rig schema accepts", () => {
    for (const scene of film) expect(() => v22MascotPerformanceSchema.parse(scene.mascot), scene.id).not.toThrow();
  });

  it("keeps the presenter deterministic and varied", () => {
    const again = buildFilmScenes(blueprint);
    expect(again.map((scene) => scene.mascot.head.tilt)).toEqual(film.map((scene) => scene.mascot.head.tilt));
    // The regression this guards: head tilt and torso rotate both came from
    // `sceneId.length % 2`, so eighteen scenes shared two poses between them.
    const visible = film.filter((scene) => scene.mascot.role !== "absent");
    expect(new Set(visible.map((scene) => scene.mascot.head.tilt)).size).toBeGreaterThan(visible.length * .8);
    // Hands on one curve read as a puppet, and the schema rejects it outright.
    for (const scene of visible) expect(scene.mascot.left.timing.peak, scene.id).not.toBe(scene.mascot.right.timing.peak);
  });
});
