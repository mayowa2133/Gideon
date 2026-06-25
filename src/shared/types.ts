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

export type JobKind = "analysis" | "transcription" | "semantic_analysis" | "ocr" | "tts" | "render" | "export";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceling" | "canceled";

export type JobEventKind =
  | "queued"
  | "started"
  | "stage"
  | "progress"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "canceled"
  | "retried";

export type JobStage =
  | "queued"
  | "quota"
  | "frame_extraction"
  | "transcription"
  | "ocr"
  | "semantic_analysis"
  | "tts"
  | "render"
  | "usage"
  | "finalize"
  | "cancel";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type WorkspacePlan = "local_mvp" | "starter" | "team" | "enterprise";

export type BillingStatus = "not_configured" | "trialing" | "active" | "past_due" | "canceled";

export type AuditActorType = "local_user" | "mcp_agent" | "system";

export type AuditAction =
  | "project.create"
  | "project.update_profile"
  | "project.delete"
  | "recording.attach"
  | "analysis.complete"
  | "moments.update"
  | "concepts.generate"
  | "concepts.update"
  | "scripts.generate"
  | "scripts.update"
  | "render.complete"
  | "artifact.create"
  | "job.create"
  | "job.cancel"
  | "job.retry"
  | "usage.record";

export type AuditTargetType = "workspace" | "project" | "recording" | "artifact" | "job" | "moment" | "concept" | "script" | "render" | "usage";

export type AuditMetadataValue = string | number | boolean | null;

export interface AuditEvent {
  id: string;
  workspaceId: string;
  projectId?: string;
  actorUserId: string;
  actorType: AuditActorType;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  summary: string;
  metadata?: Record<string, AuditMetadataValue>;
  createdAt: string;
}

export type UsageMetric =
  | "source_minutes"
  | "transcription_minutes"
  | "llm_runs"
  | "tts_characters"
  | "render_minutes"
  | "storage_bytes"
  | "exports";

export type ArtifactKind =
  | "source_recording"
  | "extracted_audio"
  | "frame"
  | "voiceover"
  | "render"
  | "export";

export type ArtifactProvider = "local_private" | "s3" | "r2" | "gcs";

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface WorkspaceEntitlements {
  sourceMinutesMonthly: number;
  transcriptionMinutesMonthly: number;
  llmRunsMonthly: number;
  ttsCharactersMonthly: number;
  renderMinutesMonthly: number;
  storageBytes: number;
  exportsMonthly: number;
  maxProjects: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  billingStatus: BillingStatus;
  entitlements: WorkspaceEntitlements;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface UsageEvent {
  id: string;
  workspaceId: string;
  projectId?: string;
  metric: UsageMetric;
  quantity: number;
  unit: "minute" | "count" | "character" | "byte";
  source: "recording" | "transcription" | "analysis" | "ocr" | "tts" | "render" | "export";
  idempotencyKey: string;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: ArtifactKind;
  provider: ArtifactProvider;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFileName: string;
  localPath?: string;
  localUrl?: string;
  createdAt: string;
}

export interface JobRecord {
  id: string;
  projectId: string;
  kind: JobKind;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  progress: {
    current: number;
    total: number;
    unit: string;
  };
  userMessage: string;
  cancelable: boolean;
  retryable: boolean;
  safeError?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobEvent {
  id: string;
  projectId: string;
  jobId: string;
  kind: JobEventKind;
  stage: JobStage;
  message: string;
  progress?: {
    current: number;
    total: number;
    unit: string;
  };
  metadata?: Record<string, AuditMetadataValue>;
  createdAt: string;
}

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
  originalFilePath?: string;
  artifactId?: string;
  storageKey?: string;
  sha256?: string;
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

export interface FrameEvidence {
  id: string;
  momentId: string;
  timestampMs: number;
  imagePath?: string;
  imageUrl?: string;
  ocrText?: string;
  ocrProvider?: "openai" | "local" | "none";
  confidence?: number;
  createdAt: string;
}

export interface ProviderRun {
  id: string;
  kind: "analysis" | "transcription" | "ocr" | "tts";
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
  workspaceId: string;
  name: string;
  status: ProjectStatus;
  profile: ProductProfile;
  recording?: RecordingMetadata;
  transcript?: TranscriptArtifact;
  analysisSummary?: string;
  frameEvidence: FrameEvidence[];
  moments: DetectedMoment[];
  concepts: ContentConcept[];
  scripts: ScriptDraft[];
  renders: RenderedVideo[];
  artifacts: ArtifactRecord[];
  providerRuns: ProviderRun[];
  jobs: JobRecord[];
  jobEvents: JobEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  users: UserAccount[];
  workspaces: Workspace[];
  workspaceMembers: WorkspaceMember[];
  usageEvents: UsageEvent[];
  auditEvents: AuditEvent[];
  activeUserId: string | null;
  activeWorkspaceId: string | null;
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
  storageProvider: string;
  cloudStorageConfigured: boolean;
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
