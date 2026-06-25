import { randomUUID } from "node:crypto";
import type { DetectedMoment, Project, ProviderRun, TranscriptArtifact } from "../shared/types";
import { extractAudioForTranscription, enrichMomentThumbnails } from "./media";
import { loadProviderConfig } from "./providers/config";
import { OpenAiProvider } from "./providers/openai";

export interface AnalysisPipelineResult {
  moments: DetectedMoment[];
  transcript?: TranscriptArtifact;
  analysisSummary?: string;
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

  if (openai.isConfigured()) {
    const startedAt = new Date().toISOString();
    try {
      const analysis = await openai.analyzeWalkthrough({
        profile: project.profile,
        recording: project.recording,
        transcript,
        moments: baseMoments
      });
      analysisSummary = analysis.summary;
      moments = analysis.moments.map((moment) => ({
        id: randomUUID(),
        label: moment.label,
        startMs: moment.startMs,
        endMs: moment.endMs,
        evidence: moment.evidence,
        confidence: moment.confidence,
        enabled: true
      }));
      providerRuns.push({
        id: randomUUID(),
        kind: "analysis",
        provider: "openai",
        model: config.openai.llmModel,
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

  const enrichedMoments = await enrichMomentThumbnails(project.recording, moments, projectDir);
  return {
    moments: enrichedMoments,
    transcript,
    analysisSummary,
    providerRuns
  };
}

export function safeProviderError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 240);
  }
  return "Provider request failed.";
}

