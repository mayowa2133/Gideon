import { describe, expect, it } from "vitest";
import { analyzeCreatorTemporalSamples, type TemporalSample } from "./creatorVideoTemporalQuality";
import type { CreativeBlueprint, SceneComposition } from "../shared/types";

function scene(id: string, purpose: SceneComposition["purpose"], shotType: SceneComposition["shotType"], startMs: number): SceneComposition { return { id, startMs, endMs: startMs + 2400, purpose, shotType, presenter: { visible: false, layout: "medium", crop: { x: .5, y: .5, scale: 1 }, position: "center", scale: 1, expression: "neutral", gestureIntent: "none", motionIntensity: "subtle", eyeline: "camera", backgroundTreatment: "deterministic_fixture", disclosure: "AI-generated brand presenter", sourceScriptId: "s", sourceScriptUpdatedAt: "now" }, productAssetIds: [], supportedClaimIds: [], captions: [], typography: [], background: { kind: "dark" }, transition: { kind: "none", durationMs: 0 }, focus: { x: .5, y: .5, scale: 1 }, minimumReadableDwellMs: 1000, audioCues: [] }; }
const moving = scene("moving", "demo", "product_fullscreen", 0);
const cta = scene("cta", "cta", "cta_end_card", 2400);
moving.productAssetIds = ["interaction"];
const blueprint = { scenes: [moving, cta], productAssets: [{ id: "interaction", kind: "interaction_clip" }] } as CreativeBlueprint;
function samples(sceneId: string, values: number[]): TemporalSample[] { return values.map((value, index) => ({ timestampMs: index * 400 + (sceneId === "cta" ? 2400 : 0), sceneId, averageLuma: value, lumaDeviation: 20, pixels: new Uint8Array(16).fill(value) })); }

describe("creator final-render temporal QA", () => {
  it("passes moving scenes and permits an intentionally static CTA", () => {
    const report = analyzeCreatorTemporalSamples(blueprint, [...samples("moving", [20, 35, 55, 80, 110, 145]), ...samples("cta", [80, 80, 80, 80, 80, 80])]);
    expect(report.result).toBe("pass");
    expect(report.affectedSceneIds).toEqual([]);
  });
  it("fails an entirely frozen interaction scene separately from black/blank", () => {
    const frozen = analyzeCreatorTemporalSamples(blueprint, [...samples("moving", [80, 80, 80, 80, 80, 80]), ...samples("cta", [70, 70])]);
    expect(frozen.result).toBe("fail");
    expect(frozen.affectedSceneIds).toEqual(["moving"]);
    const black = analyzeCreatorTemporalSamples(blueprint, [...samples("moving", [0, 0, 0, 0, 0, 0]).map((sample) => ({ ...sample, lumaDeviation: 0 })), ...samples("cta", [70, 70])]);
    expect(black.blackSceneIds).toEqual(["moving"]);
    expect(black.blankSceneIds).toEqual(["moving"]);
  });
  it("detects a repeated stale segment", () => {
    const report = analyzeCreatorTemporalSamples(blueprint, [...samples("moving", [20, 80, 20, 80, 20, 80]), ...samples("cta", [70, 70])]);
    expect(report.staleLoopSceneIds).toEqual(["moving"]);
    expect(report.result).toBe("fail");
  });
});
