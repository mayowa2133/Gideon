import { describe, expect, it } from "vitest";
import { peopleV2MascotPlan, peopleV2MascotScenes, peopleV2MotionKind } from "./MeetSolomonPeopleCampaignV2Film";

describe("Meet Solomon people campaign V2 visual language", () => {
  it("gives each film its own central motion device", () => {
    expect(new Set([peopleV2MotionKind("job-to-people"), peopleV2MotionKind("wrong-contact"), peopleV2MotionKind("changed-jobs")]).size).toBe(3);
  });

  it("keeps the mascot away from product and public-evidence scenes", () => {
    expect(peopleV2MascotScenes("hook")).toBe(true);
    expect(peopleV2MascotScenes("role")).toBe(false);
    expect(peopleV2MascotScenes("proof-a")).toBe(false);
    expect(peopleV2MascotScenes("proof-b")).toBe(false);
    expect(peopleV2MascotScenes("cta")).toBe(true);
  });

  it("uses valid restrained mouthless mascot performances for every angle", () => {
    for (const angle of ["job-to-people", "wrong-contact", "changed-jobs"] as const) {
      expect(() => peopleV2MascotPlan(angle, "hook", 100)).not.toThrow();
      expect(() => peopleV2MascotPlan(angle, "cta", 140)).not.toThrow();
    }
  });
});
