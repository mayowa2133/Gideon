import { describe, expect, it } from "vitest";
import { peopleCampaignV2CtaFor, peopleCampaignV2FilmSchema, peopleCampaignV2StorySchema } from "./meetSolomonPeopleCampaignV2";

const capturedAt = "2026-09-03T01:08:00.000Z";
const source = {
  id: "figma-people",
  file: "job-to-people-figma-people.png",
  sourcePath: "tmp/figma-people.png",
  sha256: "a".repeat(64),
  capturedAt,
  sourceWidth: 1440 as const,
  sourceHeight: 900 as const,
  evidenceKind: "actual-product" as const,
  proofs: [{ id: "role-proof", expectedText: "Software Engineer Intern Figma", crop: { x: 90, y: 120, width: 560, height: 100 } }],
};
const people = [
  { subject: "Recruiter Example", role: "Recruiting Manager", company: "Figma", purpose: "recruiter" as const, productStatus: "verified" as const, publicUrl: "https://example.com/recruiter", source: "public-profile" as const, checkedAt: "2026-09-03T00:30:00.000Z", sourceSummary: "Current-company check passed for the recruiting role." },
  { subject: "Manager Example", role: "Engineering Manager", company: "Figma", purpose: "manager" as const, productStatus: "verified" as const, publicUrl: "https://example.com/manager", source: "public-profile" as const, checkedAt: "2026-09-03T00:31:00.000Z", sourceSummary: "Current-company check passed for the engineering role." },
  { subject: "Peer Example", role: "Software Engineer", company: "Figma", purpose: "peer" as const, productStatus: "verified" as const, publicUrl: "https://example.com/peer", source: "public-profile" as const, checkedAt: "2026-09-03T00:32:00.000Z", sourceSummary: "Current-company check passed for the software role." },
];
const scenes = [
  { id: "hook" as const, headline: "ONE ROLE. THREE PEOPLE.", vo: "One live role can lead to three useful conversations.", captionPhrases: ["ONE ROLE"] },
  { id: "role" as const, headline: "START WITH THE ROLE.", vo: "Solomon keeps the live role beside the people search.", captionPhrases: ["START WITH THE ROLE"], proofIds: ["role-proof"] },
  { id: "map" as const, headline: "MATCH THE PURPOSE.", vo: "Choose a recruiter, manager, or peer for a specific question.", captionPhrases: ["MATCH THE PURPOSE"] },
  { id: "proof-a" as const, headline: "CHECK THE PEOPLE.", vo: "Solomon keeps the visible evidence with each possible contact.", captionPhrases: ["CHECK THE PEOPLE"], proofIds: ["role-proof"] },
  { id: "proof-b" as const, headline: "CHECK THE SOURCE.", vo: "Open the named source and verify the company before outreach.", captionPhrases: ["CHECK THE SOURCE"], proofIds: ["role-proof"] },
  { id: "takeaway" as const, headline: "YOU MAKE THE CHOICE.", vo: "You decide which person fits the question you actually have.", captionPhrases: ["YOU DECIDE"] },
  { id: "cta" as const, headline: "BUILD THE HUMAN MAP.", vo: peopleCampaignV2CtaFor("job-to-people"), captionPhrases: ["JOIN SOLOMON"] },
];
const story = {
  version: "meet-solomon-people-campaign-v2" as const,
  angle: "job-to-people" as const,
  id: "meet-solomon-job-to-people-v2",
  title: "One job to three people",
  capturedLabel: "CAPTURED 2026-09-03",
  capturedAt,
  evidenceDisclosure: "PUBLIC PROFILE EXAMPLE · NO AFFILIATION OR ENDORSEMENT" as const,
  publicEvidence: people,
  jobEvidence: { role: "Software Engineer Intern", company: "Figma", location: "San Francisco", employerUrl: "https://example.com/job", checkedAt: "2026-09-03T00:29:00.000Z", applicationControlObserved: true as const },
  sources: [source],
  scenes,
};

describe("Meet Solomon people campaign V2 evidence contract", () => {
  it("accepts a fresh live-role story with recruiter, manager, peer, and exact CTA", () => {
    expect(peopleCampaignV2StorySchema.parse(story).publicEvidence).toHaveLength(3);
  });

  it("rejects stale public evidence", () => {
    const stale = structuredClone(story);
    stale.publicEvidence[0]!.checkedAt = "2026-08-29T00:00:00.000Z";
    expect(() => peopleCampaignV2StorySchema.parse(stale)).toThrow(/not fresh enough/);
  });

  it("rejects unsupported claims that Solomon caught a contradiction", () => {
    const unsafe = structuredClone(story);
    unsafe.scenes[3]!.vo = "Solomon caught the wrong employer before you sent a message.";
    expect(() => peopleCampaignV2StorySchema.parse(unsafe)).toThrow(/unsupported/);
  });

  it("enforces the evidence rules on the timed film as well as the story", () => {
    const timed = scenes.map((scene, index) => ({ ...scene, from: index * 120, to: index === scenes.length - 1 ? 870 : (index + 1) * 120 }));
    const film = { ...story, sources: [{ ...source, sourcePath: undefined }], scenes: timed, fps: 30 as const, durationInFrames: 870, narrationSrc: "narration.wav" as const, alignment: { source: "aligned" as const, coverage: .96 }, reviewOnly: true as const };
    delete (film.sources[0] as { sourcePath?: string }).sourcePath;
    expect(peopleCampaignV2FilmSchema.parse(film).reviewOnly).toBe(true);
    const wrongCta = structuredClone(film);
    wrongCta.scenes.at(-1)!.vo = "Join Solomon today.";
    expect(() => peopleCampaignV2FilmSchema.parse(wrongCta)).toThrow(/approved CTA/);
  });
});
