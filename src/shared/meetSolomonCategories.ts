import { z } from "zod";
import { meetEvidenceSchema, type MeetEvidence } from "./meetSolomon";
import { assertMeetStoryEvidence as assertV2Evidence, meetFilmSchema as v2FilmSchema, meetProofSchema, meetSceneSchema as v2SceneSchema, meetStorySchema as v2StorySchema, type MeetScene as V2Scene } from "./meetSolomonV2";

export const categorySchema = z.enum(["finance", "software", "law"]);
export type InternshipCategory = z.infer<typeof categorySchema>;
export const CATEGORY_DATA = {
  finance: { label: "Finance", role: "Finance Intern", company: "Example Finance Co.", stage: "Applied", detail: "Review the role requirements." },
  software: { label: "Software", role: "Software Engineering Intern", company: "Example Software Studio", stage: "Interviewing", detail: "Technical" },
  law: { label: "Law", role: "Legal Intern", company: "Example Legal Group", stage: "Applied", detail: "Check eligibility and required documents." },
} as const;
export const categoryCta = (category: InternshipCategory) => `Ready? Start your ${category} internship search with Solomon.`;
export const meetSceneSchema = v2SceneSchema.extend({
  layout: z.enum(["category-hook", "noise", "split", "role-reveal", "meet", "role-company", "stage", "reset", "category-detail", "category-map", "criteria", "choose", "tracker-view", "recap", "category-payoff", "bridge", "cta"]),
  proofs: z.array(meetProofSchema.safeExtend({ phase: z.literal("always").default("always") })).max(6),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = v2StorySchema.extend({
  version: z.literal("meet-solomon-categories-v1"), category: categorySchema, sampleData: z.literal(true), captureMode: z.literal("offline-component-demo"),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).min(12).max(24),
});
export type MeetStory = z.infer<typeof meetStorySchema>;
export const asV2Scene = (s: MeetScene): V2Scene => ({ ...s, layout: s.layout === "meet" ? "meet" : "reset" });
const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  const checks = assertV2Evidence({ ...story, version: "meet-solomon-v2", scenes: story.scenes.map(s => ({ ...s, layout: "reset" })) }, evidence);
  if (checks.some(c => evidence.find(e => e.id === c.evidence)?.kind === "proof" && c.readablePx < 28)) throw new Error("Category proof must reach 28px.");
  const required = (id: string) => {
    const e = evidence.find(e => e.id === id && e.kind === "proof");
    if (!e) throw new Error(`Missing category proof: ${id}`);
    return e;
  };
  const data = CATEGORY_DATA[story.category], role = required("role"), company = required("company"), card = required("role-card"), stage = required("stage");
  const detailRole = required("detail-role"), detail = required("category-detail");
  for (const [e, expected] of [[role, data.role], [company, data.company], [stage, data.stage], [detailRole, data.role], [detail, data.detail]] as const)
    if (normal(e.text) !== normal(expected)) throw new Error(`Evidence belongs to the wrong internship category: ${e.id}`);
  if (!normal(card.text).includes(normal(data.role + data.company))) throw new Error("The complete card must contain this category's role and company.");
  const sameSource = (a: MeetEvidence, b: MeetEvidence) => a.sha256 === b.sha256 && a.file === b.file && a.capturedAt === b.capturedAt;
  for (const e of [company, card, stage]) if (!sameSource(role, e)) throw new Error("The role, company, card and stage must share a source.");
  for (const e of [role, company]) if (e.crop.x < card.crop.x || e.crop.y < card.crop.y ||
    e.crop.x + e.crop.width > card.crop.x + card.crop.width || e.crop.y + e.crop.height > card.crop.y + card.crop.height)
    throw new Error("Role and company must be inside the same captured card.");
  if (Math.abs(role.crop.x - company.crop.x) > 8 || company.crop.y < role.crop.y + role.crop.height - 5 || company.crop.y > role.crop.y + role.crop.height + 16)
    throw new Error("Company must follow the original title, including wrapped titles.");
  if (Math.abs(stage.crop.x - role.crop.x) > 16 || role.crop.y - stage.crop.y < 20 || role.crop.y - stage.crop.y > 240)
    throw new Error("Stage must head the same original column.");
  if (!sameSource(detail, detailRole) || Math.abs(detail.crop.x - detailRole.crop.x) > 20 || detail.crop.y <= detailRole.crop.y)
    throw new Error("The category detail must belong to the selected role's source panel.");
  for (const s of story.scenes) {
    const has = (...ids: string[]) => ids.every(id => s.evidence.includes(id));
    if (s.layout === "role-reveal" && (!has("role-card") || !/\b(sample|demo)\b/i.test(s.vo))) throw new Error("Reveal the sample card with a spoken demo disclosure.");
    if (s.layout === "role-company" && !has("role", "company")) throw new Error("Show role and company together.");
    if (["stage", "recap"].includes(s.layout) && !has("role", "stage")) throw new Error("Show the role with its stage.");
    if (s.layout === "category-detail" && !has("detail-role", "category-detail")) throw new Error("Show the selected role with its category detail.");
  }
  if (story.scenes.filter(s => s.layout === "cta").length !== 1 || story.scenes.at(-1)?.layout !== "cta" || story.scenes.at(-1)?.vo !== categoryCta(story.category))
    throw new Error("Each film must end with its own category-specific CTA.");
  return checks;
}

export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-categories-v1"), category: categorySchema, sampleData: z.literal(true), captureMode: z.literal("offline-component-demo"),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string(), fps: z.literal(30), durationInFrames: z.number().int().positive(),
  narrationSrc: z.literal("narration.wav"), soundDesignSrc: z.literal("sound-design.wav").optional(),
  evidence: z.array(meetEvidenceSchema).min(1), scenes: z.array(meetSceneSchema).min(12).max(24),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const checked = v2FilmSchema.safeParse({ ...film, version: "meet-solomon-v2", scenes: film.scenes.map(asV2Scene) });
  if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  try { assertMeetStoryEvidence({ ...film, requiredEvidence: {} }, film.evidence); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid category evidence." }); }
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;
export function auditMeetFilm(film: MeetFilm) {
  const introSeconds = (film.scenes.find(s => s.layout === "meet")?.from ?? film.durationInFrames) / 30;
  const firstProofSeconds = (film.scenes.find(s => s.layout === "role-reveal")?.from ?? film.durationInFrames) / 30;
  const cta = film.scenes.at(-1)!, ctaSeconds = (cta.to - cta.from) / 30;
  const longestShotSeconds = Math.max(...film.scenes.map(s => (s.to - s.from) / 30));
  const presenterShare = film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + s.to - s.from, 0) / film.durationInFrames;
  if (introSeconds > 8.5 || firstProofSeconds > 5.5 || longestShotSeconds > 4.8) throw new Error("Category pacing gate failed.");
  if (cta.layout !== "cta" || ctaSeconds < 2.8 || ctaSeconds > 4.8) throw new Error("The category CTA needs a readable 2.8–4.8 second hold.");
  if (presenterShare < .5 || presenterShare > .7) throw new Error("Category presenter share must remain 50–70%.");
  return { category: film.category, durationSeconds: film.durationInFrames / 30, shots: film.scenes.length, introSeconds, firstProofSeconds, ctaSeconds, presenterShare,
    layouts: new Set(film.scenes.map(s => s.layout)).size, longestShotSeconds, meanShotSeconds: film.durationInFrames / 30 / film.scenes.length,
    reviewOnly: true, sampleData: true, captureMode: film.captureMode };
}
