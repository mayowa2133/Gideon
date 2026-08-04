import { describe, expect, it } from "vitest";
import { compileSolomonV11DemoContent, solomonV11DemoContentSchema } from "./solomonDemoContentV11";

describe("Solomon V11 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV11DemoContent();
    const second=compileSolomonV11DemoContent();
    expect(first).toEqual(second);
    expect(solomonV11DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

