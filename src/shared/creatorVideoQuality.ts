import type {
  AvatarConsentRecord,
  AvatarPerformanceMetadata,
  AvatarQualityReport,
  CreativeBlueprint,
  CreatorVideoQualityGateResult,
  CreatorVideoQualityReport,
  RenderValidation
} from "./types";

export interface CreatorVideoQualityInput {
  blueprint: CreativeBlueprint;
  render?: RenderValidation;
  sourceScript: { id: string; updatedAt: string };
  avatar?: {
    artifactPresent: boolean;
    performance?: AvatarPerformanceMetadata;
    consent?: AvatarConsentRecord;
    quality?: AvatarQualityReport;
  };
  now?: string;
}

export function evaluateCreatorVideoQuality(input: CreatorVideoQualityInput): CreatorVideoQualityReport {
  const { blueprint, render } = input;
  const gates: CreatorVideoQualityGateResult[] = [];
  const add = (
    code: CreatorVideoQualityGateResult["code"],
    ok: boolean,
    pass: string,
    fail: string,
    sceneIds?: string[]
  ): void => {
    gates.push({ code, status: ok ? "pass" : "fail", message: ok ? pass : fail, sceneIds });
  };

  add(
    "output_format",
    Boolean(render && render.width === 1080 && render.height === 1920 && render.videoCodec === "h264" && render.audioCodec === "aac"),
    "Output is deterministic 1080×1920 H.264/AAC.",
    "A validated 1080×1920 H.264/AAC render is required."
  );
  add(
    "duration",
    Boolean(render && Math.abs(render.durationMs - blueprint.targetDurationMs) <= 1_500),
    "Rendered duration matches the blueprint.",
    "Rendered duration differs from the blueprint by more than 1.5 seconds."
  );
  add("audio_presence", Boolean(render?.audioCodec), "Audio is present.", "Audio is missing.");
  add("audio_loudness", Boolean(render?.audioQa?.withinTarget), "Audio loudness is within target.", "Audio loudness is outside target.");
  add(
    "audio_silence",
    Boolean(render?.audioQa && render.audioQa.maxContinuousSilenceMs <= 1_500),
    "No excessive continuous silence was measured.",
    "Audio contains excessive continuous silence."
  );
  add(
    "frame_signal",
    Boolean(render?.frameQa && render.frameQa.informativeFrames === render.frameQa.sampledFrames && render.frameQa.minLumaStandardDeviation >= 4),
    "Sampled frames contain usable visual signal.",
    "Black, blank, or low-signal sampled frames were detected."
  );

  const captionUnsafe = blueprint.scenes.filter((scene) =>
    scene.typography.some((cue) => cue.position === "bottom" && scene.presenter.visible && scene.presenter.layout === "lower_third")
  );
  add(
    "caption_safe_area",
    captionUnsafe.length === 0,
    "Scene text respects the declared safe layouts.",
    "Text occupies a presenter-sensitive lower safe area.",
    captionUnsafe.map(({ id }) => id)
  );
  const captionOverflow = blueprint.scenes.filter((scene) =>
    [...scene.captions.map(({ text }) => text), ...scene.typography.map(({ text }) => text)]
      .some((text) => text.trim().length > 72 || text.trim().split(/\s+/).some((word) => word.length > 28))
  );
  add(
    "caption_overflow",
    captionOverflow.length === 0,
    "Caption and heading lengths fit deterministic layout limits.",
    "One or more text cues exceed deterministic layout limits.",
    captionOverflow.map(({ id }) => id)
  );

  const productScenes = blueprint.scenes.filter((scene) => scene.productAssetIds.length > 0);
  const unreadableProductScenes = productScenes.filter((scene) => scene.focus.scale < blueprint.qualityPolicy.minProductTextScale);
  add(
    "product_scale",
    unreadableProductScenes.length === 0,
    "Product scenes meet the minimum readable scale.",
    "One or more product scenes are below the minimum readable scale.",
    unreadableProductScenes.map(({ id }) => id)
  );
  const shortScenes = blueprint.scenes.filter((scene) => scene.endMs - scene.startMs < scene.minimumReadableDwellMs);
  add("scene_dwell", shortScenes.length === 0, "All scenes meet their declared dwell.", "One or more scenes are too short.", shortScenes.map(({ id }) => id));
  const visualChangesPerTenSeconds = blueprint.scenes.length / Math.max(1, blueprint.targetDurationMs / 10_000);
  add(
    "visual_cut_rate",
    visualChangesPerTenSeconds <= blueprint.qualityPolicy.maxVisualChangesPerTenSeconds,
    "Visual change rate is within policy.",
    "The cut rate exceeds the configured readable limit."
  );

  const repeatedScenes: string[] = [];
  for (let index = 2; index < productScenes.length; index += 1) {
    const current = productScenes[index]?.productAssetIds.join("|");
    if (current && current === productScenes[index - 1]?.productAssetIds.join("|") && current === productScenes[index - 2]?.productAssetIds.join("|")) {
      repeatedScenes.push(productScenes[index]!.id);
    }
  }
  add("repeated_product_asset", repeatedScenes.length === 0, "Product evidence is not repeated excessively.", "The same product asset is used in three consecutive product scenes.", repeatedScenes);

  const ctaScene = blueprint.scenes.at(-1);
  add(
    "cta",
    Boolean(ctaScene && ctaScene.purpose === "cta" && ctaScene.shotType === "cta_end_card" && ctaScene.endMs - ctaScene.startMs >= blueprint.renderPolicy.ctaDurationMs),
    "A complete CTA end card is reserved.",
    "The blueprint is missing its reserved CTA end card."
  );
  const unsupportedScenes = blueprint.scenes.filter((scene) => scene.supportedClaimIds.some((claimId) =>
    !blueprint.productAssets.some((asset) =>
      asset.factualUseAllowed &&
      asset.approvalStatus === "approved" &&
      asset.maskingStatus !== "needs_review" &&
      asset.supportedClaimIds.includes(claimId)
    )
  ));
  add("claim_evidence", unsupportedScenes.length === 0, "Every scene claim has approved factual evidence.", "A scene claim lacks approved factual evidence.", unsupportedScenes.map(({ id }) => id));
  add("presenter_caption_collision", captionUnsafe.length === 0, "No deterministic presenter/text collisions were found.", "A presenter/text collision was found.", captionUnsafe.map(({ id }) => id));

  const presenterScenes = blueprint.scenes.filter((scene) => scene.presenter.visible);
  const disclosureMissing = presenterScenes.filter((scene) => !scene.presenter.disclosure.trim());
  add("avatar_disclosure", disclosureMissing.length === 0, "Every presenter scene carries disclosure lineage.", "Presenter disclosure is missing.", disclosureMissing.map(({ id }) => id));
  const staleLineage = presenterScenes.filter((scene) =>
    scene.presenter.sourceScriptId !== input.sourceScript.id || scene.presenter.sourceScriptUpdatedAt !== input.sourceScript.updatedAt
  );
  add("avatar_lineage", staleLineage.length === 0, "Presenter lineage matches the approved script.", "Presenter lineage is stale or mismatched.", staleLineage.map(({ id }) => id));

  const consent = input.avatar?.consent;
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const consentValid = !consent || (consent.status !== "revoked" && consent.status !== "denied" && (!consent.expiresAt || Date.parse(consent.expiresAt) > nowMs));
  add("avatar_consent", consentValid, "Avatar consent is valid or not required.", "Avatar consent is revoked, denied, or expired.");
  add("avatar_artifact", presenterScenes.length === 0 || Boolean(input.avatar?.artifactPresent), "A presenter artifact or approved fallback is present.", "Presenter scenes require a valid avatar artifact.");

  const performance = input.avatar?.performance;
  const performanceValid = Boolean(performance && performance.status === "completed" && performance.width >= 360 && performance.height >= 360 && performance.fps >= 20 && performance.fps <= 60 && performance.durationMs > 0 && validUnitRect(performance.cropSafeRegion));
  add("avatar_crop_signal", presenterScenes.length === 0 || performanceValid, "Avatar frame rate, dimensions, duration, and crop-safe region are valid.", "Avatar performance metadata is missing or invalid.");
  const backgroundValid = Boolean(performance && ["transparent", "green_screen", "baked", "deterministic_fixture"].includes(performance.backgroundType));
  add("avatar_background", presenterScenes.length === 0 || backgroundValid, "Avatar matte/background handling is declared.", "Avatar matte/background handling is missing or invalid.");

  const avatarQuality: AvatarQualityReport = input.avatar?.quality ?? {
    requiresHumanReview: true,
    evaluator: "not_run"
  };
  gates.push({
    code: "avatar_subjective_quality",
    status: avatarQuality.evaluator === "not_run" ? "requires_external_review" : "warning",
    message: avatarQuality.evaluator === "not_run"
      ? "Lip sync, identity stability, deformation, flicker, pronunciation, and emotional fit require a real provider canary and human review."
      : "Avatar subjective-quality measurements are available but still require human approval."
  });

  return {
    schemaVersion: "1",
    blueprintId: blueprint.id,
    generatedAt: input.now ?? new Date().toISOString(),
    publishable: gates.every(({ status }) => status !== "fail"),
    gates,
    avatarQuality
  };
}

function validUnitRect(rect: AvatarPerformanceMetadata["cropSafeRegion"]): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
}
