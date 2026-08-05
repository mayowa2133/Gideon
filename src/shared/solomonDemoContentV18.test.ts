import { describe, expect, it } from "vitest";
import { compileSolomonV18DemoContent, solomonV18DemoContentSchema } from "./solomonDemoContentV18";

describe("Solomon V18 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV18DemoContent();
    const second=compileSolomonV18DemoContent();
    expect(first).toEqual(second);
    expect(solomonV18DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

