import { describe, expect, it } from "vitest";
import { compileSolomonV19DemoContent, solomonV19DemoContentSchema } from "./solomonDemoContentV19";

describe("Solomon V19 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV19DemoContent();
    const second=compileSolomonV19DemoContent();
    expect(first).toEqual(second);
    expect(solomonV19DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

