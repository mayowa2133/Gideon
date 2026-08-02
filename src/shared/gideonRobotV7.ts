import { z } from "zod";
import { robotEmotionSchema, robotGazeSchema, robotGestureSchema, speechStateSchema } from "./gideonRobotV6";

export const robotScaleTokenSchema = z.enum(["host", "cameo"]);
export const eyeShapeSchema = z.enum(["curious_asymmetric", "surprised_round", "concerned_inner_raise", "focused_narrow", "relieved_curve", "confident_level"]);
export const handSilhouetteSchema = z.enum(["rest", "point", "open_palm", "wave"]);

export const robotDirectorInputSchema = z.object({
  sceneId: z.string().min(1),
  narrativeFunction: z.enum(["hook", "problem", "proof", "mechanism", "trust", "payoff", "cta"]),
  emotion: robotEmotionSchema,
  gazeTarget: robotGazeSchema,
  gesture: robotGestureSchema,
  scaleToken: robotScaleTokenSchema,
  energy: z.number().min(0).max(1),
  sceneDurationFrames: z.number().int().positive(),
  emphasizedWordFrame: z.number().int().nonnegative(),
  proofPosition: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  audioEnvelope: z.array(z.number().min(0).max(1)).min(1)
});

export const robotDirectionSchema = z.object({
  sceneId: z.string(),
  emotion: robotEmotionSchema,
  eyeShape: eyeShapeSchema,
  gazeTarget: robotGazeSchema,
  scaleToken: robotScaleTokenSchema,
  handSilhouette: handSilhouetteSchema,
  blinkFrames: z.array(z.number().int().nonnegative()),
  gazeArrivalFrame: z.number().int().nonnegative(),
  gesturePeakFrame: z.number().int().nonnegative(),
  recoveryFrame: z.number().int().nonnegative(),
  torsoTranslateX: z.number(),
  torsoTranslateY: z.number(),
  torsoRotate: z.number(),
  headRotate: z.number(),
  speechState: speechStateSchema,
  audioEnvelope: z.array(z.number().min(0).max(1)),
  semantic: z.literal(true)
}).superRefine((direction, context) => {
  if (direction.gazeArrivalFrame >= direction.gesturePeakFrame) context.addIssue({ code: "custom", message: "Gaze must arrive before the gesture peak." });
  if (direction.recoveryFrame <= direction.gesturePeakFrame) context.addIssue({ code: "custom", message: "Gesture recovery must follow its peak." });
  if (direction.scaleToken === "host" && direction.torsoTranslateY < -80) context.addIssue({ code: "custom", message: "Host framing risks head clipping." });
});

export type RobotDirectorInput = z.infer<typeof robotDirectorInputSchema>;
export type RobotDirection = z.infer<typeof robotDirectionSchema>;

const EYES: Record<RobotDirectorInput["emotion"], z.infer<typeof eyeShapeSchema>> = {
  curious: "curious_asymmetric",
  surprised: "surprised_round",
  concerned: "concerned_inner_raise",
  focused: "focused_narrow",
  relieved: "relieved_curve",
  confident: "confident_level"
};

export function directRobotPerformance(value: RobotDirectorInput): RobotDirection {
  const input = robotDirectorInputSchema.parse(value);
  const duration = input.sceneDurationFrames;
  const gesturePeakFrame = Math.min(duration - 3, Math.max(8, input.emphasizedWordFrame));
  const gazeArrivalFrame = Math.max(2, gesturePeakFrame - Math.max(4, Math.round(4 + input.energy * 4)));
  const recoveryFrame = Math.min(duration - 1, Math.max(gesturePeakFrame + 5, Math.round(duration * .82)));
  const seed = stableSeed(input.sceneId);
  const blinkFrames = irregularBlinkFrames(duration, seed, input.emotion, input.narrativeFunction === "hook");
  const direction = {
    sceneId: input.sceneId,
    emotion: input.emotion,
    eyeShape: EYES[input.emotion],
    gazeTarget: input.gazeTarget,
    scaleToken: input.scaleToken,
    handSilhouette: gestureToHand(input.gesture),
    blinkFrames,
    gazeArrivalFrame,
    gesturePeakFrame,
    recoveryFrame,
    torsoTranslateX: input.gazeTarget === "product_left" ? -18 : input.gazeTarget === "product_right" ? 18 : 0,
    torsoTranslateY: input.narrativeFunction === "hook" ? 28 : input.emotion === "concerned" ? -12 : 8,
    torsoRotate: input.narrativeFunction === "hook" ? -5.5 : input.emotion === "concerned" ? 4.5 : input.gazeTarget === "product_left" ? -3.2 : input.gazeTarget === "product_right" ? 3.2 : 0,
    headRotate: input.emotion === "curious" ? 7 : input.emotion === "surprised" ? -4 : input.gazeTarget === "product_left" ? -8 : input.gazeTarget === "product_right" ? 8 : 0,
    speechState: input.energy > .84 ? "impact" as const : input.energy > .65 ? "strong" as const : input.energy > .4 ? "medium" as const : "soft" as const,
    audioEnvelope: input.audioEnvelope,
    semantic: true as const
  };
  return robotDirectionSchema.parse(direction);
}

export function sampleSpeechEnvelope(envelope: number[], frame: number, sceneDurationFrames: number): number {
  const normalized = Math.max(0, Math.min(1, frame / Math.max(1, sceneDurationFrames - 1)));
  const index = Math.min(envelope.length - 1, Math.floor(normalized * envelope.length));
  return envelope[index] ?? 0;
}

export function sampleIrregularIdle(frame: number, seed: number): { x: number; y: number; head: number } {
  const a = Math.sin((frame + seed % 17) / (29 + seed % 9));
  const b = Math.sin((frame + seed % 31) / (47 + seed % 13));
  const c = Math.sin((frame + seed % 11) / (19 + seed % 5));
  return { x: a * 5 + b * 3, y: c * 2.2 + b * 1.1, head: a * 1.2 + c * .7 };
}

export function auditRenderedRobotGeometry(samples: Array<{ sceneId: string; top: number; bottom: number; left: number; right: number; headClearance: number; handClipped: boolean; eyeTravel: number; torsoDisplacement: number; silhouetteDifference: number }>) {
  const clippedScenes = samples.filter(({ top, bottom, left, right, headClearance, handClipped }) => top < 0 || bottom > 1920 || left < 0 || right > 1080 || headClearance < 60 || handClipped).map(({ sceneId }) => sceneId);
  const insufficientEyeTravel = samples.filter(({ eyeTravel }) => eyeTravel < 8).map(({ sceneId }) => sceneId);
  const insufficientTorsoDisplacement = samples.filter(({ torsoDisplacement }) => torsoDisplacement < 12).map(({ sceneId }) => sceneId);
  const visuallySimilarStates = samples.filter(({ silhouetteDifference }) => silhouetteDifference < .025).map(({ sceneId }) => sceneId);
  return { passed: clippedScenes.length === 0 && insufficientEyeTravel.length === 0 && insufficientTorsoDisplacement.length === 0 && visuallySimilarStates.length === 0, clippedScenes, insufficientEyeTravel, insufficientTorsoDisplacement, visuallySimilarStates };
}

function gestureToHand(gesture: RobotDirectorInput["gesture"]): z.infer<typeof handSilhouetteSchema> {
  if (gesture === "point_left" || gesture === "point_right" || gesture === "cta_down" || gesture === "direct_emphasis") return "point";
  if (gesture === "open_palm" || gesture === "approval") return "open_palm";
  if (gesture === "celebrate") return "wave";
  return "rest";
}

function irregularBlinkFrames(duration: number, seed: number, emotion: RobotDirectorInput["emotion"], suppressHook: boolean): number[] {
  if (suppressHook || duration < 28) return [];
  const gaps = [63 + seed % 19, 137 + seed % 31, 81 + seed % 23, 159 + seed % 17];
  const result: number[] = [];
  let frame = 28 + seed % 21;
  let index = 0;
  while (frame < duration - 5) {
    result.push(frame);
    if (emotion === "concerned" && frame + 5 < duration - 3) result.push(frame + 5);
    frame += gaps[index % gaps.length]!;
    index += 1;
  }
  return result;
}

function stableSeed(value: string): number {
  return [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 2_167_136_261);
}
