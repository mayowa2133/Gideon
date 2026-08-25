import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { pickCards, cardKey } = (await import("../../scripts/daily-angles.mjs")) as any;

/**
 * The card-selection rule, which was three separate capture failures before it
 * was code. Each test below is one of them.
 */
const card = (company: string, title: string) => ({ company, title, location: "Remote" });

// The feed exactly as it came back the day this rule was written: one insurer
// occupying the top of the list under a two-letter name, then a developer role,
// then the two cards a film could honestly use.
const realFeed = {
  matched: "200",
  fresh: "181",
  top: [
    card("AL", "Territory Sales Manager (Cincinnati)"),
    card("AL", "Customer Service Representative"),
    card("notion", "Workflow + Process Designer (AI Enablement)"),
    card("Commence", "Web Developer & Digital Marketing Specialist"),
    card("webflow", "Paid Social Specialist (Contract Basis)"),
    card("twilio", "Field Marketing Manager, Japan")
  ]
};
const noDevelopers = /\b(engineer|engineering|developer|programmer)\b/i;

describe("pickCards", () => {
  it("reproduces the selection that had to be made by hand", () => {
    const picked = pickCards(realFeed, new Set(), { window: 5, take: 2, disqualify: noDevelopers });
    expect(picked.map((c: any) => c.company)).toEqual(["notion", "webflow"]);
  });

  it("skips a company name too short to be a company name", () => {
    // "AL" is how the source stored Allstate. Three cards reading "AL" look like
    // a rendering bug, and the first five of that feed were all this insurer.
    const picked = pickCards(realFeed, new Set(), { window: 5, take: 5, disqualify: noDevelopers });
    expect(picked.some((c: any) => c.company === "AL")).toBe(false);
  });

  it("takes one card per employer", () => {
    const feed = { top: [card("notion", "Alpha Role"), card("notion", "Beta Role"), card("webflow", "Gamma Role")] };
    const picked = pickCards(feed, new Set(), { window: 5, take: 3 });
    expect(picked.map((c: any) => c.company)).toEqual(["notion", "webflow"]);
  });

  it("refuses a title that contradicts the angle", () => {
    // A film claiming these roles are not software engineering cannot open on a
    // "Web Developer & Digital Marketing Specialist".
    const picked = pickCards(realFeed, new Set(), { window: 6, take: 6, disqualify: noDevelopers });
    expect(picked.some((c: any) => /developer/i.test(c.title))).toBe(false);
  });

  it("never looks past the window one scroll can show", () => {
    // The sixth card sits below the 900px viewport and fails capture as
    // `region_outside_viewport`, taking a beat's line with it.
    const picked = pickCards(realFeed, new Set(), { window: 5, take: 6, disqualify: noDevelopers });
    expect(picked.some((c: any) => c.company === "twilio")).toBe(false);
  });

  it("will not re-use a card another film already took today", () => {
    const spent = new Set<string>([cardKey(card("notion", "Workflow + Process Designer (AI Enablement)"))]);
    const picked = pickCards(realFeed, spent, { window: 5, take: 2, disqualify: noDevelopers });
    expect(picked.map((c: any) => c.company)).toEqual(["webflow"]);
  });

  it("returns fewer rather than something that breaks a rule", () => {
    const thin = { top: [card("AL", "Territory Sales Manager"), card("notion", "Workflow Designer")] };
    expect(pickCards(thin, new Set(), { window: 5, take: 3 })).toHaveLength(1);
  });
});
