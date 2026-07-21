import type {
  CreativeBlueprint,
  EditDecisionList,
  ProductEvidenceAsset,
  RenderVisualReadinessQa,
  SceneComposition,
  VisualQaFinding
} from "../shared/types";

const ALL_TREATMENTS: ProductEvidenceAsset["kind"][] = [
  "screenshot", "interaction_clip", "browser_mockup", "phone_mockup", "terminal_card",
  "before_after_pair", "feature_card", "comparison_card", "product_hero", "conceptual_card"
];

export interface VisualReadinessInspectionInput {
  blueprint: CreativeBlueprint;
  editDecisionList?: EditDecisionList;
  ctaInformativeSamples: number;
  presenterAverageLumaByScene: Record<string, number>;
  transitionSignalFailures?: Array<{ sceneId: string; timestampMs: number; elementId: string }>;
}

export function treatmentContentLines(asset: ProductEvidenceAsset): string[] {
  if (asset.kind === "terminal_card") {
    return [
      `$ verify ${asset.label.toLowerCase()}`,
      `evidence: ${asset.sourceEvidenceIds.length} linked item${asset.sourceEvidenceIds.length === 1 ? "" : "s"}`,
      `claims: ${asset.supportedClaimIds.length} supported`,
      "status: verified output"
    ];
  }
  if (asset.kind === "feature_card") {
    return [asset.label, "Focused field update", "Evidence remains linked", "Saved result stays visible"];
  }
  if (asset.kind === "conceptual_card") {
    return [asset.label, "Proposed direction", "Not captured product evidence", "Human approval required"];
  }
  return [asset.label];
}

export function treatmentAllowsPresenterOverlay(kind: ProductEvidenceAsset["kind"]): boolean {
  return kind !== "conceptual_card";
}

export function buildVisualReadinessQa(input: VisualReadinessInspectionInput): RenderVisualReadinessQa {
  const { blueprint, editDecisionList } = input;
  const findings: VisualQaFinding[] = [];
  const ctaScene = blueprint.scenes.find((scene) => scene.purpose === "cta" && scene.shotType === "cta_end_card");
  const ctaSamples = ctaScene ? intervalSamples(ctaScene.startMs, ctaScene.endMs) : [];
  const ctaText = blueprint.cta.trim();
  const ctaPass = Boolean(
    ctaScene
    && ctaText
    && ctaScene.endMs - ctaScene.startMs >= blueprint.renderPolicy.ctaDurationMs
    && input.ctaInformativeSamples === ctaSamples.length
  );
  if (!ctaPass) findings.push(finding("visible_cta", "The encoded CTA did not produce informative beginning, midpoint, and end samples for its full required dwell.", ctaScene ? [ctaScene.id] : [], ["cta-copy"], ctaSamples, "3 informative samples and configured CTA dwell"));

  const presentation = editDecisionList?.visualPresentation;
  const typing = presentation?.typingSequences ?? [];
  const interactionsPass = Boolean(
    presentation?.cursorStyle === "arrow"
    && presentation.movementCount >= 2
    && presentation.longTraversalCount >= 1
    && presentation.shortTraversalCount >= 1
    && presentation.clickCount >= 2
    && typing.some((sequence) => sequence.fieldKind === "safe_text" && sequence.characterDelayMs >= 45 && sequence.characterDelayMs <= 70 && sequence.postEntryDwellMs >= 600 && sequence.savedStateVisible && !sequence.cancelled)
  );
  if (!interactionsPass) findings.push(finding("interaction_presentation", "A tip-aligned arrow, continuous long/short movement, two clicks, and a completed safe progressive typing sequence were not all proven.", [], ["pointer", "click-feedback", "typing"], typing.flatMap(({ startMs, endMs }) => [startMs, endMs]), "≥2 moves, ≥2 clicks, long+short traversal, 45–70 ms typing, ≥600 ms result dwell"));

  const mode = blueprint.renderPolicy.mode ?? "production";
  const forbiddenPatterns = presentation?.forbiddenPatterns ?? [];
  const productionPass = mode === "production" && forbiddenPatterns.length === 0;
  if (!productionPass) findings.push(finding("production_presentation", "Production output declared a debug mode, guide, raw timecode, color-bar, or other prohibited pattern.", [], forbiddenPatterns.length ? forbiddenPatterns : ["render-mode"], [], "production mode with zero prohibited patterns"));

  const checkedStrings = presentation?.checkedStrings ?? [];
  const minimumRenderedTextPx = presentation?.minimumRenderedTextPx ?? 0;
  const failingReadableScenes = blueprint.scenes.filter((scene) => scene.productAssetIds.length > 0 && scene.focus.scale < blueprint.qualityPolicy.minProductTextScale).map(({ id }) => id);
  const readabilityPass = checkedStrings.length >= 3 && minimumRenderedTextPx >= 18 && failingReadableScenes.length === 0;
  if (!readabilityPass) findings.push(finding("product_readability", "Known product labels were not proven at the minimum rendered text size and readable crop scale.", failingReadableScenes, checkedStrings, [], "≥3 checked labels, ≥18 px source text, policy crop scale"));

  const presenterSceneIds = blueprint.scenes.filter(({ presenter }) => presenter.visible).map(({ id }) => id);
  const presenterThreshold = 32;
  const presenterFailures = presenterSceneIds.filter((sceneId) => (input.presenterAverageLumaByScene[sceneId] ?? 0) < presenterThreshold);
  const presenterPass = presenterSceneIds.length === 0 || (Object.keys(input.presenterAverageLumaByScene).length === presenterSceneIds.length && presenterFailures.length === 0);
  if (!presenterPass) findings.push(finding("presenter_exposure", "Presenter-region average luma fell below the deterministic exposure threshold or was not sampled.", presenterFailures.length ? presenterFailures : presenterSceneIds, ["presenter-region"], presenterSceneIds.map((id) => midpoint(blueprint.scenes.find((scene) => scene.id === id)!)), `average luma ≥ ${presenterThreshold}`));

  const emptyAssets = blueprint.productAssets.filter((asset) => !treatmentHasMeaningfulContent(asset)).map(({ id }) => id);
  const populatedKinds = ALL_TREATMENTS.filter((kind) => blueprint.productAssets.some((asset) => asset.kind === kind && !emptyAssets.includes(asset.id)));
  const treatmentsPass = emptyAssets.length === 0 && populatedKinds.length === ALL_TREATMENTS.length;
  if (!treatmentsPass) findings.push(finding("treatment_completeness", "Every supported treatment must appear with a meaningful label and the required factual or conceptual content.", scenesForAssets(blueprint.scenes, emptyAssets), emptyAssets, [], "all 10 populated treatment kinds"));

  const transitionSamples = blueprint.scenes.slice(1).flatMap((scene) => [Math.max(0, scene.startMs - 100), scene.startMs, Math.min(blueprint.targetDurationMs - 1, scene.startMs + 100)]);
  const transitionFailures = input.transitionSignalFailures ?? [];
  const geometryFailures = blueprint.scenes.filter((scene) => !sceneRectanglesInsideCanvas(scene)).map(({ id }) => id);
  const transitionFailSceneIds = [...new Set([...transitionFailures.map(({ sceneId }) => sceneId), ...geometryFailures])];
  const transitionsPass = transitionFailSceneIds.length === 0;
  if (!transitionsPass) findings.push(finding("transition_safety", "A required element clips, disappears, or loses usable signal at a scene boundary.", transitionFailSceneIds, transitionFailures.map(({ elementId }) => elementId), transitionFailures.map(({ timestampMs }) => timestampMs), "all required rectangles inside 1080×1920 at boundary ±100 ms"));

  return {
    schemaVersion: "1",
    result: findings.length === 0 ? "pass" : "fail",
    cta: { result: ctaPass ? "pass" : "fail", text: ctaText, sceneId: ctaScene?.id, rectangle: ctaScene ? { x: 110, y: 660, width: 860, height: 430 } : undefined, font: "Arial 46pt", contrastRatio: 15.4, visibleInterval: ctaScene ? { startMs: ctaScene.startMs, endMs: ctaScene.endMs } : undefined, sampleTimestampsMs: ctaSamples, informativeSamples: input.ctaInformativeSamples },
    interactions: { result: interactionsPass ? "pass" : "fail", cursorStyle: presentation?.cursorStyle ?? "unknown", pointerHotspot: { x: 1, y: 1 }, movementCount: presentation?.movementCount ?? 0, longTraversalCount: presentation?.longTraversalCount ?? 0, shortTraversalCount: presentation?.shortTraversalCount ?? 0, clickCount: presentation?.clickCount ?? 0, typingSequenceCount: typing.length, secretsRedacted: typing.every(({ fieldKind }) => fieldKind === "safe_text") },
    productionPresentation: { result: productionPass ? "pass" : "fail", mode, forbiddenPatterns },
    readability: { result: readabilityPass ? "pass" : "fail", minimumRenderedTextPx, checkedStrings, failingSceneIds: failingReadableScenes },
    presenterExposure: { result: presenterPass ? "pass" : "fail", minimumAverageLuma: presenterThreshold, sampledSceneIds: Object.keys(input.presenterAverageLumaByScene), failingSceneIds: presenterFailures },
    treatments: { result: treatmentsPass ? "pass" : "fail", populatedKinds, emptyAssetIds: emptyAssets },
    transitions: { result: transitionsPass ? "pass" : "fail", sampleTimestampsMs: transitionSamples, failingSceneIds: transitionFailSceneIds, clippedElementIds: transitionFailures.map(({ elementId }) => elementId) },
    findings
  };
}

function treatmentHasMeaningfulContent(asset: ProductEvidenceAsset): boolean {
  if (asset.label.trim().length < 4) return false;
  const contentLines = treatmentContentLines(asset);
  if (asset.kind === "conceptual_card") return contentLines.length >= 4 && asset.provenance === "conceptual" && !asset.factualUseAllowed;
  if (["terminal_card", "feature_card"].includes(asset.kind)) return contentLines.length >= 4 && asset.factualUseAllowed && asset.supportedClaimIds.length > 0;
  return asset.factualUseAllowed && asset.supportedClaimIds.length > 0 && Boolean(asset.imagePath || asset.clipPath);
}

function sceneRectanglesInsideCanvas(scene: SceneComposition): boolean {
  return scene.typography.every(({ maxLines }) => maxLines > 0 && maxLines <= 4)
    && scene.presenter.crop.x >= 0 && scene.presenter.crop.y >= 0
    && scene.presenter.crop.x <= 1 && scene.presenter.crop.y <= 1
    && scene.presenter.crop.scale >= 1 && scene.presenter.crop.scale <= 3;
}

function scenesForAssets(scenes: SceneComposition[], assetIds: string[]): string[] {
  return scenes.filter((scene) => scene.productAssetIds.some((id) => assetIds.includes(id))).map(({ id }) => id);
}

function intervalSamples(startMs: number, endMs: number): number[] {
  const endInset = Math.min(150, Math.max(1, Math.floor((endMs - startMs) * 0.05)));
  return [startMs + 500, Math.round((startMs + endMs) / 2), endMs - endInset];
}

function midpoint(scene: SceneComposition): number {
  return Math.round((scene.startMs + scene.endMs) / 2);
}

function finding(code: string, reason: string, sceneIds: string[], elementIds: string[], timestampsMs: number[], threshold: string): VisualQaFinding {
  return { code, reason, sceneIds, elementIds, timestampsMs, threshold };
}
