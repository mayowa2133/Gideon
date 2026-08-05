import { describe, expect, it } from "vitest";
import { compileSolomonV20DemoContent, solomonV20DemoContentSchema } from "./solomonDemoContentV20";

describe("Solomon V20 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV20DemoContent();
    const second=compileSolomonV20DemoContent();
    expect(first).toEqual(second);
    expect(solomonV20DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

