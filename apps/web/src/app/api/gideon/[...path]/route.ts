import { NextRequest, NextResponse } from "next/server";
import { assertProxyBodySize, captureApiTarget, proxyRequestHeaders, proxyResponseHeaders } from "@/lib/proxyPolicy";

const methods = new Set(["GET", "POST", "PATCH", "DELETE"]);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!methods.has(request.method)) return NextResponse.json({ error: { code: "method_not_allowed", message: "Method not allowed." } }, { status: 405 });
  const baseUrl = process.env.GIDEON_HOSTED_API_INTERNAL_URL?.trim();
  if (!baseUrl) return NextResponse.json({ error: { code: "capture_not_configured", message: "Hosted Gideon API is not configured." } }, { status: 503 });
  try {
    const { path } = await context.params;
    const target = captureApiTarget(baseUrl, path, request.nextUrl.search);
    const body = request.method === "GET" ? undefined : Buffer.from(await request.arrayBuffer());
    if (body) assertProxyBodySize(request.headers.get("content-length"), body.byteLength);
    const upstream = await fetch(target, { method: request.method, headers: proxyRequestHeaders(request.headers), body, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    return new NextResponse(upstream.body, { status: upstream.status, headers: proxyResponseHeaders(upstream.headers) });
  } catch (error) {
    const message = error instanceof Error && /(?:path|body|base URL)/i.test(error.message) ? error.message : "Hosted Gideon API is unavailable.";
    const status = /body is too large/i.test(message) ? 413 : /path/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: { code: status === 413 ? "payload_too_large" : status === 400 ? "validation_failed" : "upstream_unavailable", message } }, { status });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
