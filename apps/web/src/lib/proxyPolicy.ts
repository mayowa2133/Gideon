const allowedRequestHeaders = ["cookie", "content-type", "x-csrf-token", "idempotency-key", "x-request-id"] as const;
const allowedResponseHeaders = ["content-type", "cache-control", "location", "set-cookie", "x-request-id"] as const;

export function captureApiTarget(baseUrl: string, segments: string[], search: string): URL {
  if (segments.length < 2 || segments[0] !== "api" || segments[1] !== "v1") throw new Error("Hosted API path is not allowed.");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) throw new Error("Hosted API path is invalid.");
  const base = new URL(baseUrl);
  if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("Hosted API base URL must use HTTP or HTTPS.");
  const target = new URL(segments.map(encodeURIComponent).join("/"), `${base.toString().replace(/\/$/, "")}/`);
  target.search = search;
  return target;
}

export function proxyRequestHeaders(source: Headers): Headers {
  const result = new Headers({ accept: "application/json" });
  for (const key of allowedRequestHeaders) { const value = source.get(key); if (value) result.set(key, value); }
  return result;
}

export function proxyResponseHeaders(source: Headers): Headers {
  const result = new Headers();
  for (const key of allowedResponseHeaders) { const value = source.get(key); if (value) result.set(key, value); }
  result.set("x-content-type-options", "nosniff");
  return result;
}

export function assertProxyBodySize(contentLength: string | null, byteLength: number, maxBytes = 1_048_576): void {
  const declared = contentLength ? Number(contentLength) : byteLength;
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes || byteLength > maxBytes) throw new Error("Hosted API request body is too large.");
}
