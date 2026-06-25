export type Platform =
  | "tiktok"
  | "instagram_reels"
  | "youtube_shorts"
  | "linkedin"
  | "other";

export type ProjectStatus =
  | "draft"
  | "recording_ready"
  | "analyzed"
  | "concept_review"
  | "script_review"
  | "rendering"
  | "ready"
  | "failed";

export type TonePreset =
  | "direct"
  | "founder"
  | "casual"
  | "professional"
  | "educational";

export interface ProductProfile {
  productName: string;
  targetCustomer: string;
  productDescription: string;
  preferredTone: TonePreset;
  toneGuidance: string;
  platforms: Platform[];
  walkthroughNotes: string;
}

export interface RecordingMetadata {
  filePath: string;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  validatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  speaker?: string;
}

export interface TranscriptArtifact {
  id: string;
  status: "completed" | "skipped" | "failed";
  provider: "openai" | "local" | "none";
  model?: string;
  text: string;
  segments: TranscriptSegment[];
  createdAt: string;
  error?: string;
}

export interface ProviderRun {
  id: string;
  kind: "analysis" | "transcription" | "tts";
  provider: "openai" | "local" | "none";
  model?: string;
  status: "completed" | "skipped" | "failed";
  startedAt: string;
  finishedAt: string;
  error?: string;
}

export interface DetectedMoment {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  evidence: string;
  confidence: number;
  enabled: boolean;
  thumbnailPath?: string;
  thumbnailUrl?: string;
}

export interface ContentConcept {
  id: string;
  title: string;
  formatFamily: string;
  targetPain: string;
  hookDirection: string;
  proofMomentIds: string[];
  platformFit: Platform[];
  estimatedDurationSec: number;
  rationale: string;
  selected: boolean;
  brief: string;
}

export interface CaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface VisualBeat {
  startMs: number;
  endMs: number;
  momentId: string;
  instruction: string;
}

export interface ScriptDraft {
  id: string;
  conceptId: string;
  hook: string;
  voiceoverText: string;
  captions: CaptionSegment[];
  cta: string;
  visualBeats: VisualBeat[];
  approved: boolean;
  updatedAt: string;
}

export interface RenderValidation {
  width: number;
  height: number;
  durationMs: number;
  videoCodec: string;
  audioCodec: string | null;
  fastStart: boolean;
}

export interface RenderedVideo {
  id: string;
  scriptId: string;
  title: string;
  status: "queued" | "rendering" | "completed" | "failed";
  outputPath?: string;
  outputUrl?: string;
  error?: string;
  validation?: RenderValidation;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  profile: ProductProfile;
  recording?: RecordingMetadata;
  transcript?: TranscriptArtifact;
  analysisSummary?: string;
  moments: DetectedMoment[];
  concepts: ContentConcept[];
  scripts: ScriptDraft[];
  renders: RenderedVideo[];
  providerRuns: ProviderRun[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
}

export interface PlatformInfo {
  appVersion: string;
  userDataPath: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  sayAvailable: boolean;
  openAiConfigured: boolean;
  openAiLlmModel: string | null;
  openAiTranscriptionModel: string | null;
  openAiTtsModel: string | null;
}

export interface CreateProjectInput {
  name: string;
  profile: ProductProfile;
}

export const platformLabels: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
  linkedin: "LinkedIn",
  other: "Other"
};

export const toneLabels: Record<TonePreset, string> = {
  direct: "Direct",
  founder: "Founder-native",
  casual: "Casual",
  professional: "Professional",
  educational: "Educational"
};
