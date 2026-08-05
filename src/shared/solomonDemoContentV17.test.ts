import { describe, expect, it } from "vitest";
import { compileSolomonV17DemoContent, solomonV17DemoContentSchema } from "./solomonDemoContentV17";

describe("Solomon V17 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV17DemoContent();
    const second=compileSolomonV17DemoContent();
    expect(first).toEqual(second);
    expect(solomonV17DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

