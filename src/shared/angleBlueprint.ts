import { type AngleBrief, type ScriptBeat } from "./angleBrief";
import { type SelectableClaim } from "./claimSelection";
import { MIN_SCENE_FRAMES, SHOT_BANDS } from "./creatorStoryQuality";
import { resolveCrop, type ScreenInventory } from "./screenInventory";
import type { CreativeBlueprint, SceneComposition } from "./types";

// Compiles a validated script into a blueprint the generic renderer can draw.
//
// The product-specific half -- brand kit, presenter rig, captured screens, the
// backdrop palette -- is taken from a reference blueprint rather than invented,
// because that is what "curated once, then any angle" means: the setup happened
// when the screens were captured and approved, and an angle costs nothing.
//
// What this decides is film structure: which shot each beat gets, what the
// screen behind it does, how long it holds, and which region of which screen
// proves it.

// Container aspects the templates draw into. These are not free numbers: the
// proof band's 2.47 came out of the edge-density work, where framing an
// editorial strip beat magnifying a whole card by every measure. A crop is
// resolved against the shape it will actually occupy, so cover-fit has nothing
// left to discard.
const CONTAINER_ASPECT: Record<string, number> = {
  evidence_band: 2.47, state_swap: 1.57, card_field: 1.6, composed_board: 1.55, filmstrip: 1.2, comment_card: 1.9, ambient: 1.6
};

// A default shot for each kind of beat. Deliberately small: seven pairs are
// implemented and a generated film that reaches for all of them looks restless.
// An agent editing the blueprint can choose any implemented pair; this is what
// it gets without asking.
function defaultShot(beat: { spoken: boolean; claimId?: string }, isLast: boolean): Pick<SceneComposition, "shotType" | "contentPattern"> {
  if (isLast) return { shotType: "cta_end_card", contentPattern: "comment_card" };
  if (!beat.claimId) return { shotType: "presenter_fullscreen", contentPattern: "ambient" };
  return beat.spoken
    ? { shotType: "split_presenter_product", contentPattern: "evidence_band" }
    : { shotType: "product_fullscreen", contentPattern: "evidence_band" };
}

export interface AngleCompileIssue { sceneId?: string; reason: string; detail?: string }

export function compileAngleBlueprint(input: {
  brief: AngleBrief;
  script: readonly ScriptBeat[];
  claims: readonly SelectableClaim[];
  inventory: ScreenInventory;
  reference: CreativeBlueprint;
  shots?: Record<string, Pick<SceneComposition, "shotType" | "contentPattern">>;
}): { blueprint: CreativeBlueprint; issues: AngleCompileIssue[] } {
  const { brief, script, claims, inventory, reference } = input;
  const issues: AngleCompileIssue[] = [];
  const fps = 30;
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));

  // Durations from speech, floored, then conserved. Settling every duration
  // before placing a single boundary is not a style choice: shifting boundaries
  // forward as you go cannot reclaim frames from a scene already behind you, and
  // that leak cost four frames of film the last time it was written the other way.
  const words = script.map((beat) => (beat.vo.trim() ? beat.vo.trim().split(/\s+/).length : 0));
  const spokenWords = words.reduce((sum, count) => sum + count, 0) || 1;
  // A scene carrying a claim needs time to be read, and reading time is not
  // speech time. Allocating purely by word count gave the one silent proof beat
  // the shortest scene in the film -- a second to take in the region it exists
  // to show. `minimumReadableDwellMs` is already on the scene for this; it just
  // has to reach the floor before the spare is shared out.
  const dwellFrames = Math.round((reference.scenes[0]!.minimumReadableDwellMs / 1000) * fps);
  const floors = script.map((beat) => MIN_SCENE_FRAMES + (beat.claimId ? dwellFrames : 0));
  const spare = brief.filmFrames - floors.reduce((sum, count) => sum + count, 0);
  if (spare < 0) {
    issues.push({ reason: "too_many_beats_for_duration", detail: `${script.length} beats need ${floors.reduce((sum, n) => sum + n, 0)} frames, film has ${brief.filmFrames}` });
  }
  // The failure that actually ships. Too many beats is loud -- the floors do not
  // fit and the arithmetic says so. Too few is silent: every scene simply gets
  // longer, nothing overflows, and the result is a slideshow. Six beats over
  // this film's running time is a mean shot of 6.4 seconds against a reference
  // band of 1.7 to 2.7, which no later gate can fix because the beats are gone
  // by then.
  const meanShotSeconds = brief.filmFrames / fps / Math.max(1, script.length);
  if (meanShotSeconds > SHOT_BANDS.meanShotSeconds[1]) {
    issues.push({ reason: "too_few_beats_for_pace", detail: `${script.length} beats hold ${meanShotSeconds.toFixed(1)}s each, band is ${SHOT_BANDS.meanShotSeconds.join("-")}s` });
  }
  const durations = words.map((count, index) => floors[index]! + Math.max(0, Math.round((spare * count) / spokenWords)));
  // Hand the rounding remainder to the longest scene, where a frame is invisible.
  const drift = brief.filmFrames - durations.reduce((sum, count) => sum + count, 0);
  const longest = durations.indexOf(Math.max(...durations));
  durations[longest] = (durations[longest] ?? 0) + drift;

  // Backdrop cadence: never twice in a row at the same tier. The gate that
  // checks this exists because a run of bright scenes reads as one long shot no
  // matter how the content changes.
  const palette = [...new Map(reference.scenes.flatMap((scene) => (scene.backdrop ? [[scene.backdrop.token, scene.backdrop] as const] : []))).values()];
  const byTier = (tier: string) => palette.filter((entry) => entry?.tier === tier);
  const cadence = ["bright", "mid", "deep"];

  let startMs = 0;
  const scenes: SceneComposition[] = script.map((beat, index) => {
    const slot = brief.beats[index]!;
    const shot = input.shots?.[beat.id] ?? defaultShot(slot, index === script.length - 1);
    const endMs = startMs + Math.round((durations[index]! / fps) * 1000);
    const template = reference.scenes.find((scene) => scene.contentPattern === shot.contentPattern) ?? reference.scenes[0]!;
    const tier = cadence[index % cadence.length]!;
    const options = byTier(tier);
    const backdrop = options[Math.floor(index / cadence.length) % Math.max(1, options.length)] ?? template.backdrop!;

    const claim = beat.claimId ? claimById.get(beat.claimId) : undefined;
    let productCrop: SceneComposition["productCrop"];
    if (claim) {
      const aspect = CONTAINER_ASPECT[shot.contentPattern ?? ""] ?? 1.6;
      const resolved = resolveCrop(inventory, claim.requiredReadableText, aspect, { assetId: claim.assetId });
      if ("reason" in resolved) issues.push({ sceneId: beat.id, reason: "crop_unresolved", detail: resolved.reason });
      // `trim` names which captured still to show, and the wrong one is a blank
      // panel where the evidence should be -- a message not yet generated, a
      // tracker not yet updated. The recording moment is a property of the
      // screen, so it is carried over from wherever the reference film already
      // framed that asset rather than guessed at here.
      else productCrop = {
        assetId: claim.assetId, x: resolved.x, y: resolved.y, width: resolved.width, height: resolved.height,
        trim: reference.scenes.find((scene) => scene.productCrop?.assetId === claim.assetId)?.productCrop?.trim ?? 0
      };
    }

    const scene: SceneComposition = {
      ...template,
      id: beat.id,
      startMs,
      endMs,
      shotType: shot.shotType,
      contentPattern: shot.contentPattern,
      contentOptions: shot.contentPattern === template.contentPattern ? template.contentOptions : {},
      presenter: { ...template.presenter, visible: shot.shotType !== "product_fullscreen" },
      productAssetIds: claim ? [claim.assetId] : [],
      supportedClaimIds: claim ? [claim.id] : [],
      captions: [],
      typography: [],
      backdrop,
      background: { kind: backdrop.tier === "deep" ? "dark" : "light" },
      productCrop
    };
    startMs = endMs;
    return scene;
  });

  return {
    blueprint: {
      ...reference,
      id: `${reference.id}-${brief.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
      targetDurationMs: startMs,
      claimIds: claims.map((claim) => claim.id),
      scenes,
      compiledAt: new Date(0).toISOString()
    },
    issues
  };
}
