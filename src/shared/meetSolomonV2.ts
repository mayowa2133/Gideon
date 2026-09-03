import { z } from "zod";
import { assertMeetStoryEvidence as assertLegacyEvidence, meetEvidenceSchema, meetEvidenceScale, meetFilmSchema as legacyFilmSchema, meetSceneSchema as legacySceneSchema, meetStorySchema as legacyStorySchema, type MeetEvidence } from "./meetSolomon";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const meetProofSchema = z.object({
  id, x: z.number().nonnegative(), y: z.number().nonnegative(), w: z.number().positive(), h: z.number().positive(),
  phase: z.enum(["always", "before", "after"]).default("always"),
}).superRefine((p, ctx) => {
  if (p.x + p.w > 1080 || p.y + p.h + 42 > 1780) ctx.addIssue({ code: "custom", message: "Proof and its source label must fit inside the safe frame." });
});
export type MeetProof = z.infer<typeof meetProofSchema>;
export const meetSceneSchema = legacySceneSchema.extend({
  layout: z.enum(["repeat", "inspect", "age", "question", "meet", "field", "filter", "feed", "reset", "sort", "role", "fresh", "compare", "caveat", "callback", "end"]),
  action: z.enum(["gather", "inspect", "push", "present", "point", "exchange", "reset"]),
  actionCue: z.string().min(1).optional(), actionFrame: z.number().int().nonnegative(),
  proofs: z.array(meetProofSchema).max(6),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = legacyStorySchema.extend({
  version: z.literal("meet-solomon-v2"),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true, actionFrame: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).min(12).max(24),
});
export type MeetStory = z.infer<typeof meetStorySchema>;

// Reuse the V1 boundary checks without widening its accepted version or layouts.
// V2 proof placement is authored in the blueprint, and drives this check and the picture.
export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  assertLegacyEvidence({ ...story, version: "meet-solomon-v1", scenes: story.scenes.map(s => ({ ...s, layout: "reaction" })) }, evidence);
  return story.scenes.flatMap(scene => {
    for (const key of scene.evidence) {
      if (!scene.proofs.some(p => p.id === key)) throw new Error(`Declared evidence is never shown: ${scene.id}/${key}`);
    }
    for (const p of scene.proofs) {
      if (p.phase !== "always" && !scene.actionCue) throw new Error(`Proof change has no spoken cue: ${scene.id}`);
    }
    return scene.proofs.map(p => {
      const e = evidence.find(e => e.id === p.id);
      if (!e || !scene.evidence.includes(p.id)) throw new Error(`Undeclared product proof: ${scene.id}/${p.id}`);
      const readablePx = meetEvidenceScale(e, p.w, p.h).readablePx;
      const floor = e.kind === "establishing" ? 10 : 20;
      if (readablePx < floor) throw new Error(`Proof below ${floor}px: ${scene.id}/${p.id}`);
      return { scene: scene.id, evidence: e.id, readablePx, sourceSha256: e.sha256 };
    });
  });
}

export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-v2"), id, title: z.string(), fps: z.literal(30),
  durationInFrames: z.number().int().positive(), narrationSrc: z.literal("narration.wav"),
  soundDesignSrc: z.literal("sound-design.wav").optional(), evidence: z.array(meetEvidenceSchema).min(1),
  scenes: z.array(meetSceneSchema).min(12).max(24),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const base = legacyFilmSchema.safeParse({ ...film, version: "meet-solomon-v1", scenes: film.scenes.map(s => ({ ...s, layout: "reaction" })) });
  if (!base.success) for (const issue of base.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
  for (const s of film.scenes) {
    if (s.actionFrame >= s.to - s.from) ctx.addIssue({ code: "custom", message: `Action outside scene: ${s.id}` });
    if (s.proofs.some(p => p.phase !== "always") && (s.actionFrame < 12 || s.to - s.from - s.actionFrame < 18))
      ctx.addIssue({ code: "custom", message: `Before/after proof needs time to read both states: ${s.id}` });
    if (s.layout === "compare" && (s.actionFrame < 24 || s.to - s.from - s.actionFrame < 24))
      ctx.addIssue({ code: "custom", message: `Exchanging proof cards need 18 stationary frames each: ${s.id}` });
  }
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;

export function proofIsVisible(p: MeetProof, scene: MeetScene, frame: number) {
  return p.phase === "always" || (p.phase === "before" ? frame < scene.actionFrame : frame >= scene.actionFrame);
}

export function proofOffsetX(p: MeetProof, scene: MeetScene, frame: number) {
  if (scene.layout !== "compare" || p.phase === "always") return 0;
  const ease = (at: number) => 1 - (1 - Math.max(0, Math.min(1, (frame - at) / 6))) ** 3;
  return Math.round(p.phase === "before" ? -1100 * ease(scene.actionFrame - 6) : 1100 * (1 - ease(scene.actionFrame)));
}

// Hard editorial cuts between two real captured states. Never interpolate UI text,
// remove a loading frame from a claimed continuous recording, or call this live.
export function auditMeetFilm(film: MeetFilm) {
  const frames = film.durationInFrames;
  const first = (layout: MeetScene["layout"]) => film.scenes.find(s => s.layout === layout);
  const introSeconds = (first("meet")?.from ?? frames) / 30;
  const ageRevealSeconds = (first("age")?.from ?? frames) / 30;
  const endCardSeconds = (frames - (first("end")?.from ?? 0)) / 30;
  if (introSeconds > 8 || ageRevealSeconds > 5.3 || endCardSeconds > 2.5) throw new Error("V2 pacing gate failed: reveal by 5.3s, introduce by 8s, end card at most 2.5s.");
  return { durationSeconds: frames / 30, shots: film.scenes.length, introSeconds, ageRevealSeconds, endCardSeconds,
    presenterShare: film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + s.to - s.from, 0) / frames,
    layouts: new Set(film.scenes.map(s => s.layout)).size,
    longestShotSeconds: Math.max(...film.scenes.map(s => (s.to - s.from) / 30)),
    meanShotSeconds: frames / 30 / film.scenes.length, reviewOnly: true,
    archivedEvidence: film.evidence.filter(e => e.source === "archived-product-capture").map(e => e.id),
  };
}
