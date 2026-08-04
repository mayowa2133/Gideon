import { describe, expect, it } from "vitest";
import { compileSolomonV10DemoContent, solomonV10DemoContentSchema } from "./solomonDemoContentV10";

describe("Solomon V10 demo content compiler",()=>{
  it("compiles deterministic, consistent, unsent fictional data",()=>{
    const first=compileSolomonV10DemoContent();
    const second=compileSolomonV10DemoContent();
    expect(first).toEqual(second);
    expect(solomonV10DemoContentSchema.parse(first)).toEqual(first);
    expect(first.message.body).toContain(first.opportunity.title);
    expect(first.message.body).toContain(first.opportunity.company);
    expect(first.message.sent).toBe(false);
    expect(first.realPeopleUsed).toBe(false);
  });
});

