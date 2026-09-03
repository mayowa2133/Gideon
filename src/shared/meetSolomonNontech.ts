import { z } from "zod";
import { meetEvidenceSchema, type MeetEvidence } from "./meetSolomon";
import { assertMeetStoryEvidence as assertV2Evidence, meetFilmSchema as v2FilmSchema, meetProofSchema, meetSceneSchema as v2SceneSchema, meetStorySchema as v2StorySchema, type MeetScene as V2Scene } from "./meetSolomonV2";

export const meetSceneSchema = v2SceneSchema.extend({
  layout: z.enum(["code-wall", "only-code", "legal-reveal", "meet", "company-search", "company-view", "legal-detail", "reset", "partners-reveal", "partners-detail", "constellation", "requirements", "narrow", "your-field", "callback", "end"]),
  proofs: z.array(meetProofSchema.safeExtend({ phase: z.literal("always").default("always") })).max(6),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = v2StorySchema.extend({
  version: z.literal("meet-solomon-nontech-v1"),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).min(12).max(24),
});
export type MeetStory = z.infer<typeof meetStorySchema>;

// Use common boundary and proof checks while keeping the earlier film schemas
// closed to new layouts. No #5 scene goes through an age-reveal V2 art template.
export const asV2Scene = (s: MeetScene): V2Scene => ({ ...s, layout: s.layout === "meet" || s.layout === "end" ? s.layout : "reset" });

export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  const checks = assertV2Evidence({ ...story, version: "meet-solomon-v2", scenes: story.scenes.map(s => ({ ...s, layout: "reset" })) }, evidence);
  if (checks.some(c => evidence.find(e => e.id === c.evidence)?.kind === "proof" && c.readablePx < 28))
    throw new Error("Nontech factual proof must reach the 28px type target.");
  const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pairs = [["legal-title", "legal-employer"], ["partners-title", "partners-employer"]] as const;
  const employers = pairs.map(([titleId, employerId]) => {
    const title = evidence.find(e => e.id === titleId), employer = evidence.find(e => e.id === employerId);
    if (!title || !employer || title.kind !== "proof" || employer.kind !== "proof") throw new Error("Role and employer proof are required.");
    if (title.sha256 !== employer.sha256 || title.capturedAt !== employer.capturedAt || title.file !== employer.file ||
      Math.abs(title.crop.x - employer.crop.x) > 8 || employer.crop.y - title.crop.y < 12 || employer.crop.y - title.crop.y > 32)
      throw new Error("Role and employer must belong to the same captured card.");
    return employer;
  });
  if (normal(employers[0]!.text) !== normal(employers[1]!.text) || employers[0]!.sha256 !== employers[1]!.sha256)
    throw new Error("The same-company claim requires matching employers in the same capture.");
  for (const s of story.scenes) {
    if (["legal-reveal", "legal-detail"].includes(s.layout) && !["legal-title", "legal-employer"].every(id => s.evidence.includes(id)))
      throw new Error(`Legal reveal requires its own title and employer: ${s.id}`);
    if (["partners-reveal", "partners-detail"].includes(s.layout) && !["partners-title", "partners-employer"].every(id => s.evidence.includes(id)))
      throw new Error(`Partnerships reveal requires its own title and employer: ${s.id}`);
  }
  return checks;
}

export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-nontech-v1"), id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string(),
  fps: z.literal(30), durationInFrames: z.number().int().positive(), narrationSrc: z.literal("narration.wav"),
  soundDesignSrc: z.literal("sound-design.wav").optional(), evidence: z.array(meetEvidenceSchema).min(1),
  scenes: z.array(meetSceneSchema).min(12).max(24),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const checked = v2FilmSchema.safeParse({ ...film, version: "meet-solomon-v2", scenes: film.scenes.map(asV2Scene) });
  if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;

export function auditMeetFilm(film: MeetFilm) {
  const first = (layout: MeetScene["layout"]) => film.scenes.find(s => s.layout === layout);
  const introSeconds = (first("meet")?.from ?? film.durationInFrames) / 30;
  const firstProofSeconds = (first("legal-reveal")?.from ?? film.durationInFrames) / 30;
  const endCardSeconds = (film.durationInFrames - (first("end")?.from ?? 0)) / 30;
  const presenterShare = film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + s.to - s.from, 0) / film.durationInFrames;
  const longestShotSeconds = Math.max(...film.scenes.map(s => (s.to - s.from) / 30));
  if (introSeconds > 8.5 || firstProofSeconds > 5.5 || endCardSeconds > 2.5 || longestShotSeconds > 4.5)
    throw new Error("Nontech pacing failed: proof by 5.5s, introduction by 8.5s, short end card and shots.");
  if (presenterShare < .5 || presenterShare > .7) throw new Error("Nontech presenter share must remain 50–70%.");
  return { durationSeconds: film.durationInFrames / 30, shots: film.scenes.length, introSeconds, firstProofSeconds, endCardSeconds, presenterShare,
    layouts: new Set(film.scenes.map(s => s.layout)).size, longestShotSeconds, meanShotSeconds: film.durationInFrames / 30 / film.scenes.length,
    reviewOnly: true, archivedEvidence: film.evidence.filter(e => e.source === "archived-product-capture").map(e => e.id) };
}
