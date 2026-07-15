import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  assertCsrfToken,
  createSessionCookie,
  createSignedSession,
  readSessionTokenFromCookieHeader,
  verifySignedSession,
  type AuthConfig,
  type SessionClaims
} from "./auth";
import {
  createStripeBillingService,
  loadBillingConfig,
  normalizeStripeSubscriptionEvent,
  verifyStripeWebhookSignature,
  type BillingConfig
} from "./billing";
import {
  BullMqHostedWorkerJobBroker,
  createBrokeredHostedJobQueueService,
  createHttpHostedJobQueueService,
  InMemoryHostedWorkerJobBroker,
  loadHostedJobQueueConfig,
  redisConnectionFromUrl,
  type HostedJobQueueConfig,
  type HostedWorkerJobBroker
} from "./jobQueue";
import type { CaptureApplicationService } from "./captureService";
import type { CaptureRunCoordinator } from "./captureRunCoordinator";
import type { CaptureRunControlService } from "./captureRunService";
import { createInMemoryCaptureRateLimiter, type CaptureRateLimiter } from "./captureRateLimit";
import type { CaptureCoverageService } from "./captureCoverageService";
import type { CaptureExecutionRetryService } from "./captureExecutionRetry";
import type { EnvironmentValidationCoordinator } from "./environmentValidationCoordinator";
import type { DiscoveryRunCoordinator } from "./discoveryRunCoordinator";
import type { DiscoveryRunControlService } from "./discoveryRunControl";
import type { CaptureAuditSink } from "./captureAudit";
import type { CaptureAssemblyCoordinator } from "./captureAssemblyCoordinator";
import type { CapturePreviewService } from "./capturePreviewService";
import type { CaptureCredentialVault, CaptureCredentialSecret } from "./captureCredentials";
import type { CaptureEnvironment, CaptureEnvironmentType } from "../shared/productFlowCapture";
import type {
  AppState,
  ApplyBillingSubscriptionInput,
  AuditAction,
  AuditMetadataValue,
  AuditTargetType,
  ArtifactRecord,
  ArtifactProvider,
  CreateProjectInput,
  IdentityProvider,
  JobRecord,
  ProductProfile,
  Project,
  RecordingMetadata,
  RecordingUploadSessionRecord,
  RenderedVideo,
  SyncAuthenticatedUserInput,
  Workspace,
  WorkspacePlan
} from "../shared/types";

type HostedApiHeaderValue = string | string[] | undefined;

export interface HostedApiRequest {
  method: string;
  path: string;
  headers?: Record<string, HostedApiHeaderValue>;
  body?: unknown;
  rawBody?: string | Buffer;
  nowMs?: number;
}

export interface HostedApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HostedApiConfig {
  auth: AuthConfig;
  billing: BillingConfig;
  jobQueue: HostedJobQueueConfig;
  internalAuthCallbackSecret: string | null;
}

export type HostedApiMetricEvent =
  | {
      name: "hosted_mcp_context_served";
      workspaceId: string;
      projectId: string;
      scripts: number;
      moments: number;
      frameEvidence: number;
      auditEvents: number;
    }
  | {
      name: "hosted_review_edit_succeeded";
      workspaceId: string;
      projectId: string;
      resourceKind: "script" | "moment";
      changedFields: string[];
    }
  | {
      name: "hosted_review_edit_failed";
      workspaceId: string;
      projectId: string;
      resourceKind: "script" | "moment";
      status: number;
      code: string;
    };

export interface HostedApiStore {
  load(): Promise<AppState>;
  syncAuthenticatedUser(input: SyncAuthenticatedUserInput): Promise<AppState>;
  applyBillingSubscriptionUpdate(input: ApplyBillingSubscriptionInput): Promise<AppState>;
  listProjectsForSession(input: { userId: string; workspaceId: string }): Promise<Project[]>;
  getProjectForSession(input: { userId: string; workspaceId: string; projectId: string }): Promise<Project>;
  createProjectForSession(input: CreateProjectInput & { userId: string; workspaceId: string }): Promise<Project>;
  updateProfileForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    profile: ProductProfile;
  }): Promise<Project>;
  updateScriptForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    scriptId: string;
    expectedRevision?: string;
    hook?: string;
    voiceoverText?: string;
    cta?: string;
  }): Promise<Project>;
  updateMomentForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    momentId: string;
    expectedRevision?: string;
    label?: string;
    evidence?: string;
    enabled?: boolean;
  }): Promise<Project>;
  getJobForSession(input: { userId: string; workspaceId: string; jobId: string }): Promise<{ project: Project; job: JobRecord }>;
  requestJobCancelForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }>;
  retryJobForSession(input: {
    userId: string;
    workspaceId: string;
    jobId: string;
  }): Promise<{ project: Project; job: JobRecord }>;
  getWorkspaceForBillingSession(input: {
    userId: string;
    workspaceId: string;
  }): Promise<Workspace>;
  createRecordingUploadSessionRecordForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    session: Omit<RecordingUploadSessionRecord, "createdAt" | "updatedAt">;
  }): Promise<Project>;
  getRecordingUploadSessionForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
  }): Promise<RecordingUploadSessionRecord>;
  completeRecordingUploadForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    sessionId: string;
    artifact: ArtifactRecord;
    recording: RecordingMetadata;
  }): Promise<Project>;
  createAnalysisJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }>;
  createRenderJobForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
  }): Promise<{ project: Project; job: JobRecord; reused: boolean }>;
  createExportForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    renderId: string;
    artifact: ArtifactRecord;
  }): Promise<Project>;
  getExportArtifactForSession(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    exportId: string;
  }): Promise<ArtifactRecord>;
}

export interface HostedRecordingUploadSession {
  id: string;
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  contentType: string;
  originalFileName: string;
}

export interface HostedRecordingUploadService {
  createRecordingUploadSession(input: {
    workspaceId: string;
    projectId: string;
    fileName: string;
    byteSize: number;
    contentType?: string;
  }): Promise<HostedRecordingUploadSession>;
  completeRecordingUploadSession(input: {
    session: RecordingUploadSessionRecord;
    checksumSha256?: string;
  }): Promise<{ artifact: ArtifactRecord; recording: RecordingMetadata }>;
}

export interface HostedJobQueueService {
  enqueueAnalysisJob(input: { projectId: string; jobId: string }): Promise<void> | void;
  enqueueRenderJob(input: { projectId: string; jobId: string }): Promise<void> | void;
}

export interface HostedBillingSession {
  id: string;
  url: string;
  provider: Exclude<BillingConfig["provider"], "none">;
  expiresAt?: string;
}

export interface HostedBillingService {
  createCheckoutSession(input: {
    userId: string;
    workspace: Workspace;
    plan: Exclude<WorkspacePlan, "local_mvp">;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<HostedBillingSession>;
  createCustomerPortalSession(input: {
    userId: string;
    workspace: Workspace;
    returnUrl: string;
  }): Promise<HostedBillingSession>;
}

export interface HostedExportService {
  createExport(input: { project: Project; render: RenderedVideo }): Promise<{ artifact: ArtifactRecord }>;
  createDownloadUrl(input: {
    project: Project;
    artifact: ArtifactRecord;
  }): Promise<{ downloadUrl: string; expiresAt: string }>;
}

export interface HostedApiDependencies {
  store: HostedApiStore;
  config: HostedApiConfig;
  uploadService?: HostedRecordingUploadService;
  jobQueueService?: HostedJobQueueService;
  jobQueueBroker?: HostedWorkerJobBroker;
  exportService?: HostedExportService;
  billingService?: HostedBillingService;
  captureService?: CaptureApplicationService;
  captureRunCoordinator?: CaptureRunCoordinator;
  captureRunControl?: CaptureRunControlService;
  captureRateLimiter?: CaptureRateLimiter;
  captureCoverageService?: CaptureCoverageService;
  captureExecutionRetryService?: CaptureExecutionRetryService;
  environmentValidationCoordinator?: EnvironmentValidationCoordinator;
  discoveryRunCoordinator?: DiscoveryRunCoordinator;
  discoveryRunControl?: DiscoveryRunControlService;
  captureAuditSink?: CaptureAuditSink;
  captureAssemblyCoordinator?: CaptureAssemblyCoordinator;
  capturePreviewService?: CapturePreviewService;
  captureRuntimeReady?: boolean;
  captureCredentialVault?: CaptureCredentialVault;
  onMetric?: (event: HostedApiMetricEvent) => void;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function loadHostedApiConfig(env: NodeJS.ProcessEnv = process.env): HostedApiConfig {
  return {
    auth: {
      sessionCookieName: env.GIDEON_SESSION_COOKIE_NAME?.trim() || "gideon_session",
      sessionSecret: env.GIDEON_SESSION_SECRET?.trim() || null,
      sessionDurationSeconds: positiveInteger(env.GIDEON_SESSION_DURATION_SECONDS, 60 * 60 * 24 * 14),
      secureCookies: env.GIDEON_SECURE_COOKIES !== "false"
    },
    billing: loadBillingConfig(env),
    jobQueue: loadHostedJobQueueConfig(env),
    internalAuthCallbackSecret: env.GIDEON_AUTH_CALLBACK_SECRET?.trim() || null
  };
}

export function createHostedApiDependencies(input: {
  store: HostedApiStore;
  config?: HostedApiConfig;
  env?: NodeJS.ProcessEnv;
  uploadService?: HostedRecordingUploadService;
  jobQueueService?: HostedJobQueueService;
  jobQueueBroker?: HostedWorkerJobBroker;
  exportService?: HostedExportService;
  billingService?: HostedBillingService;
  captureService?: CaptureApplicationService;
  captureRunCoordinator?: CaptureRunCoordinator;
  captureRunControl?: CaptureRunControlService;
  captureRateLimiter?: CaptureRateLimiter;
  captureCoverageService?: CaptureCoverageService;
  captureExecutionRetryService?: CaptureExecutionRetryService;
  environmentValidationCoordinator?: EnvironmentValidationCoordinator;
  discoveryRunCoordinator?: DiscoveryRunCoordinator;
  discoveryRunControl?: DiscoveryRunControlService;
  captureAuditSink?: CaptureAuditSink;
  captureAssemblyCoordinator?: CaptureAssemblyCoordinator;
  capturePreviewService?: CapturePreviewService;
  captureRuntimeReady?: boolean;
  captureCredentialVault?: CaptureCredentialVault;
  onMetric?: (event: HostedApiMetricEvent) => void;
}): HostedApiDependencies {
  const config = input.config ?? loadHostedApiConfig(input.env);
  const jobQueueBroker = input.jobQueueBroker ?? createHostedJobQueueBroker(config.jobQueue);
  return {
    store: input.store,
    config,
    uploadService: input.uploadService,
    jobQueueService: input.jobQueueService ?? createHostedJobQueueService(config.jobQueue, jobQueueBroker),
    jobQueueBroker,
    exportService: input.exportService,
    billingService: input.billingService ?? createHostedBillingService(config.billing),
    captureService: input.captureService,
    captureRunCoordinator: input.captureRunCoordinator,
    captureRunControl: input.captureRunControl,
    captureRateLimiter: input.captureRateLimiter ?? createInMemoryCaptureRateLimiter(),
    captureCoverageService: input.captureCoverageService,
    captureExecutionRetryService: input.captureExecutionRetryService,
    environmentValidationCoordinator: input.environmentValidationCoordinator,
    discoveryRunCoordinator: input.discoveryRunCoordinator,
    discoveryRunControl: input.discoveryRunControl,
    captureAuditSink: input.captureAuditSink,
    captureAssemblyCoordinator: input.captureAssemblyCoordinator,
    capturePreviewService: input.capturePreviewService,
    captureRuntimeReady: input.captureRuntimeReady,
    captureCredentialVault: input.captureCredentialVault,
    onMetric: input.onMetric
  };
}

export async function handleHostedApiRequest(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies
): Promise<HostedApiResponse> {
  const requestId = requestIdFrom(request);
  try {
    const method = request.method.toUpperCase();
    const path = new URL(request.path, "http://gideon.local").pathname;
    if (method === "GET" && path === "/api/v1/auth/session") {
      return await handleGetSession(request, dependencies, requestId);
    }
    if (method === "POST" && path === "/api/v1/auth/provider-callback") {
      return await handleProviderCallback(request, dependencies, requestId);
    }
    if (method === "POST" && path === "/api/v1/auth/session/logout") {
      return await handleLogout(request, dependencies, requestId);
    }
    if (method === "GET" && path === "/api/v1/projects") {
      return await handleListProjects(request, dependencies, requestId);
    }
    if (method === "GET" && path === "/api/v1/capture-capabilities") {
      requiredSession(request, dependencies);
      const capabilities = captureCapabilities(dependencies);
      return jsonResponse(200, { capture: capabilities }, requestId);
    }
    if (method === "POST" && path === "/api/v1/projects") {
      return await handleCreateProject(request, dependencies, requestId);
    }
    const captureEnvironmentsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-environments$/);
    if (captureEnvironmentsRoute && (method === "GET" || method === "POST")) {
      return await handleCaptureEnvironments(
        request,
        dependencies,
        requestId,
        decodeURIComponent(captureEnvironmentsRoute[1] ?? ""),
        method
      );
    }
    const captureEnvironmentValidateRoute = path.match(
      /^\/api\/v1\/projects\/([^/]+)\/capture-environments\/([^/]+)\/validate$/
    );
    if (method === "POST" && captureEnvironmentValidateRoute) {
      return await handleValidateCaptureEnvironment(
        request,
        dependencies,
        requestId,
        decodeURIComponent(captureEnvironmentValidateRoute[1] ?? ""),
        decodeURIComponent(captureEnvironmentValidateRoute[2] ?? "")
      );
    }
    const captureEnvironmentRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-environments\/([^/]+)$/);
    if (captureEnvironmentRoute && (method === "GET" || method === "PATCH")) {
      return await handleCaptureEnvironment(request, dependencies, requestId, decodeURIComponent(captureEnvironmentRoute[1] ?? ""), decodeURIComponent(captureEnvironmentRoute[2] ?? ""), method);
    }
    const capturePersonasRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-personas$/);
    if (capturePersonasRoute && (method === "GET" || method === "POST")) {
      return await handleCapturePersonas(
        request,
        dependencies,
        requestId,
        decodeURIComponent(capturePersonasRoute[1] ?? ""),
        method
      );
    }
    const captureCredentialGrantsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-credential-grants$/);
    if (method === "POST" && captureCredentialGrantsRoute) {
      return await handleCreateCaptureCredentialGrant(request, dependencies, requestId, decodeURIComponent(captureCredentialGrantsRoute[1] ?? ""));
    }
    const captureCredentialGrantRevokeRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-credential-grants\/([^/]+)\/revoke$/);
    if (method === "POST" && captureCredentialGrantRevokeRoute) {
      return await handleRevokeCaptureCredentialGrant(request, dependencies, requestId, decodeURIComponent(captureCredentialGrantRevokeRoute[1] ?? ""), decodeURIComponent(captureCredentialGrantRevokeRoute[2] ?? ""));
    }
    const capturePersonaRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-personas\/([^/]+)$/);
    if (method === "PATCH" && capturePersonaRoute) {
      return await handleUpdateCapturePersona(request, dependencies, requestId, decodeURIComponent(capturePersonaRoute[1] ?? ""), decodeURIComponent(capturePersonaRoute[2] ?? ""));
    }
    const productFlowsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/product-flows$/);
    if (productFlowsRoute && (method === "GET" || method === "POST")) {
      return await handleProductFlows(
        request,
        dependencies,
        requestId,
        decodeURIComponent(productFlowsRoute[1] ?? ""),
        method
      );
    }
    const discoveryRunsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/discovery-runs$/);
    if (method === "POST" && discoveryRunsRoute) {
      return await handleCreateDiscoveryRun(request, dependencies, requestId, decodeURIComponent(discoveryRunsRoute[1] ?? ""));
    }
    const discoveryRunRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/discovery-runs\/([^/]+)$/);
    if (method === "GET" && discoveryRunRoute) {
      return await handleGetDiscoveryRun(request, dependencies, requestId, decodeURIComponent(discoveryRunRoute[1] ?? ""), decodeURIComponent(discoveryRunRoute[2] ?? ""));
    }
    const discoveryRunCancelRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/discovery-runs\/([^/]+)\/cancel$/);
    if (method === "POST" && discoveryRunCancelRoute) {
      return await handleCancelDiscoveryRun(request, dependencies, requestId, decodeURIComponent(discoveryRunCancelRoute[1] ?? ""), decodeURIComponent(discoveryRunCancelRoute[2] ?? ""));
    }
    const productFlowRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/product-flows\/([^/]+)$/);
    if (productFlowRoute && (method === "GET" || method === "PATCH")) {
      return await handleProductFlow(request, dependencies, requestId, decodeURIComponent(productFlowRoute[1] ?? ""), decodeURIComponent(productFlowRoute[2] ?? ""), method);
    }
    const productFlowApprovalRoute = path.match(
      /^\/api\/v1\/projects\/([^/]+)\/product-flows\/([^/]+)\/(approve|reject)$/
    );
    if (method === "POST" && productFlowApprovalRoute) {
      return await handleProductFlowApproval(
        request,
        dependencies,
        requestId,
        decodeURIComponent(productFlowApprovalRoute[1] ?? ""),
        decodeURIComponent(productFlowApprovalRoute[2] ?? ""),
        productFlowApprovalRoute[3] === "approve" ? "approved" : "rejected"
      );
    }
    const captureRunsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-runs$/);
    if (method === "POST" && captureRunsRoute) {
      return await handleCreateCaptureRun(
        request,
        dependencies,
        requestId,
        decodeURIComponent(captureRunsRoute[1] ?? "")
      );
    }
    const captureRunRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-runs\/([^/]+)$/);
    if (method === "GET" && captureRunRoute) {
      return await handleGetCaptureRun(request, dependencies, requestId, decodeURIComponent(captureRunRoute[1] ?? ""), decodeURIComponent(captureRunRoute[2] ?? ""));
    }
    const captureRunCancelRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-runs\/([^/]+)\/cancel$/);
    if (method === "POST" && captureRunCancelRoute) {
      return await handleCancelCaptureRun(request, dependencies, requestId, decodeURIComponent(captureRunCancelRoute[1] ?? ""), decodeURIComponent(captureRunCancelRoute[2] ?? ""));
    }
    const captureAssemblyRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/capture-runs\/([^/]+)\/assemblies$/);
    if (method === "POST" && captureAssemblyRoute) {
      return await handleCreateCaptureAssembly(request, dependencies, requestId, decodeURIComponent(captureAssemblyRoute[1] ?? ""), decodeURIComponent(captureAssemblyRoute[2] ?? ""));
    }
    const latestCoverageRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/coverage-snapshots\/latest$/);
    if (method === "GET" && latestCoverageRoute) {
      return await handleLatestCaptureCoverage(request, dependencies, requestId, decodeURIComponent(latestCoverageRoute[1] ?? ""));
    }
    const executionRetryRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/flow-executions\/([^/]+)\/retry$/);
    if (method === "POST" && executionRetryRoute) {
      return await handleRetryCaptureExecution(request, dependencies, requestId, decodeURIComponent(executionRetryRoute[1] ?? ""), decodeURIComponent(executionRetryRoute[2] ?? ""));
    }
    const executionPreviewRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/flow-executions\/([^/]+)\/preview-url$/);
    if (method === "POST" && executionPreviewRoute) {
      return await handleCreateCapturePreview(request, dependencies, requestId, decodeURIComponent(executionPreviewRoute[1] ?? ""), decodeURIComponent(executionPreviewRoute[2] ?? ""));
    }
    const projectRoute = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    if (method === "GET" && projectRoute) {
      return await handleGetProject(request, dependencies, requestId, decodeURIComponent(projectRoute[1] ?? ""));
    }
    const projectMcpContextRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/mcp-context$/);
    if (method === "GET" && projectMcpContextRoute) {
      return await handleGetProjectMcpContext(
        request,
        dependencies,
        requestId,
        decodeURIComponent(projectMcpContextRoute[1] ?? "")
      );
    }
    const projectProfileRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/profile$/);
    if (method === "PATCH" && projectProfileRoute) {
      return await handleUpdateProjectProfile(request, dependencies, requestId, decodeURIComponent(projectProfileRoute[1] ?? ""));
    }
    const projectScriptRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/scripts\/([^/]+)$/);
    if (method === "PATCH" && projectScriptRoute) {
      return await handleUpdateProjectScript(
        request,
        dependencies,
        requestId,
        decodeURIComponent(projectScriptRoute[1] ?? ""),
        decodeURIComponent(projectScriptRoute[2] ?? "")
      );
    }
    const projectMomentRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/moments\/([^/]+)$/);
    if (method === "PATCH" && projectMomentRoute) {
      return await handleUpdateProjectMoment(
        request,
        dependencies,
        requestId,
        decodeURIComponent(projectMomentRoute[1] ?? ""),
        decodeURIComponent(projectMomentRoute[2] ?? "")
      );
    }
    const recordingUploadRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/recordings\/uploads$/);
    if (method === "POST" && recordingUploadRoute) {
      return await handleCreateRecordingUploadSession(
        request,
        dependencies,
        requestId,
        decodeURIComponent(recordingUploadRoute[1] ?? "")
      );
    }
    const recordingCompleteRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/recordings\/([^/]+)\/complete$/);
    if (method === "POST" && recordingCompleteRoute) {
      return await handleCompleteRecordingUpload(
        request,
        dependencies,
        requestId,
        decodeURIComponent(recordingCompleteRoute[1] ?? ""),
        decodeURIComponent(recordingCompleteRoute[2] ?? "")
      );
    }
    const analysisRunsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/analysis-runs$/);
    if (method === "POST" && analysisRunsRoute) {
      return await handleCreateAnalysisRun(request, dependencies, requestId, decodeURIComponent(analysisRunsRoute[1] ?? ""));
    }
    const renderJobsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/render-jobs$/);
    if (method === "POST" && renderJobsRoute) {
      return await handleCreateRenderJob(request, dependencies, requestId, decodeURIComponent(renderJobsRoute[1] ?? ""));
    }
    const exportsRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/exports$/);
    if (method === "POST" && exportsRoute) {
      return await handleCreateExport(request, dependencies, requestId, decodeURIComponent(exportsRoute[1] ?? ""));
    }
    const exportDownloadUrlRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/exports\/([^/]+)\/download-url$/);
    if (method === "POST" && exportDownloadUrlRoute) {
      return await handleCreateExportDownloadUrl(
        request,
        dependencies,
        requestId,
        decodeURIComponent(exportDownloadUrlRoute[1] ?? ""),
        decodeURIComponent(exportDownloadUrlRoute[2] ?? "")
      );
    }
    const billingCheckoutRoute = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/billing\/checkout-sessions$/);
    if (method === "POST" && billingCheckoutRoute) {
      return await handleCreateBillingCheckoutSession(
        request,
        dependencies,
        requestId,
        decodeURIComponent(billingCheckoutRoute[1] ?? "")
      );
    }
    const billingPortalRoute = path.match(/^\/api\/v1\/workspaces\/([^/]+)\/billing\/portal-sessions$/);
    if (method === "POST" && billingPortalRoute) {
      return await handleCreateBillingPortalSession(
        request,
        dependencies,
        requestId,
        decodeURIComponent(billingPortalRoute[1] ?? "")
      );
    }
    const jobRoute = path.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (method === "GET" && jobRoute) {
      return await handleGetJob(request, dependencies, requestId, decodeURIComponent(jobRoute[1] ?? ""));
    }
    const jobActionRoute = path.match(/^\/api\/v1\/jobs\/([^/]+)\/(cancel|retry)$/);
    if (method === "POST" && jobActionRoute) {
      const jobId = decodeURIComponent(jobActionRoute[1] ?? "");
      return jobActionRoute[2] === "cancel"
        ? await handleCancelJob(request, dependencies, requestId, jobId)
        : await handleRetryJob(request, dependencies, requestId, jobId);
    }
    if (method === "POST" && path === "/api/v1/webhooks/stripe") {
      return await handleStripeWebhook(request, dependencies, requestId);
    }
    return errorResponse(404, "not_found", "Route not found.", requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResponse(error.status, error.code, error.message, requestId);
    }
    return errorResponse(500, "internal_error", "Unexpected API error.", requestId);
  }
}

export function createHostedApiNodeHandler(dependencies: HostedApiDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const rawBody = await readRawBody(request);
    const result = await handleHostedApiRequest(
      {
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: request.headers,
        rawBody
      },
      dependencies
    );
    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.statusCode = result.status;
    response.end(JSON.stringify(result.body));
  };
}

function createHostedBillingService(config: BillingConfig): HostedBillingService | undefined {
  if (config.provider === "stripe" && config.stripeSecretKey) {
    return createStripeBillingService(config);
  }
  return undefined;
}

function createHostedJobQueueBroker(config: HostedJobQueueConfig): HostedWorkerJobBroker | undefined {
  if (config.provider === "memory") {
    return new InMemoryHostedWorkerJobBroker();
  }
  if (config.provider === "bullmq" && config.redisUrl) {
    return new BullMqHostedWorkerJobBroker({
      connection: redisConnectionFromUrl(config.redisUrl),
      queueName: config.bullMqQueueName,
      prefix: config.bullMqPrefix ?? undefined,
      concurrency: config.bullMqConcurrency,
      defaultJobOptions: config.bullMqDefaultJobOptions
    });
  }
  return undefined;
}

function createHostedJobQueueService(
  config: HostedJobQueueConfig,
  broker?: HostedWorkerJobBroker
): HostedJobQueueService | undefined {
  if (config.provider === "http" && config.httpEndpointUrl && config.signingSecret) {
    return createHttpHostedJobQueueService(config);
  }
  if (config.provider === "memory" && broker) {
    return createBrokeredHostedJobQueueService(broker);
  }
  if (config.provider === "bullmq" && broker) {
    return createBrokeredHostedJobQueueService(broker);
  }
  return undefined;
}

async function handleGetSession(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  const session = await optionalSession(request, dependencies);
  const headers = session.clearCookie
    ? { "Set-Cookie": clearSessionCookie(dependencies.config.auth.sessionCookieName, dependencies.config.auth.secureCookies) }
    : undefined;
  if (!session.claims) {
    return jsonResponse(200, { session: null }, requestId, headers);
  }
  const state = await dependencies.store.load();
  const payload = sessionPayload(state, session.claims);
  if (!payload) {
    return jsonResponse(200, { session: null }, requestId, {
      "Set-Cookie": clearSessionCookie(dependencies.config.auth.sessionCookieName, dependencies.config.auth.secureCookies)
    });
  }
  return jsonResponse(200, payload, requestId, headers);
}

async function handleProviderCallback(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  if (!dependencies.config.internalAuthCallbackSecret) {
    throw new ApiError(503, "auth_callback_not_configured", "Hosted auth callback secret is not configured.");
  }
  if (!dependencies.config.auth.sessionSecret) {
    throw new ApiError(503, "session_not_configured", "Hosted session secret is not configured.");
  }
  const providedSecret = header(request, "x-gideon-auth-callback-secret");
  if (!providedSecret || !safeEqual(providedSecret, dependencies.config.internalAuthCallbackSecret)) {
    throw new ApiError(401, "authentication_required", "Auth callback secret is invalid.");
  }
  const body = objectBody(request);
  const state = await dependencies.store.syncAuthenticatedUser({
    authSubject: requiredString(body.authSubject, "authSubject"),
    email: requiredString(body.email, "email"),
    displayName: optionalString(body.displayName),
    identityProvider: optionalIdentityProvider(body.identityProvider),
    defaultWorkspaceName: optionalString(body.defaultWorkspaceName)
  });
  const user = state.users.find((candidate) => candidate.id === state.activeUserId);
  const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId);
  if (!user?.authSubject || !workspace) {
    throw new ApiError(500, "internal_error", "Authenticated user sync did not produce an active user and workspace.");
  }
  const signed = createSignedSession({
    secret: dependencies.config.auth.sessionSecret,
    userId: user.id,
    authSubject: user.authSubject,
    workspaceId: workspace.id,
    nowMs: request.nowMs,
    durationSeconds: dependencies.config.auth.sessionDurationSeconds
  });
  return jsonResponse(
    201,
    sessionPayload(state, signed.claims),
    requestId,
    {
      "Set-Cookie": createSessionCookie({
        cookieName: dependencies.config.auth.sessionCookieName,
        token: signed.token,
        expiresAt: signed.claims.expiresAt,
        secure: dependencies.config.auth.secureCookies
      })
    }
  );
}

async function handleLogout(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  return jsonResponse(200, { session: null }, requestId, {
    "Set-Cookie": clearSessionCookie(dependencies.config.auth.sessionCookieName, dependencies.config.auth.secureCookies)
  });
}

async function handleStripeWebhook(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  const webhookSecret = dependencies.config.billing.stripeWebhookSecret;
  if (!webhookSecret) {
    throw new ApiError(503, "billing_webhook_not_configured", "Stripe webhook secret is not configured.");
  }
  const rawBody = rawBodyString(request);
  try {
    verifyStripeWebhookSignature({
      payload: rawBody,
      signatureHeader: requiredHeader(request, "stripe-signature"),
      webhookSecret,
      nowMs: request.nowMs
    });
  } catch (error) {
    throw new ApiError(400, "invalid_signature", error instanceof Error ? error.message : "Stripe signature is invalid.");
  }
  const event = parseJson(rawBody);
  const update = normalizeStripeSubscriptionEvent(event, dependencies.config.billing);
  if (!update) {
    return jsonResponse(200, { received: true, applied: false }, requestId);
  }
  await dependencies.store.applyBillingSubscriptionUpdate(update);
  return jsonResponse(200, { received: true, applied: true, workspaceId: update.workspaceId }, requestId);
}

async function handleListProjects(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  const projects = await storeCall(() =>
    dependencies.store.listProjectsForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId
    })
  );
  return jsonResponse(200, { projects: projects.map(projectSummary) }, requestId);
}

async function handleCreateProject(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const input = hostedProjectInput(objectBody(request));
  const project = await storeCall(() =>
    dependencies.store.createProjectForSession({
      ...input,
      userId: claims.userId,
      workspaceId: claims.workspaceId
    })
  );
  return jsonResponse(201, { project: projectSummary(project) }, requestId, {
    Location: `/api/v1/projects/${project.id}`
  });
}

async function handleCaptureEnvironments(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  method: string
): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, method === "POST");
  if (method === "GET") {
    const environments = await captureServiceCall(() =>
      service.listEnvironments({ workspaceId: claims.workspaceId, projectId })
    );
    return jsonResponse(200, { environments: environments.map(captureEnvironmentResource) }, requestId);
  }
  const input = hostedCaptureEnvironmentInput(objectBody(request));
  const environment = await captureServiceCall(() =>
    service.createEnvironment({ ...input, workspaceId: claims.workspaceId, projectId })
  );
  await recordCaptureAudit(dependencies, claims, projectId, "capture_environment.create", "capture_environment", environment.id);
  return jsonResponse(201, { environment: captureEnvironmentResource(environment) }, requestId, {
    Location: `/api/v1/projects/${projectId}/capture-environments/${environment.id}`
  });
}

async function handleValidateCaptureEnvironment(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  environmentId: string
): Promise<HostedApiResponse> {
  const coordinator = dependencies.environmentValidationCoordinator;
  if (!coordinator) throw new ApiError(503, "capture_not_configured", "Asynchronous capture environment validation is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "capture environment validation");
  const idempotencyKey = header(request, "idempotency-key")?.trim();
  if (!idempotencyKey) throw new ApiError(422, "validation_failed", "Idempotency-Key header is required.");
  const result = await captureServiceCall(() => coordinator.create({ workspaceId: claims.workspaceId, projectId, environmentId, idempotencyKey }));
  if (!result.reused) await recordCaptureAudit(dependencies, claims, projectId, "capture_environment.validate", "capture_environment", environmentId, { job_id: result.job.id });
  return jsonResponse(
    result.reused ? 200 : 202,
    {
      environment: captureEnvironmentResource(result.environment),
      job: { ...result.job, workspaceId: claims.workspaceId },
      reused: result.reused
    },
    requestId,
    { Location: `/api/v1/jobs/${result.job.id}` }
  );
}

async function handleCaptureEnvironment(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, environmentId: string, method: string): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, method === "PATCH");
  if (method === "GET") {
    const environment = await captureServiceCall(() => service.getEnvironment({ workspaceId: claims.workspaceId, projectId, environmentId }));
    return jsonResponse(200, { environment: captureEnvironmentResource(environment) }, requestId);
  }
  const input = hostedCaptureEnvironmentInput(objectBody(request));
  const environment = await captureServiceCall(() => service.updateEnvironment({ ...input, workspaceId: claims.workspaceId, projectId, environmentId }));
  await recordCaptureAudit(dependencies, claims, projectId, "capture_environment.update", "capture_environment", environment.id);
  return jsonResponse(200, { environment: captureEnvironmentResource(environment) }, requestId);
}

async function handleCapturePersonas(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  method: string
): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, method === "POST");
  if (method === "GET") {
    const personas = await captureServiceCall(() => service.listPersonas({ workspaceId: claims.workspaceId, projectId }));
    return jsonResponse(200, { personas }, requestId);
  }
  const input = hostedCapturePersonaInput(objectBody(request));
  const persona = await captureServiceCall(() =>
    service.createPersona({ ...input, workspaceId: claims.workspaceId, projectId })
  );
  await recordCaptureAudit(dependencies, claims, projectId, "capture_persona.create", "capture_persona", persona.id);
  return jsonResponse(201, { persona }, requestId);
}

async function handleUpdateCapturePersona(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, personaId: string): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  const input = hostedCapturePersonaInput(body, true);
  const persona = await captureServiceCall(() => service.updatePersona({ ...input, personaId, workspaceId: claims.workspaceId, projectId, status: body.status as "active" | "disabled" | undefined }));
  return jsonResponse(200, { persona }, requestId);
}

async function handleCreateCaptureCredentialGrant(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string): Promise<HostedApiResponse> {
  const vault = dependencies.captureCredentialVault;
  if (!vault) throw new ApiError(503, "capture_not_configured", "Capture credential storage is not configured.");
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  rejectUnknownKeys(body, ["environmentId", "personaId", "kind", "secret", "expiresAt"], "capture credential grant");
  const environmentId = requiredString(body.environmentId, "environmentId");
  const personaId = requiredString(body.personaId, "personaId");
  await captureServiceCall(() => service.getEnvironment({ workspaceId: claims.workspaceId, projectId, environmentId }));
  const personas = await captureServiceCall(() => service.listPersonas({ workspaceId: claims.workspaceId, projectId }));
  if (!personas.some((persona) => persona.id === personaId && persona.environmentId === environmentId)) throw new ApiError(404, "not_found", "Resource not found.");
  const kind = requiredString(body.kind, "kind");
  if (kind !== "username_password" && kind !== "session_bootstrap_token") throw new ApiError(422, "validation_failed", "kind is invalid.");
  const grant = await captureServiceCall(() => vault.create({ workspaceId: claims.workspaceId, projectId, environmentId, personaId, kind, secret: hostedCaptureCredentialSecret(body.secret, kind), expiresAt: requiredString(body.expiresAt, "expiresAt") }));
  await recordCaptureAudit(dependencies, claims, projectId, "capture_credential_grant.create", "capture_credential_grant", grant.id, { environment_id: environmentId, persona_id: personaId, kind });
  return jsonResponse(201, { credentialGrant: grant }, requestId, { Location: `/api/v1/projects/${projectId}/capture-credential-grants/${grant.id}` });
}

async function handleRevokeCaptureCredentialGrant(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, grantId: string): Promise<HostedApiResponse> {
  const vault = dependencies.captureCredentialVault;
  if (!vault) throw new ApiError(503, "capture_not_configured", "Capture credential storage is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  rejectUnknownKeys(body, ["environmentId", "personaId"], "capture credential revocation");
  const grant = await captureServiceCall(() => vault.revoke({ grantId, workspaceId: claims.workspaceId, projectId, environmentId: requiredString(body.environmentId, "environmentId"), personaId: requiredString(body.personaId, "personaId") }));
  await recordCaptureAudit(dependencies, claims, projectId, "capture_credential_grant.revoke", "capture_credential_grant", grant.id);
  return jsonResponse(200, { credentialGrant: grant }, requestId);
}

async function handleProductFlows(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  method: string
): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, method === "POST");
  if (method === "GET") {
    const flows = await captureServiceCall(() => service.listFlows({ workspaceId: claims.workspaceId, projectId }));
    return jsonResponse(200, { flows }, requestId);
  }
  const body = objectBody(request);
  rejectUnknownKeys(body, ["flow"], "product flow");
  if (body.flow === undefined) throw new ApiError(422, "validation_failed", "flow is required.");
  const flow = await captureServiceCall(() =>
    service.saveFlowRevision({ workspaceId: claims.workspaceId, projectId, flow: body.flow })
  );
  await recordCaptureAudit(dependencies, claims, projectId, "product_flow.revise", "product_flow", flow.id, { revision: flow.revision });
  return jsonResponse(201, { flow }, requestId, {
    Location: `/api/v1/projects/${projectId}/product-flows/${flow.id}`
  });
}

async function handleProductFlow(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, flowId: string, method: string): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, method === "PATCH");
  if (method === "GET") {
    const flow = await captureServiceCall(() => service.getFlow({ workspaceId: claims.workspaceId, projectId, flowId }));
    return jsonResponse(200, { flow }, requestId);
  }
  const body = objectBody(request);
  rejectUnknownKeys(body, ["flow"], "product flow");
  if (!body.flow || typeof body.flow !== "object" || Array.isArray(body.flow) || (body.flow as { id?: unknown }).id !== flowId) throw new ApiError(422, "validation_failed", "flow.id must match the route.");
  const flow = await captureServiceCall(() => service.saveFlowRevision({ workspaceId: claims.workspaceId, projectId, flow: body.flow }));
  await recordCaptureAudit(dependencies, claims, projectId, "product_flow.revise", "product_flow", flow.id, { revision: flow.revision });
  return jsonResponse(200, { flow }, requestId);
}

async function handleProductFlowApproval(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  flowId: string,
  status: "approved" | "rejected"
): Promise<HostedApiResponse> {
  const service = requiredCaptureService(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "product flow approval");
  const flow = await captureServiceCall(() =>
    service.setFlowApproval({
      workspaceId: claims.workspaceId,
      projectId,
      flowId,
      status,
      actorUserId: claims.userId
    })
  );
  await recordCaptureAudit(dependencies, claims, projectId, status === "approved" ? "product_flow.approve" : "product_flow.reject", "product_flow", flow.id, { revision: flow.revision });
  return jsonResponse(200, { flow }, requestId);
}

async function handleCreateCaptureRun(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  const coordinator = requiredCaptureRunCoordinator(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  rejectUnknownKeys(body, ["environmentId", "flowIds"], "capture run");
  const idempotencyKey = header(request, "idempotency-key")?.trim();
  if (!idempotencyKey) throw new ApiError(422, "validation_failed", "Idempotency-Key header is required.");
  const result = await captureServiceCall(() =>
    coordinator.create({
      workspaceId: claims.workspaceId,
      projectId,
      environmentId: requiredString(body.environmentId, "environmentId"),
      flowIds: requiredStringArray(body.flowIds, "flowIds", 1, 50),
      idempotencyKey
    })
  );
  if (!result.reused) await recordCaptureAudit(dependencies, claims, projectId, "capture_run.start", "capture_run", result.captureRun.id, { job_id: result.job.id, flow_count: result.captureRun.flowRevisionIds.length });
  return jsonResponse(
    result.reused ? 200 : 202,
    {
      captureRun: captureRunResource(result.captureRun),
      job: { ...result.job, workspaceId: claims.workspaceId },
      reused: result.reused
    },
    requestId,
    { Location: `/api/v1/projects/${projectId}/capture-runs/${result.captureRun.id}` }
  );
}

async function handleCreateDiscoveryRun(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string): Promise<HostedApiResponse> {
  if (!dependencies.discoveryRunCoordinator) throw new ApiError(503, "capture_not_configured", "Asynchronous product flow discovery is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  rejectUnknownKeys(body, ["environmentId", "goals", "maxCandidates"], "discovery run");
  const idempotencyKey = header(request, "idempotency-key")?.trim();
  if (!idempotencyKey) throw new ApiError(422, "validation_failed", "Idempotency-Key header is required.");
  const result = await captureServiceCall(() => dependencies.discoveryRunCoordinator!.create({
    workspaceId: claims.workspaceId,
    projectId,
    environmentId: requiredString(body.environmentId, "environmentId"),
    goals: hostedDiscoveryGoals(body.goals),
    maxCandidates: optionalBoundedInteger(body.maxCandidates, "maxCandidates", 1, 100),
    idempotencyKey
  }));
  if (!result.reused) await recordCaptureAudit(dependencies, claims, projectId, "flow_discovery.start", "discovery_run", result.run.id, { job_id: result.job.id });
  return jsonResponse(result.reused ? 200 : 202, { discoveryRun: discoveryRunResource(result.run), job: { ...result.job, workspaceId: claims.workspaceId }, reused: result.reused }, requestId, { Location: `/api/v1/projects/${projectId}/discovery-runs/${result.run.id}` });
}

async function handleGetDiscoveryRun(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, discoveryRunId: string): Promise<HostedApiResponse> {
  if (!dependencies.discoveryRunControl) throw new ApiError(503, "capture_not_configured", "Product flow discovery control is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, false);
  const run = await captureServiceCall(() => dependencies.discoveryRunControl!.get({ workspaceId: claims.workspaceId, projectId, discoveryRunId }));
  return jsonResponse(200, { discoveryRun: discoveryRunResource(run) }, requestId);
}

async function handleCancelDiscoveryRun(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, discoveryRunId: string): Promise<HostedApiResponse> {
  if (!dependencies.discoveryRunControl) throw new ApiError(503, "capture_not_configured", "Product flow discovery control is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "discovery run cancellation");
  const run = await captureServiceCall(() => dependencies.discoveryRunControl!.cancel({ workspaceId: claims.workspaceId, projectId, discoveryRunId }));
  await recordCaptureAudit(dependencies, claims, projectId, "flow_discovery.cancel", "discovery_run", run.id);
  return jsonResponse(202, { discoveryRun: discoveryRunResource(run) }, requestId);
}

async function handleGetCaptureRun(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, captureRunId: string): Promise<HostedApiResponse> {
  const control = requiredCaptureRunControl(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, false);
  const result = await captureServiceCall(() => control.get({ workspaceId: claims.workspaceId, projectId, captureRunId }));
  return jsonResponse(200, { captureRun: captureRunResource(result.run), executions: result.executions.map(flowExecutionResource) }, requestId);
}

async function handleCancelCaptureRun(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, captureRunId: string): Promise<HostedApiResponse> {
  const control = requiredCaptureRunControl(dependencies);
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "capture run cancellation");
  const run = await captureServiceCall(() => control.cancel({ workspaceId: claims.workspaceId, projectId, captureRunId }));
  await recordCaptureAudit(dependencies, claims, projectId, "capture_run.cancel", "capture_run", run.id);
  return jsonResponse(202, { captureRun: captureRunResource(run) }, requestId);
}

async function handleCreateCaptureAssembly(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, captureRunId: string): Promise<HostedApiResponse> {
  if (!dependencies.captureAssemblyCoordinator) throw new ApiError(503, "capture_not_configured", "Capture assembly is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  const body = objectBody(request);
  rejectUnknownKeys(body, ["executionIds"], "capture assembly");
  const idempotencyKey = header(request, "idempotency-key")?.trim();
  if (!idempotencyKey) throw new ApiError(422, "validation_failed", "Idempotency-Key header is required.");
  const result = await captureServiceCall(() => dependencies.captureAssemblyCoordinator!.create({ workspaceId: claims.workspaceId, projectId, captureRunId, executionIds: requiredStringArray(body.executionIds, "executionIds", 1, 50), actorUserId: claims.userId, idempotencyKey }));
  return jsonResponse(result.reused ? 200 : 202, { job: { ...result.job, workspaceId: claims.workspaceId }, reused: result.reused }, requestId, { Location: `/api/v1/jobs/${result.job.id}` });
}

async function handleCreateCapturePreview(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, executionId: string): Promise<HostedApiResponse> {
  if (!dependencies.capturePreviewService) throw new ApiError(503, "capture_not_configured", "Capture clip previews are not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "capture clip preview");
  const preview = await captureServiceCall(() => dependencies.capturePreviewService!.create({ workspaceId: claims.workspaceId, projectId, executionId }));
  return jsonResponse(200, { preview }, requestId, { "Cache-Control": "private, no-store" });
}

async function handleLatestCaptureCoverage(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string): Promise<HostedApiResponse> {
  if (!dependencies.captureCoverageService) throw new ApiError(503, "capture_not_configured", "Structured product capture coverage is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, false);
  const snapshot = await captureServiceCall(() => dependencies.captureCoverageService!.latest({ workspaceId: claims.workspaceId, projectId }));
  if (!snapshot) throw new ApiError(404, "not_found", "Resource not found.");
  return jsonResponse(200, { coverageSnapshot: snapshot }, requestId);
}

async function handleRetryCaptureExecution(request: HostedApiRequest, dependencies: HostedApiDependencies, requestId: string, projectId: string, executionId: string): Promise<HostedApiResponse> {
  if (!dependencies.captureExecutionRetryService) throw new ApiError(503, "capture_not_configured", "Structured product capture retry is not configured.");
  const claims = await authorizeCaptureProject(request, dependencies, projectId, true);
  rejectUnknownKeys(objectBody(request), [], "flow execution retry");
  const idempotencyKey = header(request, "idempotency-key")?.trim();
  if (!idempotencyKey) throw new ApiError(422, "validation_failed", "Idempotency-Key header is required.");
  const result = await captureServiceCall(() => dependencies.captureExecutionRetryService!.retry({ workspaceId: claims.workspaceId, projectId, executionId, idempotencyKey }));
  if (!result.reused) await recordCaptureAudit(dependencies, claims, projectId, "capture_run.retry", "flow_execution", executionId, { capture_run_id: result.captureRun.id, job_id: result.job.id });
  return jsonResponse(result.reused ? 200 : 202, { captureRun: captureRunResource(result.captureRun), job: { ...result.job, workspaceId: claims.workspaceId }, reused: result.reused }, requestId, { Location: `/api/v1/projects/${projectId}/capture-runs/${result.captureRun.id}` });
}

async function authorizeCaptureProject(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  projectId: string,
  mutation: boolean
): Promise<SessionClaims> {
  const claims = requiredSession(request, dependencies);
  if (mutation) {
    try {
      assertCsrfToken(claims, header(request, "x-csrf-token"));
    } catch {
      throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
    }
    try {
      await dependencies.captureRateLimiter?.consume({ workspaceId: claims.workspaceId, userId: claims.userId, nowMs: request.nowMs ?? Date.now() });
    } catch {
      throw new ApiError(429, "rate_limited", "Too many capture requests. Try again shortly.");
    }
  }
  await storeCall(() =>
    dependencies.store.getProjectForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  return claims;
}

async function recordCaptureAudit(
  dependencies: HostedApiDependencies,
  claims: SessionClaims,
  projectId: string,
  action: AuditAction,
  targetType: AuditTargetType,
  targetId?: string,
  metadata?: Record<string, AuditMetadataValue>
): Promise<void> {
  await dependencies.captureAuditSink?.record({ workspaceId: claims.workspaceId, projectId, actorUserId: claims.userId, actorType: "local_user", action, targetType, targetId, metadata });
}

function captureCapabilities(dependencies: HostedApiDependencies) {
  const checks = {
    environmentValidation: Boolean(dependencies.environmentValidationCoordinator),
    credentialVault: Boolean(dependencies.captureCredentialVault),
    discovery: Boolean(dependencies.discoveryRunCoordinator && dependencies.discoveryRunControl),
    capture: Boolean(dependencies.captureService && dependencies.captureRunCoordinator && dependencies.captureRunControl),
    assembly: Boolean(dependencies.captureAssemblyCoordinator),
    clipPreview: Boolean(dependencies.capturePreviewService),
    coverage: Boolean(dependencies.captureCoverageService),
    audit: Boolean(dependencies.captureAuditSink),
    isolatedRuntime: dependencies.captureRuntimeReady === true
  };
  return { available: Object.values(checks).every(Boolean), ...checks };
}

async function handleGetProject(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  const project = await storeCall(() =>
    dependencies.store.getProjectForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  return jsonResponse(200, { project: projectResource(project) }, requestId);
}

async function handleGetProjectMcpContext(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  const project = await storeCall(() =>
    dependencies.store.getProjectForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  const state = await dependencies.store.load();
  emitHostedApiMetric(dependencies, {
    name: "hosted_mcp_context_served",
    workspaceId: claims.workspaceId,
    projectId,
    scripts: project.scripts.length,
    moments: project.moments.length,
    frameEvidence: project.frameEvidence.length,
    auditEvents: state.auditEvents.filter((event) => event.projectId === project.id).length
  });
  return jsonResponse(200, { project: mcpProjectContextResource(project, state) }, requestId);
}

async function handleUpdateProjectProfile(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const profile = hostedProfileInput(objectBody(request));
  const project = await storeCall(() =>
    dependencies.store.updateProfileForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId,
      profile
    })
  );
  return jsonResponse(200, { project: projectResource(project) }, requestId);
}

async function handleUpdateProjectScript(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  scriptId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    try {
      assertCsrfToken(claims, header(request, "x-csrf-token"));
    } catch {
      throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
    }
    const body = objectBody(request);
    const input = hostedScriptPatchInput(body);
    const expectedRevision = requiredRevisionPrecondition(request, body);
    const project = await storeCall(() =>
      dependencies.store.updateScriptForSession({
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        projectId,
        scriptId,
        expectedRevision,
        ...input
      })
    );
    emitHostedApiMetric(dependencies, {
      name: "hosted_review_edit_succeeded",
      workspaceId: claims.workspaceId,
      projectId,
      resourceKind: "script",
      changedFields: changedReviewFields(input)
    });
    return jsonResponse(200, { project: projectResource(project) }, requestId);
  } catch (error) {
    emitHostedReviewFailureMetric(dependencies, claims.workspaceId, projectId, "script", error);
    throw error;
  }
}

async function handleUpdateProjectMoment(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  momentId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    try {
      assertCsrfToken(claims, header(request, "x-csrf-token"));
    } catch {
      throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
    }
    const body = objectBody(request);
    const input = hostedMomentPatchInput(body);
    const expectedRevision = requiredRevisionPrecondition(request, body);
    const project = await storeCall(() =>
      dependencies.store.updateMomentForSession({
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        projectId,
        momentId,
        expectedRevision,
        ...input
      })
    );
    emitHostedApiMetric(dependencies, {
      name: "hosted_review_edit_succeeded",
      workspaceId: claims.workspaceId,
      projectId,
      resourceKind: "moment",
      changedFields: changedReviewFields(input)
    });
    return jsonResponse(200, { project: projectResource(project) }, requestId);
  } catch (error) {
    emitHostedReviewFailureMetric(dependencies, claims.workspaceId, projectId, "moment", error);
    throw error;
  }
}

async function handleGetJob(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  jobId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  const { project, job } = await storeCall(() =>
    dependencies.store.getJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      jobId
    })
  );
  return jsonResponse(200, { job: jobResource(project, job) }, requestId);
}

async function handleCancelJob(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  jobId: string
): Promise<HostedApiResponse> {
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const { project, job } = await storeCall(() =>
    dependencies.store.requestJobCancelForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      jobId
    })
  );
  return jsonResponse(202, { job: jobResource(project, job) }, requestId);
}

async function handleRetryJob(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  jobId: string
): Promise<HostedApiResponse> {
  if (!dependencies.jobQueueService) {
    throw new ApiError(503, "job_queue_not_configured", "Hosted job queue is not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const { job: existingJob } = await storeCall(() =>
    dependencies.store.getJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      jobId
    })
  );
  if (existingJob.kind !== "analysis" && existingJob.kind !== "render") {
    throw new ApiError(409, "state_conflict", `Retry queueing is not supported for ${existingJob.kind} jobs.`);
  }
  const { project, job } = await storeCall(() =>
    dependencies.store.retryJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      jobId
    })
  );
  try {
    if (job.kind === "analysis") {
      await dependencies.jobQueueService.enqueueAnalysisJob({ projectId: project.id, jobId: job.id });
    } else if (job.kind === "render") {
      await dependencies.jobQueueService.enqueueRenderJob({ projectId: project.id, jobId: job.id });
    } else {
      throw new ApiError(409, "state_conflict", `Retry queueing is not supported for ${job.kind} jobs.`);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw jobQueueError(error);
  }
  return jsonResponse(202, { job: jobResource(project, job) }, requestId);
}

async function handleCreateRecordingUploadSession(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  if (!dependencies.uploadService) {
    throw new ApiError(503, "direct_upload_not_configured", "Hosted direct uploads are not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const input = hostedRecordingUploadInput(objectBody(request));
  await storeCall(() =>
    dependencies.store.getProjectForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  let upload: HostedRecordingUploadSession;
  try {
    upload = await dependencies.uploadService.createRecordingUploadSession({
      workspaceId: claims.workspaceId,
      projectId,
      fileName: input.fileName,
      byteSize: input.byteSize,
      contentType: input.contentType
    });
  } catch (error) {
    throw uploadServiceError(error);
  }
  await storeCall(() =>
    dependencies.store.createRecordingUploadSessionRecordForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId,
      session: {
        id: upload.id,
        workspaceId: claims.workspaceId,
        projectId,
        artifactId: upload.id,
        provider: upload.provider,
        storageKey: upload.storageKey,
        status: "pending",
        method: upload.method,
        contentType: upload.contentType,
        byteSize: input.byteSize,
        originalFileName: upload.originalFileName,
        expiresAt: upload.expiresAt
      }
    })
  );
  return jsonResponse(
    201,
    {
      recordingId: upload.id,
      upload: recordingUploadResource(upload)
    },
    requestId,
    {
      Location: `/api/v1/projects/${projectId}/recordings/${upload.id}`
    }
  );
}

async function handleCompleteRecordingUpload(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  sessionId: string
): Promise<HostedApiResponse> {
  if (!dependencies.uploadService) {
    throw new ApiError(503, "direct_upload_not_configured", "Hosted direct uploads are not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const input = hostedRecordingUploadCompletionInput(objectBody(request));
  const session = await storeCall(() =>
    dependencies.store.getRecordingUploadSessionForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId,
      sessionId
    })
  );
  let completed: { artifact: ArtifactRecord; recording: RecordingMetadata };
  try {
    completed = await dependencies.uploadService.completeRecordingUploadSession({
      session,
      checksumSha256: input.checksumSha256
    });
  } catch (error) {
    throw uploadServiceError(error);
  }
  const project = await storeCall(() =>
    dependencies.store.completeRecordingUploadForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId,
      sessionId,
      artifact: completed.artifact,
      recording: completed.recording
    })
  );
  if (!project.recording) {
    throw new ApiError(500, "internal_error", "Recording completion did not attach recording metadata.");
  }
  return jsonResponse(
    200,
    {
      project: projectResource(project),
      recording: recordingResource(project.recording)
    },
    requestId
  );
}

async function handleCreateAnalysisRun(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  if (!dependencies.jobQueueService) {
    throw new ApiError(503, "job_queue_not_configured", "Hosted job queue is not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  objectBody(request);
  const { project, job, reused } = await storeCall(() =>
    dependencies.store.createAnalysisJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  if (!reused) {
    try {
      await dependencies.jobQueueService.enqueueAnalysisJob({ projectId, jobId: job.id });
    } catch (error) {
      throw jobQueueError(error);
    }
  }
  return jsonResponse(
    202,
    {
      analysisRun: {
        id: job.id,
        projectId,
        workspaceId: project.workspaceId,
        status: job.status,
        reused
      },
      job: jobResource(project, job)
    },
    requestId,
    {
      Location: `/api/v1/jobs/${job.id}`
    }
  );
}

async function handleCreateRenderJob(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  if (!dependencies.jobQueueService) {
    throw new ApiError(503, "job_queue_not_configured", "Hosted job queue is not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  objectBody(request);
  const { project, job, reused } = await storeCall(() =>
    dependencies.store.createRenderJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  if (!reused) {
    try {
      await dependencies.jobQueueService.enqueueRenderJob({ projectId, jobId: job.id });
    } catch (error) {
      throw jobQueueError(error);
    }
  }
  return jsonResponse(
    202,
    {
      renderJob: {
        id: job.id,
        projectId,
        workspaceId: project.workspaceId,
        status: job.status,
        reused
      },
      job: jobResource(project, job)
    },
    requestId,
    {
      Location: `/api/v1/jobs/${job.id}`
    }
  );
}

async function handleCreateExport(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string
): Promise<HostedApiResponse> {
  if (!dependencies.exportService) {
    throw new ApiError(503, "export_not_configured", "Hosted exports are not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const input = hostedExportInput(objectBody(request));
  const project = await storeCall(() =>
    dependencies.store.getProjectForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId
    })
  );
  const render = project.renders.find((candidate) => candidate.id === input.renderId && candidate.status === "completed");
  if (!render) {
    throw new ApiError(404, "not_found", "Completed render not found.");
  }
  let created: { artifact: ArtifactRecord };
  try {
    created = await dependencies.exportService.createExport({ project, render });
  } catch (error) {
    throw exportServiceError(error);
  }
  const updated = await storeCall(() =>
    dependencies.store.createExportForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      projectId,
      renderId: input.renderId,
      artifact: created.artifact
    })
  );
  return jsonResponse(
    201,
    {
      export: exportResource(created.artifact, input.renderId),
      project: projectResource(updated)
    },
    requestId,
    {
      Location: `/api/v1/projects/${projectId}/exports/${created.artifact.id}`
    }
  );
}

async function handleCreateExportDownloadUrl(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  projectId: string,
  exportId: string
): Promise<HostedApiResponse> {
  if (!dependencies.exportService) {
    throw new ApiError(503, "export_not_configured", "Hosted exports are not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  objectBody(request);
  const [project, artifact] = await Promise.all([
    storeCall(() =>
      dependencies.store.getProjectForSession({
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        projectId
      })
    ),
    storeCall(() =>
      dependencies.store.getExportArtifactForSession({
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        projectId,
        exportId
      })
    )
  ]);
  let signed: { downloadUrl: string; expiresAt: string };
  try {
    signed = await dependencies.exportService.createDownloadUrl({ project, artifact });
  } catch (error) {
    throw exportServiceError(error);
  }
  return jsonResponse(200, { download: exportDownloadResource(artifact, signed) }, requestId, {
    "Cache-Control": "no-store"
  });
}

async function handleCreateBillingCheckoutSession(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  workspaceId: string
): Promise<HostedApiResponse> {
  if (!dependencies.billingService || dependencies.config.billing.provider === "none") {
    throw new ApiError(503, "billing_not_configured", "Hosted billing is not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  if (workspaceId !== claims.workspaceId) {
    throw new ApiError(403, "action_forbidden", "Action is not allowed for this workspace.");
  }
  const input = hostedBillingCheckoutInput(objectBody(request), dependencies.config.billing);
  const workspace = await storeCall(() =>
    dependencies.store.getWorkspaceForBillingSession({
      userId: claims.userId,
      workspaceId
    })
  );
  let session: HostedBillingSession;
  try {
    session = await dependencies.billingService.createCheckoutSession({
      userId: claims.userId,
      workspace,
      plan: input.plan,
      priceId: input.priceId,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl
    });
  } catch (error) {
    throw billingServiceError(error);
  }
  return jsonResponse(201, { checkoutSession: billingSessionResource(workspace, session, input.plan) }, requestId, {
    "Cache-Control": "no-store"
  });
}

async function handleCreateBillingPortalSession(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies,
  requestId: string,
  workspaceId: string
): Promise<HostedApiResponse> {
  if (!dependencies.billingService || dependencies.config.billing.provider === "none") {
    throw new ApiError(503, "billing_not_configured", "Hosted billing is not configured.");
  }
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  if (workspaceId !== claims.workspaceId) {
    throw new ApiError(403, "action_forbidden", "Action is not allowed for this workspace.");
  }
  const input = hostedBillingPortalInput(objectBody(request));
  const workspace = await storeCall(() =>
    dependencies.store.getWorkspaceForBillingSession({
      userId: claims.userId,
      workspaceId
    })
  );
  if (!workspace.billingCustomerId) {
    throw new ApiError(409, "state_conflict", "Workspace does not have a billing customer yet.");
  }
  let session: HostedBillingSession;
  try {
    session = await dependencies.billingService.createCustomerPortalSession({
      userId: claims.userId,
      workspace,
      returnUrl: input.returnUrl
    });
  } catch (error) {
    throw billingServiceError(error);
  }
  return jsonResponse(201, { portalSession: billingSessionResource(workspace, session) }, requestId, {
    "Cache-Control": "no-store"
  });
}

function requiredSession(request: HostedApiRequest, dependencies: HostedApiDependencies): SessionClaims {
  const token = readSessionTokenFromCookieHeader(header(request, "cookie"), dependencies.config.auth.sessionCookieName);
  if (!token || !dependencies.config.auth.sessionSecret) {
    throw new ApiError(401, "authentication_required", "A valid session is required.");
  }
  try {
    return verifySignedSession({
      token,
      secret: dependencies.config.auth.sessionSecret,
      nowMs: request.nowMs
    });
  } catch (error) {
    throw new ApiError(401, "session_expired", error instanceof Error ? error.message : "Session is invalid.");
  }
}

async function optionalSession(
  request: HostedApiRequest,
  dependencies: HostedApiDependencies
): Promise<{ claims: SessionClaims | null; clearCookie: boolean }> {
  const token = readSessionTokenFromCookieHeader(header(request, "cookie"), dependencies.config.auth.sessionCookieName);
  if (!token || !dependencies.config.auth.sessionSecret) {
    return { claims: null, clearCookie: Boolean(token) };
  }
  try {
    return {
      claims: verifySignedSession({
        token,
        secret: dependencies.config.auth.sessionSecret,
        nowMs: request.nowMs
      }),
      clearCookie: false
    };
  } catch {
    return { claims: null, clearCookie: true };
  }
}

function sessionPayload(state: AppState, claims: SessionClaims) {
  const user = state.users.find((candidate) => candidate.id === claims.userId && candidate.authSubject === claims.authSubject);
  const workspace = state.workspaces.find((candidate) => candidate.id === claims.workspaceId);
  const member = state.workspaceMembers.find(
    (candidate) => candidate.userId === claims.userId && candidate.workspaceId === claims.workspaceId
  );
  if (!user || !workspace || !member) {
    return null;
  }
  return {
    session: {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      },
      role: member.role,
      expiresAt: claims.expiresAt
    },
    csrfToken: claims.csrfToken
  };
}

function projectSummary(project: Project) {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    productName: project.profile.productName
  };
}

function projectResource(project: Project) {
  return {
    ...projectSummary(project),
    profile: profileResource(project.profile),
    hasRecording: Boolean(project.recording),
    transcriptStatus: project.transcript?.status ?? null,
    momentsCount: project.moments.length,
    conceptsCount: project.concepts.length,
    scriptsCount: project.scripts.length,
    rendersCount: project.renders.length,
    renders: project.renders.map(renderResource),
    artifactsCount: project.artifacts.length,
    jobsCount: project.jobs.length
  };
}

function profileResource(profile: Project["profile"]): Project["profile"] {
  return {
    ...profile,
    brandKit: profile.brandKit
      ? {
          ...profile.brandKit,
          logoPath: undefined
        }
      : undefined
  };
}

function mcpProjectContextResource(project: Project, state: AppState) {
  return {
    ...projectResource(project),
    revision: project.updatedAt,
    recording: project.recording
      ? {
          fileName: project.recording.fileName,
          durationMs: project.recording.durationMs,
          width: project.recording.width,
          height: project.recording.height,
          fps: project.recording.fps,
          videoCodec: project.recording.videoCodec,
          audioCodec: project.recording.audioCodec,
          hasAudio: project.recording.hasAudio,
          sizeBytes: project.recording.sizeBytes,
          validatedAt: project.recording.validatedAt,
          artifactId: project.recording.artifactId,
          sha256: project.recording.sha256
        }
      : null,
    transcript: project.transcript
      ? {
          id: project.transcript.id,
          status: project.transcript.status,
          provider: project.transcript.provider,
          model: project.transcript.model,
          text: project.transcript.text,
          segments: project.transcript.segments,
          createdAt: project.transcript.createdAt,
          error: project.transcript.error
        }
      : null,
    moments: project.moments.map((moment) => ({
      id: moment.id,
      revision: project.updatedAt,
      label: moment.label,
      startMs: moment.startMs,
      endMs: moment.endMs,
      evidence: moment.evidence,
      sourceEvidenceIds: moment.sourceEvidenceIds,
      confidence: moment.confidence,
      proofScore: moment.proofScore,
      visualRole: moment.visualRole,
      beforeAfterPairId: moment.beforeAfterPairId,
      focus: moment.focus,
      interactionHint: moment.interactionHint,
      enabled: moment.enabled,
      thumbnailUrl: moment.thumbnailUrl
    })),
    frameEvidence: project.frameEvidence.map((frame) => ({
      id: frame.id,
      momentId: frame.momentId,
      timestampMs: frame.timestampMs,
      imageUrl: frame.imageUrl,
      ocrText: frame.ocrText,
      uiElements: frame.uiElements,
      ocrProvider: frame.ocrProvider,
      confidence: frame.confidence,
      proofScore: frame.proofScore,
      visualRole: frame.visualRole,
      beforeAfterPairId: frame.beforeAfterPairId,
      focus: frame.focus,
      interactionHints: frame.interactionHints,
      createdAt: frame.createdAt
    })),
    scripts: project.scripts.map((script) => ({
      id: script.id,
      revision: script.updatedAt,
      conceptId: script.conceptId,
      templateKey: script.templateKey,
      hook: script.hook,
      voiceoverText: script.voiceoverText,
      captions: script.captions,
      cta: script.cta,
      visualBeats: script.visualBeats,
      editDecisionList: script.editDecisionList
        ? {
            schemaVersion: script.editDecisionList.schemaVersion,
            templateId: script.editDecisionList.templateId,
            templateKey: script.editDecisionList.templateKey,
            templateVersion: script.editDecisionList.templateVersion,
            brandKitId: script.editDecisionList.brandKitId,
            durationMs: script.editDecisionList.durationMs,
            canvas: script.editDecisionList.canvas,
            zooms: script.editDecisionList.zooms,
            transitions: script.editDecisionList.transitions,
            overlays: script.editDecisionList.overlays,
            callouts: script.editDecisionList.callouts,
            cursorCues: script.editDecisionList.cursorCues,
            presenter: {
              enabled: script.editDecisionList.presenter.enabled,
              style: script.editDecisionList.presenter.style,
              avatarId: script.editDecisionList.presenter.avatarId,
              provenance: script.editDecisionList.presenter.provenance,
              disclosure: script.editDecisionList.presenter.disclosure,
              startMs: script.editDecisionList.presenter.startMs,
              endMs: script.editDecisionList.presenter.endMs,
              position: script.editDecisionList.presenter.position,
              motion: script.editDecisionList.presenter.motion
            },
            qualityGates: script.editDecisionList.qualityGates
          }
        : null,
      evidenceClaims: script.evidenceClaims ?? [],
      qualityWarnings: script.qualityWarnings ?? [],
      approved: script.approved,
      updatedAt: script.updatedAt
    })),
    jobs: project.jobs.map((job) => jobResource(project, job)),
    auditEvents: state.auditEvents
      .filter((event) => event.projectId === project.id)
      .slice(-25)
      .map((event) => ({
        id: event.id,
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        actorUserId: event.actorUserId,
        actorType: event.actorType,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        metadata: event.metadata,
        createdAt: event.createdAt
      }))
  };
}

function jobResource(project: Project, job: JobRecord) {
  return {
    ...job,
    workspaceId: project.workspaceId,
    projectId: project.id
  };
}

function captureRunResource(run: import("../shared/productFlowCapture").CaptureRun) {
  return {
    id: run.id,
    projectId: run.projectId,
    environmentVersionId: run.environmentVersionId,
    jobId: run.jobId,
    status: run.status,
    flowRevisionIds: run.flowRevisionIds,
    compiledPlanHashes: run.compiledPlanHashes,
    policyFingerprint: run.policyFingerprint,
    estimatedBrowserSeconds: run.estimatedBrowserSeconds,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

function discoveryRunResource(run: import("../shared/productFlowCapture").DiscoveryRun) {
  return { id: run.id, projectId: run.projectId, environmentVersionId: run.environmentVersionId, jobId: run.jobId, status: run.status, promptVersion: run.promptVersion, provider: run.provider ?? null, model: run.model ?? null, maxSteps: run.maxSteps, maxScreenshots: run.maxScreenshots, maxDurationMs: run.maxDurationMs, safeErrorCode: run.safeErrorCode ?? null, createdAt: run.createdAt, updatedAt: run.updatedAt };
}

function flowExecutionResource(execution: import("../shared/productFlowCapture").FlowExecutionRecord) {
  return {
    id: execution.id, captureRunId: execution.captureRunId, flowId: execution.flowId, flowRevision: execution.flowRevision,
    environmentVersionId: execution.environmentVersionId, status: execution.status, attempt: execution.attempt,
    compiledPlanHash: execution.compiledPlanHash, receiptArtifactId: execution.receiptArtifactId ?? null,
    rawCaptureArtifactId: execution.rawCaptureArtifactId ?? null, normalizedClipArtifactId: execution.normalizedClipArtifactId ?? null,
    quality: execution.quality ? { status: execution.quality.status, checks: execution.quality.checks.map((check) => ({ code: check.code, status: check.status })) } : null,
    blockerCode: execution.blockerCode ?? null, createdAt: execution.createdAt, updatedAt: execution.updatedAt
  };
}

function renderResource(render: RenderedVideo) {
  return {
    id: render.id,
    scriptId: render.scriptId,
    title: render.title,
    status: render.status,
    artifactId: render.artifactId ?? null,
    sha256: render.sha256 ?? null,
    sizeBytes: render.sizeBytes ?? null,
    validation: render.validation ?? null,
    createdAt: render.createdAt
  };
}

function recordingUploadResource(upload: HostedRecordingUploadSession) {
  return {
    uploadId: upload.id,
    provider: upload.provider,
    uploadUrl: upload.uploadUrl,
    method: upload.method,
    headers: upload.headers,
    expiresAt: upload.expiresAt,
    maxBytes: upload.maxBytes,
    contentType: upload.contentType,
    originalFileName: upload.originalFileName
  };
}

function recordingResource(recording: RecordingMetadata) {
  return {
    artifactId: recording.artifactId,
    fileName: recording.fileName,
    sizeBytes: recording.sizeBytes,
    durationMs: recording.durationMs,
    width: recording.width,
    height: recording.height,
    fps: recording.fps,
    videoCodec: recording.videoCodec,
    audioCodec: recording.audioCodec,
    hasAudio: recording.hasAudio,
    sha256: recording.sha256,
    validatedAt: recording.validatedAt
  };
}

function captureEnvironmentResource(environment: CaptureEnvironment) {
  return {
    id: environment.id,
    projectId: environment.projectId,
    workspaceId: environment.workspaceId,
    name: environment.name,
    type: environment.type,
    baseUrl: environment.baseUrl,
    allowedDomains: environment.allowedDomains,
    status: environment.status,
    resetAdapter: environment.resetAdapter,
    revision: environment.revision,
    currentVersionId: environment.currentVersionId ?? null,
    safeErrorCode: environment.safeErrorCode ?? null,
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt
  };
}

function exportResource(artifact: ArtifactRecord, renderId: string) {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    workspaceId: artifact.workspaceId,
    renderId,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    originalFileName: artifact.originalFileName,
    createdAt: artifact.createdAt
  };
}

function exportDownloadResource(
  artifact: ArtifactRecord,
  signed: { downloadUrl: string; expiresAt: string }
) {
  return {
    exportId: artifact.id,
    projectId: artifact.projectId,
    workspaceId: artifact.workspaceId,
    url: signed.downloadUrl,
    expiresAt: signed.expiresAt,
    filename: artifact.originalFileName,
    contentType: artifact.contentType,
    byteSize: artifact.byteSize
  };
}

function billingSessionResource(workspace: Workspace, session: HostedBillingSession, plan?: Exclude<WorkspacePlan, "local_mvp">) {
  return {
    id: session.id,
    workspaceId: workspace.id,
    provider: session.provider,
    plan: plan ?? workspace.plan,
    url: session.url,
    expiresAt: session.expiresAt ?? null
  };
}

function jsonResponse(
  status: number,
  data: unknown,
  requestId: string,
  headers: Record<string, string> = {}
): HostedApiResponse {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: {
      data,
      meta: { requestId }
    }
  };
}

function errorResponse(status: number, code: string, message: string, requestId: string): HostedApiResponse {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: {
      error: {
        code,
        message,
        requestId
      }
    }
  };
}

function objectBody(request: HostedApiRequest): Record<string, unknown> {
  const body = request.body ?? parseJson(rawBodyString(request));
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

function rawBodyString(request: HostedApiRequest): string {
  if (typeof request.rawBody === "string") {
    return request.rawBody;
  }
  if (Buffer.isBuffer(request.rawBody)) {
    return request.rawBody.toString("utf8");
  }
  if (request.body !== undefined) {
    return JSON.stringify(request.body);
  }
  return "";
}

function parseJson(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "invalid_request", "Request body must be valid JSON.");
  }
}

function requiredHeader(request: HostedApiRequest, name: string): string {
  const value = header(request, name);
  if (!value) {
    throw new ApiError(400, "invalid_request", `${name} header is required.`);
  }
  return value;
}

function header(request: HostedApiRequest, name: string): string | undefined {
  const expected = name.toLowerCase();
  for (const [candidate, value] of Object.entries(request.headers ?? {})) {
    if (candidate.toLowerCase() !== expected) {
      continue;
    }
    return Array.isArray(value) ? value.join(",") : value;
  }
  return undefined;
}

function requestIdFrom(request: HostedApiRequest): string {
  const provided = header(request, "x-request-id")?.trim();
  return provided && /^[a-zA-Z0-9._:-]{6,100}$/.test(provided) ? provided : `req_${Date.now().toString(36)}`;
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ApiError(422, "validation_failed", `${field} is required.`);
  }
  return normalized;
}

function requiredRevisionPrecondition(request: HostedApiRequest, body: Record<string, unknown>): string {
  const headerRevision = normalizeRevision(header(request, "if-match"));
  const bodyRevision = normalizeRevision(body.revision);
  const revision = headerRevision ?? bodyRevision;
  if (!revision) {
    throw new ApiError(428, "precondition_required", "If-Match or revision is required for collaborative edits.");
  }
  return revision;
}

function normalizeRevision(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).trim() : trimmed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hostedScriptPatchInput(body: Record<string, unknown>): {
  hook?: string;
  voiceoverText?: string;
  cta?: string;
} {
  const input = {
    hook: optionalString(body.hook),
    voiceoverText: optionalString(body.voiceoverText),
    cta: optionalString(body.cta)
  };
  if (!input.hook && !input.voiceoverText && !input.cta) {
    throw new ApiError(422, "validation_failed", "At least one script field is required.");
  }
  return input;
}

function hostedMomentPatchInput(body: Record<string, unknown>): {
  label?: string;
  evidence?: string;
  enabled?: boolean;
} {
  const input = {
    label: optionalString(body.label),
    evidence: optionalString(body.evidence),
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined
  };
  if (!input.label && !input.evidence && typeof input.enabled !== "boolean") {
    throw new ApiError(422, "validation_failed", "At least one moment field is required.");
  }
  return input;
}

function changedReviewFields(input: Record<string, unknown>): string[] {
  return Object.entries(input)
    .filter(([, value]) => typeof value !== "undefined")
    .map(([field]) => field)
    .sort();
}

function emitHostedReviewFailureMetric(
  dependencies: HostedApiDependencies,
  workspaceId: string,
  projectId: string,
  resourceKind: "script" | "moment",
  error: unknown
): void {
  const apiError = error instanceof ApiError ? error : apiErrorFromStoreError(error);
  emitHostedApiMetric(dependencies, {
    name: "hosted_review_edit_failed",
    workspaceId,
    projectId,
    resourceKind,
    status: apiError.status,
    code: apiError.code
  });
}

function emitHostedApiMetric(dependencies: HostedApiDependencies, event: HostedApiMetricEvent): void {
  try {
    dependencies.onMetric?.(event);
  } catch {
    // Metrics must not change API behavior.
  }
}

function optionalIdentityProvider(value: unknown): IdentityProvider | undefined {
  const normalized = optionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (["local", "email", "google", "github", "oidc"].includes(normalized)) {
    return normalized as IdentityProvider;
  }
  throw new ApiError(422, "validation_failed", "identityProvider is invalid.");
}

function hostedProjectInput(body: Record<string, unknown>): CreateProjectInput {
  return {
    name: optionalString(body.name) ?? "",
    profile: hostedProfileInput(body)
  };
}

function hostedProfileInput(body: Record<string, unknown>): ProductProfile {
  const profile = body.profile;
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
    throw new ApiError(422, "validation_failed", "profile is required.");
  }
  return profile as ProductProfile;
}

function hostedCaptureEnvironmentInput(body: Record<string, unknown>): {
  name: string;
  type: CaptureEnvironmentType;
  baseUrl: string;
  allowedDomains: string[];
  resetAdapter: CaptureEnvironment["resetAdapter"];
} {
  rejectUnknownKeys(body, ["name", "type", "baseUrl", "allowedDomains", "resetAdapter"], "capture environment");
  const type = requiredString(body.type, "type");
  if (!["local_preview", "staging", "demo", "production_sandbox"].includes(type)) {
    throw new ApiError(422, "validation_failed", "type is invalid.");
  }
  const resetAdapter = requiredString(body.resetAdapter, "resetAdapter");
  if (!["none", "http_endpoint", "fixture_api", "disposable_account", "manual"].includes(resetAdapter)) {
    throw new ApiError(422, "validation_failed", "resetAdapter is invalid.");
  }
  return {
    name: requiredString(body.name, "name"),
    type: type as CaptureEnvironmentType,
    baseUrl: requiredString(body.baseUrl, "baseUrl"),
    allowedDomains: requiredStringArray(body.allowedDomains, "allowedDomains", 1, 20),
    resetAdapter: resetAdapter as CaptureEnvironment["resetAdapter"]
  };
}

function hostedCapturePersonaInput(body: Record<string, unknown>, allowStatus = false): {
  environmentId: string;
  key: string;
  displayName: string;
  roleDescription: string;
  fixtureProfileId?: string;
  credentialGrantId?: string;
} {
  rejectUnknownKeys(
    body,
    ["environmentId", "key", "displayName", "roleDescription", "fixtureProfileId", "credentialGrantId", ...(allowStatus ? ["status"] : [])],
    "capture persona"
  );
  if (allowStatus && body.status !== undefined && body.status !== "active" && body.status !== "disabled") throw new ApiError(422, "validation_failed", "status is invalid.");
  return {
    environmentId: requiredString(body.environmentId, "environmentId"),
    key: requiredString(body.key, "key"),
    displayName: requiredString(body.displayName, "displayName"),
    roleDescription: requiredString(body.roleDescription, "roleDescription"),
    fixtureProfileId: optionalString(body.fixtureProfileId),
    credentialGrantId: optionalString(body.credentialGrantId)
  };
}

function hostedCaptureCredentialSecret(value: unknown, kind: "username_password" | "session_bootstrap_token"): CaptureCredentialSecret {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(422, "validation_failed", "secret is required.");
  const secret = value as Record<string, unknown>;
  rejectUnknownKeys(secret, kind === "username_password" ? ["username", "password"] : ["sessionBootstrapToken"], "secret");
  return kind === "username_password"
    ? { username: requiredString(secret.username, "secret.username"), password: requiredString(secret.password, "secret.password") }
    : { sessionBootstrapToken: requiredString(secret.sessionBootstrapToken, "secret.sessionBootstrapToken") };
}

function requiredStringArray(value: unknown, field: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ApiError(422, "validation_failed", `${field} must contain ${min}–${max} values.`);
  }
  const normalized = value.map((item) => requiredString(item, field));
  if (new Set(normalized).size !== normalized.length) {
    throw new ApiError(422, "validation_failed", `${field} must not contain duplicates.`);
  }
  return normalized;
}

function hostedDiscoveryGoals(value: unknown): Array<{ id: string; text: string; priority: number }> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new ApiError(422, "validation_failed", "goals must contain 1–50 values.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(422, "validation_failed", "goal is invalid.");
    const goal = item as Record<string, unknown>;
    rejectUnknownKeys(goal, ["id", "text", "priority"], "goal");
    return { id: requiredString(goal.id, "goal.id"), text: requiredString(goal.text, "goal.text"), priority: requiredBoundedInteger(goal.priority, "goal.priority", 0, 100) };
  });
}

function optionalBoundedInteger(value: unknown, field: string, min: number, max: number): number | undefined { return value === undefined ? undefined : requiredBoundedInteger(value, field, min, max); }
function requiredBoundedInteger(value: unknown, field: string, min: number, max: number): number { if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new ApiError(422, "validation_failed", `${field} must be an integer from ${min} to ${max}.`); return value; }

function rejectUnknownKeys(
  body: Record<string, unknown>,
  allowedKeys: string[],
  resource: string
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) throw new ApiError(422, "validation_failed", `${resource}.${unknown} is not allowed.`);
}

function hostedRecordingUploadInput(body: Record<string, unknown>): {
  fileName: string;
  byteSize: number;
  contentType?: string;
} {
  const fileName = normalizeUploadFileName(requiredString(body.filename ?? body.fileName, "filename"));
  const byteSize = normalizeUploadByteSize(body.sizeBytes ?? body.byteSize);
  const contentType = normalizeUploadContentType(body.mediaType ?? body.contentType);
  return { fileName, byteSize, contentType };
}

function hostedRecordingUploadCompletionInput(body: Record<string, unknown>): { checksumSha256?: string } {
  const checksumSha256 = optionalChecksumSha256(body.checksumSha256);
  return checksumSha256 ? { checksumSha256 } : {};
}

function hostedExportInput(body: Record<string, unknown>): { renderId: string } {
  return {
    renderId: requiredString(body.renderId, "renderId")
  };
}

function hostedBillingCheckoutInput(
  body: Record<string, unknown>,
  billingConfig: BillingConfig
): {
  plan: Exclude<WorkspacePlan, "local_mvp">;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
} {
  const plan = requiredString(body.plan, "plan");
  if (!["starter", "team", "enterprise"].includes(plan)) {
    throw new ApiError(422, "validation_failed", "plan must be starter, team, or enterprise.");
  }
  const priceId = billingConfig.stripePriceIds[plan as Exclude<WorkspacePlan, "local_mvp">];
  if (!priceId) {
    throw new ApiError(503, "billing_not_configured", `Billing price for ${plan} is not configured.`);
  }
  return {
    plan: plan as Exclude<WorkspacePlan, "local_mvp">,
    priceId,
    successUrl: requiredHttpUrl(body.successUrl, "successUrl"),
    cancelUrl: requiredHttpUrl(body.cancelUrl, "cancelUrl")
  };
}

function hostedBillingPortalInput(body: Record<string, unknown>): { returnUrl: string } {
  return {
    returnUrl: requiredHttpUrl(body.returnUrl, "returnUrl")
  };
}

function requiredHttpUrl(value: unknown, field: string): string {
  const raw = requiredString(value, field);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Unsupported protocol.");
    }
    return parsed.toString();
  } catch {
    throw new ApiError(422, "validation_failed", `${field} must be an absolute http(s) URL.`);
  }
}

async function storeCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw apiErrorFromStoreError(error);
  }
}

async function captureServiceCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture service operation failed.";
    if (/not found/i.test(message)) throw new ApiError(404, "not_found", "Resource not found.");
    if (/revision must|not current|not ready|revoked|already/i.test(message)) {
      throw new ApiError(409, "state_conflict", message);
    }
    if (/must|required|invalid|forbidden|require HTTPS|allowed domain|draft/i.test(message)) {
      throw new ApiError(422, "validation_failed", message);
    }
    if (/resolve|network|private|reserved|destination/i.test(message)) {
      throw new ApiError(422, "environment_validation_failed", "Capture environment could not be validated safely.");
    }
    throw new ApiError(500, "internal_error", "Unexpected capture service error.");
  }
}

function requiredCaptureService(dependencies: HostedApiDependencies): CaptureApplicationService {
  if (!dependencies.captureService) {
    throw new ApiError(503, "capture_not_configured", "Structured product capture is not configured.");
  }
  return dependencies.captureService;
}

function requiredCaptureRunCoordinator(dependencies: HostedApiDependencies): CaptureRunCoordinator {
  if (!dependencies.captureRunCoordinator) {
    throw new ApiError(503, "capture_not_configured", "Structured product capture execution is not configured.");
  }
  return dependencies.captureRunCoordinator;
}

function requiredCaptureRunControl(dependencies: HostedApiDependencies): CaptureRunControlService {
  if (!dependencies.captureRunControl) throw new ApiError(503, "capture_not_configured", "Structured product capture control is not configured.");
  return dependencies.captureRunControl;
}

function apiErrorFromStoreError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Store operation failed.";
  if (/not a member|cannot perform|forbidden/i.test(message)) {
    return new ApiError(403, "action_forbidden", "Action is not allowed for this workspace.");
  }
  if (/not found/i.test(message)) {
    return new ApiError(404, "not_found", "Resource not found.");
  }
  if (/revision conflict/i.test(message)) {
    return new ApiError(409, "revision_conflict", "Resource revision has changed.");
  }
  if (/quota exceeded|limit exceeded/i.test(message)) {
    return new ApiError(402, "quota_exceeded", message);
  }
  if (/cannot|not retryable|no attempts remaining|already/i.test(message)) {
    return new ApiError(409, "state_conflict", message);
  }
  if (/must be|required|invalid|enter a valid|mismatch|does not match/i.test(message)) {
    return new ApiError(422, "validation_failed", message);
  }
  return new ApiError(500, "internal_error", "Unexpected API error.");
}

function uploadServiceError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Upload service operation failed.";
  if (/not configured|requires configured|missing/i.test(message)) {
    return new ApiError(503, "direct_upload_not_configured", message);
  }
  if (/mismatch|checksum|does not match|invalid/i.test(message)) {
    return new ApiError(422, "validation_failed", message);
  }
  if (/failed|unavailable|timeout|storage/i.test(message)) {
    return new ApiError(503, "storage_unavailable", message);
  }
  return new ApiError(500, "internal_error", "Unexpected upload service error.");
}

function jobQueueError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Job queue operation failed.";
  if (/not configured|missing/i.test(message)) {
    return new ApiError(503, "job_queue_not_configured", message);
  }
  return new ApiError(503, "temporarily_unavailable", message);
}

function exportServiceError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Export service operation failed.";
  if (/not configured|missing/i.test(message)) {
    return new ApiError(503, "export_not_configured", message);
  }
  if (/mismatch|invalid|does not match/i.test(message)) {
    return new ApiError(422, "validation_failed", message);
  }
  return new ApiError(503, "temporarily_unavailable", message);
}

function billingServiceError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Billing service operation failed.";
  if (/not configured|missing|price/i.test(message)) {
    return new ApiError(503, "billing_not_configured", message);
  }
  if (/customer|subscription|already|cannot|expired/i.test(message)) {
    return new ApiError(409, "state_conflict", message);
  }
  if (/invalid|mismatch|does not match/i.test(message)) {
    return new ApiError(422, "validation_failed", message);
  }
  return new ApiError(503, "temporarily_unavailable", message);
}

function clearSessionCookie(cookieName: string, secure: boolean): string {
  const parts = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0"
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUploadFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (normalized.length < 1 || normalized.length > 255) {
    throw new ApiError(422, "validation_failed", "filename must be 1–255 characters.");
  }
  if (!/\.(mp4|mov|webm)$/i.test(normalized)) {
    throw new ApiError(415, "unsupported_media_type", "Recording uploads must be MP4, MOV, or WebM files.");
  }
  return normalized;
}

function normalizeUploadByteSize(value: unknown): number {
  const byteSize = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new ApiError(422, "validation_failed", "sizeBytes must be a positive integer.");
  }
  return byteSize;
}

function normalizeUploadContentType(value: unknown): string | undefined {
  const normalized = optionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"].includes(normalized.toLowerCase())) {
    return normalized.toLowerCase();
  }
  throw new ApiError(415, "unsupported_media_type", "mediaType must be video/mp4, video/quicktime, or video/webm.");
}

function optionalChecksumSha256(value: unknown): string | undefined {
  const normalized = optionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new ApiError(422, "validation_failed", "checksumSha256 must be a 64-character hex string.");
  }
  return normalized.toLowerCase();
}

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
