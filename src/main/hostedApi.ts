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
  loadBillingConfig,
  normalizeStripeSubscriptionEvent,
  verifyStripeWebhookSignature,
  type BillingConfig
} from "./billing";
import type {
  AppState,
  ApplyBillingSubscriptionInput,
  CreateProjectInput,
  IdentityProvider,
  ProductProfile,
  Project,
  SyncAuthenticatedUserInput
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
}

export interface HostedApiDependencies {
  store: HostedApiStore;
  config: HostedApiConfig;
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
    internalAuthCallbackSecret: env.GIDEON_AUTH_CALLBACK_SECRET?.trim() || null
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
  if (/must be|required|invalid|enter a valid/i.test(message)) {
    return new ApiError(422, "validation_failed", message);
  }
  return new ApiError(500, "internal_error", "Unexpected API error.");
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

async function readRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
