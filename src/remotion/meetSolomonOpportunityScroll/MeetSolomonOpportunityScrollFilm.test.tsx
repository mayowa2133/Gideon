import { describe, expect, it } from "vitest";
import { scrollOffset } from "./MeetSolomonOpportunityScrollFilm";

describe("Meet Solomon opportunity scroll motion", () => {
  it("holds before and after one continuous scroll", () => {
    expect(scrollOffset(0, 90, 500, 2000)).toBe(0);
    expect(scrollOffset(500, 90, 500, 2000)).toBe(-2000);
    expect(scrollOffset(800, 90, 500, 2000)).toBe(-2000);
  });
});
