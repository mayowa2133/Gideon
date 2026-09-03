import { z } from "zod";
import { meetEvidenceSchema, type MeetEvidence } from "./meetSolomon";
import { meetFilmSchema as baseFilmSchema, meetProofSchema, meetSceneSchema as baseSceneSchema, meetStorySchema as baseStorySchema } from "./meetSolomonV2";
import { assertMeetStoryEvidence as assertV1Evidence, categoryCta as legacyCta, categorySchema, CATEGORY_DATA, type InternshipCategory } from "./meetSolomonCategories";
export { CATEGORY_DATA, type InternshipCategory } from "./meetSolomonCategories";
export const categoryCta = (category: InternshipCategory) => `Organise your ${category} internship applications with Solomon.`;
export const meetSceneSchema = baseSceneSchema.extend({
  layout: z.enum(["category-hook", "role-reveal", "meet", "role-company", "stage", "open-detail", "category-detail", "reset", "criteria", "tracker-view", "category-payoff", "cta"]),
  proofs: z.array(meetProofSchema).max(4),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = baseStorySchema.extend({
  version: z.literal("meet-solomon-categories-v2"), category: categorySchema, sampleData: z.literal(true), captureMode: z.literal("offline-component-demo"),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).length(12),
});
export type MeetStory = z.infer<typeof meetStorySchema>;
export const interactionSchema = z.object({
  category: categorySchema, action: z.literal("select-sample-role"), mode: z.literal("offline-component-demo"),
  beforeCapturedAt: z.string().datetime(), afterCapturedAt: z.string().datetime(),
  beforeSha256: z.string().regex(/^[a-f0-9]{64}$/), afterSha256: z.string().regex(/^[a-f0-9]{64}$/),
  edit: z.literal("before-after-hard-cut"), continuousRecording: z.literal(false),
}).superRefine((r, ctx) => {
  const elapsed = Date.parse(r.afterCapturedAt) - Date.parse(r.beforeCapturedAt);
  if (elapsed <= 0 || elapsed > 30 * 60 * 1000 || r.beforeSha256 === r.afterSha256)
    ctx.addIssue({ code: "custom", message: "Interaction must contain distinct, ordered captures within 30 minutes." });
});
export type Interaction = z.infer<typeof interactionSchema>;
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
export const asBaseScene = (s: MeetScene) => ({ ...s, layout: s.layout === "meet" ? "meet" as const : "reset" as const });
export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  // Reuse the closed V1 source relationships without changing its accepted format.
  const checks = assertV1Evidence({ ...story, version: "meet-solomon-categories-v1", scenes: story.scenes.map(s => ({
    ...s, vo: s.layout === "cta" ? legacyCta(story.category) : s.vo,
    layout: s.layout === "open-detail" ? "reset" as const : s.layout,
    proofs: s.proofs.map(p => ({ ...p, phase: "always" as const })),
  })) }, evidence);
  if (story.scenes.at(-1)?.layout !== "cta" || story.scenes.at(-1)?.vo !== categoryCta(story.category)) throw new Error("V2 needs the final application-organisation CTA.");
  const opening = story.scenes.filter(s => s.layout === "open-detail");
  if (opening.length !== 1) throw new Error("V2 must include one captured card-opening interaction.");
  for (const s of story.scenes) {
    if (s.layout !== "open-detail" && s.proofs.some(p => p.phase !== "always")) throw new Error("Only the captured interaction may switch proof states.");
  }
  const s = opening[0]!, before = evidence.find(e => e.id === "open-before"), after = evidence.find(e => e.id === "open-after");
  if (!before || !after || before.kind !== "proof" || after.kind !== "establishing" || s.presenter !== "absent" ||
    s.proofs.length !== 2 || !s.proofs.some(p => p.id === before.id && p.phase === "before") || !s.proofs.some(p => p.id === after.id && p.phase === "after"))
    throw new Error("Opening requires its original card and distinct establishing detail panel, without a presenter.");
  if (!normal(before.text).includes(normal(CATEGORY_DATA[story.category].role + CATEGORY_DATA[story.category].company))) throw new Error("Opening card belongs to another category.");
  return checks;
}
export function assertInteraction(category: InternshipCategory, evidence: MeetEvidence[], raw: unknown) {
  const r = interactionSchema.parse(raw), before = evidence.find(e => e.id === "open-before"), after = evidence.find(e => e.id === "open-after");
  if (r.category !== category || !before || !after || before.sha256 !== r.beforeSha256 || after.sha256 !== r.afterSha256 ||
    before.capturedAt !== r.beforeCapturedAt || after.capturedAt !== r.afterCapturedAt)
    throw new Error("Interaction receipt must bind this category and both source captures.");
  return r;
}
export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-categories-v2"), category: categorySchema, sampleData: z.literal(true), captureMode: z.literal("offline-component-demo"),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string(), fps: z.literal(30), durationInFrames: z.number().int().positive(),
  narrationSrc: z.literal("narration.wav"), soundDesignSrc: z.literal("sound-design.wav").optional(), evidence: z.array(meetEvidenceSchema).min(1),
  scenes: z.array(meetSceneSchema).length(12), interaction: interactionSchema,
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const result = baseFilmSchema.safeParse({ ...film, version: "meet-solomon-v2", scenes: film.scenes.map(asBaseScene) });
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  try { assertMeetStoryEvidence({ ...film, requiredEvidence: {} }, film.evidence); assertInteraction(film.category, film.evidence, film.interaction); }
  catch (e) { ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Invalid category evidence." }); }
  const action = film.scenes.find(s => s.layout === "open-detail");
  if (action && (action.actionFrame < 18 || action.to - action.from - action.actionFrame < 30)) ctx.addIssue({ code: "custom", message: "Opening needs at least 0.6 seconds before selection and 1 second for the detail panel." });
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;
export function auditMeetFilm(film: MeetFilm) {
  const firstProofSeconds = (film.scenes.find(s => s.layout === "role-reveal")?.from ?? film.durationInFrames) / 30;
  const introSeconds = (film.scenes.find(s => s.layout === "meet")?.from ?? film.durationInFrames) / 30;
  const ctaSeconds = (film.scenes.at(-1)!.to - film.scenes.at(-1)!.from) / 30;
  const presenterShare = film.scenes.filter(s => s.presenter !== "absent").reduce((sum, s) => sum + s.to - s.from, 0) / film.durationInFrames;
  const longestShotSeconds = Math.max(...film.scenes.map(s => (s.to - s.from) / 30));
  if (film.durationInFrames < 900 || film.durationInFrames > 990) throw new Error("V2 films must stay within 30–33 seconds.");
  if (firstProofSeconds < 1.5 || firstProofSeconds > 3.2 || introSeconds > 6.6) throw new Error(`V2 opening timing failed: proof ${firstProofSeconds.toFixed(2)}s, introduction ${introSeconds.toFixed(2)}s.`);
  if (ctaSeconds < 3 || ctaSeconds > 5 || longestShotSeconds > 5) throw new Error(`V2 CTA/shot hold failed: CTA ${ctaSeconds.toFixed(2)}s, longest ${longestShotSeconds.toFixed(2)}s.`);
  if (presenterShare < .35 || presenterShare > .6) throw new Error(`V2 presenter share must be 35–60%; received ${(presenterShare * 100).toFixed(1)}%.`);
  return { category: film.category, durationSeconds: film.durationInFrames / 30, shots: film.scenes.length, firstProofSeconds, introSeconds, ctaSeconds, presenterShare, longestShotSeconds,
    interaction: "Captured card selection, editorial before/after cut; not continuous playback", reviewOnly: true, sampleData: true, captureMode: film.captureMode };
}
