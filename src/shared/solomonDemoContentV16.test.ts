import { describe, expect, it } from "vitest";
import { compileSolomonV16DemoContent, solomonV16DemoContentSchema } from "./solomonDemoContentV16";

describe("Solomon V16 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV16DemoContent();
    const second=compileSolomonV16DemoContent();
    expect(first).toEqual(second);
    expect(solomonV16DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

