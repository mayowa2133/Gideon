// Turns a CreativeBlueprint into the frame-based film the Remotion renderer
// consumes. This is where "generic" actually lives: the blueprint is authored
// intent in milliseconds, and everything downstream of here is the same
// machinery that renders V22 today.
//
// Two conversions matter and neither is cosmetic.
//
// **Milliseconds to frames, via realized narration.** A blueprint carries
// authored durations; the film's boundaries come from when the words are
// actually spoken. `hook` and `sting` are authored at 867ms and both land at
// 1.00s once the TTS is measured. Deriving boundaries from speech is what took
// scene-to-speech alignment from 3.68s of drift to 0.02s, and the one-second
// floor is applied here rather than trusted from the blueprint.
//
// **PresenterCue to a mascot performance.** The blueprint describes the
// presenter the way a director would -- visible, close-up, explanatory, pointing
// -- and the rig needs gestures, limb timings, gaze keyframes, blinks and a
// posture. Everything the cue does not say is derived deterministically from the
// scene id, because the same blueprint must render the same film: the
// held-stability and mascot-dropout gates both depend on it.
import type { CreativeBlueprint, SceneComposition, SceneContentOptions, SceneContentPattern, SceneLayoutRect, SceneProductCrop } from "./types";
import type { V22Face, V22Gesture, V22MascotPerformance, V22Mouth } from "./solomonMascotV22";

export const FILM_FPS = 30;
export const MIN_SCENE_FRAMES = 30;

// Caption windows and their word groups, film-level rather than per scene: the
// words are spoken across boundaries and the renderer windows them.
export interface FilmCaption {
  id: string;
  from: number;
  to: number;
  highlight?: string;
  wordGroups: Array<{ from: number; to: number; text: string; emphasis?: boolean }>;
}

export interface FilmScene {
  id: string;
  from: number;
  to: number;
  groupFrom: number;
  contentPattern: SceneContentPattern;
  contentOptions: SceneContentOptions;
  backdrop: { token: string; tier: "bright" | "mid" | "deep"; luma: number; css: string; foreground: string };
  productCrops: SceneProductCrop[];
  layout: SceneLayoutRect[];
  camera: { recipe: string; scaleFrom: number; scaleTo: number; focus: { x: number; y: number }; semanticTarget: string };
  mascot: V22MascotPerformance;
  labels: string[];
  // Only the camera reads this, to decide whether a scene is calm enough to
  // freeze its push. Derived from the pattern rather than authored.
  typography: string;
}

// Deterministic per-scene variation. A string hash rather than a seed so a scene
// keeps its stance across renders. Same construction as the V22 rig's posture
// spread, which replaced a `sceneId.length % 2` that gave eighteen scenes two
// poses between them.
export function sceneHash(sceneId: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < sceneId.length; index += 1) {
    hash ^= sceneId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}
function spread(sceneId: string, salt: number, low: number, high: number) {
  return Number((low + sceneHash(sceneId, salt) * (high - low)).toFixed(3));
}

// The cue's vocabulary, mapped onto the rig's. Deliberately not one-to-one:
// `neutral` becomes `concerned` only where the scene's purpose is `problem`,
// because a neutral face on a payoff beat should read as friendly, not flat.
const FACE_BY_EXPRESSION: Record<string, V22Face> = {
  excited: "happy", confident: "friendly", explanatory: "focused", neutral: "friendly"
};
const GESTURE_BY_INTENT: Record<string, [V22Gesture, V22Gesture]> = {
  open_hand: ["open_palm", "presentation_palm"],
  point: ["true_point_left", "true_point_right"],
  emphasis: ["stop_palm", "approval"],
  none: ["rest_mitt", "rest_mitt"]
};
const MOUTH_BY_EXPRESSION: Record<string, V22Mouth> = {
  excited: "wide_open", confident: "confident_smile", explanatory: "small_open", neutral: "closed_smile"
};
const ROLE_BY_LAYOUT: Record<string, V22MascotPerformance["role"]> = {
  fullscreen: "hero_close", close_up: "hero_close", medium: "host",
  lower_third: "cameo_right", split_left: "cameo_left", split_right: "cameo_right"
};
const PURPOSE_TO_NARRATIVE: Record<SceneComposition["purpose"], V22MascotPerformance["narrativePurpose"]> = {
  hook: "emotion", problem: "emotion", demo: "attention",
  proof: "interpretation", payoff: "payoff_reaction", cta: "cta"
};

export function mascotFromCue(scene: SceneComposition, durationFrames: number): V22MascotPerformance {
  const cue = scene.presenter;
  if (!cue.visible) {
    return {
      sceneId: scene.id, role: "absent", narrativePurpose: "none",
      face: "friendly", mouthBias: "closed_smile",
      gazePath: [{ frame: 0, target: "camera", x: .5, y: .4 }],
      head: { turn: 0, tilt: 0, beats: [] },
      torso: { lean: 0, rotate: 0, recoil: 0 },
      left: { gesture: "rest_mitt", timing: { start: 0, peak: 6, recover: 12, wristRotation: 0 } },
      right: { gesture: "rest_mitt", timing: { start: 0, peak: 8, recover: 14, wristRotation: 0 } },
      blinkFrames: [], audioFrames: [{ frame: 0, rms: 0, speaking: false, onset: 0, phraseBoundary: false }]
    };
  }
  const face = scene.purpose === "problem" && cue.expression === "neutral" ? "concerned" : FACE_BY_EXPRESSION[cue.expression] ?? "friendly";
  const [left, right] = GESTURE_BY_INTENT[cue.gestureIntent] ?? GESTURE_BY_INTENT.none!;
  // Hands must peak at different frames -- the schema rejects a rig whose arms
  // move as one, because two limbs on the same curve read as a puppet.
  const leftPeak = 8 + Math.round(sceneHash(scene.id, 7) * 5);
  const rightPeak = leftPeak + 4 + Math.round(sceneHash(scene.id, 13) * 4);
  const lookingAtProduct = cue.eyeline !== "camera";
  return {
    sceneId: scene.id,
    role: ROLE_BY_LAYOUT[cue.layout] ?? "host",
    narrativePurpose: PURPOSE_TO_NARRATIVE[scene.purpose],
    face,
    mouthBias: MOUTH_BY_EXPRESSION[cue.expression] ?? "closed_smile",
    gazePath: lookingAtProduct
      ? [{ frame: 0, target: "camera" as const, x: .5, y: .4 }, { frame: 6, target: "product" as const, x: cue.crop.x, y: Math.max(0, cue.crop.y - .2) }]
      : [{ frame: 0, target: "camera" as const, x: .5, y: .4 }],
    head: {
      turn: lookingAtProduct ? spread(scene.id, 11, .28, .55) : spread(scene.id, 17, -.26, .26),
      tilt: spread(scene.id, 23, -.5, .5),
      beats: [4, Math.min(durationFrames - 1, 14)]
    },
    torso: {
      lean: face === "concerned" ? -.38 : spread(scene.id, 41, .12, .46),
      rotate: spread(scene.id, 31, -.34, .34),
      recoil: face === "concerned" ? .55 : .12
    },
    left: { gesture: left, timing: { start: 4, peak: leftPeak, recover: Math.min(durationFrames, leftPeak + 12), wristRotation: 12 } },
    right: { gesture: right, timing: { start: 6, peak: rightPeak, recover: Math.min(durationFrames, rightPeak + 12), wristRotation: -14 } },
    // Blinks are scene-relative and deterministic; the rig snaps them to whole
    // frames so a blink can never become sub-pixel drift.
    blinkFrames: durationFrames > 40 ? [Math.round(durationFrames * .55)] : [],
    audioFrames: [{ frame: 0, rms: .4, speaking: true, onset: .05, phraseBoundary: false }],
    interactionTarget: { elementId: scene.productAssetIds[0] ?? scene.id, x: cue.crop.x, y: cue.crop.y, action: cue.gestureIntent === "point" ? "point" : "present" }
  };
}

// Where each scene actually starts, measured from the assembled narration. A
// scene is anchored to the beat that speaks over it, so this is per scene rather
// than a single film length.
export interface RealizedTiming { id: string; startMs: number; endMs: number }

// Authored millisecond boundaries become frame boundaries on the realized
// timeline.
//
// Scaling authored durations by a single film-length ratio is NOT good enough,
// and the parity render is what proved it: against V22's realized boundaries the
// proportional version drifted by up to 110 frames -- 3.7 seconds -- putting
// scenes on the wrong backdrops and captions over the wrong shots. Speech is not
// proportional to what was authored. Some beats run long and their neighbours do
// not shrink to compensate.
//
// So per-scene realized timings win when they are available, and the proportional
// fallback exists only for tests and for previewing a blueprint before its
// narration has been assembled.
export function sceneFramesFor(blueprint: CreativeBlueprint, realized?: number | RealizedTiming[]) {
  const perScene = Array.isArray(realized) ? new Map(realized.map((timing) => [timing.id, timing])) : null;
  const realizedEndMs = Array.isArray(realized) ? realized.at(-1)?.endMs : realized;
  const authoredEnd = blueprint.scenes.at(-1)?.endMs ?? blueprint.targetDurationMs;
  const scale = realizedEndMs && authoredEnd ? realizedEndMs / authoredEnd : 1;
  const toFrame = (ms: number) => Math.round((ms * scale) / 1000 * FILM_FPS);
  const sceneMs = (scene: CreativeBlueprint["scenes"][number]) => {
    const timing = perScene?.get(scene.id);
    return timing
      ? { from: Math.round(timing.startMs / 1000 * FILM_FPS), to: Math.round(timing.endMs / 1000 * FILM_FPS) }
      : { from: toFrame(scene.startMs), to: toFrame(scene.endMs) };
  };
  // Enforce the floor here rather than trusting the blueprint: hydration can
  // squeeze a scene below a second, and a sub-second shot reads as a glitch
  // rather than a fast cut.
  //
  // Durations are settled before any boundary is placed. Adjusting boundaries in
  // place and shifting the tail cannot conserve the total, because a donor
  // earlier in the timeline is never reached by a forward shift -- that leaked
  // four frames onto a 1155-frame film. Solving lengths first and laying them
  // out contiguously afterwards conserves it by construction.
  const lengths = blueprint.scenes.map((scene) => { const { from, to } = sceneMs(scene); return to - from; });
  for (let index = 0; index < lengths.length; index += 1) {
    let deficit = MIN_SCENE_FRAMES - lengths[index]!;
    if (deficit <= 0) continue;
    // Take from the longest scenes first, and never take a donor below the floor.
    const donors = lengths
      .map((length, donorIndex) => ({ donorIndex, length }))
      .filter(({ donorIndex, length }) => donorIndex !== index && length > MIN_SCENE_FRAMES)
      .sort((a, b) => b.length - a.length);
    for (const donor of donors) {
      if (deficit <= 0) break;
      const spare = Math.min(deficit, lengths[donor.donorIndex]! - MIN_SCENE_FRAMES);
      lengths[donor.donorIndex]! -= spare;
      lengths[index]! += spare;
      deficit -= spare;
    }
  }
  const bounds: Array<{ id: string; from: number; to: number }> = [];
  let cursor = 0;
  blueprint.scenes.forEach((scene, index) => {
    bounds.push({ id: scene.id, from: cursor, to: cursor + lengths[index]! });
    cursor += lengths[index]!;
  });
  return bounds;
}

export function buildFilmScenes(blueprint: CreativeBlueprint, realized?: number | RealizedTiming[]): FilmScene[] {
  const bounds = sceneFramesFor(blueprint, realized);
  return blueprint.scenes.map((scene, index) => {
    const { from, to } = bounds[index]!;
    const backdrop = scene.backdrop;
    if (!backdrop) throw new Error(`Scene ${scene.id} has no backdrop; the Remotion path requires one.`);
    if (!scene.contentPattern) throw new Error(`Scene ${scene.id} has no content pattern.`);
    // Scenes that continue an animation across a cut share a group origin, so a
    // component driven by useCurrentFrame does not restart three times. The
    // three signature splits are the case this exists for.
    const groupStartMs = scene.groupStartMs ?? scene.startMs;
    const groupIndex = blueprint.scenes.findIndex((candidate) => candidate.startMs === groupStartMs);
    return {
      id: scene.id,
      from, to,
      groupFrom: groupIndex >= 0 ? bounds[groupIndex]!.from : from,
      contentPattern: scene.contentPattern,
      contentOptions: scene.contentOptions ?? {},
      backdrop,
      productCrops: scene.productCrops ?? (scene.productCrop ? [scene.productCrop] : []),
      layout: scene.layoutRects ?? [],
      camera: {
        recipe: `${scene.purpose}-${scene.contentPattern}`,
        scaleFrom: 1, scaleTo: scene.focus.scale,
        focus: { x: scene.focus.x, y: scene.focus.y },
        semanticTarget: `${scene.id}-${scene.shotType}`
      },
      mascot: mascotFromCue(scene, to - from),
      typography: scene.contentPattern === "evidence_band" || scene.contentPattern === "composed_board" ? "product_annotation" : "spoken",
      labels: scene.typography.map(({ text }) => text)
    };
  });
}
