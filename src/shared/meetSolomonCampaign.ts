import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const crop = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const meetSolomonCampaignAngleSchema = z.enum([
  "application-triage",
  "company-opportunities",
  "follow-up-cadence",
  "commute-fit",
  "ai-control",
]);

export const meetSolomonCampaignSourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  file: z.string().regex(/^[a-z0-9-]+\.png$/),
  sourcePath: z.string().min(1),
  sha256: digest,
  capturedAt: z.string().datetime(),
  sourceWidth: z.literal(1440),
  sourceHeight: z.literal(900),
  proofs: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    expectedText: z.string().min(2),
    crop,
  })).min(1),
});

export const meetSolomonCampaignSceneSchema = z.object({
  id: z.enum(["hook", "metaphor", "proof-one", "proof-two", "payoff", "cta"]),
  vo: z.string().min(8).max(220),
  headline: z.string().min(3).max(86),
  proofIds: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(3).default([]),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
});

const approvedCtas = {
  "application-triage": "Want to stop wasting applications? Join Solomon.",
  "company-opportunities": "Want one place to explore a company’s openings? Join Solomon.",
  "follow-up-cadence": "Want your next follow-up kept in view? Join Solomon.",
  "commute-fit": "Want opportunities that fit your real life? Join Solomon.",
  "ai-control": "Want AI help with you in control? Join Solomon.",
} as const;

const storyBase = z.object({
  version: z.literal("meet-solomon-campaign-v1"),
  angle: meetSolomonCampaignAngleSchema,
  id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: z.string().min(3).max(100),
  capturedLabel: z.string().regex(/^CAPTURED 2026-[0-9]{2}-[0-9]{2}$/),
  sources: z.array(meetSolomonCampaignSourceSchema).min(1).max(4),
  scenes: z.array(meetSolomonCampaignSceneSchema.omit({ from: true, to: true })).length(6),
});

export const meetSolomonCampaignStorySchema = storyBase.superRefine((story, ctx) => {
  const proofIds = story.sources.flatMap((source) => source.proofs.map((proof) => proof.id));
  if (new Set(proofIds).size !== proofIds.length) {
    ctx.addIssue({ code: "custom", message: "Campaign proof IDs must be unique." });
  }
  for (const source of story.sources) {
    for (const proof of source.proofs) {
      if (proof.crop.x + proof.crop.width > source.sourceWidth || proof.crop.y + proof.crop.height > source.sourceHeight) {
        ctx.addIssue({ code: "custom", message: `Proof ${proof.id} exceeds its source capture.` });
      }
    }
  }
  for (const scene of story.scenes) {
    for (const id of scene.proofIds) {
      if (!proofIds.includes(id)) ctx.addIssue({ code: "custom", message: `Scene ${scene.id} references unknown proof ${id}.` });
    }
  }
  const joined = story.scenes.map((scene) => scene.vo).join(" ");
  if (/guarantee|automatically sends|exclusive jobs|apply for you/i.test(joined)) {
    ctx.addIssue({ code: "custom", message: "Campaign copy contains an unsupported autonomy or outcome claim." });
  }
  if ((story.angle === "company-opportunities" || story.angle === "commute-fit") && !/listings can change/i.test(joined)) {
    ctx.addIssue({ code: "custom", message: "Job-listing films must say listings can change." });
  }
  if (story.scenes.at(-1)?.vo !== approvedCtas[story.angle]) {
    ctx.addIssue({ code: "custom", message: "Campaign film must end with its approved informational CTA." });
  }
});

export const meetSolomonCampaignFilmSchema = storyBase.omit({ scenes: true, sources: true }).extend({
  fps: z.literal(30),
  durationInFrames: z.number().int().min(480).max(1080),
  narrationSrc: z.literal("narration.wav"),
  sources: z.array(meetSolomonCampaignSourceSchema.omit({ sourcePath: true })).min(1).max(4),
  scenes: z.array(meetSolomonCampaignSceneSchema.required({ from: true, to: true })).length(6),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(0.9).max(1) }),
  reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  if (film.scenes[0]?.from !== 0 || film.scenes.at(-1)?.to !== film.durationInFrames) {
    ctx.addIssue({ code: "custom", message: "Campaign scenes must cover the full film." });
  }
  for (let index = 1; index < film.scenes.length; index += 1) {
    if (film.scenes[index - 1]?.to !== film.scenes[index]?.from) {
      ctx.addIssue({ code: "custom", message: "Campaign scenes must be contiguous." });
    }
  }
  const cta = film.scenes.at(-1)!;
  if ((cta.to - cta.from) / film.fps < 4) ctx.addIssue({ code: "custom", message: "CTA must hold for at least four seconds." });
});

export const campaignCtaFor = (angle: z.infer<typeof meetSolomonCampaignAngleSchema>) => approvedCtas[angle];

export type MeetSolomonCampaignAngle = z.infer<typeof meetSolomonCampaignAngleSchema>;
export type MeetSolomonCampaignStory = z.infer<typeof meetSolomonCampaignStorySchema>;
export type MeetSolomonCampaignFilm = z.infer<typeof meetSolomonCampaignFilmSchema>;
