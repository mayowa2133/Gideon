import { describe, expect, it } from "vitest";
import { compileCreativeBlueprint } from "./creativeBlueprint";
import { evaluateCreatorVideoQuality } from "./creatorVideoQuality";
import type { DetectedMoment, ProductProfile, RenderValidation, RenderVisualReadinessQa, ScriptDraft } from "./types";

const updatedAt = "2026-07-18T00:00:00.000Z";
const profile: ProductProfile = {
  productName: "Fixture",
  targetCustomer: "operators",
  productDescription: "A deterministic product fixture",
  preferredTone: "educational",
  toneGuidance: "Clear",
  platforms: ["tiktok"],
  walkthroughNotes: "Show proof",
  brandPresenterEnabled: true,
  avatarPresenterId: "orbit",
  creatorPacePreset: "energetic"
};
const moment: DetectedMoment = {
  id: "proof",
  label: "Completed result",
  startMs: 0,
  endMs: 8_000,
  evidence: "The product shows a completed result.",
  sourceEvidenceIds: ["evidence-proof"],
  confidence: 0.95,
  enabled: true,
  proofScore: 0.95,
  focus: { x: 0.5, y: 0.5, scale: 1.2 }
};

function buildFixture() {
  const script: ScriptDraft = {
    id: "script-1",
    conceptId: "concept-1",
    hook: "Watch the result appear.",
    voiceoverText: Array.from({ length: 110 }, (_, index) => `word${index}`).join(" "),
    captions: [{ startMs: 0, endMs: 1_500, text: "Watch the result" }],
    cta: "Try the product",
    visualBeats: [],
    evidenceClaims: [{ text: "Shows a completed result", sourceEvidenceIds: ["evidence-proof"], momentIds: ["proof"] }],
    approved: true,
    updatedAt
  };
  const compiled = compileCreativeBlueprint({ profile, script, moments: [moment], frameEvidence: [], recordingPath: "/fixture.mp4" });
  compiled.blueprint.productAssets = compiled.blueprint.productAssets.map((asset) => ({
    ...asset,
    approvalStatus: "approved",
    maskingStatus: "not_required"
  }));
  return { script, blueprint: compiled.blueprint };
}

function render(durationMs: number): RenderValidation {
  return {
    width: 1080,
    height: 1920,
    durationMs,
    videoCodec: "h264",
    audioCodec: "aac",
    fastStart: true,
    frameQa: { sampledFrames: 3, informativeFrames: 3, averageLuma: 40, minLuma: 4, maxLuma: 240, minLumaStandardDeviation: 12 },
    audioQa: { integratedLufs: -14, loudnessRangeLu: 4, maxContinuousSilenceMs: 300, targetLufs: -14, withinTarget: true }
    ,temporalQa: { schemaVersion: "1", sampledFrameCount: 80, repeatedFrameRatio: .12, longestUnexpectedFrozenIntervalMs: 400, affectedSceneIds: [], staleLoopSceneIds: [], blackSceneIds: [], blankSceneIds: [], thresholds: { repeatedDifference: .8, maxRepeatedFrameRatio: .72, maxFrozenIntervalMs: 1500 }, result: "pass" },
    visualReadinessQa: passingVisualQa()
  };
}

function passingVisualQa(): RenderVisualReadinessQa {
  return {
    schemaVersion: "1", result: "pass",
    cta: { result: "pass", text: "Try the product", sceneId: "scene-cta", rectangle: { x: 110, y: 660, width: 860, height: 430 }, font: "GideonKinetic", contrastRatio: 15, visibleInterval: { startMs: 1, endMs: 2 }, sampleTimestampsMs: [1, 2, 3], informativeSamples: 3 },
    interactions: { result: "pass", cursorStyle: "arrow", pointerHotspot: { x: 1, y: 1 }, movementCount: 2, longTraversalCount: 1, shortTraversalCount: 1, clickCount: 2, typingSequenceCount: 1, secretsRedacted: true },
    productionPresentation: { result: "pass", mode: "production", forbiddenPatterns: [] },
    readability: { result: "pass", minimumRenderedTextPx: 24, checkedStrings: ["one", "two", "three"], failingSceneIds: [] },
    presenterExposure: { result: "pass", minimumAverageLuma: 32, sampledSceneIds: ["scene-1"], failingSceneIds: [] },
    treatments: { result: "pass", populatedKinds: ["screenshot", "interaction_clip", "browser_mockup", "phone_mockup", "terminal_card", "before_after_pair", "feature_card", "comparison_card", "product_hero", "conceptual_card"], emptyAssetIds: [] },
    transitions: { result: "pass", sampleTimestampsMs: [], failingSceneIds: [], clippedElementIds: [] }, findings: []
  };
}

describe("creator video quality gates", () => {
  it("passes locally measurable gates while reserving subjective avatar review", () => {
    const { script, blueprint } = buildFixture();
    const report = evaluateCreatorVideoQuality({
      blueprint,
      render: render(blueprint.targetDurationMs),
      sourceScript: { id: script.id, updatedAt: script.updatedAt },
      avatar: {
        artifactPresent: true,
        consent: { assetType: "fictional_catalog", status: "not_required" },
        performance: {
          width: 1080,
          height: 1920,
          fps: 30,
          durationMs: blueprint.targetDurationMs,
          cropSafeRegion: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
          backgroundType: "green_screen",
          status: "completed"
        }
      },
      now: "2026-07-18T01:00:00.000Z"
    });
    expect(report.gates.filter(({ status }) => status === "fail")).toEqual([]);
    expect(report.structurallyPublishable).toBe(true);
    expect(report.humanReviewReady).toBe(true);
    expect(report.publishable).toBe(true);
    expect(report.gates.find(({ code }) => code === "avatar_subjective_quality")?.status).toBe("requires_external_review");
  });

  it("does not mistake a reserved CTA for an encoded visible CTA", () => {
    const { script, blueprint } = buildFixture();
    const failedVisual = passingVisualQa();
    failedVisual.result = "fail";
    failedVisual.cta.result = "fail";
    failedVisual.cta.informativeSamples = 0;
    failedVisual.findings = [{ code: "visible_cta", reason: "CTA drawing disabled", sceneIds: [blueprint.scenes.at(-1)!.id], elementIds: ["cta-copy"], timestampsMs: failedVisual.cta.sampleTimestampsMs, threshold: "3 informative samples" }];
    const report = evaluateCreatorVideoQuality({
      blueprint,
      render: { ...render(blueprint.targetDurationMs), visualReadinessQa: failedVisual },
      sourceScript: { id: script.id, updatedAt: script.updatedAt },
      avatar: {
        artifactPresent: true,
        consent: { assetType: "fictional_catalog", status: "not_required" },
        performance: { width: 1080, height: 1920, fps: 30, durationMs: blueprint.targetDurationMs, cropSafeRegion: { x: .1, y: .05, width: .8, height: .9 }, backgroundType: "green_screen", status: "completed" }
      }
    });
    expect(report.structurallyPublishable).toBe(true);
    expect(report.humanReviewReady).toBe(false);
    expect(report.publishable).toBe(false);
    expect(report.gates.find(({ code }) => code === "visible_cta")).toMatchObject({ status: "fail", timestampsMs: failedVisual.cta.sampleTimestampsMs });
  });

  it("blocks stale lineage, missing evidence, invalid consent, and bad media", () => {
    const { script, blueprint } = buildFixture();
    blueprint.scenes.find((scene) => scene.presenter.visible)!.presenter.sourceScriptUpdatedAt = "stale";
    blueprint.scenes.find((scene) => scene.supportedClaimIds.length > 0)!.supportedClaimIds = ["unsupported"];
    const report = evaluateCreatorVideoQuality({
      blueprint,
      render: { ...render(blueprint.targetDurationMs + 4_000), width: 720, audioCodec: null },
      sourceScript: { id: script.id, updatedAt: script.updatedAt },
      avatar: { artifactPresent: false, consent: { assetType: "real_likeness", status: "revoked" } },
      now: "2026-07-18T01:00:00.000Z"
    });
    expect(report.publishable).toBe(false);
    expect(report.gates.filter(({ status }) => status === "fail").map(({ code }) => code)).toEqual(expect.arrayContaining([
      "output_format", "duration", "audio_presence", "claim_evidence", "avatar_lineage", "avatar_consent", "avatar_artifact", "avatar_crop_signal", "avatar_background"
    ]));
  });
});
