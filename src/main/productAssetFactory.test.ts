import { describe, expect, it } from "vitest";
import { buildProductAssetCommands, productAssetFactoryCacheKey } from "./productAssetFactory";
import type { ProductEvidenceAsset } from "../shared/types";

function asset(kind: ProductEvidenceAsset["kind"], id = kind): ProductEvidenceAsset {
  return {
    id,
    kind,
    label: id,
    sourceMomentIds: ["moment-1"],
    sourceEvidenceIds: ["evidence-1"],
    supportedClaimIds: ["claim-1"],
    sourceStartMs: 1_000,
    sourceEndMs: 4_000,
    maskingStatus: "needs_review",
    crop: { x: 0.5, y: 0.5, scale: 1.2 },
    readableRegion: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    provenance: "captured_product",
    approvalStatus: "approved",
    factualUseAllowed: true
  };
}

describe("product asset factory", () => {
  it("builds deterministic screenshot, interaction, mockup/card, and before-after commands", () => {
    const commands = buildProductAssetCommands({
      recordingPath: "/safe/source.mp4",
      outputDir: "/safe/assets",
      assets: [asset("screenshot"), asset("interaction_clip"), asset("browser_mockup"), asset("phone_mockup"), asset("terminal_card"), asset("feature_card"), asset("comparison_card"), asset("product_hero"), asset("before_after_pair")],
      maskRegionsByAssetId: { screenshot: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }] }
    });
    expect(commands).toHaveLength(9);
    expect(commands.find(({ assetId }) => assetId === "interaction_clip")?.args).toEqual(expect.arrayContaining(["-t", "3.000", "-c:v", "libx264", "+faststart"]));
    expect(commands.find(({ assetId }) => assetId === "before_after_pair")?.args.join(" ")).toContain("hstack=inputs=2");
    expect(commands.find(({ assetId }) => assetId === "screenshot")?.args.join(" ")).toContain("drawbox=x=128:y=144:w=384:h=72");
    expect(commands.every(({ outputPath }) => outputPath.startsWith("/safe/assets/"))).toBe(true);
  });

  it("skips conceptual and rejected assets and rejects unsafe mask coordinates", () => {
    expect(buildProductAssetCommands({
      recordingPath: "/safe/source.mp4",
      outputDir: "/safe/assets",
      assets: [{ ...asset("conceptual_card"), provenance: "conceptual" }, { ...asset("feature_card", "rejected"), approvalStatus: "rejected" }]
    })).toEqual([]);
    expect(() => buildProductAssetCommands({
      recordingPath: "/safe/source.mp4",
      outputDir: "/safe/assets",
      assets: [asset("screenshot")],
      maskRegionsByAssetId: { screenshot: [{ x: 0.9, y: 0, width: 0.2, height: 0.2 }] }
    })).toThrow("normalized rectangles");
  });

  it("invalidates materialized evidence when source, crop, evidence, or masking changes", () => {
    const input = { recordingPath: "/safe/source.mp4", outputDir: "/safe/assets", sourceSha256: "source-a", assets: [asset("screenshot")], maskRegionsByAssetId: {} };
    const initial = productAssetFactoryCacheKey(input);
    expect(productAssetFactoryCacheKey({ ...input, sourceSha256: "source-b" })).not.toBe(initial);
    expect(productAssetFactoryCacheKey({ ...input, assets: [{ ...asset("screenshot"), crop: { x: .4, y: .5, scale: 1.2 } }] })).not.toBe(initial);
    expect(productAssetFactoryCacheKey({ ...input, assets: [{ ...asset("screenshot"), sourceEvidenceIds: ["evidence-2"] }] })).not.toBe(initial);
    expect(productAssetFactoryCacheKey({ ...input, maskRegionsByAssetId: { screenshot: [{ x: .1, y: .1, width: .2, height: .1 }] } })).not.toBe(initial);
  });
});
