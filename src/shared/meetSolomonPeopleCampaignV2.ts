import { z } from "zod";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const cropSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const peopleCampaignV2AngleSchema = z.enum(["job-to-people", "wrong-contact", "changed-jobs"]);

export const peopleCampaignV2SourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  file: z.string().regex(/^[a-z0-9-]+\.png$/),
  sourcePath: z.string().min(1),
  sha256: digestSchema,
  capturedAt: z.string().datetime(),
  sourceWidth: z.literal(1440),
  sourceHeight: z.literal(900),
  evidenceKind: z.enum(["actual-product", "public-source"]),
  proofs: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    expectedText: z.string().min(2),
    crop: cropSchema,
  })).min(1),
});

export const peopleCampaignV2SceneSchema = z.object({
  id: z.enum(["hook", "role", "map", "proof-a", "proof-b", "takeaway", "cta"]),
  headline: z.string().min(3).max(90),
  vo: z.string().min(8).max(240),
  captionPhrases: z.array(z.string().min(2).max(90)).min(1).max(4),
  proofIds: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(3).default([]),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().positive().optional(),
});

const publicEvidenceSchema = z.object({
  subject: z.string().min(3),
  role: z.string().min(2),
  company: z.string().min(2),
  purpose: z.enum(["recruiter", "manager", "peer", "stale-contact", "comparison-contact"]),
  productStatus: z.enum(["verified", "verification-skipped", "contradicted"]),
  publicUrl: z.string().url(),
  source: z.enum(["public-profile", "company-site", "employer-posting"]),
  checkedAt: z.string().datetime(),
  sourceSummary: z.string().min(12).max(240),
});

const jobEvidenceSchema = z.object({
  role: z.string().min(3),
  company: z.string().min(2),
  location: z.string().min(2),
  employerUrl: z.string().url(),
  checkedAt: z.string().datetime(),
  applicationControlObserved: z.literal(true),
});

const approvedCtas = {
  "job-to-people": "Want one role turned into a human map? Join Solomon.",
  "wrong-contact": "Want evidence before you choose who to contact? Join Solomon.",
  "changed-jobs": "Want sources you can inspect before outreach? Join Solomon.",
} as const;

const baseSchema = z.object({
  version: z.literal("meet-solomon-people-campaign-v2"),
  angle: peopleCampaignV2AngleSchema,
  id: z.string().regex(/^[a-z][a-z0-9-]{0,89}$/),
  title: z.string().min(3).max(100),
  capturedLabel: z.string().regex(/^CAPTURED 2026-[0-9]{2}-[0-9]{2}$/),
  capturedAt: z.string().datetime(),
  evidenceDisclosure: z.literal("PUBLIC PROFILE EXAMPLE · NO AFFILIATION OR ENDORSEMENT"),
  publicEvidence: z.array(publicEvidenceSchema).min(1).max(4),
  jobEvidence: jobEvidenceSchema.optional(),
  sources: z.array(peopleCampaignV2SourceSchema).min(1).max(6),
  scenes: z.array(peopleCampaignV2SceneSchema.omit({ from: true, to: true })).length(7),
});

type StoryAuditInput = Pick<z.infer<typeof baseSchema>, "angle" | "capturedAt" | "publicEvidence" | "jobEvidence"> & {
  sources: Array<Pick<z.infer<typeof peopleCampaignV2SourceSchema>, "sourceWidth" | "sourceHeight" | "proofs">>;
  scenes: Array<Pick<z.infer<typeof peopleCampaignV2SceneSchema>, "id" | "vo" | "proofIds">>;
};

function addStoryIssues(story: StoryAuditInput, ctx: z.RefinementCtx) {
  const proofIds = story.sources.flatMap((source) => source.proofs.map((proof) => proof.id));
  if (new Set(proofIds).size !== proofIds.length) ctx.addIssue({ code: "custom", message: "V2 proof IDs must be unique." });
  for (const source of story.sources) for (const proof of source.proofs) {
    if (proof.crop.x + proof.crop.width > source.sourceWidth || proof.crop.y + proof.crop.height > source.sourceHeight) {
      ctx.addIssue({ code: "custom", message: `Proof ${proof.id} exceeds its source capture.` });
    }
  }
  for (const scene of story.scenes) for (const proofId of scene.proofIds) {
    if (!proofIds.includes(proofId)) ctx.addIssue({ code: "custom", message: `Scene ${scene.id} references unknown proof ${proofId}.` });
  }
  const capturedAt = Date.parse(story.capturedAt);
  for (const evidence of story.publicEvidence) {
    const ageHours = (capturedAt - Date.parse(evidence.checkedAt)) / 3_600_000;
    if (ageHours < 0 || ageHours > 72) ctx.addIssue({ code: "custom", message: `${evidence.subject} public evidence is not fresh enough for this capture.` });
  }
  if (story.jobEvidence) {
    const ageHours = (capturedAt - Date.parse(story.jobEvidence.checkedAt)) / 3_600_000;
    if (ageHours < 0 || ageHours > 72) ctx.addIssue({ code: "custom", message: "The employer posting check is not fresh enough for this capture." });
  }
  if (story.angle === "job-to-people") {
    if (!story.jobEvidence) ctx.addIssue({ code: "custom", message: "Job-to-people requires a live employer posting." });
    const purposes = new Set(story.publicEvidence.map((evidence) => evidence.purpose));
    for (const purpose of ["recruiter", "manager", "peer"] as const) if (!purposes.has(purpose)) ctx.addIssue({ code: "custom", message: `Job-to-people is missing a ${purpose}.` });
  }
  if (story.angle === "changed-jobs" && !story.publicEvidence.some((evidence) => evidence.productStatus === "contradicted")) {
    ctx.addIssue({ code: "custom", message: "Changed-jobs must disclose a product/source contradiction." });
  }
  const script = story.scenes.map((scene) => scene.vo).join(" ");
  if (/guarantee|will get you|will refer you|automatically sends|hiring decision-maker|Solomon caught|Solomon rejected/i.test(script)) {
    ctx.addIssue({ code: "custom", message: "V2 copy contains an unsupported identity, automation, or outcome claim." });
  }
  if (story.scenes.at(-1)?.vo !== approvedCtas[story.angle]) ctx.addIssue({ code: "custom", message: "V2 must end with its approved CTA." });
}

export const peopleCampaignV2StorySchema = baseSchema.superRefine(addStoryIssues);

export const peopleCampaignV2FilmSchema = baseSchema.omit({ scenes: true, sources: true }).extend({
  fps: z.literal(30),
  durationInFrames: z.number().int().min(540).max(1080),
  narrationSrc: z.literal("narration.wav"),
  sources: z.array(peopleCampaignV2SourceSchema.omit({ sourcePath: true })).min(1).max(6),
  scenes: z.array(peopleCampaignV2SceneSchema.required({ from: true, to: true })).length(7),
  alignment: z.object({ source: z.literal("aligned"), coverage: z.number().min(0.92).max(1) }),
  reviewOnly: z.literal(true),
}).superRefine((film, ctx) => {
  addStoryIssues(film, ctx);
  if (film.scenes[0]?.from !== 0 || film.scenes.at(-1)?.to !== film.durationInFrames) ctx.addIssue({ code: "custom", message: "V2 scenes must cover the full film." });
  for (let index = 1; index < film.scenes.length; index += 1) if (film.scenes[index - 1]?.to !== film.scenes[index]?.from) ctx.addIssue({ code: "custom", message: "V2 scenes must be contiguous." });
  const cta = film.scenes.at(-1)!;
  if ((cta.to - cta.from) / film.fps < 4.25) ctx.addIssue({ code: "custom", message: "V2 CTA must hold for at least 4.25 seconds." });
});

export const peopleCampaignV2CtaFor = (angle: z.infer<typeof peopleCampaignV2AngleSchema>) => approvedCtas[angle];
export type PeopleCampaignV2Angle = z.infer<typeof peopleCampaignV2AngleSchema>;
export type PeopleCampaignV2Story = z.infer<typeof peopleCampaignV2StorySchema>;
export type PeopleCampaignV2Film = z.infer<typeof peopleCampaignV2FilmSchema>;
