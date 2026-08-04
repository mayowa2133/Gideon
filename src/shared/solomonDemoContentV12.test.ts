import { describe, expect, it } from "vitest";
import { compileSolomonV12DemoContent, solomonV12DemoContentSchema } from "./solomonDemoContentV12";

describe("Solomon V12 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV12DemoContent();
    const second=compileSolomonV12DemoContent();
    expect(first).toEqual(second);
    expect(solomonV12DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

