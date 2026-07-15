import { describe, expect, it } from "vitest";
import { isPublicAddress, validateCaptureNetworkDestination } from "./captureNetworkPolicy";
import type { BrowserExecutionPolicy } from "../shared/productFlowCapture";

const policy: BrowserExecutionPolicy = {
  baseUrl: "https://demo.example.com",
  allowedDomains: ["demo.example.com"],
  allowedRisks: ["observe", "navigate", "synthetic_write"],
  allowedKeys: ["Enter", "Escape", "Tab"],
  allowHttpLocalhost: false,
  allowSubdomains: false,
  allowCredentialInjectionFromLoginAdapter: true,
  maxSteps: 100
};

describe("capture network policy", () => {
  it("creates a versioned receipt only when every resolved address is public", async () => {
    const receipt = await validateCaptureNetworkDestination("/app", policy, {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }
      ],
      now: () => "2026-07-14T10:00:00.000Z"
    });
    expect(receipt).toEqual({
      schemaVersion: "1",
      url: "https://demo.example.com/app",
      hostname: "demo.example.com",
      resolvedAddresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
      validatedAt: "2026-07-14T10:00:00.000Z",
      policyVersion: "capture-network-v1"
    });
  });

  it("rejects mixed public/private DNS answers to prevent rebinding", async () => {
    await expect(
      validateCaptureNetworkDestination("https://demo.example.com", policy, {
        lookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "169.254.169.254", family: 4 }
        ]
      })
    ).rejects.toThrow("private or reserved network address");
  });

  it("rejects resolution failure, empty results, external domains, and URL credentials", async () => {
    await expect(
      validateCaptureNetworkDestination("https://demo.example.com", policy, {
        lookup: async () => {
          throw new Error("DNS failed");
        }
      })
    ).rejects.toThrow("could not be resolved");
    await expect(
      validateCaptureNetworkDestination("https://demo.example.com", policy, { lookup: async () => [] })
    ).rejects.toThrow("did not resolve");
    await expect(validateCaptureNetworkDestination("https://evil.example", policy)).rejects.toThrow(
      "domain is not allowed"
    );
    await expect(validateCaptureNetworkDestination("https://user:pass@demo.example.com", policy)).rejects.toThrow(
      "credentials are forbidden"
    );
  });

  it("permits localhost only through the explicit local-preview policy", async () => {
    const localPolicy = {
      ...policy,
      baseUrl: "http://localhost:4173",
      allowedDomains: ["localhost"],
      allowHttpLocalhost: true
    };
    await expect(validateCaptureNetworkDestination("/app", localPolicy)).resolves.toMatchObject({
      hostname: "localhost",
      resolvedAddresses: ["127.0.0.1"]
    });
    await expect(
      validateCaptureNetworkDestination("http://localhost:4173/app", { ...localPolicy, allowHttpLocalhost: false })
    ).rejects.toThrow("require HTTPS");
  });

  it("classifies private, reserved, documentation, and public addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "ff00::1",
      "2001:db8::1"
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
