import { z } from "zod";
import { meetEvidenceSchema, meetEvidenceScale, meetFilmSchema as baseFilm, type MeetEvidence } from "./meetSolomon";
import { meetSceneSchema as v2Scene, meetStorySchema as v2Story, assertMeetStoryEvidence as assertV2 } from "./meetSolomonV2";

export const realCta = (category: string) => `Find your next ${category === "law" ? "legal" : category} internship with Solomon.`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const https = z.string().url().refine(value => new URL(value).protocol === "https:", "Employer URLs must use HTTPS.");
export const listingSchema = z.object({
  employer: z.string().min(2), role: z.string().min(8), employerUrl: https,
  verifiedAt: z.string().datetime(), verificationFile: z.string().regex(/^[a-z0-9-]+\.txt$/), verificationSha256: digest,
  employerPageRole: z.string().min(8), applicationControlObserved: z.literal(true),
  productUrl: z.string().url(), captureMode: z.literal("real-product-live-data"),
  accountContext: z.literal("existing-local-development-session"), sampleData: z.literal(false),
}).superRefine((listing, ctx) => {
  if (/example|fictional|sample|northstar/i.test(listing.employer + " " + listing.role)) ctx.addIssue({ code: "custom", message: "Demo records cannot be used in real internship films." });
  if (!/intern/i.test(listing.role) || !/intern/i.test(listing.employerPageRole)) ctx.addIssue({ code: "custom", message: "Both product and employer must identify an internship." });
});
const layout = z.enum(["hook", "reveal", "meet", "overview", "employer", "location", "reset", "requirements", "fit", "posting", "caveat", "cta"]);
export const meetSceneSchema = v2Scene.extend({ layout });
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const asV2Scene = (scene: MeetScene) => ({ ...scene, layout: "question" as const });
const realVersion = z.enum(["meet-solomon-real-internships-v1", "meet-solomon-real-internships-v2"]);
export const meetStorySchema = v2Story.extend({
  version: realVersion, category: z.enum(["finance", "software", "law"]), listing: listingSchema,
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).length(12),
});
export type MeetStory = z.infer<typeof meetStorySchema>;
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
export function assertVerification(listing: z.infer<typeof listingSchema>, pageText: string, sha256: string) {
  if (sha256 !== listing.verificationSha256) throw new Error("Employer verification text hash mismatch.");
  if (!normal(pageText).includes(normal(listing.employerPageRole)) || !normal(pageText).includes(normal(listing.employer)) || !/\bApply\b/.test(pageText)) throw new Error("Employer verification must contain the exact internship, employer and application control.");
}
export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  const result = assertV2({ ...story, version: "meet-solomon-v2", scenes: story.scenes.map(s => ({ ...s, layout: "question" })) }, evidence);
  if (new Set(evidence.map(e => e.id)).size !== evidence.length) throw new Error("Duplicate evidence IDs.");
  if (new Set(evidence.map(e => e.sha256)).size !== 1) throw new Error("This format requires one selected job capture; do not mix listings.");
  for (const e of evidence) {
    if (e.source !== "current-product-capture") throw new Error("Real internships require current product captures.");
    if (Math.abs(Date.parse(e.capturedAt) - Date.parse(story.listing.verifiedAt)) > 86400000) throw new Error("Capture and employer verification must be within one day.");
  }
  for (const scene of story.scenes) for (const p of scene.proofs) {
    const e = evidence.find(e => e.id === p.id)!;
    if (p.phase !== "always") throw new Error("Do not imply an unrecorded live interaction.");
    if (meetEvidenceScale(e, p.w, p.h).readablePx < (e.kind === "proof" ? 28 : 10)) throw new Error("Real internship proof below its readability floor.");
  }
  const reveal = story.scenes.find(s => s.layout === "reveal");
  const revealedText = reveal?.proofs.map(p => evidence.find(e => e.id === p.id && e.kind === "proof")?.text ?? "").join(" ") ?? "";
  if (!normal(revealedText).includes(normal(story.listing.employer)) || !/intern/i.test(revealedText)) throw new Error("The reveal must show its employer and internship in same-scene proof.");
  const identity = evidence.filter(e => e.kind === "proof").map(e => e.text).join(" ");
  if (!normal(identity).includes(normal(story.listing.employer))) throw new Error("Employer must be visible in product proof.");
  // Full role is captured as one band; fragments may be shown at larger sizes too.
  if (!evidence.some(e => normal(e.text).includes(normal(story.listing.role)))) throw new Error("The exact selected role is missing from the captured product.");
  const last = story.scenes.at(-1)!;
  if (last.layout !== "cta" || last.vo !== realCta(story.category)) throw new Error("Real internship films must end with their spoken CTA.");
  if (!story.scenes.some(s => s.layout === "caveat" && /change/i.test(s.vo))) throw new Error("Explain that listings can change.");
  if (story.version === "meet-solomon-real-internships-v2") {
    const spoken = story.scenes.map(s => s.vo).join(" ");
    if (story.scenes.some(s => /make sure|guarantee|will match/i.test(s.vo))) throw new Error("Do not claim Solomon guarantees a resume match or outcome.");
    if (!/tailor/i.test(spoken) || !/track|checklist|organi[sz]/i.test(spoken)) throw new Error("Benefit-led films must explain Solomon resume tailoring and application organisation.");
    for (const id of ["tailoring", "checklist"]) if (!story.scenes.some(s => s.proofs.some(p => p.id === id))) throw new Error(`Benefit-led films require ${id} product proof.`);
  }
  return result;
}
export const meetFilmSchema = z.object({
  version: realVersion, category: z.enum(["finance", "software", "law"]), listing: listingSchema,
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string(), fps: z.literal(30), durationInFrames: z.number().int().positive(),
  narrationSrc: z.literal("narration.wav"), soundDesignSrc: z.literal("sound-design.wav").optional(), evidence: z.array(meetEvidenceSchema).min(1),
  scenes: z.array(meetSceneSchema).length(12), alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const parsed = baseFilm.safeParse({ ...film, version: "meet-solomon-v1", scenes: film.scenes.map(s => ({ ...s, layout: "reaction" })) });
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;
export function auditMeetFilm(film: MeetFilm) {
  const firstProof = film.scenes.find(s => s.proofs.some(p => film.evidence.find(e => e.id === p.id)?.kind === "proof"));
  const ctaSeconds = (film.durationInFrames - film.scenes.at(-1)!.from) / 30;
  const introSeconds = (film.scenes.find(s => s.layout === "meet")?.from ?? Infinity) / 30;
  if (!firstProof || firstProof.from / 30 > 4 || introSeconds > 9 || ctaSeconds < 3 || ctaSeconds > 6) throw new Error("Real internship pacing requires early proof, introduction, and a readable final CTA.");
  return { durationSeconds: film.durationInFrames / 30, shots: film.scenes.length, firstProofSeconds: firstProof.from / 30, introSeconds, ctaSeconds,
    presenterShare: film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + s.to - s.from, 0) / film.durationInFrames,
    longestShotSeconds: Math.max(...film.scenes.map(s => (s.to - s.from) / 30)), verifiedAt: film.listing.verifiedAt, sampleData: false, reviewOnly: true };
}
