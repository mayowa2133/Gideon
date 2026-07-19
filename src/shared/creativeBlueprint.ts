import type {
  BrandKit,
  CaptionSegment,
  CreativeBlueprint,
  CreativeBlueprintQualityPolicy,
  CreatorPacePreset,
  CreatorShotType,
  CreatorVideoTemplateSpec,
  DetectedMoment,
  EvidenceClaim,
  EditDecisionList,
  FrameEvidence,
  ProductEvidenceAsset,
  ProductProfile,
  SceneComposition,
  ScriptDraft
} from "./types";

export const referenceCreatorVideoTemplateV1: CreatorVideoTemplateSpec = {
  id: "creator-product-explainer",
  version: 1,
  name: "Creator-led product explainer",
  targetDurationMs: { min: 36_000, default: 44_000, max: 53_000 },
  defaultPacePreset: "energetic",
  paceRangesWpm: {
    readable: { min: 145, max: 160 },
    energetic: { min: 160, max: 175 },
    reference_fast: { min: 200, max: 235 }
  },
  structure: ["hook", "problem", "demo", "proof", "payoff", "cta"],
  hookDeadlineMs: 3_000,
  sceneDurationMs: { min: 1_800, preferred: 2_200, max: 4_800 },
  productProofDwellMs: { min: 2_400, complexMin: 3_200 },
  ctaDurationMs: 4_500,
  allowedShotTypes: [
    "product_hero",
    "product_fullscreen",
    "product_mockup",
    "presenter_fullscreen",
    "presenter_lower_third",
    "presenter_with_card",
    "split_presenter_product",
    "comparison_card",
    "kinetic_typography",
    "cta_end_card"
  ],
  captionFamilies: ["kinetic_bold", "editorial_serif_italic"],
  transitionPolicy: ["snap_cut", "match_cut", "wipe"],
  presenterRules: {
    mayHideForProductProof: true,
    maximumConsecutivePresenterScenes: 2,
    allowedLayouts: ["fullscreen", "close_up", "medium", "lower_third", "split_left", "split_right"]
  },
  safeAreas: { top: 90, right: 70, bottom: 170, left: 70 },
  audio: { targetLufs: -14, toleranceLu: 1.5, maxContinuousSilenceMs: 850 },
  qualityGates: {
    requireEvidenceBackedClaims: true,
    requireCaptionSafeArea: true,
    requireAudioAlignment: true,
    requireCta: true,
    requireAvatarDisclosure: true,
    maxVisualChangesPerTenSeconds: 6,
    minProductTextScale: 1.15
  }
};

export interface CreativeBlueprintIssue {
  code:
    | "unsupported_claim"
    | "missing_product_asset"
    | "script_too_long"
    | "script_too_short"
    | "caption_collision"
    | "insufficient_product_dwell";
  severity: "warning" | "blocking";
  message: string;
  claimId?: string;
  sceneId?: string;
}

export interface CompileCreativeBlueprintInput {
  profile: ProductProfile;
  script: ScriptDraft;
  moments: DetectedMoment[];
  frameEvidence?: FrameEvidence[];
  recordingPath?: string;
  template?: CreatorVideoTemplateSpec;
  previousBlueprint?: CreativeBlueprint;
}

export function buildProductEvidenceAssets(input: {
  moments: DetectedMoment[];
  frameEvidence?: FrameEvidence[];
  claims?: EvidenceClaim[];
  recordingPath?: string;
}): ProductEvidenceAsset[] {
  const claims = input.claims ?? [];
  const frames = input.frameEvidence ?? [];
  const assets: ProductEvidenceAsset[] = [];
  const claimIdsForEvidence = (evidenceIds: string[]): string[] => claims
    .filter((claim) => claim.sourceEvidenceIds.some((id) => evidenceIds.includes(id)))
    .map((claim, index) => claimId(claim, claims.indexOf(claim) >= 0 ? claims.indexOf(claim) : index));

  for (const moment of input.moments.filter((candidate) => candidate.enabled)) {
    const evidenceIds = unique(moment.sourceEvidenceIds ?? []);
    const frame = bestFrameForMoment(frames, moment.id);
    const frameEvidenceIds = unique([...evidenceIds, ...(frame ? [frame.id] : [])]);
    const supportedClaimIds = claimIdsForEvidence(frameEvidenceIds);
    const inferredKind = inferVisualAssetKind(moment, frame);
    assets.push({
      id: `asset-${safeId(moment.id)}-primary`,
      kind: inferredKind,
      label: cleanText(moment.label, "Product proof"),
      sourceMomentIds: [moment.id],
      sourceEvidenceIds: frameEvidenceIds,
      supportedClaimIds,
      sourceStartMs: moment.startMs,
      sourceEndMs: moment.endMs,
      imagePath: frame?.imagePath ?? moment.thumbnailPath,
      imageUrl: frame?.imageUrl ?? moment.thumbnailUrl,
      clipPath: input.recordingPath,
      maskingStatus: frame?.ocrText ? "needs_review" : "not_required",
      crop: normalizeFocus(frame?.focus ?? moment.focus),
      readableRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.78 },
      provenance: "captured_product",
      approvalStatus: "draft",
      factualUseAllowed: frameEvidenceIds.length > 0
    });

    if (input.recordingPath && moment.endMs - moment.startMs >= 900) {
      assets.push({
        id: `asset-${safeId(moment.id)}-interaction`,
        kind: "interaction_clip",
        label: `${cleanText(moment.label, "Product")} interaction`,
        sourceMomentIds: [moment.id],
        sourceEvidenceIds: evidenceIds,
        supportedClaimIds,
        sourceStartMs: moment.startMs,
        sourceEndMs: moment.endMs,
        clipPath: input.recordingPath,
        maskingStatus: "needs_review",
        crop: normalizeFocus(moment.focus),
        readableRegion: { x: 0.06, y: 0.08, width: 0.88, height: 0.78 },
        provenance: "captured_product",
        approvalStatus: "draft",
        factualUseAllowed: evidenceIds.length > 0
      });
    }
  }

  for (const pairId of unique(input.moments.flatMap((moment) => moment.beforeAfterPairId ? [moment.beforeAfterPairId] : []))) {
    const pair = input.moments.filter((moment) => moment.beforeAfterPairId === pairId && moment.enabled);
    const evidenceIds = unique(pair.flatMap((moment) => moment.sourceEvidenceIds ?? []));
    if (pair.some((moment) => moment.visualRole === "before") && pair.some((moment) => moment.visualRole === "payoff")) {
      assets.push({
        id: `asset-pair-${safeId(pairId)}`,
        kind: "before_after_pair",
        label: "Before and after",
        sourceMomentIds: pair.map((moment) => moment.id),
        sourceEvidenceIds: evidenceIds,
        supportedClaimIds: claimIdsForEvidence(evidenceIds),
        maskingStatus: "needs_review",
        crop: { x: 0.5, y: 0.5, scale: 1.15 },
        readableRegion: { x: 0.06, y: 0.08, width: 0.88, height: 0.78 },
        provenance: "evidence_derived",
        approvalStatus: "draft",
        factualUseAllowed: evidenceIds.length > 0
      });
    }
  }

  const firstFactual = assets.find((asset) => asset.factualUseAllowed);
  if (firstFactual) {
    assets.push({
      ...firstFactual,
      id: "asset-product-hero",
      kind: "product_hero",
      label: firstFactual.label
    });
  }
  return dedupeAssets(assets);
}

export function compileCreativeBlueprint(input: CompileCreativeBlueprintInput): {
  blueprint: CreativeBlueprint;
  issues: CreativeBlueprintIssue[];
} {
  if (!input.script.approved) {
    throw new Error("A CreativeBlueprint requires an approved script.");
  }
  const template = input.template ?? referenceCreatorVideoTemplateV1;
  const pacePreset = input.profile.creatorPacePreset ?? template.defaultPacePreset;
  const wordCount = countWords(input.script.voiceoverText);
  const targetWpm = midpoint(template.paceRangesWpm[pacePreset]);
  const narrationDurationMs = wordCount === 0 ? 0 : Math.round((wordCount / targetWpm) * 60_000);
  const targetDurationMs = clamp(
    Math.max(narrationDurationMs + template.ctaDurationMs, template.targetDurationMs.min),
    template.targetDurationMs.min,
    template.targetDurationMs.max
  );
  const contentEndMs = targetDurationMs - template.ctaDurationMs;
  const previousAssets = new Map((input.previousBlueprint?.productAssets ?? []).map((asset) => [asset.id, asset]));
  const assets = buildProductEvidenceAssets({
    moments: input.moments,
    frameEvidence: input.frameEvidence,
    claims: input.script.evidenceClaims,
    recordingPath: input.recordingPath
  }).map((asset) => {
    const previous = previousAssets.get(asset.id);
    return previous ? {
      ...asset,
      approvalStatus: previous.approvalStatus,
      maskingStatus: previous.maskingStatus,
      imagePath: previous.imagePath ?? asset.imagePath,
      imageUrl: previous.imageUrl ?? asset.imageUrl,
      clipPath: previous.clipPath ?? asset.clipPath,
      crop: previous.crop,
      readableRegion: previous.readableRegion
    } : asset;
  });
  const issues = scriptFitIssues(wordCount, narrationDurationMs, contentEndMs, pacePreset);
  if (assets.length === 0) {
    issues.push({
      code: "missing_product_asset",
      severity: "blocking",
      message: "The approved script needs at least one evidence-derived product asset."
    });
  } else if (assets.length < 3) {
    issues.push({
      code: "missing_product_asset",
      severity: "warning",
      message: "The product asset pool is too small to guarantee varied proof scenes without repetition."
    });
  }
  const claims = input.script.evidenceClaims ?? [];
  claims.forEach((claim, index) => {
    const id = claimId(claim, index);
    if (!assets.some((asset) => asset.factualUseAllowed && asset.supportedClaimIds.includes(id))) {
      issues.push({
        code: "unsupported_claim",
        severity: "blocking",
        claimId: id,
        message: `Claim ${index + 1} has no approved factual product asset.`
      });
    }
  });

  const sceneTimings = createSceneTimings({
    contentEndMs,
    template,
    presenterEnabled: Boolean(input.profile.brandPresenterEnabled),
    assets
  });
  const priorScenes = new Map((input.previousBlueprint?.scenes ?? []).map((scene) => [scene.id, scene]));
  const presenterEnabled = Boolean(input.profile.brandPresenterEnabled);
  const scenes = sceneTimings.map((timing, index) => {
    const id = `scene-${String(index + 1).padStart(3, "0")}`;
    const previous = priorScenes.get(id);
    if (previous?.manuallyOverridden) {
      return preserveManualScene(previous, timing.startMs, timing.endMs);
    }
    const purpose = purposeForScene(index, sceneTimings.length);
    const shotType = shotTypeForScene(index, sceneTimings.length, purpose, presenterEnabled, assets, template.allowedShotTypes);
    const asset = assetForScene(assets, index, shotType);
    const supportedClaimIds = asset?.supportedClaimIds ?? [];
    const layout = presenterLayoutForShot(shotType, index);
    const captionPosition = captionPositionForLayout(layout);
    return {
      id,
      startMs: timing.startMs,
      endMs: timing.endMs,
      purpose,
      shotType,
      presenter: {
        visible: presenterEnabled && presenterVisibleForShot(shotType),
        layout,
        crop: presenterCropForLayout(layout),
        position: presenterPositionForLayout(layout),
        scale: presenterScaleForLayout(layout),
        expression: purpose === "hook" ? "excited" : purpose === "proof" ? "explanatory" : "confident",
        gestureIntent: purpose === "demo" || purpose === "proof" ? "point" : "emphasis",
        motionIntensity: pacePreset === "reference_fast" ? "energetic" : "medium",
        eyeline: layout === "split_left" ? "product_right" : layout === "split_right" ? "product_left" : "camera",
        backgroundTreatment: "deterministic_fixture",
        disclosure: "AI-generated brand presenter",
        sourceScriptId: input.script.id,
        sourceScriptUpdatedAt: input.script.updatedAt,
        sourceConsentArtifactId: input.profile.customAvatarSource?.artifactId
      },
      productAssetIds: asset ? [asset.id] : [],
      supportedClaimIds,
      captions: captionsForRange(input.script.captions, timing.startMs, timing.endMs),
      typography: [{
        family: purpose === "hook" || shotType === "kinetic_typography" ? "editorial_serif_italic" : "kinetic_bold",
        text: typographyText(input.script, purpose, asset?.label),
        emphasizedWords: emphasizedWords(typographyText(input.script, purpose, asset?.label)),
        position: captionPosition,
        maxLines: purpose === "hook" ? 3 : 2
      }],
      background: { kind: backgroundForShot(shotType), color: input.profile.brandKit?.backgroundColor },
      transition: { kind: index === 0 ? "none" : transitionForIndex(index), durationMs: index === 0 ? 0 : 240 },
      focus: asset?.crop ?? { x: 0.5, y: 0.5, scale: 1.15 },
      minimumReadableDwellMs: complexProductShot(shotType, asset)
        ? template.productProofDwellMs.complexMin
        : productShot(shotType)
          ? template.productProofDwellMs.min
          : template.sceneDurationMs.min,
      audioCues: index === 0 ? [] : [{ id: `sfx-${id}`, kind: transitionForIndex(index) === "wipe" ? "whoosh" : "pop", startMs: timing.startMs, gainDb: -18 }]
    } satisfies SceneComposition;
  });

  scenes.push(createCtaScene({
    index: scenes.length,
    startMs: contentEndMs,
    endMs: targetDurationMs,
    script: input.script,
    profile: input.profile,
    pacePreset
  }));

  for (const scene of scenes) {
    if (productShot(scene.shotType) && scene.endMs - scene.startMs < scene.minimumReadableDwellMs) {
      issues.push({
        code: "insufficient_product_dwell",
        severity: "blocking",
        sceneId: scene.id,
        message: `${scene.id} is shorter than its required product-proof dwell.`
      });
    }
    if (productShot(scene.shotType) && scene.productAssetIds.length === 0) {
      issues.push({
        code: "missing_product_asset",
        severity: "warning",
        sceneId: scene.id,
        message: `${scene.id} needs an approved product asset or a clearly conceptual fallback.`
      });
    }
  }

  const qualityPolicy: CreativeBlueprintQualityPolicy = { ...template.qualityGates };
  const blueprint: CreativeBlueprint = {
    schemaVersion: "1",
    id: `blueprint-${stableHash(`${input.script.id}:${input.script.updatedAt}:${pacePreset}:${targetDurationMs}`)}`,
    templateId: template.id,
    templateVersion: template.version,
    targetDurationMs,
    pacePreset,
    estimatedWordsPerMinute: targetWpm,
    hook: input.script.hook,
    cta: input.script.cta,
    brandKit: normalizeBlueprintBrand(input.profile),
    claimIds: claims.map(claimId),
    productAssets: assets,
    scenes,
    renderPolicy: {
      canvas: { width: 1080, height: 1920, fps: 30 },
      targetLufs: template.audio.targetLufs,
      loudnessToleranceLu: template.audio.toleranceLu,
      ctaDurationMs: template.ctaDurationMs
    },
    qualityPolicy,
    compiledAt: input.script.updatedAt
  };
  return { blueprint, issues: dedupeIssues(issues) };
}

export function migrateLegacyEditDecisionListToBlueprint(input: CompileCreativeBlueprintInput): CreativeBlueprint {
  return compileCreativeBlueprint(input).blueprint;
}

export function projectBlueprintOntoEditDecisionList(
  editDecisionList: EditDecisionList,
  blueprint: CreativeBlueprint
): EditDecisionList {
  const contentEndMs = blueprint.targetDurationMs - blueprint.renderPolicy.ctaDurationMs;
  const captions = retimeCaptions(editDecisionList.captions, contentEndMs);
  const assets = new Map(blueprint.productAssets.map((asset) => [asset.id, asset]));
  let lastSource = editDecisionList.sourceSegments[0];
  const sourceSegments = blueprint.scenes.map((scene, index) => {
    const asset = scene.productAssetIds.map((id) => assets.get(id)).find(Boolean);
    const fallback = editDecisionList.sourceSegments[index % Math.max(1, editDecisionList.sourceSegments.length)] ?? lastSource;
    const sourceStartMs = asset?.sourceStartMs ?? fallback?.sourceStartMs ?? 0;
    const sourceEndMs = Math.max(sourceStartMs + 500, asset?.sourceEndMs ?? fallback?.sourceEndMs ?? sourceStartMs + (scene.endMs - scene.startMs));
    const segment = {
      momentId: asset?.sourceMomentIds[0] ?? fallback?.momentId ?? "source",
      sourceStartMs,
      sourceEndMs,
      timelineStartMs: scene.startMs,
      timelineEndMs: scene.endMs,
      fit: "contain" as const,
      focus: scene.focus
    };
    lastSource = segment;
    return segment;
  });
  return {
    ...editDecisionList,
    durationMs: blueprint.targetDurationMs,
    sourceSegments,
    captions,
    transitions: blueprint.scenes.flatMap((scene) => scene.transition.kind === "none" ? [] : [{
      id: `transition-${scene.id}`,
      kind: scene.transition.kind,
      startMs: scene.startMs,
      endMs: Math.min(scene.endMs, scene.startMs + scene.transition.durationMs),
      emphasis: scene.purpose === "hook" || scene.purpose === "cta" ? "primary" as const : "accent" as const
    }]),
    sfx: blueprint.scenes.flatMap((scene) => scene.audioCues),
    overlays: [
      ...editDecisionList.overlays.filter((overlay) => overlay.kind !== "hook" && overlay.kind !== "cta"),
      { id: "hook", kind: "hook" as const, startMs: 0, endMs: Math.min(3_000, blueprint.targetDurationMs), text: blueprint.hook, position: "top" as const, emphasis: "primary" as const },
      { id: "cta", kind: "cta" as const, startMs: contentEndMs, endMs: blueprint.targetDurationMs, text: blueprint.cta, position: "center" as const, emphasis: "primary" as const }
    ],
    presenter: {
      ...editDecisionList.presenter,
      enabled: blueprint.scenes.some((scene) => scene.presenter.visible),
      startMs: 0,
      endMs: blueprint.targetDurationMs
    },
    creativeBlueprint: { ...blueprint, scenes: blueprint.scenes.map((scene) => ({ ...scene, captions: captionsForRange(captions, scene.startMs, scene.endMs) })) }
  };
}

export function validateCreativeBlueprint(blueprint: CreativeBlueprint): CreativeBlueprintIssue[] {
  const issues: CreativeBlueprintIssue[] = [];
  if (blueprint.scenes.length === 0 || blueprint.scenes[0]?.startMs !== 0) {
    issues.push({ code: "missing_product_asset", severity: "blocking", message: "Blueprint timeline must start at zero." });
  }
  blueprint.scenes.forEach((scene, index) => {
    const next = blueprint.scenes[index + 1];
    if (scene.endMs <= scene.startMs || (next && next.startMs !== scene.endMs)) {
      issues.push({ code: "caption_collision", severity: "blocking", sceneId: scene.id, message: "Scene timeline contains a gap, overlap, or invalid range." });
    }
    if (scene.presenter.visible && scene.typography.some((cue) => cue.position === presenterTextCollisionPosition(scene.presenter.layout))) {
      issues.push({ code: "caption_collision", severity: "warning", sceneId: scene.id, message: "Typography shares the presenter's primary region." });
    }
  });
  const cta = blueprint.scenes.at(-1);
  if (!cta || cta.shotType !== "cta_end_card" || cta.endMs !== blueprint.targetDurationMs) {
    issues.push({ code: "script_too_short", severity: "blocking", message: "Blueprint must end with a CTA scene." });
  }
  return issues;
}

function createSceneTimings(input: {
  contentEndMs: number;
  template: CreatorVideoTemplateSpec;
  presenterEnabled: boolean;
  assets: ProductEvidenceAsset[];
}): Array<{ startMs: number; endMs: number }> {
  let count = Math.max(4, Math.round(input.contentEndMs / input.template.sceneDurationMs.preferred));
  const durationsForCount = (candidateCount: number): number[] => Array.from({ length: candidateCount }, (_unused, index) => {
    const purpose = purposeForScene(index, candidateCount);
    const shotType = shotTypeForScene(index, candidateCount, purpose, input.presenterEnabled, input.assets, input.template.allowedShotTypes);
    const asset = assetForScene(input.assets, index, shotType);
    if (complexProductShot(shotType, asset)) return input.template.productProofDwellMs.complexMin;
    if (productShot(shotType)) return input.template.productProofDwellMs.min;
    return input.template.sceneDurationMs.min;
  });
  let desired = durationsForCount(count);
  while (count > 4 && desired.reduce((total, duration) => total + duration, 0) > input.contentEndMs) {
    count -= 1;
    desired = durationsForCount(count);
  }
  const totalDesired = desired.reduce((total, duration) => total + duration, 0);
  const factor = input.contentEndMs / totalDesired;
  const result: Array<{ startMs: number; endMs: number }> = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const end = index === count - 1
      ? input.contentEndMs
      : Math.min(input.contentEndMs, cursor + Math.round(desired[index]! * factor));
    result.push({ startMs: cursor, endMs: end });
    cursor = end;
  }
  return result;
}

function purposeForScene(index: number, count: number): SceneComposition["purpose"] {
  if (index === 0) return "hook";
  const progress = index / Math.max(1, count - 1);
  if (progress < 0.2) return "problem";
  if (progress < 0.55) return "demo";
  if (progress < 0.82) return "proof";
  return "payoff";
}

function shotTypeForScene(
  index: number,
  count: number,
  purpose: SceneComposition["purpose"],
  presenterEnabled: boolean,
  assets: ProductEvidenceAsset[],
  allowedShotTypes: CreatorShotType[]
): CreatorShotType {
  const allowed = new Set<CreatorShotType>(allowedShotTypes.filter((shotType) => shotType !== "cta_end_card"));
  const choose = (...candidates: CreatorShotType[]): CreatorShotType =>
    candidates.find((candidate) => allowed.has(candidate)) ?? allowedShotTypes.find((candidate) => candidate !== "cta_end_card") ?? "kinetic_typography";
  if (index === 0) return assets.length
    ? choose("product_hero", "presenter_fullscreen", "kinetic_typography")
    : presenterEnabled
      ? choose("presenter_fullscreen", "kinetic_typography", "product_hero")
      : choose("kinetic_typography", "product_hero");
  if (!presenterEnabled) {
    return index % 4 === 0
      ? choose("kinetic_typography", "product_fullscreen", "product_mockup")
      : index % 3 === 0
        ? choose("product_mockup", "product_fullscreen", "kinetic_typography")
        : choose("product_fullscreen", "product_mockup", "kinetic_typography");
  }
  const sequence: CreatorShotType[] = [
    "presenter_fullscreen",
    "presenter_with_card",
    "product_fullscreen",
    "split_presenter_product",
    "kinetic_typography",
    "presenter_lower_third",
    "product_mockup",
    "comparison_card"
  ];
  if (purpose === "proof" && index % 2 === 0) return choose("product_fullscreen", "split_presenter_product", "presenter_with_card");
  if (purpose === "payoff" && index === count - 1) return choose("presenter_fullscreen", "product_hero", "kinetic_typography");
  const candidate = sequence[(index - 1) % sequence.length]!;
  return choose(candidate, presenterEnabled ? "presenter_with_card" : "product_fullscreen", "kinetic_typography");
}

function assetForScene(assets: ProductEvidenceAsset[], index: number, shotType: CreatorShotType): ProductEvidenceAsset | undefined {
  if (!productShot(shotType) && shotType !== "presenter_with_card" && shotType !== "split_presenter_product") return undefined;
  const preferred = assets.filter((asset) => shotType === "comparison_card" ? asset.kind === "comparison_card" || asset.kind === "before_after_pair" : true);
  const pool = preferred.length ? preferred : assets;
  return pool.length ? pool[index % pool.length] : undefined;
}

function presenterVisibleForShot(shotType: CreatorShotType): boolean {
  return ["presenter_fullscreen", "presenter_lower_third", "presenter_with_card", "split_presenter_product", "cta_end_card"].includes(shotType);
}

function presenterLayoutForShot(shotType: CreatorShotType, index: number): SceneComposition["presenter"]["layout"] {
  if (shotType === "presenter_fullscreen") return index % 2 === 0 ? "close_up" : "fullscreen";
  if (shotType === "presenter_lower_third" || shotType === "presenter_with_card") return "lower_third";
  if (shotType === "split_presenter_product") return index % 2 === 0 ? "split_left" : "split_right";
  return "medium";
}

function presenterCropForLayout(layout: SceneComposition["presenter"]["layout"]): { x: number; y: number; scale: number } {
  return { x: 0.5, y: layout === "close_up" ? 0.32 : 0.46, scale: layout === "close_up" ? 1.65 : layout === "fullscreen" ? 1.2 : 1.05 };
}

function presenterPositionForLayout(layout: SceneComposition["presenter"]["layout"]): SceneComposition["presenter"]["position"] {
  if (layout === "split_left") return "left";
  if (layout === "split_right") return "right";
  if (layout === "lower_third") return "lower_right";
  return "center";
}

function presenterScaleForLayout(layout: SceneComposition["presenter"]["layout"]): number {
  if (layout === "fullscreen" || layout === "close_up") return 1;
  if (layout === "medium") return 0.72;
  if (layout === "lower_third") return 0.46;
  return 0.52;
}

function captionPositionForLayout(layout: SceneComposition["presenter"]["layout"]): SceneComposition["typography"][number]["position"] {
  if (layout === "split_left") return "right";
  if (layout === "split_right") return "left";
  if (layout === "lower_third") return "top";
  return "bottom";
}

function createCtaScene(input: {
  index: number;
  startMs: number;
  endMs: number;
  script: ScriptDraft;
  profile: ProductProfile;
  pacePreset: CreatorPacePreset;
}): SceneComposition {
  return {
    id: `scene-${String(input.index + 1).padStart(3, "0")}`,
    startMs: input.startMs,
    endMs: input.endMs,
    purpose: "cta",
    shotType: "cta_end_card",
    presenter: {
      visible: Boolean(input.profile.brandPresenterEnabled),
      layout: "close_up",
      crop: { x: 0.5, y: 0.32, scale: 1.65 },
      position: "center",
      scale: 1,
      expression: "confident",
      gestureIntent: "emphasis",
      motionIntensity: input.pacePreset === "reference_fast" ? "energetic" : "medium",
      eyeline: "camera",
      backgroundTreatment: "deterministic_fixture",
      disclosure: "AI-generated brand presenter",
      sourceScriptId: input.script.id,
      sourceScriptUpdatedAt: input.script.updatedAt,
      sourceConsentArtifactId: input.profile.customAvatarSource?.artifactId
    },
    productAssetIds: [],
    supportedClaimIds: [],
    captions: captionsForRange(input.script.captions, input.startMs, input.endMs),
    typography: [{ family: "kinetic_bold", text: input.script.cta, emphasizedWords: emphasizedWords(input.script.cta), position: "center", maxLines: 3 }],
    background: { kind: "dark", color: input.profile.brandKit?.backgroundColor },
    transition: { kind: "match_cut", durationMs: 300 },
    focus: { x: 0.5, y: 0.4, scale: 1.2 },
    minimumReadableDwellMs: 4_500,
    audioCues: [{ id: "sfx-cta", kind: "whoosh", startMs: input.startMs, gainDb: -20 }]
  };
}

function preserveManualScene(scene: SceneComposition, startMs: number, endMs: number): SceneComposition {
  const duration = endMs - startMs;
  return {
    ...scene,
    startMs,
    endMs,
    captions: scene.captions.map((caption) => ({
      ...caption,
      startMs: clamp(caption.startMs, startMs, endMs),
      endMs: clamp(caption.endMs, startMs, endMs)
    })),
    minimumReadableDwellMs: Math.min(scene.minimumReadableDwellMs, duration)
  };
}

function inferVisualAssetKind(moment: DetectedMoment, frame?: FrameEvidence): ProductEvidenceAsset["kind"] {
  const text = `${moment.label} ${moment.evidence} ${frame?.ocrText ?? ""}`.toLowerCase();
  if (/terminal|command|code|shell|install/.test(text)) return "terminal_card";
  if (/mobile|phone|ios|android|app store/.test(text)) return "phone_mockup";
  if (/compare|versus| vs |pricing|before|after/.test(text)) return "comparison_card";
  if (/browser|website|dashboard|page/.test(text)) return "browser_mockup";
  return "screenshot";
}

function bestFrameForMoment(frames: FrameEvidence[], momentId: string): FrameEvidence | undefined {
  return frames
    .filter((frame) => frame.momentId === momentId)
    .sort((left, right) => (right.proofScore ?? right.confidence ?? 0) - (left.proofScore ?? left.confidence ?? 0))[0];
}

function normalizeFocus(focus?: { x: number; y: number; scale: number }): { x: number; y: number; scale: number } {
  return { x: clamp(focus?.x ?? 0.5, 0, 1), y: clamp(focus?.y ?? 0.5, 0, 1), scale: clamp(focus?.scale ?? 1.15, 1, 2.5) };
}

function normalizeBlueprintBrand(profile: ProductProfile): BrandKit {
  return {
    id: profile.brandKit?.id ?? `brand-${safeId(profile.productName)}`,
    productName: cleanText(profile.brandKit?.productName ?? profile.productName, "Product"),
    logoPath: profile.brandKit?.logoPath,
    logoUrl: profile.brandKit?.logoUrl,
    primaryColor: profile.brandKit?.primaryColor ?? "#B8F34A",
    secondaryColor: profile.brandKit?.secondaryColor ?? "#F7F8F3",
    accentColor: profile.brandKit?.accentColor ?? "#4F7CFF",
    backgroundColor: profile.brandKit?.backgroundColor ?? "#0B0D0C",
    captionStyle: profile.brandKit?.captionStyle ?? "kinetic_bold",
    ctaStyle: profile.brandKit?.ctaStyle ?? "soft_try",
    tagline: profile.brandKit?.tagline
  };
}

function captionsForRange(captions: CaptionSegment[], startMs: number, endMs: number): CaptionSegment[] {
  return captions.filter((caption) => caption.endMs > startMs && caption.startMs < endMs);
}

function retimeCaptions(captions: CaptionSegment[], targetEndMs: number): CaptionSegment[] {
  const sourceEndMs = Math.max(1, ...captions.map((caption) => caption.endMs));
  const factor = targetEndMs / sourceEndMs;
  return captions.map((caption) => ({
    ...caption,
    startMs: Math.round(caption.startMs * factor),
    endMs: Math.round(caption.endMs * factor),
    words: caption.words?.map((word) => ({
      ...word,
      startMs: Math.round(word.startMs * factor),
      endMs: Math.round(word.endMs * factor)
    }))
  }));
}

function typographyText(script: ScriptDraft, purpose: SceneComposition["purpose"], assetLabel?: string): string {
  if (purpose === "hook") return script.hook;
  if (purpose === "cta") return script.cta;
  return cleanText(assetLabel, purpose === "proof" ? "See the proof" : purpose === "payoff" ? "The result" : "How it works");
}

function emphasizedWords(text: string): string[] {
  return text.split(/\s+/).map((word) => word.replace(/[^a-zA-Z0-9-]/g, "")).filter((word) => word.length >= 6).slice(0, 3);
}

function backgroundForShot(shotType: CreatorShotType): SceneComposition["background"]["kind"] {
  if (shotType === "cta_end_card") return "dark";
  if (shotType === "kinetic_typography" || shotType === "comparison_card") return "light";
  if (shotType.startsWith("presenter")) return "brand";
  return "product_blur";
}

function transitionForIndex(index: number): "snap_cut" | "match_cut" | "wipe" {
  return index % 5 === 0 ? "wipe" : index % 3 === 0 ? "match_cut" : "snap_cut";
}

function productShot(shotType: CreatorShotType): boolean {
  return ["product_hero", "product_fullscreen", "product_mockup", "comparison_card"].includes(shotType);
}

function complexProductShot(shotType: CreatorShotType, asset: ProductEvidenceAsset | undefined): boolean {
  return shotType === "comparison_card" || asset?.kind === "terminal_card" || asset?.kind === "before_after_pair";
}

function presenterTextCollisionPosition(layout: SceneComposition["presenter"]["layout"]): SceneComposition["typography"][number]["position"] {
  if (layout === "split_left") return "left";
  if (layout === "split_right") return "right";
  if (layout === "lower_third") return "bottom";
  return "center";
}

function scriptFitIssues(wordCount: number, narrationMs: number, contentMs: number, pace: CreatorPacePreset): CreativeBlueprintIssue[] {
  if (narrationMs > contentMs) return [{ code: "script_too_long", severity: "blocking", message: `The approved script cannot fit the ${pace} pace without exceeding the content timeline.` }];
  if (wordCount < 60) return [{ code: "script_too_short", severity: "warning", message: "The approved script may leave excessive silence in the reference-length template." }];
  return [];
}

function claimId(claim: EvidenceClaim, index: number): string {
  return `claim-${String(index + 1).padStart(3, "0")}-${stableHash(claim.text).slice(0, 6)}`;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function midpoint(range: { min: number; max: number }): number {
  return Math.round((range.min + range.max) / 2);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item";
}

function cleanText(value: string | undefined, fallback: string): string {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function dedupeAssets(assets: ProductEvidenceAsset[]): ProductEvidenceAsset[] {
  return [...new Map(assets.map((asset) => [asset.id, asset])).values()];
}

function dedupeIssues(issues: CreativeBlueprintIssue[]): CreativeBlueprintIssue[] {
  return [...new Map(issues.map((issue) => [`${issue.code}:${issue.sceneId ?? issue.claimId ?? issue.message}`, issue])).values()];
}
