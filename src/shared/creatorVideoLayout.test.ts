import { describe, expect, it } from "vitest";
import { calculateBlueprintLayout, choosePlacement, intersectionArea, presenterReservedRect } from "./creatorVideoLayout";
import type { CreativeBlueprint, ProductEvidenceAsset, SceneComposition } from "./types";

const asset: ProductEvidenceAsset = { id: "asset", kind: "phone_mockup", label: "Proof", sourceMomentIds: ["m"], sourceEvidenceIds: ["e"], supportedClaimIds: [], maskingStatus: "not_required", crop: { x: .5, y: .5, scale: 1.2 }, readableRegion: { x: .1, y: .1, width: .8, height: .7 }, provenance: "captured_product", approvalStatus: "approved", factualUseAllowed: true };
const scene = (layout: SceneComposition["presenter"]["layout"], shotType: SceneComposition["shotType"] = "split_presenter_product"): SceneComposition => ({ id: `scene-${layout}`, startMs: 0, endMs: 3000, purpose: "demo", shotType, presenter: { visible: true, layout, crop: { x: .5, y: .5, scale: 1 }, position: layout === "split_left" ? "left" : "right", scale: 1, expression: "confident", gestureIntent: "point", motionIntensity: "medium", eyeline: "camera", backgroundTreatment: "deterministic_fixture", disclosure: "AI-generated brand presenter", sourceScriptId: "s", sourceScriptUpdatedAt: "now" }, productAssetIds: ["asset"], supportedClaimIds: [], captions: [{ startMs: 0, endMs: 1000, text: "Caption" }], typography: [{ family: "kinetic_bold", text: "Heading", emphasizedWords: [], position: "top", maxLines: 2 }], background: { kind: "dark" }, transition: { kind: "none", durationMs: 0 }, focus: { x: .5, y: .5, scale: 1.2 }, minimumReadableDwellMs: 1000, audioCues: [] });

describe("creator video collision layout", () => {
  it.each(["fullscreen", "close_up", "lower_third", "split_left", "split_right"] as const)("places text using rectangles for %s", (layout) => {
    const receipt = choosePlacement(scene(layout), asset, "typography", "top", 2);
    expect(receipt.collisionFree).toBe(true);
    expect(receipt.reserved.some((region) => region.kind === "presenter")).toBe(true);
    expect(receipt.reserved.every((region) => intersectionArea(receipt.chosen, region.rect) === 0)).toBe(true);
  });

  it("covers product-only proof, phone and terminal assets", () => {
    const blueprint = { productAssets: [asset, { ...asset, id: "terminal", kind: "terminal_card" }], scenes: [{ ...scene("split_left", "product_fullscreen"), presenter: { ...scene("split_left").presenter, visible: false }, productAssetIds: ["asset"] }]} as unknown as CreativeBlueprint;
    expect(calculateBlueprintLayout(blueprint).every((receipt) => receipt.collisionFree)).toBe(true);
  });

  it("detects an impossible layout deterministically", () => {
    const impossible = { ...scene("fullscreen"), typography: [] };
    const huge = { ...asset, readableRegion: { x: 0, y: 0, width: 1, height: 1 } };
    const receipt = choosePlacement(impossible, huge, "typography", "center", 12);
    expect(receipt.collisionFree).toBe(false);
    expect(presenterReservedRect("fullscreen").height).toBeGreaterThan(.5);
  });
});
