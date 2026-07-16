import { describe, expect, it } from "vitest";
import { authorizeCaptureProxyTarget, captureEgressProxyConfigFromEnv } from "./captureEgressProxy";

describe("capture egress proxy policy", () => {
  it("connects only to an allowlisted public address and approved port", async () => {
    const config = captureEgressProxyConfigFromEnv({ GIDEON_CAPTURE_BASE_URL: "https://demo.example.test", GIDEON_CAPTURE_ALLOWED_DOMAINS: "demo.example.test", GIDEON_CAPTURE_ALLOWED_PORTS: "443" });
    await expect(authorizeCaptureProxyTarget("demo.example.test:443", { ...config, networkPolicyOptions: { lookup: async () => [{ address: "93.184.216.34", family: 4 }] } })).resolves.toEqual({ hostname: "demo.example.test", port: 443, address: "93.184.216.34" });
    await expect(authorizeCaptureProxyTarget("demo.example.test:8443", config)).rejects.toThrow("port is not allowed");
    await expect(authorizeCaptureProxyTarget("evil.example.test@demo.example.test:443", config)).rejects.toThrow("target is invalid");
    await expect(authorizeCaptureProxyTarget("demo.example.test:443/private", config)).rejects.toThrow("target is invalid");
  });

  it.each(["127.0.0.1:443", "169.254.169.254:443", "metadata.google.internal:443", "evil.example.test:443"])("blocks %s before opening a tunnel", async (authority) => {
    const config = captureEgressProxyConfigFromEnv({ GIDEON_CAPTURE_BASE_URL: "https://demo.example.test", GIDEON_CAPTURE_ALLOWED_DOMAINS: "demo.example.test" });
    await expect(authorizeCaptureProxyTarget(authority, { ...config, networkPolicyOptions: { lookup: async () => [{ address: "169.254.169.254", family: 4 }] } })).rejects.toThrow();
  });

  it("rejects local HTTP policies and unsafe environment configuration", () => {
    expect(() => captureEgressProxyConfigFromEnv({ GIDEON_CAPTURE_BASE_URL: "http://localhost:3000", GIDEON_CAPTURE_ALLOWED_DOMAINS: "localhost" })).toThrow("non-local HTTPS");
    expect(() => captureEgressProxyConfigFromEnv({ GIDEON_CAPTURE_BASE_URL: "https://demo.example.test", GIDEON_CAPTURE_ALLOWED_DOMAINS: "demo.example.test", GIDEON_CAPTURE_ALLOWED_PORTS: "0,70000" })).toThrow("ports are invalid");
  });
});
