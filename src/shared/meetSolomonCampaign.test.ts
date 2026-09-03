import { describe, expect, it } from "vitest";
import { campaignCtaFor, meetSolomonCampaignStorySchema } from "./meetSolomonCampaign";

const source = {
  id: "source-one",
  file: "source-one.png",
  sourcePath: "tmp/source-one.png",
  sha256: "a".repeat(64),
  capturedAt: "2026-08-24T02:03:40.535Z",
  sourceWidth: 1440 as const,
  sourceHeight: 900 as const,
  proofs: [{ id: "proof-one", expectedText: "Search Company Career Page", crop: { x: 700, y: 150, width: 620, height: 120 } }],
};

const story = {
  version: "meet-solomon-campaign-v1" as const,
  angle: "company-opportunities" as const,
  id: "meet-solomon-company-opportunities-v1",
  title: "One company, every opportunity",
  capturedLabel: "CAPTURED 2026-08-24",
  sources: [source],
  scenes: [
    { id: "hook", vo: "Found one company you love? Search it differently.", headline: "ONE COMPANY." },
    { id: "metaphor", vo: "Put its careers page into Solomon and keep the search together.", headline: "ONE SEARCH." },
    { id: "proof-one", vo: "Solomon can search supported company career pages from one place.", headline: "CAREER PAGE SEARCH.", proofIds: ["proof-one"] },
    { id: "proof-two", vo: "This capture returned a board of roles you can inspect yourself.", headline: "THE BOARD, TOGETHER.", proofIds: ["proof-one"] },
    { id: "payoff", vo: "Listings can change, so confirm the employer posting.", headline: "CHECK THE SOURCE." },
    { id: "cta", vo: campaignCtaFor("company-opportunities"), headline: "EXPLORE THE WHOLE COMPANY." },
  ],
};

describe("Meet Solomon campaign story", () => {
  it("accepts grounded copy with the angle CTA", () => {
    expect(meetSolomonCampaignStorySchema.parse(story).angle).toBe("company-opportunities");
  });

  it("rejects unsupported autonomy and missing listing caveats", () => {
    const unsafe = structuredClone(story);
    unsafe.scenes[1]!.vo = "Solomon automatically sends every application for you.";
    unsafe.scenes[4]!.vo = "Every opening is ready forever.";
    expect(() => meetSolomonCampaignStorySchema.parse(unsafe)).toThrow();
  });

  it("rejects an unknown proof reference", () => {
    const invalid = structuredClone(story);
    invalid.scenes[2]!.proofIds = ["missing-proof"];
    expect(() => meetSolomonCampaignStorySchema.parse(invalid)).toThrow(/unknown proof/);
  });
});
