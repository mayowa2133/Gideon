import { z } from "zod";

export const robotEmotionSchema = z.enum(["curious", "surprised", "concerned", "focused", "relieved", "confident"]);
export const robotGazeSchema = z.enum(["camera", "product_left", "product_right", "caption", "cta"]);
export const robotGestureSchema = z.enum([
  "neutral", "point_left", "point_right", "open_palm", "count_one", "compare", "thinking",
  "present_object", "approval", "direct_emphasis", "cta_down", "celebrate"
]);
export const robotFramingSchema = z.enum(["extreme_close", "close", "medium", "side_left", "side_right", "pip", "desk", "three_quarter", "lower_reaction", "cta_close"]);
export const speechStateSchema = z.enum(["rest", "soft", "medium", "strong", "impact"]);

export const robotPerformanceSchema = z.object({
  emotion: robotEmotionSchema,
  gaze: robotGazeSchema,
  gesture: robotGestureSchema,
  framing: robotFramingSchema,
  speechState: speechStateSchema,
  energy: z.number().min(0).max(1),
  lean: z.number().min(-1).max(1),
  headTurn: z.number().min(-1).max(1),
  gestureLeadFrames: z.number().int().min(0).max(12),
  gazeLeadFrames: z.number().int().min(0).max(12),
  semantic: z.boolean()
});

export const creativeDirectionSchema = z.object({
  audience: z.string().min(1),
  promise: z.string().min(1),
  consequenceHook: z.string().min(1),
  tone: z.array(z.string().min(1)).min(2),
  pacing: z.object({ targetWordsPerMinute: z.number().min(205).max(225), targetVisualStates: z.number().int().min(14).max(22) }),
  visualGrammar: z.array(z.enum(["robot_studio", "product_proof", "editorial_takeover", "split_comparison", "cta"])).min(3),
  palette: z.object({ ink: z.string(), paper: z.string(), mint: z.string(), amber: z.string(), coral: z.string() }),
  typography: z.object({ spoken: z.string(), editorial: z.string() }),
  productFocus: z.enum(["selective_crop", "outline", "spotlight"]),
  forbidden: z.array(z.string()).min(3)
});

export const evidenceBindingSchema = z.object({
  claimId: z.string().min(1),
  claim: z.string().min(1),
  assetId: z.enum(["jobs", "tracker", "contacts", "outreach"]),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedInterval: z.object({ startMs: z.number().nonnegative(), endMs: z.number().positive() }),
  visibleRegion: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }),
  approved: z.literal(true)
}).superRefine((binding, context) => {
  if (binding.verifiedInterval.endMs <= binding.verifiedInterval.startMs) context.addIssue({ code: "custom", message: "Evidence interval must be positive." });
  if (binding.visibleRegion.x + binding.visibleRegion.width > 1 || binding.visibleRegion.y + binding.visibleRegion.height > 1) context.addIssue({ code: "custom", message: "Evidence region must remain inside the source." });
});

export const ctaPolicySchema = z.object({
  actionCount: z.literal(1),
  text: z.string().min(1),
  destination: z.enum(["platform_follow", "platform_save", "verified_public_url"]),
  destinationVerified: z.boolean(),
  publicUrlImplied: z.literal(false),
  deliveryPromised: z.literal(false)
}).superRefine((cta, context) => {
  if (!cta.destinationVerified) context.addIssue({ code: "custom", message: "CTA destination is not verified." });
  if (/comment|send you|dm you|link in bio/i.test(cta.text)) context.addIssue({ code: "custom", message: "CTA copy promises an unverified delivery path." });
});

export type RobotEmotion = z.infer<typeof robotEmotionSchema>;
export type RobotGaze = z.infer<typeof robotGazeSchema>;
export type RobotGesture = z.infer<typeof robotGestureSchema>;
export type RobotFraming = z.infer<typeof robotFramingSchema>;
export type RobotPerformance = z.infer<typeof robotPerformanceSchema>;
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;
export type EvidenceBinding = z.infer<typeof evidenceBindingSchema>;
export type CtaPolicy = z.infer<typeof ctaPolicySchema>;

export interface RobotPerformanceAudit {
  passed: boolean;
  silhouetteCount: number;
  gazeCount: number;
  emotionCount: number;
  hasForwardLean: boolean;
  hasCelebration: boolean;
  repeatedSemanticGestures: string[];
  invalidGazeLeadScenes: string[];
  decorativeMotionOnProductScenes: string[];
}

export function auditRobotPerformance(scenes: Array<{ id: string; kind: string; performance?: RobotPerformance }>): RobotPerformanceAudit {
  const performed = scenes.filter((scene): scene is typeof scene & { performance: RobotPerformance } => Boolean(scene.performance));
  const silhouettes = new Set(performed.map(({ performance }) => `${performance.framing}:${performance.gesture}`));
  const gazes = new Set(performed.map(({ performance }) => performance.gaze));
  const emotions = new Set(performed.map(({ performance }) => performance.emotion));
  const semantic = performed.filter(({ performance }) => performance.semantic);
  const repeatedSemanticGestures = semantic.slice(1)
    .filter((scene, index) => scene.performance.gesture === semantic[index]!.performance.gesture)
    .map(({ id }) => id);
  const invalidGazeLeadScenes = performed
    .filter(({ performance }) => performance.gesture !== "neutral" && performance.gazeLeadFrames > performance.gestureLeadFrames)
    .map(({ id }) => id);
  const decorativeMotionOnProductScenes = performed
    .filter(({ kind, performance }) => kind === "product" && !performance.semantic)
    .map(({ id }) => id);
  const audit = {
    silhouetteCount: silhouettes.size,
    gazeCount: gazes.size,
    emotionCount: emotions.size,
    hasForwardLean: performed.some(({ performance }) => performance.lean >= 0.45),
    hasCelebration: performed.some(({ performance }) => performance.gesture === "celebrate"),
    repeatedSemanticGestures,
    invalidGazeLeadScenes,
    decorativeMotionOnProductScenes
  };
  return { passed: audit.silhouetteCount >= 6 && audit.gazeCount >= 4 && audit.emotionCount >= 3 && audit.hasForwardLean && audit.hasCelebration && repeatedSemanticGestures.length === 0 && invalidGazeLeadScenes.length === 0 && decorativeMotionOnProductScenes.length === 0, ...audit };
}

export function parseCreativeDirection(value: unknown): CreativeDirection {
  return creativeDirectionSchema.parse(value);
}

export function parseEvidenceBindings(value: unknown): EvidenceBinding[] {
  return z.array(evidenceBindingSchema).min(4).parse(value);
}

export function parseCtaPolicy(value: unknown): CtaPolicy {
  return ctaPolicySchema.parse(value);
}
