import { describe, expect, it } from "vitest";
import type { CreativeBlueprint, EditDecisionList, ProductEvidenceAsset, SceneComposition } from "../shared/types";
import { buildVisualReadinessQa, treatmentAllowsPresenterOverlay, treatmentContentLines } from "./creatorVideoVisualReadiness";

const kinds: ProductEvidenceAsset["kind"][] = ["screenshot", "interaction_clip", "browser_mockup", "phone_mockup", "terminal_card", "before_after_pair", "feature_card", "comparison_card", "product_hero", "conceptual_card"];

function asset(kind: ProductEvidenceAsset["kind"], index: number): ProductEvidenceAsset {
  const conceptual = kind === "conceptual_card";
  return {
    id: `asset-${index}`, kind, label: conceptual ? "Proposed follow-up automation" : `Populated ${kind}`,
    sourceMomentIds: ["moment"], sourceEvidenceIds: ["evidence"], supportedClaimIds: conceptual ? [] : ["claim"],
    imagePath: conceptual || kind === "interaction_clip" ? undefined : `/tmp/asset-${index}.png`, clipPath: kind === "interaction_clip" ? "/tmp/interaction.mp4" : undefined,
    maskingStatus: "not_required", crop: { x: .5, y: .5, scale: 1.2 }, readableRegion: { x: .1, y: .1, width: .8, height: .8 },
    provenance: conceptual ? "conceptual" : "captured_product", approvalStatus: "approved", factualUseAllowed: !conceptual
  };
}

function scene(id: string, startMs: number, endMs: number, purpose: SceneComposition["purpose"], assetId?: string): SceneComposition {
  return {
    id, startMs, endMs, purpose, shotType: purpose === "cta" ? "cta_end_card" : "product_fullscreen",
    presenter: { visible: false, layout: "medium", crop: { x: .5, y: .5, scale: 1.2 }, position: "center", scale: 1, expression: "neutral", gestureIntent: "none", motionIntensity: "subtle", eyeline: "camera", backgroundTreatment: "deterministic_fixture", disclosure: "AI-generated brand presenter", sourceScriptId: "script", sourceScriptUpdatedAt: "now" },
    productAssetIds: assetId ? [assetId] : [], supportedClaimIds: assetId ? ["claim"] : [], captions: [], typography: [{ family: "kinetic_bold", text: purpose === "cta" ? "Review" : "Proof", emphasizedWords: [], position: "top", maxLines: 2 }],
    background: { kind: "dark" }, transition: { kind: startMs === 0 ? "none" : "crossfade", durationMs: startMs === 0 ? 0 : 240 }, focus: { x: .5, y: .5, scale: 1.2 }, minimumReadableDwellMs: 1_500, audioCues: []
  };
}

function fixture(): { blueprint: CreativeBlueprint; editDecisionList: EditDecisionList } {
  const assets = kinds.map(asset);
  const productScenes = assets.map((item, index) => scene(`scene-${index + 1}`, index * 2_000, (index + 1) * 2_000, "proof", item.id));
  const cta = scene("scene-cta", 20_000, 24_500, "cta");
  const blueprint = {
    schemaVersion: "1", id: "blueprint", templateId: "template", templateVersion: 1, targetDurationMs: 24_500, pacePreset: "readable", estimatedWordsPerMinute: 150,
    hook: "Hook", cta: "Review the scenes, then render your product.", brandKit: {}, claimIds: ["claim"], productAssets: assets, scenes: [...productScenes, cta],
    renderPolicy: { canvas: { width: 1080, height: 1920, fps: 30 }, targetLufs: -14, loudnessToleranceLu: 1.5, ctaDurationMs: 4_500, mode: "production" },
    qualityPolicy: { minProductTextScale: 1.1 }, compiledAt: "now"
  } as CreativeBlueprint;
  const editDecisionList = {
    visualPresentation: {
      cursorStyle: "arrow", movementCount: 3, longTraversalCount: 1, shortTraversalCount: 2, clickCount: 2,
      typingSequences: [{ id: "typing", fieldKind: "safe_text", value: "Maya Chen", startMs: 3_000, endMs: 4_000, characterDelayMs: 60, postEntryDwellMs: 800, savedStateVisible: true, cancelled: false }],
      checkedStrings: ["Contacts", "Maya Chen", "Qualified"], minimumRenderedTextPx: 24, forbiddenPatterns: []
    }
  } as EditDecisionList;
  return { blueprint, editDecisionList };
}

describe("encoded creator-video visual readiness", () => {
  it("passes a complete production receipt", () => {
    const { blueprint, editDecisionList } = fixture();
    const report = buildVisualReadinessQa({ blueprint, editDecisionList, ctaInformativeSamples: 3, presenterAverageLumaByScene: {} });
    expect(report.result).toBe("pass");
    expect(report.treatments.populatedKinds).toEqual(kinds);
  });

  it("requires informative multi-section copy for text-led treatments", () => {
    const { blueprint } = fixture();
    for (const kind of ["terminal_card", "feature_card", "conceptual_card"] as const) {
      const item = blueprint.productAssets.find((candidate) => candidate.kind === kind)!;
      expect(treatmentContentLines(item)).toHaveLength(4);
      expect(new Set(treatmentContentLines(item)).size).toBe(4);
    }
    expect(treatmentAllowsPresenterOverlay("conceptual_card")).toBe(false);
    expect(treatmentAllowsPresenterOverlay("feature_card")).toBe(true);
  });

  it("fails an intended CTA that has no encoded text signal", () => {
    const { blueprint, editDecisionList } = fixture();
    const report = buildVisualReadinessQa({ blueprint, editDecisionList, ctaInformativeSamples: 0, presenterAverageLumaByScene: {} });
    expect(report.cta.result).toBe("fail");
    expect(report.findings.find(({ code }) => code === "visible_cta")?.timestampsMs).toHaveLength(3);
  });

  it("rejects debug/timecode presentation and missing interaction evidence", () => {
    const { blueprint, editDecisionList } = fixture();
    blueprint.renderPolicy.mode = "debug";
    editDecisionList.visualPresentation!.forbiddenPatterns = ["raw-timecode"];
    editDecisionList.visualPresentation!.clickCount = 1;
    const report = buildVisualReadinessQa({ blueprint, editDecisionList, ctaInformativeSamples: 3, presenterAverageLumaByScene: {} });
    expect(report.productionPresentation.result).toBe("fail");
    expect(report.interactions.result).toBe("fail");
  });

  it("rejects unreadable, underexposed, empty, and clipped fixtures", () => {
    const { blueprint, editDecisionList } = fixture();
    blueprint.scenes[0]!.focus.scale = .5;
    blueprint.productAssets[0]!.label = "";
    blueprint.scenes[1]!.presenter.visible = true;
    blueprint.scenes[2]!.presenter.crop.x = 1.2;
    const report = buildVisualReadinessQa({ blueprint, editDecisionList, ctaInformativeSamples: 3, presenterAverageLumaByScene: { "scene-2": 10 } });
    expect(report.readability.result).toBe("fail");
    expect(report.presenterExposure.result).toBe("fail");
    expect(report.treatments.result).toBe("fail");
    expect(report.transitions.result).toBe("fail");
  });
});
