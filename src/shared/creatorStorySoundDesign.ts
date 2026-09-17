// Plans the sound effects for a creator-story film from the film itself.
//
// Until this existed the render copied `sound-design.wav` out of a reference
// capture's directory: twelve tones authored as fixed frame numbers for one
// 36-second film ("status-click" at 49, "payoff-reveal" at 878), laid under
// whatever film had just been compiled. Nothing checked them against the
// scenes, so a fresh script got a click in the middle of a held face and a
// reveal sting on a cut that had no reveal. Every gate in the chain read the
// blueprint, and none read the audio.
//
// The cues here come from the scene list the renderer is about to draw --
// the same `FilmScene[]` handed to Remotion -- so a sound can only land on
// something the film shows. What each scene's template animates, and when,
// is read off the templates rather than modelled: `product_screen` springs
// its page in from frame 0, `state_swap` swaps at `swapAt` of its length,
// `big_number` fades its figure over the first nine frames. A cue is placed
// at the START of the motion it accompanies (the entry, not the settle),
// because that is where a sound reads as causing the picture rather than
// commenting on it.
import type { FilmScene } from "./creatorStoryFilm";
import { FILM_FPS } from "./creatorStoryFilm";
import type { CreativeBlueprint, RenderSfxKind, SceneComposition } from "./types";

export interface PlannedSoundCue {
  id: string;
  kind: RenderSfxKind;
  sceneId: string;
  frame: number;
  startMs: number;
  gainDb: number;
  // Why the cue exists, in the terms a listener would use to check it.
  reason: string;
}

// Relative to the -6 dBFS peak every library file is trimmed to, before the
// master's loudnorm to -14 LUFS. Narration is the anchor; the effects sit
// under it. Carried over from the tone version's range and not yet tuned by
// ear -- see the receipt this plan writes.
export const SOUND_DESIGN_GAIN_DB: Record<RenderSfxKind, number> = {
  click: -22,
  pop: -24,
  whoosh: -22,
  card: -20,
  impact: -16,
  success: -18,
  sting: -14
};

// More than this and the film is a slot machine. A 38-second film has twelve
// to eighteen scenes; a sound on every one of them is the failure mode the
// restraint rule exists for, so the cap trims by priority, not by position.
export const MAX_SOUND_CUES = 16;
// Two cues closer than this collide into one smeared hit.
export const MIN_CUE_GAP_FRAMES = 6;
const PRIORITY: Record<RenderSfxKind, number> = { sting: 5, impact: 4, success: 3, card: 2, whoosh: 1, pop: 1, click: 1 };

// Patterns that draw a product crop with an entrance the sound can sit on.
const PRODUCT_PATTERNS = new Set<NonNullable<SceneComposition["contentPattern"]>>([
  "evidence_band", "state_swap", "card_field", "filmstrip", "composed_board", "wide_strip", "product_screen", "editorial_scroll"
]);

export function planSoundDesign(blueprint: CreativeBlueprint, scenes: FilmScene[], fps = FILM_FPS): PlannedSoundCue[] {
  const durationInFrames = scenes.at(-1)?.to ?? 0;
  const candidates: PlannedSoundCue[] = [];
  const place = (scene: FilmScene, kind: RenderSfxKind, frame: number, reason: string) => {
    const at = Math.max(scene.from, Math.min(scene.to - 1, Math.round(frame)));
    candidates.push({ id: `sfx-${scene.id}-${kind}`, kind, sceneId: scene.id, frame: at, startMs: Math.round((at / fps) * 1000), gainDb: SOUND_DESIGN_GAIN_DB[kind], reason });
  };

  scenes.forEach((scene, index) => {
    const authored = blueprint.scenes.find(({ id }) => id === scene.id);
    if (!authored) throw new Error(`Film scene ${scene.id} has no blueprint scene.`);
    const last = index === scenes.length - 1;
    const crops = scene.productCrops;
    const pattern = scene.contentPattern;

    // The hook is the voice starting; a sound under its first frame competes
    // with the one thing the hook has to do.
    if (index === 0) return;

    if (last) {
      // A CTA that sets its instruction in type gets the sting. A last scene
      // that is only the presenter holding a face is the ending, and silence
      // is the point of it -- the film ends on a look, not a chime.
      if (authored.purpose === "cta" && (scene.labels.length > 0 || pattern === "comment_card")) {
        place(scene, "sting", scene.from, "CTA card lands");
      }
      return;
    }

    if (pattern === "big_number") {
      // The figure fades up over frames 0-9 and grows to 16; the hit goes on
      // the first frame it is visible.
      place(scene, "impact", scene.from, "big-number reveal");
      return;
    }

    if (crops.length > 0 && pattern && PRODUCT_PATTERNS.has(pattern)) {
      // Entry, not settle: product_screen (spring, 18f), wide_strip (14f),
      // evidence_band (reveal 10-55f), editorial_scroll (12f) all start at 0.
      place(scene, "card", scene.from, `${pattern} enters`);
    }

    // A swap is the one moment in the film where a state visibly changes --
    // Applied becoming Interviewing -- and it is the moment the claim is made.
    const swapAt = pattern === "state_swap"
      ? (scene.contentOptions.swapAt ?? 0.31)
      : (pattern === "evidence_band" && crops.length > 1 && scene.contentOptions.swapAt) || undefined;
    if (swapAt !== undefined) {
      place(scene, "success", scene.from + (scene.to - scene.from) * swapAt, `${pattern} swaps at ${swapAt}`);
    }
  });

  // Priority first, then time, so the cap and the gap both keep the cue that
  // matters more. Sorted back into film order at the end.
  const ranked = [...candidates].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.frame - b.frame);
  const kept: PlannedSoundCue[] = [];
  for (const cue of ranked) {
    if (kept.length >= MAX_SOUND_CUES) break;
    if (kept.some((other) => Math.abs(other.frame - cue.frame) < MIN_CUE_GAP_FRAMES)) continue;
    kept.push(cue);
  }
  const plan = kept.sort((a, b) => a.frame - b.frame || PRIORITY[b.kind] - PRIORITY[a.kind]);
  for (const cue of plan) {
    if (cue.frame < 0 || cue.frame >= durationInFrames) throw new Error(`Sound cue ${cue.id} at frame ${cue.frame} is outside the film (${durationInFrames} frames).`);
  }
  return plan;
}
