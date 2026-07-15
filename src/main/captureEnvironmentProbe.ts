import http from "node:http";
import https from "node:https";
import type { LookupAddress } from "node:dns";
import type { BrowserExecutionPolicy } from "../shared/productFlowCapture";
import { validateCaptureNetworkDestination, type CaptureNetworkPolicyOptions } from "./captureNetworkPolicy";

export interface CaptureEnvironmentProbeReceipt {
  finalUrl: string;
  statusCode: number;
  redirects: string[];
  resolvedAddresses: string[];
}

export async function probeCaptureEnvironmentReachability(
  baseUrl: string,
  policy: BrowserExecutionPolicy,
  options: CaptureNetworkPolicyOptions & { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<CaptureEnvironmentProbeReceipt> {
  let current = new URL(baseUrl);
  const redirects: string[] = [];
  const addresses = new Set<string>();
  for (let count = 0; count <= (options.maxRedirects ?? 5); count += 1) {
    const network = await validateCaptureNetworkDestination(current.toString(), policy, options);
    network.resolvedAddresses.forEach((address) => addresses.add(address));
    const response = await head(current, network.resolvedAddresses, options.timeoutMs ?? 10_000);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      if (count === (options.maxRedirects ?? 5)) throw new Error("Capture environment has too many redirects.");
      current = new URL(response.location, current);
      redirects.push(current.toString());
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 500) throw new Error("Capture environment did not return a usable response.");
    return { finalUrl: current.toString(), statusCode: response.statusCode, redirects, resolvedAddresses: [...addresses].sort() };
  }
  throw new Error("Capture environment could not be reached.");
}

function head(url: URL, validatedAddresses: string[], timeoutMs: number): Promise<{ statusCode: number; location?: string }> {
  return new Promise((resolve, reject) => {
    let addressIndex = 0;
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: "HEAD",
      timeout: timeoutMs,
      headers: { "User-Agent": "Gideon-Capture-Validator/1", Accept: "text/html,application/xhtml+xml" },
      servername: url.hostname,
      lookup(_hostname, lookupOptions, callback) {
        const all = typeof lookupOptions === "object" && lookupOptions.all;
        const records: LookupAddress[] = validatedAddresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
        if (all) callback(null, records);
        else {
          const record = records[addressIndex++ % records.length];
          if (!record) callback(new Error("No validated destination address is available."), "", 4);
          else callback(null, record.address, record.family);
        }
      }
    }, (response) => {
      response.resume();
      resolve({ statusCode: response.statusCode ?? 0, location: typeof response.headers.location === "string" ? response.headers.location : undefined });
    });
    request.on("timeout", () => request.destroy(new Error("Capture environment probe timed out.")));
    request.on("error", () => reject(new Error("Capture environment could not be reached securely.")));
    request.end();
  });
}
