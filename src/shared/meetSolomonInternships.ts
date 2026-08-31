import { z } from "zod";
import { meetEvidenceSchema, type MeetEvidence } from "./meetSolomon";
import { assertMeetStoryEvidence as assertV2Evidence, meetFilmSchema as v2FilmSchema, meetProofSchema, meetSceneSchema as v2SceneSchema, meetStorySchema as v2StorySchema, type MeetScene as V2Scene } from "./meetSolomonV2";

export const INTERNSHIP_CTA = "Start your internship search with Solomon.";
export const meetSceneSchema = v2SceneSchema.extend({
  layout: z.enum(["hunt", "tabs", "intern-reveal", "meet", "role-company", "tracker-view", "stage", "status-caveat", "requirements", "fit", "next-step", "return", "recap", "untangle", "clarity", "cta"]),
  proofs: z.array(meetProofSchema.safeExtend({ phase: z.literal("always").default("always") })).max(6),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = v2StorySchema.extend({
  version: z.literal("meet-solomon-internships-v1"), sampleData: z.literal(true),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).min(12).max(24),
});
export type MeetStory = z.infer<typeof meetStorySchema>;
export const asV2Scene = (s: MeetScene): V2Scene => ({ ...s, layout: s.layout === "meet" ? "meet" : "reset" });

export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  const checks = assertV2Evidence({ ...story, version: "meet-solomon-v2", scenes: story.scenes.map(s => ({ ...s, layout: "reset" })) }, evidence);
  if (checks.some(c => evidence.find(e => e.id === c.evidence)?.kind === "proof" && c.readablePx < 28))
    throw new Error("Internship factual proof must reach 28px.");
  const required = (id: string) => {
    const e = evidence.find(e => e.id === id && e.kind === "proof");
    if (!e) throw new Error(`Missing internship proof: ${id}`);
    return e;
  };
  const role = required("intern-role"), company = required("intern-company"), card = required("intern-card"), stage = required("intern-stage");
  if (!/\bintern(?:ship)?\b/i.test(role.text)) throw new Error("The role must actually name an internship.");
  for (const e of [company, card, stage]) if (e.sha256 !== role.sha256 || e.file !== role.file || e.capturedAt !== role.capturedAt)
    throw new Error("Internship role, company, card and stage must share the captured source.");
  for (const e of [role, company]) if (e.crop.x < card.crop.x || e.crop.y < card.crop.y ||
    e.crop.x + e.crop.width > card.crop.x + card.crop.width || e.crop.y + e.crop.height > card.crop.y + card.crop.height)
    throw new Error("Role and company must come from the same internship card.");
  if (Math.abs(company.crop.x - role.crop.x) > 8 || company.crop.y - role.crop.y < 12 || company.crop.y - role.crop.y > 32)
    throw new Error("Company does not belong immediately beneath the internship title.");
  if (Math.abs(stage.crop.x - role.crop.x) > 16 || role.crop.y - stage.crop.y < 30 || role.crop.y - stage.crop.y > 240)
    throw new Error("Internship stage must head the same captured column.");
  const has = (s: MeetStory["scenes"][number], ids: string[]) => ids.every(id => s.evidence.includes(id));
  for (const s of story.scenes) {
    if (s.layout === "intern-reveal" && (!has(s, ["intern-card"]) || !/\bdemo\b/i.test(s.vo))) throw new Error("The internship reveal must show the sample card and say demo.");
    if (s.layout === "role-company" && !has(s, ["intern-role", "intern-company"])) throw new Error("Role/company proof must be visible together.");
    if (["stage", "recap"].includes(s.layout) && !has(s, ["intern-role", "intern-stage"])) throw new Error("Stage claim must show its internship role and column label.");
  }
  if (story.scenes.filter(s => s.layout === "cta").length !== 1 || story.scenes.at(-1)?.layout !== "cta" || story.scenes.at(-1)?.vo !== INTERNSHIP_CTA)
    throw new Error("End with the explicit internship CTA; no unverified delivery destination.");
  return checks;
}

export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-internships-v1"), sampleData: z.literal(true),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string(), fps: z.literal(30), durationInFrames: z.number().int().positive(),
  narrationSrc: z.literal("narration.wav"), soundDesignSrc: z.literal("sound-design.wav").optional(),
  evidence: z.array(meetEvidenceSchema).min(1), scenes: z.array(meetSceneSchema).min(12).max(24),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const checked = v2FilmSchema.safeParse({ ...film, version: "meet-solomon-v2", scenes: film.scenes.map(asV2Scene) });
  if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  try { assertMeetStoryEvidence({ ...film, requiredEvidence: {} }, film.evidence); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid internship evidence." }); }
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;

export function auditMeetFilm(film: MeetFilm) {
  const introSeconds = (film.scenes.find(s => s.layout === "meet")?.from ?? film.durationInFrames) / 30;
  const firstProofSeconds = (film.scenes.find(s => s.layout === "intern-reveal")?.from ?? film.durationInFrames) / 30;
  const cta = film.scenes.at(-1)!, ctaSeconds = (cta.to - cta.from) / 30;
  const longestShotSeconds = Math.max(...film.scenes.map(s => (s.to - s.from) / 30));
  const presenterShare = film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + s.to - s.from, 0) / film.durationInFrames;
  if (introSeconds > 8.5 || firstProofSeconds > 5.5 || longestShotSeconds > 4.5) throw new Error("Internship pacing gate failed.");
  if (cta.layout !== "cta" || ctaSeconds < 2.3 || ctaSeconds > 4.5) throw new Error("The internship CTA needs a readable 2.3–4.5 second hold.");
  if (presenterShare < .5 || presenterShare > .7) throw new Error("Internship presenter share must remain 50–70%.");
  return { durationSeconds: film.durationInFrames / 30, shots: film.scenes.length, introSeconds, firstProofSeconds, ctaSeconds, presenterShare,
    layouts: new Set(film.scenes.map(s => s.layout)).size, longestShotSeconds, meanShotSeconds: film.durationInFrames / 30 / film.scenes.length,
    reviewOnly: true, sampleData: true, archivedEvidence: film.evidence.filter(e => e.source === "archived-product-capture").map(e => e.id) };
}
