import { describe, expect, it } from "vitest";
import { compileSolomonV21DemoContent, solomonV21DemoContentSchema } from "./solomonDemoContentV21";

describe("Solomon V21 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV21DemoContent();
    const second=compileSolomonV21DemoContent();
    expect(first).toEqual(second);
    expect(solomonV21DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

