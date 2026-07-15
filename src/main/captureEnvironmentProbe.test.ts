import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { probeCaptureEnvironmentReachability } from "./captureEnvironmentProbe";

describe("capture environment reachability probe", () => {
  const servers: http.Server[] = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  it("pins requests to validated addresses and follows only policy-approved redirects", async () => {
    const server = http.createServer((request, response) => {
      if (request.url === "/") { response.statusCode = 302; response.setHeader("location", "/ready"); }
      else response.statusCode = 204;
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture failed");
    const baseUrl = `http://localhost:${address.port}`;
    const receipt = await probeCaptureEnvironmentReachability(baseUrl, policy(baseUrl), { lookup: async () => [{ address: "127.0.0.1", family: 4 }] });
    expect(receipt).toMatchObject({ statusCode: 204, finalUrl: `${baseUrl}/ready`, redirects: [`${baseUrl}/ready`] });
  });

  it("blocks a redirect to a domain outside policy before connecting", async () => {
    const server = http.createServer((_request, response) => { response.statusCode = 302; response.setHeader("location", "https://evil.example.test/"); response.end(); });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture failed");
    const baseUrl = `http://localhost:${address.port}`;
    await expect(probeCaptureEnvironmentReachability(baseUrl, policy(baseUrl), { lookup: async () => [{ address: "127.0.0.1", family: 4 }] })).rejects.toThrow("not allowed");
  });
});

function policy(baseUrl: string) { return { baseUrl, allowedDomains: ["localhost"], allowedRisks: ["observe", "navigate"] as const, allowedKeys: ["Enter"] as const, allowHttpLocalhost: true, allowSubdomains: false, allowCredentialInjectionFromLoginAdapter: false, maxSteps: 20 }; }
