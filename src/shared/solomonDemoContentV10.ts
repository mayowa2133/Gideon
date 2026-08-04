import { z } from "zod";

export const SOLOMON_V10_DEMO_CONTENT_VERSION = "solomon-demo-content-v10.1" as const;
export const SOLOMON_V10_DISCLOSURE = "DEMO DATA" as const;

export const solomonV10DemoContentSchema = z.object({
  version: z.literal(SOLOMON_V10_DEMO_CONTENT_VERSION),
  seed: z.number().int().positive(),
  disclosure: z.literal(SOLOMON_V10_DISCLOSURE),
  opportunity: z.object({
    title: z.literal("Product Engineer"),
    company: z.literal("Northstar Labs"),
    location: z.literal("Toronto, Canada"),
    previousStage: z.literal("Applied"),
    resultStage: z.literal("Interviewing")
  }),
  contact: z.object({
    name: z.literal("Avery Chen"),
    role: z.literal("Senior Technical Recruiter"),
    company: z.literal("Northstar Labs"),
    reasons: z.tuple([
      z.literal("Works at Northstar Labs"),
      z.literal("Relevant recruiting role"),
      z.literal("Supporting evidence included")
    ])
  }),
  message: z.object({
    subject: z.literal("Product Engineer at Northstar Labs"),
    body: z.string().min(120).max(420),
    editable: z.literal(true),
    sent: z.literal(false),
    controls: z.tuple([z.literal("Save Edit"), z.literal("Cancel")])
  }),
  externalProvidersDisabled: z.literal(true),
  realPeopleUsed: z.literal(false)
});

export type SolomonV10DemoContent = z.infer<typeof solomonV10DemoContentSchema>;

export function compileSolomonV10DemoContent(seed = 101_010): SolomonV10DemoContent {
  return solomonV10DemoContentSchema.parse({
    version: SOLOMON_V10_DEMO_CONTENT_VERSION,
    seed,
    disclosure: SOLOMON_V10_DISCLOSURE,
    opportunity: {
      title: "Product Engineer",
      company: "Northstar Labs",
      location: "Toronto, Canada",
      previousStage: "Applied",
      resultStage: "Interviewing"
    },
    contact: {
      name: "Avery Chen",
      role: "Senior Technical Recruiter",
      company: "Northstar Labs",
      reasons: ["Works at Northstar Labs", "Relevant recruiting role", "Supporting evidence included"]
    },
    message: {
      subject: "Product Engineer at Northstar Labs",
      body: "Hi Avery — I’m reaching out about the Product Engineer role at Northstar Labs. Your work supporting technical hiring made you a relevant person to ask about the team and its priorities. I’d value your perspective if you’re open to sharing it.",
      editable: true,
      sent: false,
      controls: ["Save Edit", "Cancel"]
    },
    externalProvidersDisabled: true,
    realPeopleUsed: false
  });
}

