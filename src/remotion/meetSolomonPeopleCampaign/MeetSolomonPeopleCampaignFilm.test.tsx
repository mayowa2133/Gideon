import { describe, expect, it } from "vitest";
import { peopleMascotPlan, peopleMascotScenes, peopleMotionKind } from "./MeetSolomonPeopleCampaignFilm";

describe("Meet Solomon people-campaign visual language", () => {
  it("uses a distinct people metaphor for every angle", () => expect(new Set([peopleMotionKind("right-person"), peopleMotionKind("who-to-meet"), peopleMotionKind("one-company"), peopleMotionKind("first-message"), peopleMotionKind("keep-warm")]).size).toBe(5));
  it("keeps product proofs free of mascot distraction", () => { expect(peopleMascotScenes("hook")).toBe(true); expect(peopleMascotScenes("proof-one")).toBe(false); expect(peopleMascotScenes("proof-two")).toBe(false); expect(peopleMascotScenes("cta")).toBe(true); });
  it("keeps the transparent mouthless mascot in the performance contract", () => { expect(() => peopleMascotPlan("right-person", "hook", 90)).not.toThrow(); expect(() => peopleMascotPlan("keep-warm", "payoff", 100)).not.toThrow(); expect(() => peopleMascotPlan("first-message", "cta", 140)).not.toThrow(); });
});
