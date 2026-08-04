import { describe, expect, it } from "vitest";
import { compileSolomonV15DemoContent, solomonV15DemoContentSchema } from "./solomonDemoContentV15";

describe("Solomon V15 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV15DemoContent();
    const second=compileSolomonV15DemoContent();
    expect(first).toEqual(second);
    expect(solomonV15DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

