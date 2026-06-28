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
  createBrokeredHostedJobQueueService,
  createHttpHostedJobQueueService,
  InMemoryHostedWorkerJobBroker,
  loadHostedJobQueueConfig,
  type HostedJobQueueConfig,
  type HostedWorkerJobBroker
} from "./jobQueue";
import type {
  AppState,
  ApplyBillingSubscriptionInput,
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
    billingService: input.billingService ?? createHostedBillingService(config.billing)
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
    if (method === "POST" && path === "/api/v1/projects") {
      return await handleCreateProject(request, dependencies, requestId);
    }
    const projectRoute = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
    if (method === "GET" && projectRoute) {
      return await handleGetProject(request, dependencies, requestId, decodeURIComponent(projectRoute[1] ?? ""));
    }
    const projectProfileRoute = path.match(/^\/api\/v1\/projects\/([^/]+)\/profile$/);
    if (method === "PATCH" && projectProfileRoute) {
      return await handleUpdateProjectProfile(request, dependencies, requestId, decodeURIComponent(projectProfileRoute[1] ?? ""));
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
  const claims = requiredSession(request, dependencies);
  try {
    assertCsrfToken(claims, header(request, "x-csrf-token"));
  } catch {
    throw new ApiError(403, "csrf_failed", "CSRF token is invalid.");
  }
  const { project, job } = await storeCall(() =>
    dependencies.store.retryJobForSession({
      userId: claims.userId,
      workspaceId: claims.workspaceId,
      jobId
    })
  );
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
    profile: project.profile,
    hasRecording: Boolean(project.recording),
    transcriptStatus: project.transcript?.status ?? null,
    momentsCount: project.moments.length,
    conceptsCount: project.concepts.length,
    scriptsCount: project.scripts.length,
    rendersCount: project.renders.length,
    artifactsCount: project.artifacts.length,
    jobsCount: project.jobs.length
  };
}

function jobResource(project: Project, job: JobRecord) {
  return {
    ...job,
    workspaceId: project.workspaceId,
    projectId: project.id
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function apiErrorFromStoreError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Store operation failed.";
  if (/not a member|cannot perform|forbidden/i.test(message)) {
    return new ApiError(403, "action_forbidden", "Action is not allowed for this workspace.");
  }
  if (/not found/i.test(message)) {
    return new ApiError(404, "not_found", "Resource not found.");
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
