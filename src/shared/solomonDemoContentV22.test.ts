import { describe, expect, it } from "vitest";
import { compileSolomonV22DemoContent, solomonV22DemoContentSchema } from "./solomonDemoContentV22";

describe("Solomon V22 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV22DemoContent();
    const second=compileSolomonV22DemoContent();
    expect(first).toEqual(second);
    expect(solomonV22DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

