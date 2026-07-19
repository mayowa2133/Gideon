import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  artifacts: {
    videoFile: string;
    contactSheetFile: string;
    reportFile: string;
  };
}

export async function runCreatorVideoBenchmark(outputDir: string): Promise<CreatorVideoBenchmarkReport> {
  if (!path.isAbsolute(outputDir)) {
    throw new Error("Creator video benchmark output directory must be absolute.");
  }
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const ffmpeg = resolveFfmpeg();
  const sourcePath = path.join(outputDir, "synthetic-product-source.mp4");
  const voiceoverPath = path.join(outputDir, "synthetic-narration.wav");
  const avatarPath = path.join(outputDir, "deterministic-avatar.mp4");
  const contactSheetPath = path.join(outputDir, "creator-video-contact-sheet.jpg");
  const reportPath = path.join(outputDir, "creator-video-benchmark.json");

  await createSyntheticProductSource(ffmpeg, sourcePath);
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
  const renderedPlan = plans.find((plan) => plan.pacePreset === "energetic")!;
  const blueprint = renderedPlan.blueprint;
  const contentEndMs = blueprint.targetDurationMs - blueprint.renderPolicy.ctaDurationMs;
  script.captions = buildBenchmarkCaptions(script.voiceoverText, contentEndMs);
  blueprint.scenes = blueprint.scenes.map((scene) => ({
    ...scene,
    captions: script.captions.filter((caption) => caption.endMs > scene.startMs && caption.startMs < scene.endMs),
    presenter: { ...scene.presenter, backgroundTreatment: "green_screen" }
  }));

  await createSyntheticNarration(ffmpeg, voiceoverPath, blueprint.targetDurationMs);
  const avatarFixture = await createDeterministicAvatarFixture({
    outputPath: avatarPath,
    durationMs: blueprint.targetDurationMs,
    sourceImagePath: benchmarkAvatarImage(),
    ffmpegPath: ffmpeg
  });

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
  const rendered = await renderDraft({
    projectId: "creator-video-benchmark",
    projectDir: outputDir,
    profile: renderedPlan.profile,
    recording,
    script,
    moment: moments[0],
    title: "creator-video-energetic",
    voiceoverPath,
    avatarPresenterPath: avatarPath
  });
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

  const productScenes = blueprint.scenes.filter((scene) => scene.shotType.startsWith("product_") || scene.shotType === "comparison_card");
  const presenterStates = blueprint.scenes.map((scene) => scene.presenter.visible);
  const report: CreatorVideoBenchmarkReport = {
    schemaVersion: "1",
    benchmark: "creator-video-structural-v1",
    generatedAt: new Date().toISOString(),
    subjectiveEquivalenceClaimed: false,
    photorealisticAvatarQualityClaimed: false,
    renderedPreset: "energetic",
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
    artifacts: {
      videoFile: path.basename(rendered.outputPath),
      contactSheetFile: path.basename(contactSheetPath),
      reportFile: path.basename(reportPath)
    }
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.chmod(rendered.outputPath, 0o600);
  await fs.chmod(contactSheetPath, 0o600);
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
    { ...base, id: "benchmark-screenshot", kind: "screenshot", label: "Synthetic product proof", sourceStartMs: 2_000 },
    { ...base, id: "benchmark-interaction", kind: "interaction_clip", label: "Synthetic interaction", sourceStartMs: 3_500, sourceEndMs: 7_000 }
  ];
}

function benchmarkProfile(pace: CreatorPacePreset): ProductProfile {
  return {
    productName: "Gideon Fixture",
    targetCustomer: "product teams",
    productDescription: "Turns captured product evidence into creator-led vertical videos.",
    preferredTone: "educational",
    toneGuidance: "Use only visible fixture evidence.",
    platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    walkthroughNotes: "Synthetic fixture only.",
    defaultTemplateKey: "brand_presenter",
    brandPresenterEnabled: true,
    avatarPresenterId: "orbit",
    brandPresenterPosition: "lower_right",
    brandPresenterMotion: "caption_sync",
    soundDesignEnabled: true,
    musicMood: "clean_tech",
    creatorPacePreset: pace,
    pronunciationDictionary: { Gideon: "GID-ee-un" },
    brandKit: { ...createDefaultBrandKit("Gideon Fixture"), tagline: "Evidence into explanation" }
  };
}

function benchmarkMoments(): DetectedMoment[] {
  return [
    fixtureMoment("dashboard", "Product dashboard", 0, 3_500, "proof-dashboard", "proof"),
    fixtureMoment("interaction", "Approved interaction", 3_500, 7_000, "proof-interaction", "action"),
    fixtureMoment("comparison", "Before and after result", 7_000, 10_500, "proof-comparison", "payoff", "pair-1"),
    fixtureMoment("outcome", "Completed output", 10_500, 14_000, "proof-outcome", "payoff", "pair-1")
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
    evidence: `${label} is visible in the synthetic fixture.`,
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
    ocrText: index % 2 === 0 ? "Product dashboard verified result" : "Browser workflow completed",
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
    "This is how Gideon turns a captured product workflow into a creator led explanation.",
    "First it keeps each claim connected to the exact product evidence that supports it.",
    "Then it chooses a clear product shot, presenter layout, caption position, and readable amount of screen time.",
    "The presenter can appear full screen, move into a split layout, or disappear while the product proof fills the frame.",
    "Screenshots, interactions, comparison cards, browser frames, and editorial text all come from one approved scene plan.",
    "The energetic preset stays understandable instead of copying the extreme speaking speed of the references.",
    "Every scene remains editable, and unsupported factual claims stay blocked until matching evidence exists."
  ];
  const voiceoverText = sentences.join(" ");
  return {
    id: "benchmark-script",
    conceptId: "benchmark-concept",
    templateKey: "brand_presenter",
    hook: "Turn one product workflow into a creator-led video.",
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

async function createSyntheticProductSource(ffmpeg: string, outputPath: string): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=14",
    "-vf", "drawbox=x=70:y=70:w=1140:h=580:color=0xF7F8F3@0.82:t=fill,drawbox=x='80+mod(t*120,920)':y=180:w=210:h=70:color=0x4F7CFF@0.92:t=fill,drawbox=x=150:y=320:w='300+20*t':h=110:color=0xB8F34A@0.92:t=fill,format=yuv420p",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart", outputPath
  ]);
}

async function extractScreenshot(ffmpeg: string, sourcePath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "2", "-i", sourcePath, "-frames:v", "1", outputPath]);
}

async function createSyntheticNarration(ffmpeg: string, outputPath: string, durationMs: number): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
    "-i", `sine=frequency=190:sample_rate=44100:duration=${(durationMs / 1_000).toFixed(3)}`,
    "-t", (durationMs / 1_000).toFixed(3), "-af", "volume=0.25", "-ac", "2", "-c:a", "pcm_s16le", outputPath
  ]);
}

async function createContactSheet(ffmpeg: string, videoPath: string, outputPath: string): Promise<void> {
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", "-i", videoPath,
    "-vf", "fps=1/3,scale=270:-1,tile=5x4:padding=4:margin=4:color=black",
    "-frames:v", "1", outputPath
  ], 120_000);
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
