import dns from "node:dns/promises";
import net from "node:net";
import type { BrowserExecutionPolicy } from "../shared/productFlowCapture";

export interface CaptureNetworkValidationReceipt {
  schemaVersion: "1";
  url: string;
  hostname: string;
  resolvedAddresses: string[];
  validatedAt: string;
  policyVersion: string;
}

export interface CaptureNetworkPolicyOptions {
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  now?: () => string;
  policyVersion?: string;
}

export async function validateCaptureNetworkDestination(
  rawUrl: string,
  policy: BrowserExecutionPolicy,
  options: CaptureNetworkPolicyOptions = {}
): Promise<CaptureNetworkValidationReceipt> {
  const url = parseAndAuthorizeUrl(rawUrl, policy);
  const hostname = normalizeHostname(url.hostname);
  const local = isLocalHostname(hostname);
  if (local) {
    if (!policy.allowHttpLocalhost) throw new Error("Local preview destinations are not enabled.");
    return {
      schemaVersion: "1",
      url: url.toString(),
      hostname,
      resolvedAddresses: [hostname === "localhost" ? "127.0.0.1" : hostname],
      validatedAt: options.now?.() ?? new Date().toISOString(),
      policyVersion: options.policyVersion ?? "capture-network-v1"
    };
  }

  const lookup = options.lookup ?? (async (host) => dns.lookup(host, { all: true, verbatim: true }));
  let results: Array<{ address: string; family: number }>;
  try {
    results = await lookup(hostname);
  } catch {
    throw new Error("Capture destination could not be resolved.");
  }
  if (results.length === 0) throw new Error("Capture destination did not resolve to an address.");
  const addresses = [...new Set(results.map((result) => normalizeAddress(result.address)))];
  for (const address of addresses) {
    if (!isPublicAddress(address)) {
      throw new Error("Capture destination resolved to a private or reserved network address.");
    }
  }
  return {
    schemaVersion: "1",
    url: url.toString(),
    hostname,
    resolvedAddresses: addresses,
    validatedAt: options.now?.() ?? new Date().toISOString(),
    policyVersion: options.policyVersion ?? "capture-network-v1"
  };
}

function parseAndAuthorizeUrl(rawUrl: string, policy: BrowserExecutionPolicy): URL {
  let url: URL;
  try {
    url = new URL(rawUrl, policy.baseUrl);
  } catch {
    throw new Error("Capture destination URL is invalid.");
  }
  if (url.username || url.password) throw new Error("Capture destination URL credentials are forbidden.");
  const hostname = normalizeHostname(url.hostname);
  const local = isLocalHostname(hostname);
  if (url.protocol !== "https:" && !(local && policy.allowHttpLocalhost && url.protocol === "http:")) {
    throw new Error("Capture destinations require HTTPS except for approved local previews.");
  }
  if (!domainAllowed(hostname, policy)) throw new Error("Capture destination domain is not allowed.");
  return url;
}

function domainAllowed(hostname: string, policy: BrowserExecutionPolicy): boolean {
  return policy.allowedDomains.map(normalizeHostname).some(
    (domain) => hostname === domain || (policy.allowSubdomains && hostname.endsWith(`.${domain}`))
  );
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^\.+|\.+$/g, "");
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped?.[1] ?? normalized;
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first = 0, second = 0, third = 0] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith("ff")) return false;
  if (normalized.startsWith("2001:db8")) return false;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped?.[1] ? isPublicIpv4(mapped[1]) : true;
}
