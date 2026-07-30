import { describe, expect, it } from "vitest";
import {
  expandNormalizedRect,
  intersectionRatio,
  mapSourcePointToCard,
  mapSourceRectToCard,
  normalizePixelRect,
  productCardLayoutV4,
  productContainmentReport,
  viewportForCard
} from "./editorialProductFraming";

const source = { width: 1440, height: 900 };

describe("editorial product framing", () => {
  it("normalizes recorded DOM geometry", () => {
    expect(normalizePixelRect({ x: 144, y: 90, width: 288, height: 180 }, source)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2
    });
  });

  it("expands compact action targets without leaving the source", () => {
    const expanded = expandNormalizedRect({ x: 0.92, y: 0.90, width: 0.06, height: 0.08 }, 0.5, 0.6);
    expect(expanded).toEqual({ x: 0.5, y: 0.4, width: 0.5, height: 0.6 });
  });

  it("fits landscape source geometry to a landscape macro card without distortion", () => {
    const card = productCardLayoutV4({
      composition: "product_macro",
      presenterVisible: false,
      presenterPlacement: "none"
    });
    const viewport = viewportForCard({ x: 0.08, y: 0.24, width: 0.30, height: 0.22 }, card, { sourceSize: source });
    expect((viewport.width * source.width) / (viewport.height * source.height)).toBeCloseTo(card.width / card.height, 4);
  });

  it("maps critical regions through the exact viewport and card placement", () => {
    const viewport = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
    const card = { x: 90, y: 220, width: 900, height: 900 };
    expect(mapSourceRectToCard({ x: 0.2, y: 0.3, width: 0.1, height: 0.1 }, viewport, card)).toEqual({
      x: 270,
      y: 400,
      width: 180,
      height: 180
    });
    expect(mapSourcePointToCard({ x: 0.35, y: 0.45 }, viewport, card)).toEqual({ x: 540, y: 670 });
  });

  it("keeps every v4 product card inside a 40px horizontal safe envelope", () => {
    const layouts = [
      productCardLayoutV4({ composition: "product_macro", presenterVisible: false, presenterPlacement: "none" }),
      productCardLayoutV4({ composition: "product_comparison", presenterVisible: false, presenterPlacement: "none" }),
      productCardLayoutV4({ composition: "rapid_recap", presenterVisible: true, presenterPlacement: "bottom" }),
      productCardLayoutV4({ composition: "asymmetric_split", presenterVisible: true, presenterPlacement: "left" }),
      productCardLayoutV4({ composition: "product_reaction", presenterVisible: true, presenterPlacement: "right" })
    ];
    expect(layouts.every((card) =>
      card.x >= 40 && card.x + card.width <= 1040 && card.y >= 40 && card.y + card.height <= 1880
    )).toBe(true);
  });

  it("passes transform-aware target and cursor containment", () => {
    const card = productCardLayoutV4({
      composition: "product_macro",
      presenterVisible: false,
      presenterPlacement: "none"
    });
    const region = { x: 0.16, y: 0.30, width: 0.18, height: 0.12 };
    const viewport = viewportForCard(region, card, { sourceSize: source });
    const report = productContainmentReport({
      sourceSize: source,
      card,
      viewport,
      criticalRegion: region,
      cursor: { x: 0.25, y: 0.36 },
      safeMarginPx: 24
    });
    expect(report.passed).toBe(true);
    expect(report.cardIntersectionRatio).toBe(1);
    expect(report.criticalIntersectionRatio).toBeCloseTo(1, 8);
    expect(report.cursorContained).toBe(true);
  });

  it("rejects a clipped card instead of trusting declared occupancy", () => {
    const report = productContainmentReport({
      sourceSize: source,
      card: { x: -20, y: 200, width: 1000, height: 1000 },
      viewport: { x: 0.1, y: 0.1, width: 0.6, height: 0.8 },
      criticalRegion: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
      safeMarginPx: 24
    });
    expect(report.passed).toBe(false);
    expect(report.cardIntersectionRatio).toBeLessThan(1);
  });

  it("rejects a critical region touching a viewport edge", () => {
    const card = { x: 50, y: 200, width: 980, height: 760 };
    const report = productContainmentReport({
      sourceSize: source,
      card,
      viewport: { x: 0, y: 0, width: 0.8, height: 0.9 },
      criticalRegion: { x: 0, y: 0.2, width: 0.2, height: 0.2 },
      safeMarginPx: 24
    });
    expect(report.passed).toBe(false);
    expect(report.criticalSafeMarginPx).toBe(0);
  });

  it("calculates geometric intersection rather than a metadata proxy", () => {
    expect(intersectionRatio(
      { x: -50, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toBe(0.5);
  });
});
