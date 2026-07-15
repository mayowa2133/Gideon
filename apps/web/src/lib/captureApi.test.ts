import { describe, expect, it } from "vitest";
import { CaptureApi, CaptureApiError, stableHash } from "./captureApi";

describe("capture API client", () => {
  it("discovers CSRF before mutation and sends an idempotency key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/auth/session")) return json(200, { data: { session: { user: { id: "user-1", displayName: "Founder" }, workspace: { id: "workspace-1", name: "Demo" }, role: "owner" }, csrfToken: "csrf-1" } });
      return json(202, { data: { captureRun: { id: "run-1", status: "queued" }, job: { id: "job-1" }, reused: false } });
    };
    const client = new CaptureApi("/proxy", fetcher as typeof fetch);
    await client.startCapture("project-1", { environmentId: "environment-1", flowIds: ["flow-1"] });
    expect(calls).toHaveLength(2);
    const headers = calls[1]!.init!.headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("csrf-1");
    expect(headers.get("idempotency-key")).toMatch(/^capture:[a-f0-9]{8}:/);
    expect(calls[1]!.init!.credentials).toBe("same-origin");
  });

  it("returns safe structured API errors", async () => {
    const client = new CaptureApi("/proxy", (async () => json(503, { error: { code: "capture_not_configured", message: "Capture unavailable." }, meta: { requestId: "req-1" } })) as typeof fetch);
    await expect(client.capabilities()).rejects.toMatchObject({ status: 503, code: "capture_not_configured", requestId: "req-1" } satisfies Partial<CaptureApiError>);
  });

  it("uses a deterministic compact non-secret hash", () => {
    expect(stableHash("environment-1:flow-1")).toBe(stableHash("environment-1:flow-1"));
    expect(stableHash("environment-1:flow-2")).not.toBe(stableHash("environment-1:flow-1"));
  });

  it("lists projects and saves edited flows as complete API envelopes", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/projects")) return json(200, { data: { projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Launch", productName: "Gideon", status: "draft", updatedAt: "2026-07-14T00:00:00.000Z" }] } });
      if (String(url).endsWith("/auth/session")) return json(200, { data: { session: { user: { id: "user-1", displayName: "Founder" }, workspace: { id: "workspace-1", name: "Demo" }, role: "owner" }, csrfToken: "csrf-1" } });
      return json(200, { data: { flow: { id: "flow-1", revision: 2 } } });
    };
    const client = new CaptureApi("/proxy", fetcher as typeof fetch);
    await expect(client.listProjects()).resolves.toMatchObject([{ id: "project-1", name: "Launch" }]);
    const flow: import("./captureApi").ProductFlowDto = { schemaVersion: "1", id: "flow-1", revision: 2, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: "Edited", goal: "Show proof", startingState: { entryPath: "/app" }, steps: [], finalAssertions: [], approval: { status: "draft" }, sourceEvidenceIds: [] };
    await client.reviseFlow("project-1", flow);
    expect(calls.at(-1)?.init?.method).toBe("PATCH");
    expect((calls.at(-1)?.init?.headers as Headers).get("x-csrf-token")).toBe("csrf-1");
    expect(JSON.parse(String(calls.at(-1)?.init?.body))).toEqual({ flow });
  });
});

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
