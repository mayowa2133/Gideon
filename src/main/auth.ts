import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface AuthConfig {
  sessionCookieName: string;
  sessionSecret: string | null;
  sessionDurationSeconds: number;
  secureCookies: boolean;
}

export interface SessionClaims {
  version: 1;
  sessionId: string;
  userId: string;
  authSubject: string;
  workspaceId: string;
  csrfToken: string;
  issuedAt: string;
  expiresAt: string;
}

export interface CreateSignedSessionInput {
  secret: string;
  userId: string;
  authSubject: string;
  workspaceId: string;
  nowMs?: number;
  durationSeconds?: number;
  csrfToken?: string;
  sessionId?: string;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    sessionCookieName: nonEmpty(env.GIDEON_SESSION_COOKIE_NAME) ?? "gideon_session",
    sessionSecret: nonEmpty(env.GIDEON_SESSION_SECRET),
    sessionDurationSeconds: positiveInteger(env.GIDEON_SESSION_DURATION_SECONDS, 60 * 60 * 24 * 14),
    secureCookies: env.GIDEON_SECURE_COOKIES !== "false"
  };
}

export function createSignedSession(input: CreateSignedSessionInput): { token: string; claims: SessionClaims } {
  if (!input.secret.trim()) {
    throw new Error("Session secret is required.");
  }
  const nowMs = input.nowMs ?? Date.now();
  const durationSeconds = input.durationSeconds ?? 60 * 60 * 24 * 14;
  const claims: SessionClaims = {
    version: 1,
    sessionId: input.sessionId ?? randomUUID(),
    userId: input.userId,
    authSubject: input.authSubject,
    workspaceId: input.workspaceId,
    csrfToken: input.csrfToken ?? randomBytes(24).toString("base64url"),
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + durationSeconds * 1000).toISOString()
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload, input.secret);
  return {
    token: `${payload}.${signature}`,
    claims
  };
}

export function verifySignedSession(input: { token: string; secret: string; nowMs?: number }): SessionClaims {
  const [payload, signature] = input.token.split(".");
  if (!payload || !signature) {
    throw new Error("Session token is malformed.");
  }
  const expected = signPayload(payload, input.secret);
  if (!safeEqual(signature, expected)) {
    throw new Error("Session token signature is invalid.");
  }
  const claims = parseSessionClaims(JSON.parse(base64UrlDecode(payload)));
  const nowMs = input.nowMs ?? Date.now();
  if (Date.parse(claims.expiresAt) <= nowMs) {
    throw new Error("Session token has expired.");
  }
  return claims;
}

export function createSessionCookie(input: {
  cookieName?: string;
  token: string;
  expiresAt: string;
  secure?: boolean;
}): string {
  const parts = [
    `${input.cookieName ?? "gideon_session"}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(input.expiresAt).toUTCString()}`
  ];
  if (input.secure !== false) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readSessionTokenFromCookieHeader(cookieHeader: string | undefined, cookieName = "gideon_session"): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return null;
}

export function assertCsrfToken(claims: Pick<SessionClaims, "csrfToken">, providedToken: string | undefined): void {
  if (!providedToken || !safeEqual(providedToken, claims.csrfToken)) {
    throw new Error("CSRF token is invalid.");
  }
}

function parseSessionClaims(value: unknown): SessionClaims {
  if (!isObject(value)) {
    throw new Error("Session token payload is invalid.");
  }
  const claims = value as Partial<SessionClaims>;
  if (
    claims.version !== 1 ||
    !claims.sessionId ||
    !claims.userId ||
    !claims.authSubject ||
    !claims.workspaceId ||
    !claims.csrfToken ||
    !claims.issuedAt ||
    !claims.expiresAt
  ) {
    throw new Error("Session token payload is missing required claims.");
  }
  return claims as SessionClaims;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
