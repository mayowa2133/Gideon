import { describe, expect, it } from "vitest";
import { compileSolomonV14DemoContent, solomonV14DemoContentSchema } from "./solomonDemoContentV14";

describe("Solomon V14 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV14DemoContent();
    const second=compileSolomonV14DemoContent();
    expect(first).toEqual(second);
    expect(solomonV14DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

