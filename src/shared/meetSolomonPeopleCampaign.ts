import { z } from "zod";

const cropSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() });
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const peopleCampaignAngleSchema = z.enum(["right-person", "who-to-meet", "one-company", "first-message", "keep-warm"]);

export const peopleCampaignSourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  file: z.string().regex(/^[a-z0-9-]+\.png$/),
  sourcePath: z.string().min(1),
  sha256: digestSchema,
  capturedAt: z.string().datetime(),
  sourceWidth: z.literal(1440),
  sourceHeight: z.literal(900),
  proofs: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), expectedText: z.string().min(2), crop: cropSchema })).min(1),
});

export const peopleCampaignSceneSchema = z.object({
  id: z.enum(["hook", "metaphor", "proof-one", "proof-two", "payoff", "cta"]),
  headline: z.string().min(3).max(86),
  vo: z.string().min(8).max(220),
  proofIds: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(3).default([]),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
});

const approvedCtas = {
  "right-person": "Want to find the right person behind the role? Join Solomon.",
  "who-to-meet": "Want help choosing who to reach? Join Solomon.",
  "one-company": "Want more paths into one company? Join Solomon.",
  "first-message": "Want help starting the right conversation? Join Solomon.",
  "keep-warm": "Want to keep the right connection warm? Join Solomon.",
} as const;

const contactEvidenceSchema = z.object({
  name: z.string().min(3),
  title: z.string().min(2),
  company: z.string().min(2),
  publicUrl: z.string().url(),
  source: z.enum(["public-profile", "company-site"]),
  currentCompanyVerified: z.literal(true),
  checkedAt: z.string().datetime(),
});

const baseSchema = z.object({
  version: z.literal("meet-solomon-people-campaign-v1"),
  angle: peopleCampaignAngleSchema,
  id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: z.string().min(3).max(100),
  capturedLabel: z.string().regex(/^CAPTURED 2026-[0-9]{2}-[0-9]{2}$/),
  realContacts: z.literal(true),
  contactEvidence: z.array(contactEvidenceSchema).min(1).max(3),
  sources: z.array(peopleCampaignSourceSchema).min(1).max(4),
  scenes: z.array(peopleCampaignSceneSchema.omit({ from: true, to: true })).length(6),
});

export const peopleCampaignStorySchema = baseSchema.superRefine((story, ctx) => {
  const proofIds = story.sources.flatMap((source) => source.proofs.map((proof) => proof.id));
  if (new Set(proofIds).size !== proofIds.length) ctx.addIssue({ code: "custom", message: "People-campaign proof IDs must be unique." });
  for (const source of story.sources) for (const proof of source.proofs) {
    if (proof.crop.x + proof.crop.width > source.sourceWidth || proof.crop.y + proof.crop.height > source.sourceHeight) ctx.addIssue({ code: "custom", message: `Proof ${proof.id} exceeds its source capture.` });
  }
  for (const scene of story.scenes) for (const proofId of scene.proofIds) {
    if (!proofIds.includes(proofId)) ctx.addIssue({ code: "custom", message: `Scene ${scene.id} references unknown proof ${proofId}.` });
  }
  const script = story.scenes.map((scene) => scene.vo).join(" ");
  if (/guarantee|will get you|will refer you|automatically sends|hiring decision-maker/i.test(script)) {
    ctx.addIssue({ code: "custom", message: "People-campaign copy contains an unsupported identity, autonomy, referral, or outcome claim." });
  }
  if (story.scenes.at(-1)?.vo !== approvedCtas[story.angle]) ctx.addIssue({ code: "custom", message: "People-campaign film must end with its approved CTA." });
});

export const peopleCampaignFilmSchema = baseSchema.omit({ scenes: true, sources: true }).extend({
  fps: z.literal(30),
  durationInFrames: z.number().int().min(480).max(1080),
  narrationSrc: z.literal("narration.wav"),
  sources: z.array(peopleCampaignSourceSchema.omit({ sourcePath: true })).min(1).max(4),
  scenes: z.array(peopleCampaignSceneSchema.required({ from: true, to: true })).length(6),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(0.9).max(1) }),
  reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  if (film.scenes[0]?.from !== 0 || film.scenes.at(-1)?.to !== film.durationInFrames) ctx.addIssue({ code: "custom", message: "People-campaign scenes must cover the full film." });
  for (let index = 1; index < film.scenes.length; index += 1) if (film.scenes[index - 1]?.to !== film.scenes[index]?.from) ctx.addIssue({ code: "custom", message: "People-campaign scenes must be contiguous." });
  const cta = film.scenes.at(-1)!;
  if ((cta.to - cta.from) / film.fps < 4) ctx.addIssue({ code: "custom", message: "CTA must hold for at least four seconds." });
});

export const peopleCampaignCtaFor = (angle: z.infer<typeof peopleCampaignAngleSchema>) => approvedCtas[angle];

export type PeopleCampaignAngle = z.infer<typeof peopleCampaignAngleSchema>;
export type PeopleCampaignStory = z.infer<typeof peopleCampaignStorySchema>;
export type PeopleCampaignFilm = z.infer<typeof peopleCampaignFilmSchema>;
