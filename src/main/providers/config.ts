export interface OpenAiProviderConfig {
  apiKey: string | null;
  baseUrl: string;
  llmModel: string;
  analysisPromptVersion?: string;
  analysisPromptReviewedAt?: string;
  analysisPromptRolloutStage?: "canary" | "staging" | "production";
  analysisModelRolloutPercent?: number;
  analysisModelCanaryPercent?: number;
  ocrPromptVersion?: string;
  transcriptionModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsPromptVersion?: string;
}

export interface ProviderConfig {
  openai: OpenAiProviderConfig;
}

export function loadProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  return {
    openai: {
      apiKey: env.GIDEON_OPENAI_API_KEY ?? env.OPENAI_API_KEY ?? null,
      baseUrl: trimTrailingSlash(env.GIDEON_OPENAI_BASE_URL ?? "https://api.openai.com/v1"),
      llmModel: env.GIDEON_OPENAI_LLM_MODEL ?? "gpt-5.1",
      analysisPromptVersion: env.GIDEON_ANALYSIS_PROMPT_VERSION ?? "analysis-v1",
      analysisPromptReviewedAt: normalizeOptional(env.GIDEON_ANALYSIS_PROMPT_REVIEWED_AT),
      analysisPromptRolloutStage: parsePromptRolloutStage(env.GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE),
      analysisModelRolloutPercent: parseOptionalInteger(env.GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT),
      analysisModelCanaryPercent: parseOptionalInteger(env.GIDEON_ANALYSIS_MODEL_CANARY_PERCENT),
      ocrPromptVersion: env.GIDEON_OCR_PROMPT_VERSION ?? "ocr-v1",
      transcriptionModel: env.GIDEON_OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
      ttsModel: env.GIDEON_OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      ttsVoice: env.GIDEON_OPENAI_TTS_VOICE ?? "coral",
      ttsPromptVersion: env.GIDEON_TTS_PROMPT_VERSION ?? "tts-v1"
    }
  };
}

export function isOpenAiConfigured(config: ProviderConfig = loadProviderConfig()): boolean {
  return Boolean(config.openai.apiKey);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parsePromptRolloutStage(value: string | undefined): OpenAiProviderConfig["analysisPromptRolloutStage"] {
  const normalized = normalizeOptional(value);
  if (normalized === "canary" || normalized === "staging" || normalized === "production") {
    return normalized;
  }
  return undefined;
}
