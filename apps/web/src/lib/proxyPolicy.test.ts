import { describe, expect, it } from "vitest";
import { assertProxyBodySize, captureApiTarget, proxyRequestHeaders, proxyResponseHeaders } from "./proxyPolicy";

describe("hosted web proxy policy", () => {
  it("allows only encoded /api/v1 paths on an HTTP(S) upstream", () => {
    expect(captureApiTarget("https://api.example.test/base", ["api", "v1", "projects", "project 1"], "?limit=20").toString()).toBe("https://api.example.test/base/api/v1/projects/project%201?limit=20");
    expect(() => captureApiTarget("https://api.example.test", ["internal", "secrets"], "")).toThrow("not allowed");
    expect(() => captureApiTarget("file:///tmp", ["api", "v1", "projects"], "")).toThrow("HTTP or HTTPS");
  });

  it("drops authorization and arbitrary forwarding headers", () => {
    const request = proxyRequestHeaders(new Headers({ cookie: "session=ok", authorization: "Bearer no", "x-csrf-token": "csrf", "x-forwarded-host": "evil" }));
    expect(request.get("cookie")).toBe("session=ok");
    expect(request.get("x-csrf-token")).toBe("csrf");
    expect(request.has("authorization")).toBe(false);
    expect(request.has("x-forwarded-host")).toBe(false);
    const response = proxyResponseHeaders(new Headers({ "content-type": "application/json", "x-private-key": "no" }));
    expect(response.get("x-content-type-options")).toBe("nosniff");
    expect(response.has("x-private-key")).toBe(false);
  });

  it("rejects oversized declared and actual bodies", () => {
    expect(() => assertProxyBodySize("2000000", 1)).toThrow("too large");
    expect(() => assertProxyBodySize(null, 2_000_000)).toThrow("too large");
  });
});
