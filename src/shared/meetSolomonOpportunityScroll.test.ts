import { describe, expect, it } from "vitest";
import { opportunityStorySchema } from "./meetSolomonOpportunityScroll";

const source = (id: string) => ({ id, file: `${id}.png`, sourcePath: `/tmp/${id}.png`, sha256: "a".repeat(64), capturedAt: "2026-08-31T12:00:00.000Z", sourceWidth: 1440 as const, sourceHeight: 900 as const,
  cards: [1, 2, 3].map(n => ({ id: `${id}-${n}`, category: "Software", crop: { x: 95, y: 170 + n * 120, width: 492, height: 112 } })) });
const scenes = [
  ["hook", "See what is waiting for you on Solomon.", "SEE WHAT'S WAITING."],
  ["range", "Software, marketing, design, human resources, and more.", "MORE DIRECTIONS."],
  ["feed", "Solomon brings real openings from multiple sources into one focused feed.", "ONE FOCUSED FEED."],
  ["direction", "Pick the occupations that match your direction, then revisit one organized place.", "PICK YOUR DIRECTION."],
  ["caveat", "Listings can change, so confirm the employer posting.", "LISTINGS CHANGE."],
  ["cta", "Want easy access to more opportunities? Join Solomon.", "JOIN SOLOMON."],
].map(([id, vo, headline]) => ({ id, vo, headline }));

describe("Meet Solomon opportunity scroll", () => {
  it("accepts grounded, caveated copy", () => expect(opportunityStorySchema.parse({ version: "meet-solomon-opportunity-scroll-v1", id: "opportunities", title: "Opportunities on Solomon", sources: [source("software"), source("marketing")], scenes })).toBeTruthy());
  it("rejects unsupported exclusivity", () => expect(() => opportunityStorySchema.parse({ version: "meet-solomon-opportunity-scroll-v1", id: "opportunities", title: "Opportunities on Solomon", sources: [source("software"), source("marketing")], scenes: scenes.map((scene, index) => index === 2 ? { ...scene, vo: "Exclusive jobs are waiting here." } : scene) })).toThrow(/exclusive/i));
});
