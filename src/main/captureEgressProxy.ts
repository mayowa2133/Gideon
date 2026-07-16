import http from "node:http";
import net from "node:net";
import type { BrowserExecutionPolicy } from "../shared/productFlowCapture";
import { validateCaptureNetworkDestination, type CaptureNetworkPolicyOptions } from "./captureNetworkPolicy";

export interface CaptureEgressProxyConfig {
  listenHost: string;
  listenPort: number;
  policy: BrowserExecutionPolicy;
  allowedPorts: number[];
  connectTimeoutMs: number;
  networkPolicyOptions?: CaptureNetworkPolicyOptions;
}

export async function authorizeCaptureProxyTarget(authority: string, config: Pick<CaptureEgressProxyConfig, "policy" | "allowedPorts" | "networkPolicyOptions">): Promise<{ hostname: string; port: number; address: string }> {
  if (typeof authority !== "string" || !authority || authority.length > 500 || /[\u0000-\u0020\u007f]/.test(authority)) throw new Error("Capture egress target is invalid.");
  let url: URL;
  try { url = new URL(`https://${authority}/`); } catch { throw new Error("Capture egress target is invalid."); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Capture egress target is invalid.");
  const port = Number(url.port || 443);
  if (!Number.isInteger(port) || !config.allowedPorts.includes(port)) throw new Error("Capture egress target port is not allowed.");
  const receipt = await validateCaptureNetworkDestination(url.toString(), config.policy, config.networkPolicyOptions);
  const address = receipt.resolvedAddresses[0];
  if (!address) throw new Error("Capture egress target did not resolve safely.");
  return { hostname: receipt.hostname, port, address };
}

export function createCaptureEgressProxy(configInput: CaptureEgressProxyConfig): { server: http.Server; close(): Promise<void> } {
  const config = validateConfig(configInput);
  const server = http.createServer((_request, response) => {
    response.writeHead(405, { "content-type": "text/plain", connection: "close", "cache-control": "no-store" });
    response.end("HTTPS CONNECT is required.\n");
  });
  server.on("connect", (request, clientSocket, head) => {
    void authorizeCaptureProxyTarget(request.url ?? "", config).then((target) => {
      const upstream = net.connect({ host: target.address, port: target.port });
      const timer = setTimeout(() => upstream.destroy(new Error("Capture egress connection timed out.")), config.connectTimeoutMs);
      upstream.once("connect", () => {
        clearTimeout(timer);
        clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: Gideon-Capture-Egress\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.once("error", () => {
        clearTimeout(timer);
        if (!clientSocket.destroyed) clientSocket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      });
      clientSocket.once("error", () => upstream.destroy());
      clientSocket.once("close", () => upstream.destroy());
    }).catch(() => {
      if (!clientSocket.destroyed) clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    });
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
  return { server, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export function captureEgressProxyConfigFromEnv(env: NodeJS.ProcessEnv): CaptureEgressProxyConfig {
  const baseUrl = required(env.GIDEON_CAPTURE_BASE_URL, "capture base URL");
  const base = new URL(baseUrl);
  const allowedDomains = required(env.GIDEON_CAPTURE_ALLOWED_DOMAINS, "allowed domains").split(",").map((value) => value.trim()).filter(Boolean);
  if (allowedDomains.length < 1 || allowedDomains.length > 50 || allowedDomains.some((value) => !/^[A-Za-z0-9.-]{1,253}$/.test(value))) throw new Error("Capture egress allowed domains are invalid.");
  const basePort = Number(base.port || 443);
  const allowedPorts = [...new Set([basePort, ...(env.GIDEON_CAPTURE_ALLOWED_PORTS ?? "443").split(",").map(Number)])];
  return validateConfig({
    listenHost: env.GIDEON_CAPTURE_EGRESS_LISTEN_HOST?.trim() || "0.0.0.0",
    listenPort: Number(env.GIDEON_CAPTURE_EGRESS_LISTEN_PORT || 8080),
    policy: { baseUrl, allowedDomains, allowedRisks: ["observe", "navigate", "synthetic_write"], allowedKeys: ["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"], allowHttpLocalhost: false, allowSubdomains: env.GIDEON_CAPTURE_ALLOW_SUBDOMAINS === "true", allowCredentialInjectionFromLoginAdapter: false, maxSteps: 100 },
    allowedPorts,
    connectTimeoutMs: Number(env.GIDEON_CAPTURE_EGRESS_CONNECT_TIMEOUT_MS || 10_000)
  });
}

function validateConfig(value: CaptureEgressProxyConfig): CaptureEgressProxyConfig {
  if (!/^(?:0\.0\.0\.0|127\.0\.0\.1|::)$/.test(value.listenHost) || !integer(value.listenPort, 1024, 65535) || !integer(value.connectTimeoutMs, 1_000, 30_000)) throw new Error("Capture egress proxy configuration is invalid.");
  if (!Array.isArray(value.allowedPorts) || value.allowedPorts.length < 1 || value.allowedPorts.length > 20 || value.allowedPorts.some((port) => !integer(port, 1, 65535))) throw new Error("Capture egress proxy ports are invalid.");
  if (new URL(value.policy.baseUrl).protocol !== "https:" || value.policy.allowHttpLocalhost) throw new Error("Capture egress proxy requires a non-local HTTPS policy.");
  return { ...value, allowedPorts: [...new Set(value.allowedPorts)] };
}
function integer(value: number, minimum: number, maximum: number): boolean { return Number.isInteger(value) && value >= minimum && value <= maximum; }
function required(value: string | undefined, label: string): string { const output = value?.trim(); if (!output) throw new Error(`Set ${label}.`); return output; }
