import { describe, expect, it } from "vitest";
import { detectArrowCursorPixels } from "./cursorPixelValidation";

describe("cursor pixel validation", () => {
  it("finds a connected arrow-shaped cursor near the expected action point", () => {
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height).fill(240);
    const dark = (x: number, y: number): void => { pixels[y * width + x] = 20; };
    for (let y = 25; y < 50; y += 1) {
      const right = 30 + Math.floor((y - 25) * 0.78);
      dark(30, y);
      dark(right, y);
    }
    for (let x = 30; x <= 48; x += 1) dark(x, 49);
    for (let y = 42; y < 56; y += 1) {
      dark(40, y);
      dark(44, y);
    }
    const detected = detectArrowCursorPixels({
      pixels,
      frameWidth: width,
      frameHeight: height,
      searchRegion: { x: 15, y: 15, width: 55, height: 55 },
      expectedCenter: { x: 38, y: 40 }
    });
    expect(detected).toMatchObject({ x: 30, y: 25 });
    expect(detected?.score).toBeGreaterThan(0.6);
  });

  it("does not misclassify a horizontal text-like component", () => {
    const width = 80;
    const height = 50;
    const pixels = new Uint8Array(width * height).fill(245);
    for (let y = 20; y < 26; y += 1) {
      for (let x = 10; x < 60; x += 1) pixels[y * width + x] = 20;
    }
    expect(detectArrowCursorPixels({
      pixels,
      frameWidth: width,
      frameHeight: height,
      searchRegion: { x: 0, y: 0, width, height }
    })).toBeUndefined();
  });
});
