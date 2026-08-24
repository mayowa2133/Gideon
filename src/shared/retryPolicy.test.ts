import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { retryPolicy, cardClaimIds } = (await import("../../scripts/lib/retry-policy.mjs")) as any;

/**
 * The daily runner retries a different posting when a card cannot be framed.
 * The bug this guards is retrying when the card was never the problem: a capture
 * that crashed because the dev server is down produces no JSON, and treating
 * that as a rejection spends three attempts and then reports "no card in this
 * feed could be framed" -- a confident, completely wrong diagnosis at the top of
 * a log nobody watched.
 */
const requirements = [
  { id: "matched", fixture: {} },
  { id: "role", fixture: { "job.title": "Software Engineer", "job.company": "Agave" } }
];

describe("retry policy", () => {
  const owned = cardClaimIds(requirements);

  it("knows which claims a different card could fix", () => {
    expect(owned).toEqual(["role"]);
  });

  it("aborts when the stage produced no JSON at all", () => {
    expect(retryPolicy({ parsed: false, payload: { issues: [{ reason: "stage_crashed" }] }, cardClaimIds: owned }))
      .toBe("abort");
  });

  it("retries when the card itself could not be framed", () => {
    expect(retryPolicy({
      parsed: true,
      payload: { issues: [{ claimId: "role", reason: "crop_unresolved", detail: "no_fit_without_cutting_words" }] },
      cardClaimIds: owned
    })).toBe("retry");
  });

  it("aborts on a surface problem the next card would hit identically", () => {
    // `scroll_anchor_missing` is about where the page was scrolled, not about
    // which posting sat there.
    expect(retryPolicy({
      parsed: true,
      payload: { issues: [{ claimId: "matched", reason: "scroll_anchor_missing" }] },
      cardClaimIds: owned
    })).toBe("abort");
  });

  it("aborts when only some of the complaints are about the card", () => {
    expect(retryPolicy({
      parsed: true,
      payload: { issues: [{ claimId: "role", reason: "crop_unresolved" }, { claimId: "matched", reason: "illegible_at_crop" }] },
      cardClaimIds: owned
    })).toBe("abort");
  });

  it("aborts on an issue with no claim attached to it", () => {
    expect(retryPolicy({
      parsed: true,
      payload: { issues: [{ reason: "motion_did_not_move" }] },
      cardClaimIds: owned
    })).toBe("abort");
  });
});
