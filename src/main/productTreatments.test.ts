import { describe, expect, it } from "vitest";
import { productTreatmentFont, productTreatmentSpec } from "./media";
import type { ProductEvidenceAssetKind } from "../shared/types";

describe("product visual treatments", () => {
  it("assigns a distinct deterministic treatment to every asset kind", () => {
    const kinds: ProductEvidenceAssetKind[] = ["screenshot", "interaction_clip", "browser_mockup", "phone_mockup", "terminal_card", "before_after_pair", "feature_card", "comparison_card", "product_hero", "conceptual_card"];
    const devices = kinds.map((kind) => productTreatmentSpec(kind).device);
    expect(new Set(devices).size).toBe(kinds.length);
    expect(productTreatmentSpec("interaction_clip")).toMatchObject({ device: "temporal", opaquePanel: false });
    expect(productTreatmentSpec("browser_mockup").device).toBe("browser");
    expect(productTreatmentSpec("phone_mockup").device).toBe("phone");
  });

  it("uses registered PureImage families without unsupported style prefixes", () => {
    expect(productTreatmentFont("GideonKinetic", 25)).toBe("25pt GideonKinetic");
    expect(productTreatmentFont("GideonEditorial", 38)).toBe("38pt GideonEditorial");
    expect(productTreatmentFont("GideonEditorial", 38)).not.toMatch(/^(bold|italic)\s/);
  });
});
