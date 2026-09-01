import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const crop = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() });
export const opportunitySourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), file: z.string().regex(/^[a-z0-9-]+\.png$/), sourcePath: z.string().min(1),
  sha256: digest, capturedAt: z.string().datetime(), sourceWidth: z.literal(1440), sourceHeight: z.literal(900),
  cards: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), category: z.string().min(2).max(32), crop })).min(3),
});
export const opportunitySceneSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/), vo: z.string().min(8).max(180), headline: z.string().min(3).max(80),
  from: z.number().int().nonnegative().optional(), to: z.number().int().positive().optional(),
});
const opportunityStoryBase = z.object({
  version: z.literal("meet-solomon-opportunity-scroll-v1"), id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), title: z.string().min(3),
  sources: z.array(opportunitySourceSchema).min(2), scenes: z.array(opportunitySceneSchema.omit({ from: true, to: true })).length(6),
});
export const opportunityStorySchema = opportunityStoryBase.superRefine((story, ctx) => {
  const ids = story.sources.flatMap(source => source.cards.map(card => card.id));
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Opportunity card IDs must be unique." });
  for (const source of story.sources) for (const card of source.cards) {
    if (card.crop.x + card.crop.width > source.sourceWidth || card.crop.y + card.crop.height > source.sourceHeight)
      ctx.addIssue({ code: "custom", message: `Card ${card.id} exceeds its source capture.` });
  }
  const allVo = story.scenes.map(scene => scene.vo).join(" ");
  if (/exclusive/i.test(allVo)) ctx.addIssue({ code: "custom", message: "Do not claim the public-source job feed is exclusive." });
  if (!/listings can change/i.test(allVo)) ctx.addIssue({ code: "custom", message: "The film must say listings can change." });
  if (story.scenes.at(-1)?.vo !== "Want easy access to more opportunities? Join Solomon.") ctx.addIssue({ code: "custom", message: "The film must end with the approved informational CTA." });
});
export const opportunityFilmSchema = opportunityStoryBase.omit({ scenes: true }).extend({
  fps: z.literal(30), durationInFrames: z.number().int().min(600).max(1050), narrationSrc: z.literal("narration.wav"),
  sources: z.array(opportunitySourceSchema.omit({ sourcePath: true })).min(2), scenes: z.array(opportunitySceneSchema.required({ from: true, to: true })).length(6),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(.9).max(1) }), reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  if (film.scenes[0]?.from !== 0 || film.scenes.at(-1)?.to !== film.durationInFrames) ctx.addIssue({ code: "custom", message: "Scenes must cover the full film." });
  if ((film.scenes.at(-1)!.to - film.scenes.at(-1)!.from) / film.fps < 4) ctx.addIssue({ code: "custom", message: "CTA must hold for at least four seconds." });
});

export type OpportunityStory = z.infer<typeof opportunityStorySchema>;
export type OpportunityFilm = z.infer<typeof opportunityFilmSchema>;
