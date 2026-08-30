import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const rect = z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() });
export const meetEvidenceSchema = z.object({
  id, file: z.string().regex(/^[a-z0-9-]+\.png$/), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().datetime(), source: z.enum(["archived-product-capture", "current-product-capture"]),
  approved: z.literal(true), sourceWidth: z.number().positive(), sourceHeight: z.number().positive(),
  kind: z.enum(["proof", "establishing"]).default("proof"),
  crop: rect, text: z.string().min(1), textHeight: z.number().positive(),
}).superRefine((e, ctx) => {
  if (e.crop.x + e.crop.width > e.sourceWidth || e.crop.y + e.crop.height > e.sourceHeight)
    ctx.addIssue({ code: "custom", message: "Evidence crop must stay inside its verified source." });
  if (/(?:ignore|override|disregard)\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions|prompts)|system\s*prompt/i.test(e.text))
    ctx.addIssue({ code: "custom", message: "Instruction-like screen text cannot ground claims." });
});
export type MeetEvidence = z.infer<typeof meetEvidenceSchema>;
export const meetLayoutSchema = z.enum(["hook", "checklist", "detail", "stale", "reaction", "meet", "profile", "automatic", "leave", "feed", "fresh", "sort", "compare", "question", "payoff", "end"]);
const phraseSchema = z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]).default("bold"), from: z.number().int().nonnegative(), to: z.number().int().positive() });
export const meetSceneSchema = z.object({
  id, layout: meetLayoutSchema, vo: z.string().min(1), headline: z.string().min(1),
  from: z.number().int().nonnegative(), to: z.number().int().positive(),
  background: z.enum(["ivory", "clay", "charcoal", "sage"]),
  presenter: z.enum(["close", "left", "right", "center", "absent"]),
  expression: z.enum(["friendly", "happy", "concerned", "focused", "skeptical", "direct_cta"]),
  gesture: z.enum(["approval", "thinking_hand", "wave", "open_palm", "true_point_left", "true_point_right", "presentation_palm", "stop_palm"]),
  evidence: z.array(id), phrases: z.array(phraseSchema),
  newInformation: z.string().min(10), visualMetaphor: z.string().min(10), transition: z.string().min(10),
});
export type MeetScene = z.infer<typeof meetSceneSchema>;
export const meetStorySchema = z.object({
  version: z.literal("meet-solomon-v1"), id, title: z.string().min(1),
  requiredEvidence: z.record(id, z.string().min(1)),
  scenes: z.array(meetSceneSchema.omit({ from: true, to: true, phrases: true }).extend({
    captionPhrases: z.array(z.object({ text: z.string().min(1).max(48), style: z.enum(["bold", "serif"]) })).optional(),
  })).min(12).max(24),
});
export type MeetStory = z.infer<typeof meetStorySchema>;

export function assertMeetStoryEvidence(story: MeetStory, evidence: MeetEvidence[]) {
  const normal = (text: string) => text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const numbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  const figures = (text: string) => normal(text).split(" ").flatMap(word => /^\d+$/.test(word) ? [Number(word)] : numbers.includes(word) ? [numbers.indexOf(word)] : []);
  for (const [id, quote] of Object.entries(story.requiredEvidence)) {
    const e = evidence.find(item => item.id === id);
    if (!e || e.kind !== "proof" || !normal(e.text).includes(normal(quote))) throw new Error(`Required evidence disagrees with the script: ${id}`);
  }
  for (const scene of story.scenes) {
    if (!scene.evidence.length) continue;
    const sourceFigures = scene.evidence.flatMap(id => figures(evidence.find(e => e.id === id && e.kind === "proof")?.text ?? ""));
    if (figures(scene.vo).some(n => !sourceFigures.includes(n))) throw new Error(`Spoken figure lacks same-scene evidence: ${scene.id}`);
  }
  return story.scenes.flatMap(scene => proofPlacements(scene).map(p => {
    const e = evidence.find(item => item.id === p.id);
    if (!e || !scene.evidence.includes(p.id)) throw new Error(`Undeclared product proof: ${scene.id}/${p.id}`);
    const box = meetEvidenceScale(e, p.w, p.h);
    const floor = e.kind === "establishing" ? 10 : 20;
    if (box.readablePx < floor) throw new Error(`Proof below ${floor}px: ${scene.id}/${p.id}`);
    return { scene: scene.id, evidence: p.id, readablePx: box.readablePx, sourceSha256: e.sha256 };
  }));
}
export const meetFilmSchema = z.object({
  version: z.literal("meet-solomon-v1"), id, title: z.string(), fps: z.literal(30),
  durationInFrames: z.number().int().positive(), narrationSrc: z.literal("narration.wav"),
  soundDesignSrc: z.literal("sound-design.wav").optional(),
  evidence: z.array(meetEvidenceSchema).min(1), scenes: z.array(meetSceneSchema).min(12).max(24),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }),
  reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  const evidence = new Set(film.evidence.map(e => e.id));
  if (evidence.size !== film.evidence.length) ctx.addIssue({ code: "custom", message: "Duplicate evidence IDs." });
  const ids = new Set<string>();
  let cursor = 0;
  for (const scene of film.scenes) {
    if (ids.has(scene.id)) ctx.addIssue({ code: "custom", message: "Duplicate scene IDs." });
    ids.add(scene.id);
    if (scene.from !== cursor || scene.to <= scene.from) ctx.addIssue({ code: "custom", message: `Discontinuous scene: ${scene.id}.` });
    cursor = scene.to;
    for (const key of scene.evidence) if (!evidence.has(key)) ctx.addIssue({ code: "custom", message: `Missing evidence: ${key}.` });
    for (const phrase of scene.phrases) {
      if (phrase.from < scene.from || phrase.to > scene.to || phrase.to <= phrase.from)
        ctx.addIssue({ code: "custom", message: `Caption outside scene: ${scene.id}.` });
    }
  }
  if (cursor !== film.durationInFrames) ctx.addIssue({ code: "custom", message: "Duration must match the final cut." });
});
export type MeetFilm = z.infer<typeof meetFilmSchema>;

export interface ProofPlacement { id: string; x: number; y: number; w: number; h: number; from?: number; to?: number }
// Shared by preflight and rendering so layout and legibility have one source.
export function proofPlacements(scene: Pick<MeetScene, "layout">): ProofPlacement[] {
  switch (scene.layout) {
    case "stale": return [{ id: "older-age", x: 140, y: 1270, w: 800, h: 126 }];
    case "fresh": return [{ id: "recent-age", x: 90, y: 1270, w: 900, h: 110 }];
    case "automatic": return [{ id: "automatic", x: 78, y: 950, w: 924, h: 115 }];
    case "feed": return [{ id: "feed-context", x: 45, y: 530, w: 990, h: 840, to: 30 }, { id: "recent-role", x: 90, y: 620, w: 900, h: 160, from: 30 }];
    case "sort": return [{ id: "sort", x: 130, y: 615, w: 750, h: 180 }];
    case "compare": return [{ id: "older-age", x: 105, y: 670, w: 870, h: 100 }, { id: "recent-age", x: 105, y: 1260, w: 870, h: 100 }];
    default: return [];
  }
}

// The same contain transform drives both the picture and the readability check.
// No cover/zoom path may silently crop away a claimed word.
export function meetEvidenceScale(evidence: MeetEvidence, width: number, height: number) {
  const scale = Math.min(width / evidence.crop.width, height / evidence.crop.height);
  return { scale, width: evidence.crop.width * scale, height: evidence.crop.height * scale, readablePx: evidence.textHeight * scale };
}

export function auditMeetFilm(film: MeetFilm) {
  const durations = film.scenes.map(s => (s.to - s.from) / film.fps);
  const visible = film.scenes.filter(s => s.presenter !== "absent").reduce((n, s) => n + (s.layout === "feed" ? Math.max(0, s.to - s.from - 30) : s.layout === "leave" ? Math.min(s.to - s.from, Math.max(10, (s.to - s.from) * .45) + 22) : s.to - s.from), 0) / film.durationInFrames;
  return { durationSeconds: film.durationInFrames / film.fps, shots: film.scenes.length,
    presenterShare: visible, layouts: new Set(film.scenes.map(s => s.layout)).size,
    longestShotSeconds: Math.max(...durations), meanShotSeconds: durations.reduce((a, b) => a + b, 0) / durations.length,
    reviewOnly: true, archivedEvidence: film.evidence.filter(e => e.source === "archived-product-capture").map(e => e.id) };
}
