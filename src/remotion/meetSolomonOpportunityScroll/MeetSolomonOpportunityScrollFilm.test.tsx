import { describe, expect, it } from "vitest";
import { opportunityMascotPlacement, opportunityMascotPlan, scrollOffset } from "./MeetSolomonOpportunityScrollFilm";

describe("Meet Solomon opportunity scroll motion", () => {
  it("holds before and after one continuous scroll", () => {
    expect(scrollOffset(0, 90, 500, 2000)).toBe(0);
    expect(scrollOffset(500, 90, 500, 2000)).toBe(-2000);
    expect(scrollOffset(800, 90, 500, 2000)).toBe(-2000);
  });
  it("keeps V1 unchanged and limits the V2 robot to two purposeful cameos", () => {
    expect(opportunityMascotPlacement("meet-solomon-opportunity-scroll-v1", "hook")).toBeNull();
    expect(opportunityMascotPlacement("meet-solomon-opportunity-scroll-v2", "feed")).toBeNull();
    expect(opportunityMascotPlacement("meet-solomon-opportunity-scroll-v2", "hook")).toBe("hook");
    expect(opportunityMascotPlacement("meet-solomon-opportunity-scroll-v2", "cta")).toBe("cta");
    expect(opportunityMascotPlan("cta", 132).narrativePurpose).toBe("cta");
  });
});
