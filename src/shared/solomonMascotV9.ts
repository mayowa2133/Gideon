import { z } from "zod";

export const V9_MASCOT_GEOMETRY_VERSION = "solomon-baby-schema-v1" as const;
export const V9_MASCOT_MATERIAL_VERSION = "solomon-soft-gloss-v1" as const;

export const v9MascotGeometrySchema = z.object({
  totalHeight: z.number().positive(),
  headHeight: z.number().positive(),
  headWidth: z.number().positive(),
  bodyWidth: z.number().positive(),
  bodyHeight: z.number().positive(),
  screenWidth: z.number().positive(),
  screenHeight: z.number().positive(),
  screenCornerRadius: z.number().positive(),
  eyeWidth: z.number().positive(),
  eyeCenterYRatio: z.number().min(0).max(1),
  badgeWidth: z.number().positive(),
  cameoFingerDetails: z.boolean(),
  roundedSilhouette: z.boolean(),
  eggBody: z.boolean(),
  antennaClearance: z.number().nonnegative(),
  hasOrangeBobble: z.literal(true),
  hasOrangeBellyAccent: z.literal(true),
  hasSolomonBadge: z.literal(true),
  visorColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  faceColor: z.string().regex(/^#[0-9a-f]{6}$/i)
});

export const v9MascotFaceSchema = z.enum([
  "friendly_rest",
  "wide_surprise",
  "concerned",
  "focused",
  "happy_crescent",
  "direct_cta",
  "wink",
  "old_way_lidded"
]);
export const v9MascotMouthSchema = z.enum(["smile_rest", "smile_small", "smile_medium", "smile_emphasis", "smile_closed", "thinking_wave"]);
export const v9MascotGestureSchema = z.enum([
  "rest_mitt",
  "point_left",
  "point_right",
  "point_down",
  "open_palm",
  "presentation_palm",
  "stop_control",
  "approval",
  "thinking",
  "wave",
  "celebration",
  "save_bookmark"
]);
export const v9MascotRoleSchema = z.enum(["host", "cameo_left", "cameo_right", "split_left", "split_right", "absent"]);
export const v9MascotGazeTargetSchema = z.enum(["camera", "product", "caption", "cta"]);

export const v9MascotAudioFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  rms: z.number().min(0).max(1),
  speaking: z.boolean(),
  onset: z.number().min(0).max(1),
  phraseBoundary: z.boolean(),
  emphasized: z.boolean(),
  pitchDelta: z.number().min(-1).max(1),
  mouth: v9MascotMouthSchema
});

export const v9MascotPerformanceSchema = z.object({
  sceneId: z.string().min(1),
  role: v9MascotRoleSchema,
  emotion: v9MascotFaceSchema,
  gazePath: z.array(z.object({ frame: z.number().int().nonnegative(), target: v9MascotGazeTargetSchema })).min(1),
  torso: z.object({ lean: z.number().min(-1).max(1), rotate: z.number().min(-1).max(1), shiftX: z.number().min(-1).max(1), shiftY: z.number().min(-1).max(1) }),
  head: z.object({ tilt: z.number().min(-1).max(1), turn: z.number().min(-1).max(1), beats: z.array(z.number().int().nonnegative()) }),
  leftGesture: v9MascotGestureSchema,
  rightGesture: v9MascotGestureSchema,
  gazeArrivalFrame: z.number().int().nonnegative(),
  gestureStartFrame: z.number().int().nonnegative(),
  gesturePeakFrame: z.number().int().positive(),
  recoveryFrame: z.number().int().positive(),
  interactionTarget: z.object({ elementId: z.string().min(1), x: z.number().min(0).max(1), y: z.number().min(0).max(1), action: z.string().min(1) }).optional(),
  audioFrames: z.array(v9MascotAudioFrameSchema).min(1),
  skin: z.literal("solomon_s"),
  material: z.enum(["code_glossy", "hybrid_sprite", "flat_fallback"])
}).superRefine((value, context) => {
  if (value.role !== "absent" && value.gazeArrivalFrame >= value.gesturePeakFrame) context.addIssue({ code: "custom", message: "Mascot gaze must arrive before the gesture peak." });
  if (value.recoveryFrame <= value.gesturePeakFrame) context.addIssue({ code: "custom", message: "Mascot recovery must follow the gesture peak." });
  if (value.role !== "absent" && !value.interactionTarget) context.addIssue({ code: "custom", message: "Every visible mascot appearance needs a story interaction target." });
});

export type V9MascotGeometry = z.infer<typeof v9MascotGeometrySchema>;
export type V9MascotPerformance = z.infer<typeof v9MascotPerformanceSchema>;
export type V9MascotGesture = z.infer<typeof v9MascotGestureSchema>;
export type V9MascotFace = z.infer<typeof v9MascotFaceSchema>;
export type V9MascotMouth = z.infer<typeof v9MascotMouthSchema>;
export type V9MascotAudioFrame = z.infer<typeof v9MascotAudioFrameSchema>;

export const SOLOMON_MASCOT_V9_GEOMETRY: V9MascotGeometry = v9MascotGeometrySchema.parse({
  totalHeight: 900,
  headHeight: 460,
  headWidth: 620,
  bodyWidth: 510,
  bodyHeight: 390,
  screenWidth: 510,
  screenHeight: 330,
  screenCornerRadius: 160,
  eyeWidth: 128,
  eyeCenterYRatio: .45,
  badgeWidth: 78,
  cameoFingerDetails: false,
  roundedSilhouette: true,
  eggBody: true,
  antennaClearance: 38,
  hasOrangeBobble: true,
  hasOrangeBellyAccent: true,
  hasSolomonBadge: true,
  visorColor: "#030914",
  faceColor: "#39f2b5"
});

export function auditSolomonMascotV9(geometry: V9MascotGeometry) {
  const ratios = {
    headHeight: geometry.headHeight / geometry.totalHeight,
    headToBodyWidth: geometry.headWidth / geometry.bodyWidth,
    screenToHeadWidth: geometry.screenWidth / geometry.headWidth,
    screenCornerToHeadWidth: geometry.screenCornerRadius / geometry.headWidth,
    eyeToScreenWidth: geometry.eyeWidth / geometry.screenWidth,
    badgeToBodyWidth: geometry.badgeWidth / geometry.bodyWidth
  };
  const failures = [
    ratios.headHeight < .45 || ratios.headHeight > .55 ? "head_height" : undefined,
    ratios.headToBodyWidth < 1.05 ? "head_body_width" : undefined,
    ratios.screenToHeadWidth < .8 ? "screen_area" : undefined,
    ratios.screenCornerToHeadWidth < .25 ? "screen_corner_radius" : undefined,
    ratios.eyeToScreenWidth < .24 ? "eye_size" : undefined,
    Math.abs(geometry.eyeCenterYRatio - .45) > .06 ? "eye_center" : undefined,
    ratios.badgeToBodyWidth > .2 ? "badge_size" : undefined,
    geometry.cameoFingerDetails ? "cameo_fingers" : undefined,
    !geometry.roundedSilhouette ? "straight_silhouette" : undefined,
    !geometry.eggBody ? "armored_body" : undefined,
    geometry.antennaClearance < 24 ? "antenna_clearance" : undefined,
    luminanceContrast(geometry.visorColor, geometry.faceColor) < 7 ? "face_contrast" : undefined
  ].filter((value): value is string => Boolean(value));
  return { passed: failures.length === 0, geometryVersion: V9_MASCOT_GEOMETRY_VERSION, materialVersion: V9_MASCOT_MATERIAL_VERSION, ratios, failures };
}

export function auditMascotPerformanceV9(plans: V9MascotPerformance[]) {
  const visible = plans.filter(({ role }) => role !== "absent");
  const silhouettes = new Set<V9MascotGesture>(visible.flatMap(({ leftGesture, rightGesture }) => [leftGesture, rightGesture]).filter((gesture) => gesture !== "rest_mitt"));
  const faces = new Set(visible.map(({ emotion }) => emotion));
  const repeated = visible.slice(1).flatMap((plan, index) => {
    const previous = visible[index]!;
    return plan.leftGesture === previous.leftGesture && plan.rightGesture === previous.rightGesture && plan.emotion === previous.emotion ? [`${previous.sceneId}->${plan.sceneId}`] : [];
  });
  const requiredGestures: V9MascotGesture[] = ["point_right", "presentation_palm", "open_palm", "stop_control", "celebration", "save_bookmark"];
  const missingGestures = requiredGestures.filter((gesture) => !silhouettes.has(gesture));
  const missingInteractions = visible.filter(({ interactionTarget }) => !interactionTarget).map(({ sceneId }) => sceneId);
  return { passed: silhouettes.size >= 6 && faces.size >= 5 && repeated.length === 0 && missingGestures.length === 0 && missingInteractions.length === 0, silhouetteCount: silhouettes.size, faceCount: faces.size, repeated, missingGestures, missingInteractions };
}

export function sampleMascotAudioV9(frames: V9MascotAudioFrame[], frame: number): V9MascotAudioFrame {
  return frames.reduce((best, current) => Math.abs(current.frame - frame) < Math.abs(best.frame - frame) ? current : best, frames[0]!);
}

function luminanceContrast(first: string, second: string) {
  const values = [first, second].map((color) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0]! + .7152 * channels[1]! + .0722 * channels[2]!;
  });
  return (Math.max(...values) + .05) / (Math.min(...values) + .05);
}
