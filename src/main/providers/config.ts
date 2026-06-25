export interface OpenAiProviderConfig {
  apiKey: string | null;
  baseUrl: string;
  llmModel: string;
  transcriptionModel: string;
  ttsModel: string;
  ttsVoice: string;
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
      transcriptionModel: env.GIDEON_OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
      ttsModel: env.GIDEON_OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      ttsVoice: env.GIDEON_OPENAI_TTS_VOICE ?? "coral"
    }
  };
}

export function isOpenAiConfigured(config: ProviderConfig = loadProviderConfig()): boolean {
  return Boolean(config.openai.apiKey);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

