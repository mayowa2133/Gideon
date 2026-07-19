import { describe, expect, it } from "vitest";
import { buildProductAssetCommands } from "./productAssetFactory";
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
    expect(commands.find(({ assetId }) => assetId === "screenshot")?.args.join(" ")).toContain("drawbox=x=108:y=384:w=324:h=192");
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
});
