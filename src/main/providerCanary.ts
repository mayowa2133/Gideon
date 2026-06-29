import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenAiProvider, type FrameOcrResult, type WalkthroughAnalysisInput, type WalkthroughAnalysisResult } from "./providers/openai";
import { loadProviderConfig, type ProviderConfig } from "./providers/config";
import type { ProductProfile, RecordingMetadata, TranscriptArtifact } from "../shared/types";

export type ProviderCanaryCapability = "analysis" | "transcription" | "ocr" | "tts";
export type ProviderCanaryMode = "dry_run" | "live";
export type ProviderCanaryStatus = "configured" | "skipped" | "passed" | "failed";

export interface ProviderCanaryResult {
  capability: ProviderCanaryCapability;
  provider: "openai";
  status: ProviderCanaryStatus;
  model: string;
  message: string;
  durationMs: number;
}

export interface ProviderCanaryReport {
  mode: ProviderCanaryMode;
  providerConfigured: boolean;
  baseUrl: string;
  results: ProviderCanaryResult[];
  generatedAt: string;
}

export interface ProviderCanaryAdapter {
  analyzeWalkthrough(input: WalkthroughAnalysisInput): Promise<WalkthroughAnalysisResult>;
  transcribeAudio(audioPath: string, recording: RecordingMetadata): Promise<TranscriptArtifact>;
  extractFrameText(input: { imagePath: string; timestampMs: number; momentLabel?: string }): Promise<FrameOcrResult>;
  synthesizeSpeech(input: {
    text: string;
    instructions: string;
    outputPath: string;
  }): Promise<{ outputPath: string; provider: "openai"; model: string }>;
}

export interface ProviderCanaryOptions {
  env?: NodeJS.ProcessEnv;
  mode?: ProviderCanaryMode;
  adapter?: ProviderCanaryAdapter;
  config?: ProviderConfig;
  now?: () => Date;
}

export async function runProviderCanaries(options: ProviderCanaryOptions = {}): Promise<ProviderCanaryReport> {
  const env = options.env ?? process.env;
  const config = options.config ?? loadProviderConfig(env);
  const mode = options.mode ?? (env.GIDEON_PROVIDER_CANARY_LIVE === "true" ? "live" : "dry_run");
  const now = options.now ?? (() => new Date());
  const adapter = options.adapter ?? new OpenAiProvider({ config: config.openai });
  const startedAt = now().toISOString();

  const results =
    mode === "dry_run"
      ? buildDryRunResults(config)
      : await runLiveCanaries({ env, config, adapter, now });

  return {
    mode,
    providerConfigured: Boolean(config.openai.apiKey),
    baseUrl: config.openai.baseUrl,
    results,
    generatedAt: startedAt
  };
}

function buildDryRunResults(config: ProviderConfig): ProviderCanaryResult[] {
  const configured = Boolean(config.openai.apiKey);
  const message = configured
    ? "OpenAI provider configuration is present. Live canary calls were not made because dry-run mode is active."
    : "OpenAI provider configuration is missing. Set GIDEON_OPENAI_API_KEY or OPENAI_API_KEY to enable live provider canaries.";

  return [
    dryRunResult("analysis", config.openai.llmModel, configured, message),
    dryRunResult("transcription", config.openai.transcriptionModel, configured, message),
    dryRunResult("ocr", config.openai.llmModel, configured, message),
    dryRunResult("tts", config.openai.ttsModel, configured, message)
  ];
}

function dryRunResult(
  capability: ProviderCanaryCapability,
  model: string,
  configured: boolean,
  message: string
): ProviderCanaryResult {
  return {
    capability,
    provider: "openai",
    status: configured ? "configured" : "skipped",
    model,
    message,
    durationMs: 0
  };
}

async function runLiveCanaries(input: {
  env: NodeJS.ProcessEnv;
  config: ProviderConfig;
  adapter: ProviderCanaryAdapter;
  now: () => Date;
}): Promise<ProviderCanaryResult[]> {
  const { env, config, adapter, now } = input;
  if (!config.openai.apiKey) {
    return [
      missingKeyResult("analysis", config.openai.llmModel),
      missingKeyResult("transcription", config.openai.transcriptionModel),
      missingKeyResult("ocr", config.openai.llmModel),
      missingKeyResult("tts", config.openai.ttsModel)
    ];
  }

  const results: ProviderCanaryResult[] = [];
  results.push(
    await executeCanary({
      capability: "analysis",
      model: config.openai.llmModel,
      now,
      run: async () => {
        const result = await adapter.analyzeWalkthrough(buildCanaryAnalysisInput());
        if (!result.summary.trim() || result.moments.length === 0) {
          throw new Error("Analysis canary returned no summary or moments.");
        }
        return `Analysis canary passed with ${result.moments.length} grounded moment(s).`;
      },
      redactionHints: [config.openai.apiKey]
    })
  );

  const audioPath = normalizeOptionalPath(env.GIDEON_PROVIDER_CANARY_AUDIO_PATH);
  if (audioPath) {
    results.push(
      await executeCanary({
        capability: "transcription",
        model: config.openai.transcriptionModel,
        now,
        run: async () => {
          await assertReadable(audioPath, "transcription fixture");
          const transcript = await adapter.transcribeAudio(audioPath, canaryRecording);
          if (transcript.status !== "completed" || !transcript.text.trim()) {
            throw new Error("Transcription canary returned no completed transcript text.");
          }
          return "Transcription canary passed with completed transcript text.";
        },
        redactionHints: [config.openai.apiKey]
      })
    );
  } else {
    results.push(skippedFixtureResult("transcription", config.openai.transcriptionModel, "GIDEON_PROVIDER_CANARY_AUDIO_PATH"));
  }

  const imagePath = normalizeOptionalPath(env.GIDEON_PROVIDER_CANARY_IMAGE_PATH);
  if (imagePath) {
    results.push(
      await executeCanary({
        capability: "ocr",
        model: config.openai.llmModel,
        now,
        run: async () => {
          await assertReadable(imagePath, "OCR fixture");
          const result = await adapter.extractFrameText({
            imagePath,
            timestampMs: 1200,
            momentLabel: "Canary fixture"
          });
          if (typeof result.text !== "string" || Number.isNaN(result.confidence)) {
            throw new Error("OCR canary returned an invalid result.");
          }
          return "OCR canary passed with structured frame text output.";
        },
        redactionHints: [config.openai.apiKey]
      })
    );
  } else {
    results.push(skippedFixtureResult("ocr", config.openai.llmModel, "GIDEON_PROVIDER_CANARY_IMAGE_PATH"));
  }

  results.push(
    await executeCanary({
      capability: "tts",
      model: config.openai.ttsModel,
      now,
      run: async () => {
        const outputPath =
          normalizeOptionalPath(env.GIDEON_PROVIDER_CANARY_TTS_OUTPUT_PATH) ??
          path.join(os.tmpdir(), `gideon-provider-canary-${Date.now()}.wav`);
        const result = await adapter.synthesizeSpeech({
          text: "Gideon turns a product walkthrough into short-form video drafts.",
          instructions: "Speak clearly and naturally for a concise product demo.",
          outputPath
        });
        if (!result.outputPath) {
          throw new Error("TTS canary returned no output path.");
        }
        return "TTS canary passed with a generated speech artifact.";
      },
      redactionHints: [config.openai.apiKey]
    })
  );

  return results;
}

function missingKeyResult(capability: ProviderCanaryCapability, model: string): ProviderCanaryResult {
  return {
    capability,
    provider: "openai",
    status: "failed",
    model,
    message: "OpenAI API key is required for live provider canary mode.",
    durationMs: 0
  };
}

function skippedFixtureResult(
  capability: ProviderCanaryCapability,
  model: string,
  envName: string
): ProviderCanaryResult {
  return {
    capability,
    provider: "openai",
    status: "skipped",
    model,
    message: `Live ${capability} canary skipped because ${envName} was not set.`,
    durationMs: 0
  };
}

async function executeCanary(input: {
  capability: ProviderCanaryCapability;
  model: string;
  now: () => Date;
  run: () => Promise<string>;
  redactionHints: Array<string | null | undefined>;
}): Promise<ProviderCanaryResult> {
  const started = input.now().getTime();
  try {
    const message = await input.run();
    return {
      capability: input.capability,
      provider: "openai",
      status: "passed",
      model: input.model,
      message,
      durationMs: Math.max(0, input.now().getTime() - started)
    };
  } catch (error) {
    return {
      capability: input.capability,
      provider: "openai",
      status: "failed",
      model: input.model,
      message: redactSecrets(error instanceof Error ? error.message : "Provider canary failed.", input.redactionHints),
      durationMs: Math.max(0, input.now().getTime() - started)
    };
  }
}

async function assertReadable(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Configured ${label} was not readable.`);
  }
}

export function redactSecrets(message: string, hints: Array<string | null | undefined> = []): string {
  let redacted = message.replace(/sk-[A-Za-z0-9_-]{4,}/g, "[redacted]");
  for (const hint of hints) {
    if (hint) {
      redacted = redacted.split(hint).join("[redacted]");
    }
  }
  return redacted;
}

function normalizeOptionalPath(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildCanaryAnalysisInput(): WalkthroughAnalysisInput {
  const profile: ProductProfile = {
    productName: "Gideon Canary",
    targetCustomer: "B2B SaaS founders",
    productDescription: "Turns product walkthrough recordings into short-form video drafts.",
    preferredTone: "direct",
    toneGuidance: "Use clear, non-hype product language.",
    platforms: ["linkedin", "youtube_shorts"],
    walkthroughNotes: "Show upload, moment review, script approval, and render export."
  };

  return {
    profile,
    recording: canaryRecording,
    transcript: {
      id: "canary-transcript",
      status: "completed",
      provider: "local",
      model: "canary-fixture",
      text: "Upload a walkthrough, review the detected product moments, approve a script, and export a vertical draft.",
      segments: [
        {
          id: "segment-1",
          startMs: 0,
          endMs: 3500,
          text: "Upload a walkthrough, review moments, approve a script, and export a vertical draft.",
          confidence: 0.95
        }
      ],
      createdAt: "2026-06-29T00:00:00.000Z"
    },
    moments: [
      {
        id: "moment-1",
        label: "Review detected moments",
        startMs: 500,
        endMs: 3500,
        evidence: "Transcript mentions reviewing moments and visible UI shows a moment review queue.",
        confidence: 0.82,
        enabled: true
      }
    ],
    frameEvidence: [
      {
        id: "frame-1",
        momentId: "moment-1",
        timestampMs: 1800,
        ocrText: "Detected moments",
        ocrProvider: "local",
        confidence: 0.88,
        createdAt: "2026-06-29T00:00:00.000Z"
      }
    ]
  };
}

const canaryRecording: RecordingMetadata = {
  filePath: "/tmp/gideon-provider-canary.mp4",
  fileUrl: "file:///tmp/gideon-provider-canary.mp4",
  fileName: "gideon-provider-canary.mp4",
  sizeBytes: 1024,
  durationMs: 5000,
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  validatedAt: "2026-06-29T00:00:00.000Z"
};
