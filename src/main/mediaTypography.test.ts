import { describe, expect, it } from "vitest";
import { resolveOverlayTypography } from "./media";

describe("creator typography resolver", () => {
  it("resolves distinct kinetic bold and genuine editorial italic configurations", () => {
    const receipt = resolveOverlayTypography();
    expect(receipt.kinetic.resolvedFamily).not.toBe(receipt.editorial.resolvedFamily);
    expect(receipt.editorial.italic).toBe(true);
    expect(receipt.kinetic.fontFile).toMatch(/Bold/i);
    expect(receipt.editorial.fontFile).toMatch(/Italic/i);
    expect(receipt.kinetic.fontFile).not.toBe(receipt.editorial.fontFile);
  });
});
