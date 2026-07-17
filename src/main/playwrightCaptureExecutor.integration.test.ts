import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrowserExecutionPolicy, ProductFlowRevision } from "../shared/productFlowCapture";
import { compileProductFlow } from "./productFlowCompiler";
import { executePlaywrightCapture } from "./playwrightCaptureExecutor";
import { normalizeBrowserCapture } from "./captureMedia";

const executablePath = findBrowserExecutable();

describe.skipIf(!executablePath)("Playwright capture executor integration", () => {
  let server: http.Server;
  let baseUrl: string;
  let outputDir: string;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      if (request.url === "/new") {
        response.end(`<!doctype html>
          <html><body>
            <label>Project name <input name="project-name" /></label>
            <button type="button" onclick="document.querySelector('[data-result]').textContent = 'Project created: ' + document.querySelector('input').value">Create project</button>
            <p data-result></p>
          </body></html>`);
        return;
      }
      if (request.url === "/delayed") {
        response.end(`<!doctype html><html><body><p>Loading profile</p><script>setTimeout(() => location.href = '/new', 250)</script></body></html>`);
        return;
      }
      if (request.url === "/late-control") {
        response.end(`<!doctype html><html><body><main><p>Loading controls</p></main><script>setTimeout(() => { const button = document.createElement('button'); button.textContent = 'Get started'; button.onclick = () => document.querySelector('main').innerHTML = '<p>Ready</p>'; document.querySelector('main').append(button); }, 250)</script></body></html>`);
        return;
      }
      if (request.url === "/login-state") {
        response.end(`<!doctype html><html><body><label>Password <input type="password" /></label></body></html>`);
        return;
      }
      if (request.url === "/loading-state") {
        response.end(`<!doctype html><html><body><div role="progressbar">Loading fixture</div></body></html>`);
        return;
      }
      if (request.url === "/ambiguous") {
        response.end(`<!doctype html><html><body><button>Continue</button><button>Continue</button></body></html>`);
        return;
      }
      if (request.url === "/durable") {
        response.end(`<!doctype html><html><body><nav aria-label="Personal"><a href="/personal-settings">Settings</a></nav><nav aria-label="Workspace"><a href="/workspace-settings">Settings</a></nav></body></html>`);
        return;
      }
      if (request.url === "/structural") {
        response.end(`<!doctype html><html><body><section aria-label="Personal"><button onclick="document.querySelector('output').textContent='Personal'">Continue</button></section><section aria-label="Workspace"><button onclick="document.querySelector('output').textContent='Workspace'">Continue</button></section><output></output></body></html>`);
        return;
      }
      if (request.url?.startsWith("/privacy-receipt")) {
        response.end(`<!doctype html><html><body><p>Contact founder@example.test</p></body></html>`);
        return;
      }
      if (request.url === "/personal-settings" || request.url === "/workspace-settings") {
        response.end(`<!doctype html><html><body><h1>${request.url === "/workspace-settings" ? "Workspace settings" : "Personal settings"}</h1></body></html>`);
        return;
      }
      response.end(`<!doctype html><html><body><a href="/new">New project</a></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port.");
    baseUrl = `http://localhost:${address.port}`;
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-integration-"));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("dry-runs an approved flow with deterministic assertions and no recording", async () => {
    const result = await executePlaywrightCapture({
      id: "execution-dry-run",
      workspaceId: "workspace-1",
      plan: compileProductFlow(createFlow(), createPolicy(baseUrl)),
      policy: createPolicy(baseUrl),
      fixtureValues: { project_name: "Gideon fixture" },
      outputDir,
      recordVideo: false,
      executablePath,
      now: incrementingClock(),
      networkPolicyOptions: { now: () => "2026-07-14T10:00:00.000Z" }
    });
    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.steps).toHaveLength(3);
    expect(result.receipt.steps.map((step) => step.visualEvidence)).toEqual([
      expect.objectContaining({ schemaVersion: "1", viewport: expect.objectContaining({ width: 1440, height: 900 }), actionTarget: expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }) }),
      expect.objectContaining({ schemaVersion: "1", actionTarget: expect.objectContaining({ width: expect.any(Number) }), resultTarget: expect.objectContaining({ width: expect.any(Number) }) }),
      expect.objectContaining({ schemaVersion: "1", actionTarget: expect.objectContaining({ width: expect.any(Number) }), resultTarget: expect.objectContaining({ width: expect.any(Number) }) })
    ]);
    expect(result.receipt.finalAssertions.every((assertion) => assertion.passed)).toBe(true);
    expect(result.rawCapture).toBeUndefined();
    expect(result.networkReceipts).toEqual([
      expect.objectContaining({ hostname: "localhost", resolvedAddresses: ["127.0.0.1"] })
    ]);
  }, 20_000);

  it("records a clean WebM artifact with a content hash", async () => {
    const result = await executePlaywrightCapture({
      id: "execution-recorded",
      workspaceId: "workspace-1",
      plan: compileProductFlow(createFlow(), createPolicy(baseUrl)),
      policy: createPolicy(baseUrl),
      fixtureValues: { project_name: "Gideon fixture" },
      outputDir,
      recordVideo: true,
      viewport: { width: 960, height: 600 },
      executablePath,
      now: incrementingClock()
    });
    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.steps[0]?.visualEvidence?.viewport).toMatchObject({ width: 960, height: 600 });
    expect(result.rawCapture).toMatchObject({ contentType: "video/webm" });
    expect(result.rawCapture!.byteSize).toBeGreaterThan(1_000);
    expect(result.rawCapture!.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.stat(result.rawCapture!.path)).resolves.toMatchObject({ size: result.rawCapture!.byteSize });
    const normalized = await normalizeBrowserCapture({
      rawCapturePath: result.rawCapture!.path,
      outputPath: path.join(outputDir, "normalized-source.mp4"),
      executionReceiptId: result.receipt.id,
      compiledPlanHash: result.receipt.compiledPlanHash,
      expectedInputSha256: result.rawCapture!.sha256,
      now: () => "2026-07-14T10:05:00.000Z"
    });
    expect(normalized.recording).toMatchObject({ videoCodec: "h264", fps: 30, width: 960, height: 600 });
    expect(normalized.manifest).toMatchObject({
      schemaVersion: "1",
      normalizerVersion: "capture-normalizer-v1",
      executionReceiptId: result.receipt.id,
      input: { sha256: result.rawCapture!.sha256, contentType: "video/webm" },
      output: { contentType: "video/mp4", videoCodec: "h264" }
    });
    expect(normalized.manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  }, 20_000);

  it("waits for an observable browser state instead of checking it only once", async () => {
    const flow = createFlow();
    flow.steps = [
      { id: "open-delayed", intent: "Open a route that settles asynchronously.", action: { type: "navigate", path: "/delayed" }, riskClass: "navigate" },
      { id: "wait-for-new", intent: "Wait for the destination route.", action: { type: "wait_for", assertion: { type: "url", path: "/new" } }, riskClass: "observe" }
    ];
    flow.finalAssertions = [{ type: "url", path: "/new" }];
    const result = await executePlaywrightCapture({
      id: "execution-delayed-state",
      workspaceId: "workspace-1",
      plan: compileProductFlow(flow, createPolicy(baseUrl)),
      policy: createPolicy(baseUrl),
      fixtureValues: {},
      outputDir,
      recordVideo: false,
      executablePath,
      now: incrementingClock()
    });

    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.steps.at(-1)?.status).toBe("succeeded");
  }, 20_000);

  it("waits within the bounded action timeout for asynchronously rendered controls", async () => {
    const flow = createFlow();
    flow.startingState.entryPath = "/late-control";
    flow.steps = [{ id: "start", intent: "Use the control after the application renders.", action: { type: "click", target: { strategy: "role", role: "button", value: "Get started", exact: true } }, riskClass: "navigate" }];
    flow.finalAssertions = [{ type: "text", target: { strategy: "text", value: "Ready", exact: true }, value: "Ready" }];
    const result = await executePlaywrightCapture({ id: "execution-late-control", workspaceId: "workspace-1", plan: compileProductFlow(flow, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, actionTimeoutMs: 2_000, now: incrementingClock() });
    expect(result.receipt).toMatchObject({ status: "verified", steps: [{ status: "succeeded" }] });
  }, 10_000);

  it("returns a failed verification receipt instead of claiming completion", async () => {
    const flow = createFlow();
    flow.finalAssertions = [{ type: "visible", target: { strategy: "text", value: "Impossible result" } }];
    const result = await executePlaywrightCapture({
      id: "execution-failed-assertion",
      workspaceId: "workspace-1",
      plan: compileProductFlow(flow, createPolicy(baseUrl)),
      policy: createPolicy(baseUrl),
      fixtureValues: { project_name: "Gideon fixture" },
      outputDir,
      recordVideo: false,
      executablePath,
      now: incrementingClock()
    });
    expect(result.receipt.status).toBe("failed");
    expect(result.receipt.finalAssertions).toEqual([
      expect.objectContaining({ passed: false, safeMessage: "Expected browser state was not observed." })
    ]);
  }, 20_000);

  it("rejects action timeouts outside the bounded capture policy", async () => {
    await expect(executePlaywrightCapture({
      id: "execution-invalid-timeout",
      workspaceId: "workspace-1",
      plan: compileProductFlow(createFlow(), createPolicy(baseUrl)),
      policy: createPolicy(baseUrl),
      fixtureValues: { project_name: "Gideon fixture" },
      outputDir,
      recordVideo: false,
      actionTimeoutMs: 499
    })).rejects.toThrow("actionTimeoutMs must be an integer from 500 to 30000");
  });

  it("detects ambiguous visible locators before executing an action", async () => {
    const flow = createFlow();
    flow.startingState.entryPath = "/ambiguous";
    flow.steps = [{ id: "ambiguous", intent: "Do not guess between duplicate controls.", action: { type: "click", target: { strategy: "role", role: "button", value: "Continue", exact: true } }, riskClass: "navigate" }];
    flow.finalAssertions = [{ type: "url", path: "/ambiguous" }];
    const result = await executePlaywrightCapture({ id: "execution-ambiguous", workspaceId: "workspace-1", plan: compileProductFlow(flow, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, actionTimeoutMs: 2_000, now: incrementingClock() });
    expect(result.receipt).toMatchObject({ status: "failed", steps: [{ status: "failed", safeErrorCode: "locator_ambiguous" }] });
  }, 10_000);

  it("resolves stable-link and landmark-scoped structural locators", async () => {
    const stable = createFlow();
    stable.startingState.entryPath = "/durable";
    stable.steps = [{ id: "settings", intent: "Open workspace settings.", action: { type: "click", target: { strategy: "stable_link", value: "Settings", destinationPath: "/workspace-settings", exact: true } }, riskClass: "navigate" }];
    stable.finalAssertions = [{ type: "url", path: "/workspace-settings" }];
    const stableResult = await executePlaywrightCapture({ id: "execution-stable-link", workspaceId: "workspace-1", plan: compileProductFlow(stable, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, actionTimeoutMs: 2_000, now: incrementingClock() });
    expect(stableResult.receipt.status).toBe("verified");

    const structural = createFlow();
    structural.startingState.entryPath = "/structural";
    structural.steps = [{ id: "workspace-continue", intent: "Continue within the workspace region.", action: { type: "click", target: { strategy: "structural", scopeRole: "region", scopeName: "Workspace", role: "button", value: "Continue", exact: true } }, riskClass: "navigate" }];
    structural.finalAssertions = [{ type: "text", target: { strategy: "text", value: "Workspace", exact: true }, value: "Workspace" }];
    const structuralResult = await executePlaywrightCapture({ id: "execution-structural", workspaceId: "workspace-1", plan: compileProductFlow(structural, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, actionTimeoutMs: 2_000, now: incrementingClock() });
    expect(structuralResult.receipt.status).toBe("verified");
  }, 15_000);

  it.each([["/login-state", "login"], ["/loading-state", "loading"]] as const)("classifies %s without retaining page text", async (route, expectedSignal) => {
    const flow = createFlow();
    flow.steps = [{ id: "open-state", intent: "Open the synthetic state.", action: { type: "navigate", path: route }, riskClass: "navigate" }];
    flow.finalAssertions = [{ type: "url", path: route }];
    const result = await executePlaywrightCapture({ id: `execution-${expectedSignal}`, workspaceId: "workspace-1", plan: compileProductFlow(flow, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, now: incrementingClock() });
    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.steps[0]?.visualEvidence?.pageSignal).toBe(expectedSignal);
    expect(JSON.stringify(result.receipt.steps[0]?.visualEvidence)).not.toContain("Password");
    expect(JSON.stringify(result.receipt.steps[0]?.visualEvidence)).not.toContain("Loading fixture");
  }, 20_000);

  it("redacts sensitive assertion text from receipts while evaluating the approved assertion", async () => {
    const flow = createFlow();
    flow.steps = [{ id: "open-private-state", intent: "Open the synthetic private state.", action: { type: "navigate", path: "/privacy-receipt?email=founder%40example.test&token=tok_fixture_123456" }, riskClass: "navigate" }];
    flow.finalAssertions = [{ type: "text", target: { strategy: "text", value: "founder@example.test" }, value: "founder@example.test" }];
    const result = await executePlaywrightCapture({ id: "execution-private-receipt", workspaceId: "workspace-1", plan: compileProductFlow(flow, createPolicy(baseUrl)), policy: createPolicy(baseUrl), fixtureValues: {}, outputDir, recordVideo: false, executablePath, now: incrementingClock() });
    expect(result.receipt.status).toBe("verified");
    expect(result.receipt.finalAssertions[0]).toMatchObject({ assertion: { target: { value: "[masked]" }, value: "[masked]" }, passed: true });
    expect(JSON.stringify(result.receipt)).not.toContain("founder@example.test");
    expect(JSON.stringify(result.networkReceipts)).not.toMatch(/founder|tok_fixture|\?/);
  }, 20_000);
});

function createFlow(): ProductFlowRevision {
  return {
    schemaVersion: "1",
    id: "flow-create-project",
    revision: 1,
    projectId: "project-1",
    environmentVersionId: "environment-version-1",
    personaId: "persona-founder",
    title: "Create the first project",
    goal: "Create a project and verify the visible success result.",
    startingState: { entryPath: "/" },
    steps: [
      {
        id: "open-form",
        intent: "Open project creation.",
        action: { type: "click", target: { strategy: "role", role: "link", value: "New project" } },
        expectedState: [{ type: "url", path: "/new" }],
        riskClass: "navigate"
      },
      {
        id: "fill-name",
        intent: "Enter a synthetic project name.",
        action: {
          type: "fill",
          target: { strategy: "label", value: "Project name" },
          valueRef: "fixture:project_name"
        },
        expectedState: [
          { type: "value", target: { strategy: "label", value: "Project name" }, valueRef: "fixture:project_name" }
        ],
        riskClass: "synthetic_write"
      },
      {
        id: "create-project",
        intent: "Create the synthetic project.",
        action: { type: "click", target: { strategy: "role", role: "button", value: "Create project" } },
        expectedState: [{ type: "visible", target: { strategy: "text", value: "Project created" } }],
        riskClass: "synthetic_write"
      }
    ],
    finalAssertions: [
      { type: "text", target: { strategy: "text", value: "Project created" }, value: "Gideon fixture" }
    ],
    approval: {
      status: "approved",
      approvedBy: "user-1",
      approvedAt: "2026-07-14T10:00:00.000Z",
      approvedRevision: 1
    },
    sourceEvidenceIds: ["test:fixture-create-project"]
  };
}

function createPolicy(baseUrl: string): BrowserExecutionPolicy {
  return {
    baseUrl,
    allowedDomains: ["localhost"],
    allowedRisks: ["observe", "navigate", "synthetic_write"],
    allowedKeys: ["Enter", "Escape", "Tab"],
    allowHttpLocalhost: true,
    allowSubdomains: false,
    allowCredentialInjectionFromLoginAdapter: false,
    maxSteps: 20
  };
}

function incrementingClock(): () => string {
  let timestamp = Date.parse("2026-07-14T10:00:00.000Z");
  return () => new Date(timestamp++).toISOString();
}

function findBrowserExecutable(): string | undefined {
  const explicit = process.env.GIDEON_CAPTURE_BROWSER_EXECUTABLE?.trim();
  const candidates = [
    explicit,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}
