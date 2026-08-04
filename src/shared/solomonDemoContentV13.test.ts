import { describe, expect, it } from "vitest";
import { compileSolomonV13DemoContent, solomonV13DemoContentSchema } from "./solomonDemoContentV13";

describe("Solomon V13 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV13DemoContent();
    const second=compileSolomonV13DemoContent();
    expect(first).toEqual(second);
    expect(solomonV13DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

