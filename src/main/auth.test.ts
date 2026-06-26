import { describe, expect, it } from "vitest";
import {
  assertCsrfToken,
  createSessionCookie,
  createSignedSession,
  loadAuthConfig,
  readSessionTokenFromCookieHeader,
  verifySignedSession
} from "./auth";

describe("hosted auth session primitives", () => {
  it("loads signed-session configuration from environment", () => {
    const config = loadAuthConfig({
      GIDEON_SESSION_COOKIE_NAME: "gideon_custom",
      GIDEON_SESSION_SECRET: "secret",
      GIDEON_SESSION_DURATION_SECONDS: "3600",
      GIDEON_SECURE_COOKIES: "false"
    });

    expect(config).toEqual({
      sessionCookieName: "gideon_custom",
      sessionSecret: "secret",
      sessionDurationSeconds: 3600,
      secureCookies: false
    });
  });

  it("creates and verifies HMAC-signed session tokens", () => {
    const created = createSignedSession({
      secret: "session-secret",
      userId: "user-1",
      authSubject: "oidc|abc",
      workspaceId: "workspace-1",
      csrfToken: "csrf-1",
      sessionId: "session-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z"),
      durationSeconds: 60
    });

    expect(
      verifySignedSession({
        token: created.token,
        secret: "session-secret",
        nowMs: Date.parse("2026-06-25T12:00:30.000Z")
      })
    ).toEqual(created.claims);

    expect(() =>
      verifySignedSession({
        token: `${created.token.slice(0, -1)}x`,
        secret: "session-secret",
        nowMs: Date.parse("2026-06-25T12:00:30.000Z")
      })
    ).toThrow("signature is invalid");

    expect(() =>
      verifySignedSession({
        token: created.token,
        secret: "session-secret",
        nowMs: Date.parse("2026-06-25T12:01:01.000Z")
      })
    ).toThrow("expired");
  });

  it("creates secure cookies, reads them back, and validates CSRF tokens", () => {
    const created = createSignedSession({
      secret: "session-secret",
      userId: "user-1",
      authSubject: "oidc|abc",
      workspaceId: "workspace-1",
      csrfToken: "csrf-1",
      nowMs: Date.parse("2026-06-25T12:00:00.000Z")
    });
    const cookie = createSessionCookie({
      cookieName: "gideon_session",
      token: created.token,
      expiresAt: created.claims.expiresAt
    });

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(readSessionTokenFromCookieHeader(`other=value; ${cookie}`, "gideon_session")).toBe(created.token);
    expect(() => assertCsrfToken(created.claims, "csrf-1")).not.toThrow();
    expect(() => assertCsrfToken(created.claims, "wrong")).toThrow("CSRF token is invalid");
  });
});
