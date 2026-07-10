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

export type BillingProvider = "manual" | "stripe";

export type IdentityProvider = "local" | "email" | "google" | "github" | "oidc";

export type AuditActorType = "local_user" | "mcp_agent" | "system";

export type AuditAction =
  | "workspace.create"
  | "workspace.switch"
  | "workspace.member.add"
  | "workspace.member.update_role"
  | "workspace.member.remove"
  | "auth.user.sync"
  | "project.create"
  | "project.update_profile"
  | "project.delete"
  | "recording.attach"
  | "recording.upload_session.create"
  | "recording.upload_session.complete"
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
  | "usage.record"
  | "billing.plan.update"
  | "billing.webhook.apply";

export type AuditTargetType =
  | "workspace"
  | "member"
  | "user"
  | "project"
  | "recording"
  | "artifact"
  | "job"
  | "moment"
  | "concept"
  | "script"
  | "render"
  | "usage"
  | "billing";

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
  | "avatar_presenter"
  | "render"
  | "export";

export type ArtifactProvider = "local_private" | "s3" | "r2" | "gcs";

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  authSubject?: string;
  identityProvider?: IdentityProvider;
  lastSignedInAt?: string;
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
  billingProvider?: BillingProvider;
  billingCustomerId?: string;
  billingSubscriptionId?: string;
  billingCurrentPeriodEnd?: string;
  billingCancelAtPeriodEnd?: boolean;
  billingLastEventId?: string;
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
  updatedAt?: string;
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
  avatarModelReceipt?: AvatarModelReceipt;
  createdAt: string;
}

export type RecordingUploadSessionStatus = "pending" | "completed" | "expired" | "aborted";

export interface RecordingUploadSessionRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  artifactId: string;
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  storageKey: string;
  status: RecordingUploadSessionStatus;
  method: "PUT";
  contentType: string;
  byteSize: number;
  originalFileName: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
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
  workerId?: string;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
  renderScope?: {
    scriptIds?: string[];
    voiceoverMode?: "regenerate" | "reuse";
  };
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
  | "educational"
  | "bold";

export type CreatorTemplateKey =
  | "hidden_feature_reveal"
  | "saves_you_time"
  | "problem_demo_payoff"
  | "founder_demo"
  | "three_reasons"
  | "before_after_workflow"
  | "brand_presenter";

export type CaptionStylePreset = "kinetic_bold" | "clean_founder" | "educational_stack";

export type CtaStylePreset = "soft_try" | "direct_signup" | "learn_more";

export type MusicMood = "none" | "clean_tech" | "upbeat";

export interface BrandKit {
  id?: string;
  productName: string;
  logoPath?: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  captionStyle: CaptionStylePreset;
  ctaStyle: CtaStylePreset;
  tagline?: string;
}

export interface ProductProfile {
  productName: string;
  targetCustomer: string;
  productDescription: string;
  preferredTone: TonePreset;
  toneGuidance: string;
  platforms: Platform[];
  walkthroughNotes: string;
  defaultTemplateKey?: CreatorTemplateKey;
  brandPresenterEnabled?: boolean;
  avatarPresenterId?: FictionalAvatarPresenterId;
  brandPresenterPosition?: BrandPresenterLayer["position"];
  brandPresenterMotion?: BrandPresenterLayer["motion"];
  soundDesignEnabled?: boolean;
  musicMood?: MusicMood;
  brandKit?: BrandKit;
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
  uiElements?: FrameUiElement[];
  ocrProvider?: "openai" | "local" | "none";
  confidence?: number;
  changeScore?: number;
  proofScore?: number;
  visualRole?: "before" | "action" | "proof" | "payoff";
  beforeAfterPairId?: string;
  focus?: RenderFocusPoint;
  interactionHints?: InteractionHint[];
  createdAt: string;
}

export type FrameUiElementKind = "heading" | "button" | "input" | "navigation" | "status" | "table" | "copy" | "other";

export interface FrameUiElement {
  id: string;
  kind: FrameUiElementKind;
  text: string;
  role?: string;
  confidence?: number;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface InteractionHint {
  kind: "click_target" | "cursor_candidate";
  x: number;
  y: number;
  confidence: number;
  label?: string;
}

export interface ProviderRun {
  id: string;
  kind: "analysis" | "transcription" | "ocr" | "tts";
  provider: "openai" | "local" | "none";
  model?: string;
  promptVersion?: string;
  promptReviewedAt?: string;
  promptRolloutStage?: "canary" | "staging" | "production";
  promptRolloutPercent?: number;
  promptCanaryPercent?: number;
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
  sourceEvidenceIds?: string[];
  confidence: number;
  enabled: boolean;
  proofScore?: number;
  visualRole?: "before" | "action" | "proof" | "payoff";
  beforeAfterPairId?: string;
  focus?: RenderFocusPoint;
  interactionHint?: InteractionHint;
  thumbnailPath?: string;
  thumbnailUrl?: string;
}

export interface ContentConcept {
  id: string;
  title: string;
  formatFamily: string;
  templateKey?: CreatorTemplateKey;
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
  words?: Array<{
    startMs: number;
    endMs: number;
    text: string;
  }>;
}

export interface RenderFocusPoint {
  x: number;
  y: number;
  scale: number;
}

export interface VisualBeat {
  startMs: number;
  endMs: number;
  momentId: string;
  sourceStartMs?: number;
  sourceEndMs?: number;
  instruction: string;
  purpose?: "hook" | "problem" | "demo" | "proof" | "payoff" | "cta";
  callout?: string;
  focus?: RenderFocusPoint;
  transitionIn?: {
    enabled: boolean;
    kind?: RenderTransitionCue["kind"];
  };
  cursorEmphasis?: {
    enabled: boolean;
    kind?: InteractionHint["kind"];
    label?: string;
  };
  evidenceIds?: string[];
}

export interface RenderSourceSegment {
  momentId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  fit: "contain" | "cover";
  focus: RenderFocusPoint;
}

export interface RenderZoomCue {
  startMs: number;
  endMs: number;
  fromScale: number;
  toScale: number;
  focus: RenderFocusPoint;
  easing: "standard" | "snap" | "spring";
}

export interface RenderTransitionCue {
  id: string;
  kind: "snap_cut" | "match_cut" | "wipe";
  startMs: number;
  endMs: number;
  emphasis: "primary" | "accent";
}

export interface RenderOverlayCue {
  id: string;
  kind: "hook" | "proof_label" | "callout" | "cta" | "brand_badge";
  startMs: number;
  endMs: number;
  text: string;
  position: "top" | "center" | "bottom" | "left" | "right";
  emphasis: "primary" | "secondary" | "accent";
}

export interface RenderCalloutCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  anchor: RenderFocusPoint;
  arrow: {
    enabled: boolean;
    direction: "auto" | "left" | "right" | "up" | "down";
  };
  evidenceIds?: string[];
}

export interface RenderCursorCue {
  id: string;
  kind: InteractionHint["kind"];
  startMs: number;
  endMs: number;
  anchor: RenderFocusPoint;
  label?: string;
  confidence: number;
}

export interface RenderSfxCue {
  id: string;
  kind: "click" | "pop" | "whoosh";
  startMs: number;
  gainDb: number;
}

export interface BrandPresenterLayer {
  enabled: boolean;
  style: "logo_head" | "fictional_illustrated" | "fictional_3d";
  avatarId: FictionalAvatarPresenterId;
  provenance: "brand_logo" | "gideon_fictional_catalog";
  disclosure: "AI-generated brand presenter";
  startMs: number;
  endMs: number;
  position: "lower_left" | "lower_right";
  logoPath?: string;
  logoUrl?: string;
  motion: "idle_bob" | "caption_sync";
}

export type FictionalAvatarPresenterId = "logo_head" | "orbit" | "nova";

export interface FictionalAvatarPresenter {
  id: FictionalAvatarPresenterId;
  displayName: string;
  style: BrandPresenterLayer["style"];
  provenance: BrandPresenterLayer["provenance"];
  commercialApproved: boolean;
  allowsVoiceCloning: false;
  allowsRealLikeness: false;
  disclosure: BrandPresenterLayer["disclosure"];
  supportedMotions: Array<BrandPresenterLayer["motion"]>;
}

export interface AvatarModelReceipt {
  provider: "sadtalker" | "musetalk" | "talkinghead";
  modelVersion: string;
  modelLicense: string;
  avatarId: FictionalAvatarPresenterId;
  avatarProvenance: BrandPresenterLayer["provenance"];
  disclosure: BrandPresenterLayer["disclosure"];
  generatedAt: string;
}

export interface EditDecisionList {
  schemaVersion: "2";
  templateId: string;
  templateKey: CreatorTemplateKey;
  templateVersion: number;
  brandKitId: string;
  durationMs: number;
  canvas: {
    width: 1080;
    height: 1920;
    fps: 30;
  };
  brandKit: BrandKit;
  sourceSegments: RenderSourceSegment[];
  zooms: RenderZoomCue[];
  transitions: RenderTransitionCue[];
  captions: CaptionSegment[];
  overlays: RenderOverlayCue[];
  callouts: RenderCalloutCue[];
  cursorCues: RenderCursorCue[];
  sfx: RenderSfxCue[];
  presenter: BrandPresenterLayer;
  music: {
    enabled: boolean;
    mood: MusicMood;
    gainDb: number;
  };
  qualityGates: {
    requireEvidenceBackedClaims: boolean;
    requireCaptionSafeArea: boolean;
    requireAudioAlignment: boolean;
  };
}

export interface EvidenceClaim {
  text: string;
  sourceEvidenceIds: string[];
  momentIds: string[];
}

export interface ScriptQualityWarning {
  code: "unsupported_claim" | "generic_phrase" | "long_line" | "missing_evidence" | "caption_overflow_risk";
  message: string;
 }

export interface ScriptDraft {
  id: string;
  conceptId: string;
  templateKey?: CreatorTemplateKey;
  hook: string;
  voiceoverText: string;
  captions: CaptionSegment[];
  cta: string;
  visualBeats: VisualBeat[];
  editDecisionList?: EditDecisionList;
  evidenceClaims?: EvidenceClaim[];
  qualityWarnings?: ScriptQualityWarning[];
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
  frameQa?: {
    sampledFrames: number;
    informativeFrames: number;
    averageLuma: number;
    minLuma: number;
    maxLuma: number;
    minLumaStandardDeviation: number;
  };
}

export interface RenderedVideo {
  id: string;
  scriptId: string;
  title: string;
  status: "queued" | "rendering" | "completed" | "failed";
  outputPath?: string;
  outputUrl?: string;
  artifactId?: string;
  storageKey?: string;
  sha256?: string;
  sizeBytes?: number;
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
  uploadSessions: RecordingUploadSessionRecord[];
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
  queue: QueueRuntimeStats;
}

export interface QueueRuntimeStats {
  active: number;
  pending: number;
  concurrency: number;
  activeByKind: Partial<Record<JobKind, number>>;
  pendingByKind: Partial<Record<JobKind, number>>;
  concurrencyByKind: Partial<Record<JobKind, number>>;
}

export interface CreateProjectInput {
  name: string;
  profile: ProductProfile;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
}

export interface AddWorkspaceMemberInput {
  workspaceId: string;
  email: string;
  displayName?: string;
  role: WorkspaceRole;
}

export interface UpdateWorkspaceMemberRoleInput {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface RemoveWorkspaceMemberInput {
  workspaceId: string;
  userId: string;
}

export interface UpdateWorkspaceBillingPlanInput {
  workspaceId: string;
  plan: WorkspacePlan;
  billingStatus?: BillingStatus;
}

export interface ApplyBillingSubscriptionInput {
  workspaceId: string;
  provider: BillingProvider;
  providerEventId: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  plan: WorkspacePlan;
  billingStatus: BillingStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  appliedAt?: string;
}

export interface SyncAuthenticatedUserInput {
  authSubject: string;
  email: string;
  displayName?: string;
  identityProvider?: IdentityProvider;
  defaultWorkspaceName?: string;
  now?: string;
}

export interface CreateRecordingUploadSessionInput {
  projectId: string;
  fileName: string;
  byteSize: number;
  contentType?: string;
}

export interface CompleteRecordingUploadSessionInput {
  projectId: string;
  sessionId: string;
}

export interface RecordingUploadSession {
  id: string;
  recordingId: string;
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  contentType: string;
  originalFileName: string;
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
  educational: "Educational",
  bold: "Bold"
};
