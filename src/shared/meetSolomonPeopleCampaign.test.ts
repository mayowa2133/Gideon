import { describe, expect, it } from "vitest";
import { peopleCampaignCtaFor, peopleCampaignStorySchema } from "./meetSolomonPeopleCampaign";

const source = { id: "people-search", file: "people-search.png", sourcePath: "tmp/people.png", sha256: "b".repeat(64), capturedAt: "2026-09-02T14:00:00.000Z", sourceWidth: 1440 as const, sourceHeight: 900 as const, proofs: [{ id: "search", expectedText: "Search by Company", crop: { x: 100, y: 100, width: 500, height: 80 } }] };
const story = {
  version: "meet-solomon-people-campaign-v1" as const,
  angle: "right-person" as const,
  id: "meet-solomon-right-person-v1",
  title: "The right person behind the role",
  capturedLabel: "CAPTURED 2026-09-02",
  realContacts: true as const,
  contactEvidence: [{ name: "Jordan Lee", title: "Recruiter", company: "Example Co", publicUrl: "https://example.com/jordan", source: "public-profile" as const, currentCompanyVerified: true as const, checkedAt: "2026-09-02T14:00:00.000Z" }],
  sources: [source],
  scenes: [
    { id: "hook", headline: "YOUR APPLICATION CAN’T INTRODUCE ITSELF.", vo: "Your application cannot introduce itself to the team." },
    { id: "metaphor", headline: "FIND A HUMAN PATH.", vo: "A person can answer the question a posting cannot." },
    { id: "proof-one", headline: "START WITH THE COMPANY.", vo: "Solomon starts the people search from the company.", proofIds: ["search"] },
    { id: "proof-two", headline: "NARROW THE SEARCH.", vo: "Then you can inspect the people it surfaces.", proofIds: ["search"] },
    { id: "payoff", headline: "YOU CHOOSE THE CONTACT.", vo: "You choose who to contact and what to send." },
    { id: "cta", headline: "FIND THE PERSON BEHIND THE ROLE.", vo: peopleCampaignCtaFor("right-person") },
  ],
};

describe("Meet Solomon people campaign", () => {
  it("accepts a source-linked real-contact story with its angle CTA", () => expect(peopleCampaignStorySchema.parse(story).angle).toBe("right-person"));
  it("rejects guaranteed referrals", () => {
    const unsafe = structuredClone(story);
    unsafe.scenes[2]!.vo = "Solomon found a person who will refer you.";
    expect(() => peopleCampaignStorySchema.parse(unsafe)).toThrow();
  });
  it("rejects unknown proof references", () => {
    const invalid = structuredClone(story);
    invalid.scenes[2]!.proofIds = ["missing"];
    expect(() => peopleCampaignStorySchema.parse(invalid)).toThrow(/unknown proof/);
  });
});
