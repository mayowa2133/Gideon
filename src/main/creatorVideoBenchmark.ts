import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as PImage from "pureimage";
import {
  compileCreativeBlueprint,
  projectBlueprintOntoEditDecisionList,
  referenceCreatorVideoTemplateV1,
  validateCreativeBlueprint
} from "../shared/creativeBlueprint";
import { evaluateCreatorVideoQuality } from "../shared/creatorVideoQuality";
import { buildEditDecisionList, buildVisualBeatsForTemplate, createDefaultBrandKit } from "../shared/renderTemplates";
import type {
  CreativeBlueprint,
  CreatorVideoQualityReport,
  CreatorPacePreset,
  DetectedMoment,
  FrameEvidence,
  ProductProfile,
  RecordingMetadata,
  RenderValidation,
  ScriptDraft
} from "../shared/types";
import { createDeterministicAvatarFixture } from "./deterministicAvatarFixture";
import { probeRecording, renderDraft } from "./media";
import { materializeProductEvidenceAssets } from "./productAssetFactory";
import { normalizePronunciationDictionary, pronunciationDictionaryHash } from "../shared/pronunciation";
import { CLICK_FEEDBACK_MS, easePointerPosition, typingPresentationAt } from "../shared/creatorVideoInteraction";
import { treatmentAllowsPresenterOverlay } from "./creatorVideoVisualReadiness";

export interface CreatorVideoBenchmarkReport {
  schemaVersion: "1";
  benchmark: "creator-video-structural-v1";
  generatedAt: string;
  subjectiveEquivalenceClaimed: false;
  photorealisticAvatarQualityClaimed: false;
  renderedPreset: CreatorPacePreset;
  plans: Array<{
    pacePreset: CreatorPacePreset;
    targetDurationMs: number;
    sceneCount: number;
    shotTypes: string[];
    blockingIssues: string[];
  }>;
  referenceComparison: {
    hookWithinThreeSeconds: boolean;
    sceneCount: number;
    averageVisualChangeMs: number;
    alternatesPresenterAndProduct: boolean;
    shotTypeDiversity: number;
    minimumProductProofDwellMs: number;
    ctaDurationMs: number;
    hasWordTimedCaptions: boolean;
    audioTargetLufs: number;
  };
  renderValidation: RenderValidation;
  qualityReport: CreatorVideoQualityReport;
  avatarFixture: {
    provider: "deterministic_fixture";
    backgroundType: "green_screen";
    requiresHumanReview: true;
  };
  coverage: {
    productAssetKinds: string[];
    typographyFamilies: string[];
    pronunciationDictionaryHash: string;
    requestedSceneIds: string[];
    regeneratedSceneIds: string[];
    reusedSceneIds: string[];
  };
  artifacts: {
    videoFile: string;
    contactSheetFile: string;
    keyFrameSheetFile: string;
    interactionMotionStripFile: string;
    typingSequenceStripFile: string;
    ctaSampleSheetFile: string;
    reportFile: string;
    productAssetManifestFile: string;
    sceneCacheReportFile: string;
    structuralQualityReportFile: string;
    visualReadinessReportFile: string;
    qualityReportFile: string;
  };
}

export async function runCreatorVideoBenchmark(outputDir: string): Promise<CreatorVideoBenchmarkReport> {
  if (!path.isAbsolute(outputDir)) {
    throw new Error("Creator video benchmark output directory must be absolute.");
  }
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const ffmpeg = resolveFfmpeg();
  const sourcePath = path.join(outputDir, "seeded-saas-product-source.mp4");
  const voiceoverPath = path.join(outputDir, "benchmark-narration.wav");
  const avatarPath = path.join(outputDir, "deterministic-avatar.mp4");
  const contactSheetPath = path.join(outputDir, "creator-video-contact-sheet.jpg");
  const keyFrameSheetPath = path.join(outputDir, "creator-video-key-frames.jpg");
  const interactionMotionStripPath = path.join(outputDir, "creator-video-interaction-motion-strip.jpg");
  const typingSequenceStripPath = path.join(outputDir, "creator-video-typing-sequence.jpg");
  const ctaSampleSheetPath = path.join(outputDir, "creator-video-cta-samples.jpg");
  const reportPath = path.join(outputDir, "creator-video-benchmark.json");
  const sceneCacheReportPath = path.join(outputDir, "scene-cache-report.json");
  const qualityReportPath = path.join(outputDir, "creator-video-quality-report.json");
  const structuralQualityReportPath = path.join(outputDir, "creator-video-structural-quality-report.json");
  const visualReadinessReportPath = path.join(outputDir, "creator-video-visual-readiness-report.json");

  await createSeededProductSource(ffmpeg, sourcePath, path.join(outputDir, ".seeded-product-frames"));
  const assetReceipt = await materializeProductEvidenceAssets({
    recordingPath: sourcePath,
    outputDir: path.join(outputDir, "product-assets"),
    assets: benchmarkSeedAssets(),
    ffmpegPath: ffmpeg
  });
  const screenshotPath = assetReceipt.assets.find((asset) => asset.id === "benchmark-screenshot")?.imagePath;
  if (!screenshotPath || !assetReceipt.assets.some((asset) => asset.id === "benchmark-interaction" && asset.clipPath)) {
    throw new Error("Creator video benchmark product asset factory did not produce its screenshot and interaction clip.");
  }
  const recording = await probeRecording(sourcePath);
  const moments = benchmarkMoments();
  const frameEvidence = benchmarkFrameEvidence(screenshotPath);
  const script = benchmarkScript();
  const plans = (["readable", "energetic"] as CreatorPacePreset[]).map((pacePreset) => {
    const profile = benchmarkProfile(pacePreset);
    const result = compileCreativeBlueprint({ profile, script, moments, frameEvidence, recordingPath: sourcePath });
    result.blueprint.productAssets = result.blueprint.productAssets.map((asset) => ({
      ...asset,
      approvalStatus: "approved",
      maskingStatus: "masked"
    }));
    return { pacePreset, profile, ...result };
  });
  const renderedPlan = plans.find((plan) => plan.pacePreset === "readable")!;
  const blueprint = renderedPlan.blueprint;
  const allClaimIds = blueprint.claimIds;
  blueprint.productAssets = assetReceipt.assets.map((asset) => ({ ...asset, supportedClaimIds: asset.provenance === "conceptual" ? [] : allClaimIds, approvalStatus: "approved", maskingStatus: "masked", factualUseAllowed: asset.provenance !== "conceptual" }));
  const contentEndMs = blueprint.targetDurationMs - blueprint.renderPolicy.ctaDurationMs;
  script.captions = buildBenchmarkCaptions(script.voiceoverText, contentEndMs);
  blueprint.scenes = blueprint.scenes.map((scene, index) => {
    const asset = scene.purpose === "cta" ? undefined : blueprint.productAssets[index % blueprint.productAssets.length]!;
    return {
      ...scene,
      productAssetIds: asset ? [asset.id] : [],
      supportedClaimIds: scene.purpose === "cta" ? [] : allClaimIds.slice(0, 1),
      captions: script.captions.filter((caption) => caption.endMs > scene.startMs && caption.startMs < scene.endMs),
      typography: scene.typography.map((cue) => ({ ...cue, family: index % 2 === 0 ? "editorial_serif_italic" as const : "kinetic_bold" as const })),
      presenter: { ...scene.presenter, visible: scene.presenter.visible && (!asset || treatmentAllowsPresenterOverlay(asset.kind)), backgroundTreatment: "green_screen" }
    };
  });

  await createBenchmarkNarration(ffmpeg, voiceoverPath, script.voiceoverText, blueprint.targetDurationMs);
  const avatarFixture = await createDeterministicAvatarFixture({
    outputPath: avatarPath,
    durationMs: blueprint.targetDurationMs,
    sourceImagePath: benchmarkAvatarImage(),
    ffmpegPath: ffmpeg
  });
  const avatarPresenter = {
    path: avatarPath,
    provider: "deterministic_fixture" as const,
    backgroundType: avatarFixture.performance.backgroundType,
    cropSafeRegion: avatarFixture.performance.cropSafeRegion
  };

  const visualBeats = buildVisualBeatsForTemplate({
    moments,
    durationMs: contentEndMs,
    templateKey: "brand_presenter"
  });
  const baseEdl = buildEditDecisionList({
    profile: renderedPlan.profile,
    templateKey: "brand_presenter",
    durationMs: contentEndMs,
    captions: script.captions,
    visualBeats,
    hook: script.hook,
    cta: script.cta,
    moments
  });
  script.creativeBlueprint = blueprint;
  script.editDecisionList = projectBlueprintOntoEditDecisionList(baseEdl, blueprint);
  script.editDecisionList.cursorCues = [];
  script.editDecisionList.visualPresentation = {
    cursorStyle: "arrow",
    movementCount: 4,
    longTraversalCount: 1,
    shortTraversalCount: 3,
    clickCount: 3,
    typingSequences: [{
      id: "contact-search",
      fieldKind: "safe_text",
      value: "Maya Chen",
      startMs: 3_000,
      endMs: 4_300,
      characterDelayMs: 60,
      postEntryDwellMs: 900,
      savedStateVisible: true,
      cancelled: false
    }],
    checkedStrings: ["Contacts", "Maya Chen", "Lifecycle stage", "Qualified", "Changes saved"],
    minimumRenderedTextPx: 24,
    forbiddenPatterns: []
  };
  await renderDraft({
    projectId: "creator-video-benchmark",
    projectDir: outputDir,
    profile: renderedPlan.profile,
    recording,
    script,
    moment: moments[0],
    title: "creator-video-readable",
    voiceoverPath,
    avatarPresenter
  });
  const changedScene = blueprint.scenes[Math.min(2, blueprint.scenes.length - 2)]!;
  changedScene.typography = changedScene.typography.map((cue) => ({ ...cue, text: `${cue.text} — regenerated` }));
  const rendered = await renderDraft({
    projectId: "creator-video-benchmark",
    projectDir: outputDir,
    profile: renderedPlan.profile,
    recording,
    script,
    moment: moments[0],
    title: "creator-video-readable",
    voiceoverPath,
    avatarPresenter,
    sceneIds: [changedScene.id]
  });
  if (!rendered.sceneCache || rendered.sceneCache.reusedSceneIds.length === 0 || !rendered.sceneCache.regeneratedSceneIds.includes(changedScene.id)) throw new Error("Creator benchmark did not demonstrate encoded single-scene regeneration and reuse.");
  const qualityReport = evaluateCreatorVideoQuality({
    blueprint,
    render: rendered.validation,
    sourceScript: { id: script.id, updatedAt: script.updatedAt },
    avatar: {
      artifactPresent: true,
      performance: avatarFixture.performance,
      consent: { assetType: "fictional_catalog", status: "not_required" },
      quality: avatarFixture.qualityReport
    }
  });
  await createContactSheet(ffmpeg, rendered.outputPath, contactSheetPath);
  await createKeyFrameSheet(ffmpeg, rendered.outputPath, keyFrameSheetPath);
  await createInteractionMotionStrip(ffmpeg, rendered.outputPath, interactionMotionStripPath);
  await createTypingSequenceStrip(ffmpeg, sourcePath, typingSequenceStripPath);
  await createCtaSampleSheet(ffmpeg, rendered.outputPath, ctaSampleSheetPath, blueprint.targetDurationMs, blueprint.renderPolicy.ctaDurationMs);
  await fs.writeFile(sceneCacheReportPath, JSON.stringify(rendered.sceneCache, null, 2), { mode: 0o600 });
  await fs.writeFile(qualityReportPath, JSON.stringify(qualityReport, null, 2), { mode: 0o600 });
  await fs.writeFile(structuralQualityReportPath, JSON.stringify({ schemaVersion: "1", structurallyPublishable: qualityReport.structurallyPublishable, gates: qualityReport.gates.filter(({ code }) => !["visible_cta", "interaction_presentation", "production_presentation", "product_readability", "presenter_exposure", "treatment_completeness", "transition_safety"].includes(code)) }, null, 2), { mode: 0o600 });
  await fs.writeFile(visualReadinessReportPath, JSON.stringify({ schemaVersion: "1", humanReviewReady: qualityReport.humanReviewReady, visualReadinessQa: rendered.validation.visualReadinessQa }, null, 2), { mode: 0o600 });

  const productScenes = blueprint.scenes.filter((scene) => scene.shotType.startsWith("product_") || scene.shotType === "comparison_card");
  const presenterStates = blueprint.scenes.map((scene) => scene.presenter.visible);
  const report: CreatorVideoBenchmarkReport = {
    schemaVersion: "1",
    benchmark: "creator-video-structural-v1",
    generatedAt: new Date().toISOString(),
    subjectiveEquivalenceClaimed: false,
    photorealisticAvatarQualityClaimed: false,
    renderedPreset: "readable",
    plans: plans.map((plan) => ({
      pacePreset: plan.pacePreset,
      targetDurationMs: plan.blueprint.targetDurationMs,
      sceneCount: plan.blueprint.scenes.length,
      shotTypes: [...new Set(plan.blueprint.scenes.map((scene) => scene.shotType))],
      blockingIssues: [
        ...plan.issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.code),
        ...validateCreativeBlueprint(plan.blueprint).filter((issue) => issue.severity === "blocking").map((issue) => issue.code)
      ]
    })),
    referenceComparison: {
      hookWithinThreeSeconds: blueprint.scenes[0]?.purpose === "hook" && (blueprint.scenes[0]?.endMs ?? Infinity) <= 3_000,
      sceneCount: blueprint.scenes.length,
      averageVisualChangeMs: Math.round(blueprint.targetDurationMs / blueprint.scenes.length),
      alternatesPresenterAndProduct: presenterStates.some((visible, index) => index > 0 && visible !== presenterStates[index - 1]),
      shotTypeDiversity: new Set(blueprint.scenes.map((scene) => scene.shotType)).size,
      minimumProductProofDwellMs: Math.min(...productScenes.map((scene) => scene.endMs - scene.startMs)),
      ctaDurationMs: blueprint.scenes.at(-1)!.endMs - blueprint.scenes.at(-1)!.startMs,
      hasWordTimedCaptions: script.captions.some((caption) => (caption.words?.length ?? 0) > 0),
      audioTargetLufs: blueprint.renderPolicy.targetLufs
    },
    renderValidation: rendered.validation,
    qualityReport,
    avatarFixture: {
      provider: "deterministic_fixture",
      backgroundType: "green_screen",
      requiresHumanReview: true
    },
    coverage: {
      productAssetKinds: [...new Set(blueprint.productAssets.map(({ kind }) => kind))],
      typographyFamilies: [...new Set(blueprint.scenes.flatMap((scene) => scene.typography.map(({ family }) => family)))],
      pronunciationDictionaryHash: pronunciationDictionaryHash(normalizePronunciationDictionary(renderedPlan.profile.pronunciationDictionary)),
      requestedSceneIds: rendered.sceneCache.requestedSceneIds,
      regeneratedSceneIds: rendered.sceneCache.regeneratedSceneIds,
      reusedSceneIds: rendered.sceneCache.reusedSceneIds
    },
    artifacts: {
      videoFile: path.relative(outputDir, rendered.outputPath),
      contactSheetFile: path.basename(contactSheetPath),
      keyFrameSheetFile: path.basename(keyFrameSheetPath),
      interactionMotionStripFile: path.basename(interactionMotionStripPath),
      typingSequenceStripFile: path.basename(typingSequenceStripPath),
      ctaSampleSheetFile: path.basename(ctaSampleSheetPath),
      reportFile: path.basename(reportPath),
      productAssetManifestFile: path.relative(outputDir, assetReceipt.manifestPath),
      sceneCacheReportFile: path.basename(sceneCacheReportPath),
      structuralQualityReportFile: path.basename(structuralQualityReportPath),
      visualReadinessReportFile: path.basename(visualReadinessReportPath),
      qualityReportFile: path.basename(qualityReportPath)
    }
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  for (const relativeArtifactPath of Object.values(report.artifacts)) {
    if (path.isAbsolute(relativeArtifactPath) || relativeArtifactPath.split(path.sep).includes("..")) {
      throw new Error(`Creator benchmark artifact path is unsafe: ${relativeArtifactPath}`);
    }
    const artifact = await fs.stat(path.join(outputDir, relativeArtifactPath));
    if (!artifact.isFile() || artifact.size === 0) {
      throw new Error(`Creator benchmark artifact is missing or empty: ${relativeArtifactPath}`);
    }
  }
  for (const candidate of [reportPath, assetReceipt.manifestPath, sceneCacheReportPath, qualityReportPath, structuralQualityReportPath, visualReadinessReportPath]) {
    if ((await fs.readFile(candidate, "utf8")).includes(path.resolve(outputDir))) throw new Error(`${path.basename(candidate)} contains a private absolute benchmark path.`);
  }
  await fs.chmod(rendered.outputPath, 0o600);
  await fs.chmod(contactSheetPath, 0o600);
  await fs.chmod(keyFrameSheetPath, 0o600);
  await fs.chmod(interactionMotionStripPath, 0o600);
  await fs.chmod(typingSequenceStripPath, 0o600);
  await fs.chmod(ctaSampleSheetPath, 0o600);
  if (!qualityReport.structurallyPublishable || !qualityReport.humanReviewReady) {
    const failures = qualityReport.gates.filter(({ status }) => status === "fail").map(({ code }) => code).join(", ");
    throw new Error(`Creator-video benchmark did not pass local readiness gates: ${failures || "unknown failure"}. Evidence artifacts were retained for review.`);
  }
  return report;
}

function benchmarkSeedAssets(): import("../shared/types").ProductEvidenceAsset[] {
  const base = {
    sourceMomentIds: ["dashboard"],
    sourceEvidenceIds: ["proof-dashboard"],
    supportedClaimIds: ["claim-dashboard"],
    maskingStatus: "not_required" as const,
    crop: { x: 0.5, y: 0.5, scale: 1.2 },
    readableRegion: { x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    provenance: "captured_product" as const,
    approvalStatus: "approved" as const,
    factualUseAllowed: true
  };
  return [
    { ...base, id: "benchmark-screenshot", kind: "screenshot", label: "Contacts workspace", sourceStartMs: 2_000 },
    { ...base, id: "benchmark-interaction", kind: "interaction_clip", label: "Search Maya Chen", sourceStartMs: 3_500, sourceEndMs: 7_000 },
    { ...base, id: "benchmark-browser", kind: "browser_mockup", label: "Open the matching contact", sourceStartMs: 6_000 },
    { ...base, id: "benchmark-phone", kind: "phone_mockup", label: "Contact record on mobile", sourceStartMs: 7_500 },
    { ...base, id: "benchmark-terminal", kind: "terminal_card", label: "Lifecycle update verified", sourceStartMs: 10_500 },
    { ...base, id: "benchmark-before-after", kind: "before_after_pair", label: "Lead to Qualified", sourceStartMs: 8_500, sourceEndMs: 12_800 },
    { ...base, id: "benchmark-feature", kind: "feature_card", label: "Safe lifecycle-stage editing", sourceStartMs: 9_500 },
    { ...base, id: "benchmark-comparison", kind: "comparison_card", label: "Saved-state evidence", sourceStartMs: 12_500 },
    { ...base, id: "benchmark-hero", kind: "product_hero", label: "NexusReach contact workflow", sourceStartMs: 1_500 },
    { ...base, id: "benchmark-conceptual", kind: "conceptual_card", label: "Proposed follow-up automation", provenance: "conceptual", factualUseAllowed: false, supportedClaimIds: [], sourceStartMs: 9_000 }
  ];
}

function benchmarkProfile(pace: CreatorPacePreset): ProductProfile {
  return {
    productName: "NexusReach",
    targetCustomer: "revenue teams",
    productDescription: "Keeps contact records and lifecycle stages clear for revenue teams.",
    preferredTone: "educational",
    toneGuidance: "Use only visible fixture evidence.",
    platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    walkthroughNotes: "Seeded local fixture: search for Maya Chen, update lifecycle stage, and save.",
    defaultTemplateKey: "brand_presenter",
    brandPresenterEnabled: true,
    avatarPresenterId: "orbit",
    brandPresenterPosition: "lower_right",
    brandPresenterMotion: "caption_sync",
    soundDesignEnabled: true,
    musicMood: "clean_tech",
    creatorPacePreset: pace,
    pronunciationDictionary: { Gideon: "GID-ee-un" },
    brandKit: { ...createDefaultBrandKit("NexusReach"), tagline: "Every relationship in reach" }
  };
}

function benchmarkMoments(): DetectedMoment[] {
  return [
    fixtureMoment("dashboard", "Contacts workspace", 0, 3_500, "proof-dashboard", "proof"),
    fixtureMoment("interaction", "Search and open Maya Chen", 3_500, 7_000, "proof-interaction", "action"),
    fixtureMoment("comparison", "Change Lead to Qualified", 7_000, 10_500, "proof-comparison", "payoff", "pair-1"),
    fixtureMoment("outcome", "Save and confirm the update", 10_500, 14_000, "proof-outcome", "payoff", "pair-1")
  ];
}

function fixtureMoment(
  id: string,
  label: string,
  startMs: number,
  endMs: number,
  evidenceId: string,
  role: DetectedMoment["visualRole"],
  pair?: string
): DetectedMoment {
  return {
    id,
    label,
    startMs,
    endMs,
    evidence: `${label} is visible in the seeded local fixture.`,
    sourceEvidenceIds: [evidenceId],
    confidence: 1,
    enabled: true,
    proofScore: 1,
    visualRole: role,
    beforeAfterPairId: pair,
    focus: { x: 0.5, y: 0.5, scale: 1.2 }
  };
}

function benchmarkFrameEvidence(screenshotPath: string): FrameEvidence[] {
  return benchmarkMoments().map((moment, index) => ({
    id: `frame-${moment.id}`,
    momentId: moment.id,
    timestampMs: moment.startMs + 500,
    imagePath: screenshotPath,
    imageUrl: pathToFileURL(screenshotPath).toString(),
    ocrText: index % 2 === 0 ? "Contacts Maya Chen Lifecycle stage" : "Qualified Changes saved",
    confidence: 1,
    proofScore: 1,
    visualRole: moment.visualRole,
    beforeAfterPairId: moment.beforeAfterPairId,
    focus: moment.focus,
    createdAt: "1970-01-01T00:00:00.000Z"
  }));
}

function benchmarkScript(): ScriptDraft {
  const sentences = [
    "Watch Maya Chen move from a new lead to qualified in NexusReach.",
    "Open Contacts, then use the search field to find Maya Chen without scanning the whole customer list.",
    "The arrow moves to the matching row, clicks it, and opens Maya's contact record.",
    "Her current lifecycle stage is Lead, so the next action focuses on that field instead of unrelated details.",
    "Change the lifecycle stage to Qualified, then keep the completed value visible long enough to verify it.",
    "Select Save and wait for the Changes saved confirmation before leaving the record.",
    "The before-and-after state now gives the revenue team a clear, evidence-backed update they can understand at a glance."
  ];
  const voiceoverText = sentences.join(" ");
  return {
    id: "benchmark-script",
    conceptId: "benchmark-concept",
    templateKey: "brand_presenter",
    hook: "Move a contact from Lead to Qualified.",
    voiceoverText,
    captions: buildBenchmarkCaptions(voiceoverText, 42_000),
    cta: "Review the scenes, then render your product.",
    visualBeats: [],
    evidenceClaims: benchmarkMoments().map((moment) => ({
      text: moment.evidence,
      sourceEvidenceIds: moment.sourceEvidenceIds ?? [],
      momentIds: [moment.id]
    })),
    qualityWarnings: [],
    approved: true,
    updatedAt: "1970-01-01T00:00:00.000Z"
  };
}

function buildBenchmarkCaptions(text: string, durationMs: number): ScriptDraft["captions"] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunkSize = 4;
  const chunks = Array.from({ length: Math.ceil(words.length / chunkSize) }, (_unused, index) => words.slice(index * chunkSize, (index + 1) * chunkSize));
  return chunks.map((chunk, index) => {
    const startMs = Math.round((index / chunks.length) * durationMs);
    const endMs = Math.round(((index + 1) / chunks.length) * durationMs);
    const wordDuration = Math.max(1, Math.floor((endMs - startMs) / chunk.length));
    return {
      startMs,
      endMs,
      text: chunk.join(" "),
      words: chunk.map((word, wordIndex) => ({
        startMs: startMs + wordIndex * wordDuration,
        endMs: wordIndex === chunk.length - 1 ? endMs : startMs + (wordIndex + 1) * wordDuration,
        text: word
      }))
    };
  });
}

async function createSeededProductSource(ffmpeg: string, outputPath: string, framesDir: string): Promise<void> {
  const frameRate = 10;
  const durationSec = 14;
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true, mode: 0o700 });
  loadBenchmarkFont();
  try {
    for (let frame = 0; frame < frameRate * durationSec; frame += 1) {
      const timestampMs = Math.round(frame / frameRate * 1_000);
      const image = PImage.make(1280, 720);
      drawSeededProductFrame(image.getContext("2d"), timestampMs);
      await PImage.encodePNGToStream(image, createWriteStream(path.join(framesDir, `frame-${String(frame).padStart(4, "0")}.png`)));
    }
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-framerate", String(frameRate), "-start_number", "0",
      "-i", path.join(framesDir, "frame-%04d.png"), "-r", "30", "-an", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath
    ], 180_000);
  } finally {
    await fs.rm(framesDir, { recursive: true, force: true });
  }
}

type BenchmarkCanvasContext = ReturnType<ReturnType<typeof PImage.make>["getContext"]>;

function drawSeededProductFrame(context: BenchmarkCanvasContext, timestampMs: number): void {
  fill(context, 0, 0, 1280, 720, "#F4F7FB");
  fill(context, 0, 0, 210, 720, "#111827");
  context.fillStyle = "#FFFFFF";
  context.font = "bold 25pt BenchmarkArial";
  context.fillText("NexusReach", 30, 55);
  context.font = "16pt BenchmarkArial";
  ["Overview", "Contacts", "Sequences", "Analytics"].forEach((label, index) => {
    if (label === "Contacts") fill(context, 18, 112 + index * 54, 174, 42, "#2947A9");
    context.fillStyle = label === "Contacts" ? "#FFFFFF" : "#AEB8CB";
    context.fillText(label, 42, 140 + index * 54);
  });

  context.fillStyle = "#111827";
  context.font = "bold 28pt BenchmarkArial";
  context.fillText(timestampMs >= 6_600 ? "Maya Chen" : "Contacts", 250, 60);
  context.font = "15pt BenchmarkArial";
  context.fillStyle = "#64748B";
  context.fillText(timestampMs >= 6_600 ? "Contact record · Acme Labs" : "Find and update customer records", 250, 90);

  if (timestampMs < 6_600) drawContactsList(context, timestampMs);
  else drawContactRecord(context, timestampMs);

  const pointer = fixturePointerAt(timestampMs);
  if (pointer) {
    const clickAt = [2_650, 6_250, 10_150, 12_250].find((time) => Math.abs(timestampMs - time) <= CLICK_FEEDBACK_MS);
    if (clickAt !== undefined) drawClickRipple(context, pointer.x, pointer.y, Math.abs(timestampMs - clickAt) / CLICK_FEEDBACK_MS);
    drawFixtureArrow(context, pointer.x, pointer.y);
  }
}

function drawContactsList(context: BenchmarkCanvasContext, timestampMs: number): void {
  fill(context, 250, 120, 990, 72, "#FFFFFF");
  stroke(context, 250, 120, 990, 72, "#D8E0EB", 2);
  context.fillStyle = "#94A3B8";
  context.font = "17pt BenchmarkArial";
  const typing = timestampMs >= 2_900 && timestampMs <= 5_500
    ? typingPresentationAt({ value: "Maya Chen", elapsedMs: timestampMs - 2_900, characterDelayMs: 60 })
    : undefined;
  const query = timestampMs > 5_500 ? "Maya Chen" : typing?.visibleText ?? "Search contacts";
  context.fillText(`⌕  ${query}${typing?.caretVisible ? "|" : ""}`, 282, 165);
  fill(context, 1070, 132, 142, 48, "#3659C9");
  context.fillStyle = "#FFFFFF";
  context.font = "bold 15pt BenchmarkArial";
  context.fillText("+ Add contact", 1087, 163);

  const filtered = timestampMs >= 4_000;
  fill(context, 250, 220, 990, 390, "#FFFFFF");
  stroke(context, 250, 220, 990, 390, "#D8E0EB", 2);
  ["NAME", "COMPANY", "LIFECYCLE STAGE", "LAST ACTIVITY"].forEach((label, index) => {
    context.fillStyle = "#64748B";
    context.font = "bold 12pt BenchmarkArial";
    context.fillText(label, [280, 520, 760, 1030][index]!, 258);
  });
  const rows = filtered
    ? [["Maya Chen", "Acme Labs", "Lead", "Today"]]
    : [["Maya Chen", "Acme Labs", "Lead", "Today"], ["Jordan Lee", "Northstar", "Customer", "Yesterday"], ["Amara Okafor", "Sable", "Prospect", "3 days ago"]];
  rows.forEach((row, rowIndex) => {
    const y = 300 + rowIndex * 82;
    fill(context, 270, y - 27, 950, 68, rowIndex === 0 && timestampMs >= 5_500 ? "#EEF3FF" : "#FFFFFF");
    row.forEach((value, columnIndex) => {
      context.fillStyle = columnIndex === 0 ? "#172033" : "#526077";
      context.font = columnIndex === 0 ? "bold 16pt BenchmarkArial" : "15pt BenchmarkArial";
      context.fillText(value, [280, 520, 760, 1030][columnIndex]!, y + 8);
    });
  });
  context.fillStyle = "#64748B";
  context.font = "14pt BenchmarkArial";
  context.fillText(filtered ? "1 matching contact" : "3 seeded contacts", 270, 650);
}

function drawContactRecord(context: BenchmarkCanvasContext, timestampMs: number): void {
  fill(context, 250, 120, 610, 500, "#FFFFFF");
  stroke(context, 250, 120, 610, 500, "#D8E0EB", 2);
  context.fillStyle = "#172033";
  context.font = "bold 23pt BenchmarkArial";
  context.fillText("Contact details", 285, 165);
  const labels = [["Email", "maya.chen@example.test"], ["Company", "Acme Labs"], ["Role", "Growth lead"]];
  labels.forEach(([label, value], index) => {
    const y = 220 + index * 86;
    context.fillStyle = "#64748B";
    context.font = "13pt BenchmarkArial";
    context.fillText(label!, 285, y);
    context.fillStyle = "#172033";
    context.font = "17pt BenchmarkArial";
    context.fillText(value!, 285, y + 30);
  });
  context.fillStyle = "#64748B";
  context.font = "13pt BenchmarkArial";
  context.fillText("Lifecycle stage", 285, 478);
  fill(context, 285, 495, 360, 58, timestampMs >= 10_200 ? "#EEF8F1" : "#FFFFFF");
  stroke(context, 285, 495, 360, 58, timestampMs >= 10_200 ? "#22A35A" : "#B9C5D6", 2);
  context.fillStyle = "#172033";
  context.font = "17pt BenchmarkArial";
  context.fillText(timestampMs >= 10_200 ? "Qualified" : "Lead", 305, 532);
  fill(context, 690, 495, 130, 58, "#3659C9");
  context.fillStyle = "#FFFFFF";
  context.font = "bold 16pt BenchmarkArial";
  context.fillText("Save", 733, 532);

  fill(context, 890, 120, 350, 500, "#FFFFFF");
  stroke(context, 890, 120, 350, 500, "#D8E0EB", 2);
  context.fillStyle = "#172033";
  context.font = "bold 20pt BenchmarkArial";
  context.fillText("Activity", 925, 165);
  context.fillStyle = "#526077";
  context.font = "15pt BenchmarkArial";
  context.fillText("Opened welcome sequence", 925, 220);
  context.fillText("Added from product signup", 925, 285);
  if (timestampMs >= 12_300) {
    fill(context, 870, 625, 350, 64, "#167A45");
    context.fillStyle = "#FFFFFF";
    context.font = "bold 17pt BenchmarkArial";
    context.fillText("✓ Changes saved", 915, 665);
  }
}

function fixturePointerAt(timestampMs: number): { x: number; y: number } | undefined {
  const segments = [
    { start: 1_800, end: 2_650, from: { x: 1040, y: 630 }, to: { x: 430, y: 155 } },
    { start: 5_200, end: 6_250, from: { x: 430, y: 155 }, to: { x: 390, y: 308 } },
    { start: 8_900, end: 10_150, from: { x: 390, y: 308 }, to: { x: 450, y: 523 } },
    { start: 11_500, end: 12_250, from: { x: 450, y: 523 }, to: { x: 755, y: 523 } }
  ];
  const active = segments.find(({ start, end }) => timestampMs >= start && timestampMs <= end);
  if (active) return easePointerPosition(active.from, active.to, (timestampMs - active.start) / (active.end - active.start));
  const previous = [...segments].reverse().find(({ end }) => timestampMs > end);
  return previous?.to ?? (timestampMs >= segments[0]!.start ? segments[0]!.from : undefined);
}

function drawFixtureArrow(context: BenchmarkCanvasContext, x: number, y: number): void {
  context.fillStyle = "#0B1220";
  context.beginPath(); context.moveTo(x, y); context.lineTo(x + 11, y + 36); context.lineTo(x + 20, y + 26); context.lineTo(x + 31, y + 47); context.lineTo(x + 41, y + 42); context.lineTo(x + 30, y + 21); context.lineTo(x + 44, y + 19); context.closePath(); context.fill();
  context.fillStyle = "#FFFFFF";
  context.beginPath(); context.moveTo(x + 3, y + 3); context.lineTo(x + 12, y + 31); context.lineTo(x + 20, y + 22); context.lineTo(x + 31, y + 42); context.lineTo(x + 36, y + 39); context.lineTo(x + 26, y + 19); context.lineTo(x + 39, y + 17); context.closePath(); context.fill();
}

function drawClickRipple(context: BenchmarkCanvasContext, x: number, y: number, progress: number): void {
  context.fillStyle = `rgba(54,89,201,${Math.max(0, 0.32 * (1 - progress)).toFixed(3)})`;
  context.beginPath(); context.arc(x, y, 10 + 28 * progress, 0, Math.PI * 2); context.fill();
}

function fill(context: BenchmarkCanvasContext, x: number, y: number, width: number, height: number, color: string): void {
  context.fillStyle = color;
  context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y); context.lineTo(x + width, y + height); context.lineTo(x, y + height); context.closePath(); context.fill();
}

function stroke(context: BenchmarkCanvasContext, x: number, y: number, width: number, height: number, color: string, thickness: number): void {
  fill(context, x, y, width, thickness, color); fill(context, x, y + height - thickness, width, thickness, color);
  fill(context, x, y, thickness, height, color); fill(context, x + width - thickness, y, thickness, height, color);
}

let benchmarkFontLoaded = false;
function loadBenchmarkFont(): void {
  if (benchmarkFontLoaded) return;
  const candidates = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"];
  const fontPath = candidates.find((candidate) => existsSync(candidate));
  if (fontPath) PImage.registerFont(fontPath, "BenchmarkArial").loadSync();
  benchmarkFontLoaded = true;
}

async function extractScreenshot(ffmpeg: string, sourcePath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "2", "-i", sourcePath, "-frames:v", "1", outputPath]);
}

async function createBenchmarkNarration(ffmpeg: string, outputPath: string, text: string, durationMs: number): Promise<void> {
  const spokenPath = `${outputPath}.spoken.aiff`;
  try {
    await run("/usr/bin/say", ["-v", "Samantha", "-r", "155", "-o", spokenPath, text], 120_000);
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", spokenPath,
      "-af", `apad=pad_dur=${(durationMs / 1_000).toFixed(3)}`,
      "-t", (durationMs / 1_000).toFixed(3), "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outputPath
    ]);
  } catch {
    await run(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
      "-i", `sine=frequency=190:sample_rate=44100:duration=${(durationMs / 1_000).toFixed(3)}`,
      "-t", (durationMs / 1_000).toFixed(3), "-af", "volume=0.25", "-ac", "2", "-c:a", "pcm_s16le", outputPath
    ]);
  } finally {
    await fs.rm(spokenPath, { force: true });
  }
}

async function createContactSheet(ffmpeg: string, videoPath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", videoPath,
    "-vf", "fps=1,scale=180:-1,tile=6x8:padding=4:margin=4:color=black",
    "-frames:v", "1", outputPath
  ], 120_000);
}

async function createKeyFrameSheet(ffmpeg: string, videoPath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, "-vf", "fps=1/4,scale=360:-1,tile=4x3:padding=6:margin=6:color=black", "-frames:v", "1", outputPath], 120_000);
}

async function createInteractionMotionStrip(ffmpeg: string, videoPath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, "-vf", "fps=1/2,scale=216:-1,tile=10x2:padding=4:margin=4:color=black", "-frames:v", "1", outputPath], 120_000);
}

async function createTypingSequenceStrip(ffmpeg: string, sourcePath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "2.8", "-t", "2.2", "-i", sourcePath, "-vf", "fps=5,scale=320:-1,tile=6x2:padding=4:margin=4:color=black", "-frames:v", "1", outputPath], 120_000);
}

async function createCtaSampleSheet(ffmpeg: string, videoPath: string, outputPath: string, durationMs: number, ctaDurationMs: number): Promise<void> {
  const startSec = Math.max(0, (durationMs - ctaDurationMs) / 1_000);
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", startSec.toFixed(3), "-i", videoPath, "-vf", `fps=3/${Math.max(1, ctaDurationMs / 1_000).toFixed(3)},scale=360:-1,tile=3x1:padding=6:margin=6:color=black`, "-frames:v", "1", outputPath], 120_000);
}

function benchmarkAvatarImage(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return path.join(resourcesPath ?? process.cwd(), "assets", "avatar-catalog", "orbit.png");
}

function resolveFfmpeg(): string {
  return process.env.GIDEON_FFMPEG_PATH?.trim() || "/opt/homebrew/bin/ffmpeg";
}

function run(command: string, args: string[], timeoutMs = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Creator video benchmark command timed out.")); }, timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Creator video benchmark command failed with code ${code ?? "unknown"}: ${stderr.slice(-600)}`));
    });
  });
}
