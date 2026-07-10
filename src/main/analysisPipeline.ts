import { randomUUID } from "node:crypto";
import type {
  DetectedMoment,
  FrameEvidence,
  InteractionHint,
  Project,
  ProviderRun,
  RenderFocusPoint,
  TranscriptArtifact
} from "../shared/types";
import { extractAudioForTranscription, enrichMomentThumbnails } from "./media";
import type { OpenAiProviderConfig } from "./providers/config";
import { loadProviderConfig } from "./providers/config";
import { OpenAiProvider } from "./providers/openai";

const MAX_OCR_FRAMES = 4;

export interface AnalysisPipelineResult {
  moments: DetectedMoment[];
  transcript?: TranscriptArtifact;
  analysisSummary?: string;
  frameEvidence: FrameEvidence[];
  providerRuns: ProviderRun[];
}

export async function runAnalysisPipeline(
  project: Project,
  baseMoments: DetectedMoment[],
  projectDir: string
): Promise<AnalysisPipelineResult> {
  if (!project.recording) {
    throw new Error("Choose a recording before analysis.");
  }

  const config = loadProviderConfig();
  const openai = new OpenAiProvider({ config: config.openai });
  const providerRuns: ProviderRun[] = [];
  let transcript: TranscriptArtifact | undefined;
  let analysisSummary: string | undefined;
  let moments = baseMoments;
  let frameEvidence: FrameEvidence[] = [];

  const seededMoments = await enrichMomentThumbnails(project.recording, baseMoments, projectDir);
  moments = seededMoments;

  if (openai.isConfigured() && project.recording.hasAudio) {
    const startedAt = new Date().toISOString();
    try {
      const audioPath = await extractAudioForTranscription(project.recording, projectDir);
      transcript = await openai.transcribeAudio(audioPath, project.recording);
      providerRuns.push({
        id: randomUUID(),
        kind: "transcription",
        provider: "openai",
        model: config.openai.transcriptionModel,
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString()
      });
    } catch (error) {
      transcript = {
        id: randomUUID(),
        status: "failed",
        provider: "openai",
        model: config.openai.transcriptionModel,
        text: "",
        segments: [],
        createdAt: new Date().toISOString(),
        error: safeProviderError(error)
      };
      providerRuns.push({
        id: randomUUID(),
        kind: "transcription",
        provider: "openai",
        model: config.openai.transcriptionModel,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: safeProviderError(error)
      });
    }
  } else {
    transcript = {
      id: randomUUID(),
      status: project.recording.hasAudio ? "skipped" : "skipped",
      provider: openai.isConfigured() ? "none" : "local",
      text: "",
      segments: [],
      createdAt: new Date().toISOString(),
      error: project.recording.hasAudio ? "OpenAI transcription is not configured." : "Recording has no audio track."
    };
  }

  const ocrStartedAt = new Date().toISOString();
  frameEvidence = createFrameEvidence(seededMoments, ocrStartedAt);
  if (openai.isConfigured()) {
    const imageBackedEvidence = frameEvidence.filter((frame) => frame.imagePath).slice(0, MAX_OCR_FRAMES);
    if (imageBackedEvidence.length > 0) {
      const errors: string[] = [];
      let completedFrames = 0;
      for (const frame of imageBackedEvidence) {
        const moment = seededMoments.find((candidate) => candidate.id === frame.momentId);
        try {
          const result = await openai.extractFrameText({
            imagePath: frame.imagePath!,
            timestampMs: frame.timestampMs,
            momentLabel: moment?.label
          });
          frame.ocrText = result.text;
          frame.uiElements = result.uiElements;
          frame.ocrProvider = "openai";
          frame.confidence = result.confidence;
          completedFrames += 1;
        } catch (error) {
          frame.ocrProvider = "none";
          errors.push(safeProviderError(error));
        }
      }
      providerRuns.push({
        id: randomUUID(),
        kind: "ocr",
        provider: "openai",
        model: config.openai.llmModel,
        promptVersion: config.openai.ocrPromptVersion ?? "ocr-v1",
        status: completedFrames > 0 ? "completed" : "failed",
        startedAt: ocrStartedAt,
        finishedAt: new Date().toISOString(),
        error: errors[0]
      });
    } else {
      providerRuns.push({
        id: randomUUID(),
        kind: "ocr",
        provider: "none",
        status: "skipped",
        startedAt: ocrStartedAt,
        finishedAt: new Date().toISOString(),
        error: "No extracted frame images were available for OCR."
      });
    }
  } else {
    providerRuns.push({
      id: randomUUID(),
      kind: "ocr",
      provider: "none",
      status: "skipped",
      startedAt: ocrStartedAt,
      finishedAt: new Date().toISOString(),
      error: "OpenAI OCR is not configured."
    });
  }
  frameEvidence = rankFrameEvidence(frameEvidence, seededMoments, project.recording.durationMs);

  if (openai.isConfigured()) {
    const startedAt = new Date().toISOString();
    try {
      const analysis = await openai.analyzeWalkthrough({
        profile: project.profile,
        recording: project.recording,
        transcript,
        moments: seededMoments,
        frameEvidence
      });
      analysisSummary = analysis.summary;
      moments = analysis.moments.map((moment, index) => {
        const fallback = seededMoments[index];
        return {
          id: fallback?.id ?? randomUUID(),
          label: moment.label,
          startMs: moment.startMs,
          endMs: moment.endMs,
          evidence: moment.evidence,
          sourceEvidenceIds: moment.sourceEvidenceIds,
          proofScore: fallback?.proofScore,
          visualRole: fallback?.visualRole,
          focus: fallback?.focus,
          confidence: moment.confidence,
          enabled: true
        };
      });
      providerRuns.push({
        id: randomUUID(),
        kind: "analysis",
        provider: "openai",
        model: config.openai.llmModel,
        ...analysisPromptProvenance(config.openai),
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString()
      });
    } catch (error) {
      analysisSummary = "Local deterministic analysis was used because provider-backed semantic analysis failed.";
      providerRuns.push({
        id: randomUUID(),
        kind: "analysis",
        provider: "openai",
        model: config.openai.llmModel,
        ...analysisPromptProvenance(config.openai),
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: safeProviderError(error)
      });
    }
  } else {
    analysisSummary = "Local deterministic analysis was used because OpenAI semantic analysis is not configured.";
    providerRuns.push({
      id: randomUUID(),
      kind: "analysis",
      provider: "local",
      status: "skipped",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: "OpenAI semantic analysis is not configured."
    });
  }

  const rankedMoments = annotateMomentsWithFrameEvidence(moments, frameEvidence);
  const enrichedMoments = rankedMoments === seededMoments ? seededMoments : await enrichMomentThumbnails(project.recording, rankedMoments, projectDir);
  return {
    moments: enrichedMoments,
    transcript,
    analysisSummary,
    frameEvidence,
    providerRuns
  };
}

export function safeProviderError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 240);
  }
  return "Provider request failed.";
}

function analysisPromptProvenance(config: OpenAiProviderConfig): Pick<
  ProviderRun,
  "promptVersion" | "promptReviewedAt" | "promptRolloutStage" | "promptRolloutPercent" | "promptCanaryPercent"
> {
  return {
    promptVersion: config.analysisPromptVersion ?? "analysis-v1",
    promptReviewedAt: config.analysisPromptReviewedAt,
    promptRolloutStage: config.analysisPromptRolloutStage,
    promptRolloutPercent: config.analysisModelRolloutPercent,
    promptCanaryPercent: config.analysisModelCanaryPercent
  };
}

function createFrameEvidence(moments: DetectedMoment[], createdAt: string): FrameEvidence[] {
  return moments.map((moment, index) => ({
    id: `frame-${moment.id}`,
    momentId: moment.id,
    timestampMs: moment.startMs,
    imagePath: moment.thumbnailPath,
    imageUrl: moment.thumbnailUrl,
    changeScore: Number((0.35 + Math.min(index, 4) * 0.12).toFixed(3)),
    proofScore: moment.proofScore,
    visualRole: moment.visualRole,
    focus: moment.focus,
    ocrProvider: "none",
    createdAt
  }));
}

export function rankFrameEvidence(frames: FrameEvidence[], moments: DetectedMoment[], durationMs: number): FrameEvidence[] {
  const ranked = frames.map((frame, index) => {
    const moment = moments.find((candidate) => candidate.id === frame.momentId);
    const uiElements = frame.uiElements ?? [];
    const actionSignals = uiElements.filter((element) => element.kind === "button" || element.kind === "input").length;
    const proofSignals = uiElements.filter((element) => element.kind === "status" || element.kind === "table" || /success|done|generated|ready|sent|created/i.test(element.text)).length;
    const interactionHints = interactionHintsFromUiElements(uiElements, frame.changeScore);
    const readableTextScore = Math.min(0.2, (frame.ocrText?.length ?? 0) / 800);
    const timelineProgress = durationMs > 0 ? frame.timestampMs / durationMs : index / Math.max(frames.length, 1);
    const visualRole = inferVisualRole(index, frames.length, actionSignals, proofSignals, timelineProgress);
    const focus = focusFromInteractionHints(interactionHints) ?? focusFromUiElements(uiElements) ?? moment?.focus ?? focusForRole(visualRole);
    const proofScore = clamp(
      0.38 +
        (moment?.confidence ?? 0.6) * 0.25 +
        actionSignals * 0.06 +
        proofSignals * 0.12 +
        interactionHints.length * 0.04 +
        readableTextScore +
        (frame.changeScore ?? 0) * 0.12,
      0,
      1
    );
    return {
      ...frame,
      proofScore: Number(proofScore.toFixed(3)),
      visualRole,
      focus,
      interactionHints
    };
  });
  return pairBeforeAfterEvidence(ranked);
}

function annotateMomentsWithFrameEvidence(moments: DetectedMoment[], frames: FrameEvidence[]): DetectedMoment[] {
  return moments.map((moment) => {
    const frame = frames
      .filter((candidate) => candidate.momentId === moment.id || moment.sourceEvidenceIds?.includes(`frame:${candidate.id}`))
      .sort((left, right) => (right.proofScore ?? 0) - (left.proofScore ?? 0))[0];
    if (!frame) {
      return moment;
    }
    return {
      ...moment,
      proofScore: Math.max(moment.proofScore ?? 0, frame.proofScore ?? 0),
      visualRole: frame.visualRole ?? moment.visualRole,
      beforeAfterPairId: frame.beforeAfterPairId,
      focus: frame.focus ?? moment.focus,
      interactionHint: frame.interactionHints?.[0] ?? moment.interactionHint
    };
  });
}

function pairBeforeAfterEvidence(frames: FrameEvidence[]): FrameEvidence[] {
  const before = [...frames]
    .filter((frame) => frame.visualRole === "before")
    .sort((left, right) => left.timestampMs - right.timestampMs)[0];
  if (!before) {
    return frames;
  }
  const payoff = [...frames]
    .filter((frame) => frame.visualRole === "payoff" && frame.timestampMs > before.timestampMs)
    .sort((left, right) => (right.proofScore ?? 0) - (left.proofScore ?? 0) || left.timestampMs - right.timestampMs)[0];
  if (!payoff) {
    return frames;
  }
  const beforeAfterPairId = `before-after:${before.momentId}:${payoff.momentId}`;
  return frames.map((frame) =>
    frame.id === before.id || frame.id === payoff.id ? { ...frame, beforeAfterPairId } : frame
  );
}

function inferVisualRole(
  index: number,
  total: number,
  actionSignals: number,
  proofSignals: number,
  timelineProgress: number
): NonNullable<FrameEvidence["visualRole"]> {
  if (proofSignals > 0 || (actionSignals === 0 && (index === total - 1 || timelineProgress > 0.72))) {
    return "payoff";
  }
  if (actionSignals > 0) {
    return "action";
  }
  if (index === 0 || timelineProgress < 0.25) {
    return "before";
  }
  return "proof";
}

function focusFromUiElements(uiElements: FrameEvidence["uiElements"]): RenderFocusPoint | undefined {
  const element = (uiElements ?? [])
    .filter((candidate) => candidate.box)
    .sort((left, right) => elementPriority(right.kind) - elementPriority(left.kind))[0];
  if (!element?.box) {
    return undefined;
  }
  return {
    x: clamp(element.box.x + element.box.width / 2, 0.15, 0.85),
    y: clamp(element.box.y + element.box.height / 2, 0.18, 0.82),
    scale: clamp(1.1 + (1 - Math.max(element.box.width, element.box.height)) * 0.18, 1.12, 1.36)
  };
}

function focusFromInteractionHints(interactionHints: InteractionHint[]): RenderFocusPoint | undefined {
  const hint = interactionHints[0];
  if (!hint) {
    return undefined;
  }
  return {
    x: clamp(hint.x, 0.15, 0.85),
    y: clamp(hint.y, 0.18, 0.82),
    scale: clamp(1.14 + hint.confidence * 0.18, 1.14, 1.36)
  };
}

function interactionHintsFromUiElements(
  uiElements: FrameEvidence["uiElements"],
  changeScore: number | undefined
): InteractionHint[] {
  return (uiElements ?? [])
    .filter((element) => element.box)
    .map((element) => {
      const box = element.box!;
      const isClickTarget = element.kind === "button" || element.kind === "input";
      const baseConfidence = isClickTarget ? 0.72 : 0.52;
      return {
        kind: isClickTarget ? "click_target" as const : "cursor_candidate" as const,
        x: clamp(box.x + box.width / 2, 0, 1),
        y: clamp(box.y + box.height / 2, 0, 1),
        confidence: Number(
          clamp(
            baseConfidence + (element.confidence ?? 0.65) * 0.18 + (changeScore ?? 0.3) * 0.1 + elementPriority(element.kind) * 0.015,
            0,
            1
          ).toFixed(3)
        ),
        label: element.text
      };
    })
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function elementPriority(kind: string): number {
  if (kind === "status") {
    return 5;
  }
  if (kind === "button") {
    return 4;
  }
  if (kind === "table") {
    return 3;
  }
  if (kind === "heading") {
    return 2;
  }
  return 1;
}

function focusForRole(role: NonNullable<FrameEvidence["visualRole"]>): RenderFocusPoint {
  if (role === "before") {
    return { x: 0.45, y: 0.42, scale: 1.12 };
  }
  if (role === "action") {
    return { x: 0.55, y: 0.5, scale: 1.22 };
  }
  if (role === "payoff") {
    return { x: 0.5, y: 0.56, scale: 1.28 };
  }
  return { x: 0.5, y: 0.48, scale: 1.18 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
