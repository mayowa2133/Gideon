import { describe, expect, it } from "vitest";
import { runCaptureOperator } from "./captureOperatorCli";

describe("capture operator CLI", () => {
  it("drives a synthetic connection-to-reviewed-output journey without database access", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown; idempotency?: string }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method: init?.method ?? "GET", path: url.pathname, body, idempotency: headers.get("idempotency-key") ?? undefined });
      const data = responseFor(url.pathname, init?.method ?? "GET", body);
      return new Response(JSON.stringify({ data, meta: { requestId: "req-synthetic" } }), { status: url.pathname.endsWith("/discovery-runs") || url.pathname.endsWith("/capture-runs") ? 202 : 200, headers: { "content-type": "application/json" } });
    };
    const outputs: string[] = [];
    const errors: string[] = [];
    const common = {
      fetcher: fetcher as typeof fetch,
      stdout: (value: string) => outputs.push(value),
      stderr: (value: string) => errors.push(value),
      env: { GIDEON_CAPTURE_API_BASE_URL: "https://gideon.example.test", GIDEON_CAPTURE_SESSION_COOKIE: "gideon_session=opaque" },
      readFile: async () => JSON.stringify({ name: "Demo", type: "demo", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], resetAdapter: "fixture_api" })
    };
    const run = (...args: string[]) => runCaptureOperator(args, common);

    expect(await run("capabilities")).toBe(0);
    expect(await run("environment:create", "--project", "project-1", "--manifest", "capture.json")).toBe(0);
    expect(await run("environment:validate", "--project", "project-1", "--environment", "environment-1")).toBe(0);
    expect(await run("discovery:start", "--project", "project-1", "--environment", "environment-1", "--goals", '[{"id":"goal-1","text":"Show the result","priority":100}]')).toBe(0);
    expect(await run("discovery:status", "--project", "project-1", "--run", "discovery-1")).toBe(0);
    expect(await run("flow:list", "--project", "project-1")).toBe(0);
    expect(await run("flow:approve", "--project", "project-1", "--flow", "flow-1", "--revision", "1")).toBe(0);
    expect(await run("capture:start", "--project", "project-1", "--environment", "environment-1", "--flows", "flow-1")).toBe(0);
    expect(await run("capture:status", "--project", "project-1", "--run", "capture-1")).toBe(0);
    expect(await run("evidence:inspect", "--project", "project-1", "--run", "capture-1")).toBe(0);

    expect(errors).toEqual([]);
    expect(calls.some((call) => call.path.endsWith("/flow-1/approve") && JSON.stringify(call.body) === '{"revision":1}')).toBe(true);
    expect(calls.filter((call) => call.path.endsWith("/validate") || call.path.endsWith("/discovery-runs") || call.path.endsWith("/capture-runs")).every((call) => Boolean(call.idempotency))).toBe(true);
    expect(outputs.at(-1)).toContain("bounded quality/coverage receipts");
    expect(JSON.stringify(calls)).not.toContain("opaque");
  });

  it("generates a secret-free manifest and rejects secret or command material", async () => {
    const output: string[] = [];
    expect(await runCaptureOperator(["--", "manifest:template"], { stdout: (value) => output.push(value), stderr: () => undefined })).toBe(0);
    expect(output[0]).not.toMatch(/"password"|"token"|"command"/);
    const errors: string[] = [];
    expect(await runCaptureOperator(["environment:create", "--project", "project-1", "--manifest", "bad.json"], {
      stdout: () => undefined,
      stderr: (value) => errors.push(value),
      env: { GIDEON_CAPTURE_API_BASE_URL: "https://gideon.example.test", GIDEON_CAPTURE_SESSION_COOKIE: "session=opaque" },
      readFile: async () => JSON.stringify({ name: "Bad", password: "private" })
    })).toBe(2);
    expect(errors[0]).toContain("Manifest key 'password' is forbidden");
  });

  it("returns actionable authentication and argument failures", async () => {
    const errors: string[] = [];
    expect(await runCaptureOperator(["capture:status", "--project", "project-1"], { stdout: () => undefined, stderr: (value) => errors.push(value), env: {} })).toBe(2);
    expect(errors[0]).toContain("GIDEON_CAPTURE_SESSION_COOKIE");
  });
});

function responseFor(path: string, method: string, body: Record<string, unknown> | undefined): Record<string, unknown> {
  if (path === "/api/v1/auth/session") return { session: { user: { id: "user-1" } }, csrfToken: "csrf-safe" };
  if (path.endsWith("/capture-capabilities")) return { capture: { available: true, discovery: true, capture: true, coverage: true } };
  if (path.endsWith("/capture-environments") && method === "POST") return { environment: { id: "environment-1", ...body } };
  if (path.endsWith("/validate")) return { environment: { id: "environment-1", status: "ready" }, job: { id: "job-validation" }, reused: false };
  if (path.endsWith("/discovery-runs") && method === "POST") return { discoveryRun: { id: "discovery-1", status: "queued" }, job: { id: "job-discovery" }, reused: false };
  if (path.endsWith("/discovery-runs/discovery-1")) return { discoveryRun: { id: "discovery-1", status: "ready_for_review" } };
  if (path.endsWith("/product-flows")) return { flows: [{ id: "flow-1", revision: 1, approval: { status: "draft" } }] };
  if (path.endsWith("/flow-1/approve")) return { flow: { id: "flow-1", revision: 2, approval: { status: "approved", approvedRevision: 2 } } };
  if (path.endsWith("/capture-runs") && method === "POST") return { captureRun: { id: "capture-1", status: "queued" }, job: { id: "job-capture" }, reused: false };
  if (path.endsWith("/capture-runs/capture-1")) return { captureRun: { id: "capture-1", status: "completed" }, executions: [{ id: "execution-1", status: "verified", quality: { status: "ready", checks: [] } }] };
  if (path.endsWith("/coverage-snapshots/latest")) return { coverageSnapshot: { id: "coverage-1", dimensions: [{ key: "flows", denominator: 1, coveredIds: ["flow-1"], uncoveredIds: [] }] } };
  throw new Error(`Unexpected synthetic route: ${method} ${path}`);
}
