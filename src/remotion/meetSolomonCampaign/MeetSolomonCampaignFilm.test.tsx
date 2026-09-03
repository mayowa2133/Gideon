import { describe, expect, it } from "vitest";
import { campaignMascotPlan, campaignMascotScenes, campaignMotionKind } from "./MeetSolomonCampaignFilm";

describe("Meet Solomon campaign visual language", () => {
  it("gives every angle its own motion device", () => {
    expect(new Set([
      campaignMotionKind("application-triage"),
      campaignMotionKind("company-opportunities"),
      campaignMotionKind("follow-up-cadence"),
      campaignMotionKind("commute-fit"),
      campaignMotionKind("ai-control"),
    ]).size).toBe(5);
  });

  it("uses the mascot as punctuation instead of constant decoration", () => {
    expect(campaignMascotScenes("hook")).toBe(true);
    expect(campaignMascotScenes("proof-one")).toBe(false);
    expect(campaignMascotScenes("proof-two")).toBe(false);
    expect(campaignMascotScenes("cta")).toBe(true);
  });

  it("keeps every mascot cameo inside the V22 performance contract", () => {
    expect(() => campaignMascotPlan("follow-up-cadence", "hook", 90)).not.toThrow();
    expect(() => campaignMascotPlan("ai-control", "payoff", 100)).not.toThrow();
    expect(() => campaignMascotPlan("commute-fit", "cta", 140)).not.toThrow();
  });
});
