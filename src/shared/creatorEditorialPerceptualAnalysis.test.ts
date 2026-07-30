import { describe, expect, it } from "vitest";
import { analyzeEditorialPerceptualBoundaries } from "./creatorEditorialPerceptualAnalysis";

const flat = { y: 100, u: 128, v: 128, saturation: 20 };

describe("creator editorial rendered-shot perceptual analysis", () => {
  it("does not count a planned boundary with unchanged pixels and composition", () => {
    const report = analyzeEditorialPerceptualBoundaries([{
      fromShotId: "a",
      toShotId: "b",
      boundaryMs: 2_000,
      changedDimensions: ["caption_role"],
      from: flat,
      to: flat
    }], 4_000, [[0, 4_000]]);
    expect(report.meaningfulChangeCount).toBe(0);
    expect(report.duplicateAdjacentPairs).toEqual(["a->b"]);
    expect(report.longestUnchangedCompositionMs).toBe(4_000);
  });

  it("counts either a rendered signal reset or a major structural reset", () => {
    const report = analyzeEditorialPerceptualBoundaries([
      {
        fromShotId: "a",
        toShotId: "b",
        boundaryMs: 1_500,
        changedDimensions: [],
        from: flat,
        to: { y: 170, u: 100, v: 145, saturation: 55 }
      },
      {
        fromShotId: "b",
        toShotId: "c",
        boundaryMs: 3_000,
        changedDimensions: ["family", "background", "presenter_placement", "product_source"],
        from: flat,
        to: flat
      }
    ], 4_500, [[0, 3_000], [3_000, 4_500]]);
    expect(report.meaningfulChangeCount).toBe(2);
    expect(report.windows).toEqual([
      { startMs: 0, endMs: 3_000, meaningfulChanges: 1 },
      { startMs: 3_000, endMs: 4_500, meaningfulChanges: 1 }
    ]);
    expect(report.longestUnchangedCompositionMs).toBe(1_500);
  });
});
