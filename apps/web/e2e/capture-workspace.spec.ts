import { expect, test, type Page, type Route } from "@playwright/test";

test("reviews discovered intent before capture and activates an explicit assembly", async ({ page }) => {
  const state = { discoveryReads: 0, captureReads: 0, approved: false, flowRevision: 1, flowTitle: "Create a campaign", mutations: [] as string[] };
  await mockCaptureApi(page, state);
  await page.goto("/projects/project-1/capture");

  await expect(page.getByRole("heading", { name: "Prepare a resettable product environment" })).toBeVisible();
  await page.getByRole("button", { name: "2 Discover Propose workflows" }).click();
  await page.getByRole("button", { name: "Discover workflows" }).click();
  await expect(page.getByRole("heading", { name: "Approve the workflows worth recording" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Create a campaign" })).toBeVisible();

  await page.getByRole("button", { name: "Edit proposal" }).click();
  await page.getByLabel("Flow title").fill("Create a launch campaign");
  await page.getByRole("button", { name: "Save as new draft revision" }).click();
  await expect(page.getByRole("heading", { name: "Create a launch campaign" })).toBeVisible();
  await page.getByRole("button", { name: "Approve revision" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "4 Capture Record clean takes" }).click();
  await page.getByRole("checkbox", { name: /Create a launch campaign/ }).check();
  await page.getByRole("button", { name: "Capture 1 flow" }).click();

  await expect(page.getByRole("heading", { name: "Review clips, coverage, and the final source" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("1/1 verified")).toBeVisible();
  await expect(page.getByText("Video quality")).toBeVisible();
  await expect(page.getByText("frozen frames")).toBeVisible();
  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /^data:video\/mp4/);
  await expect(page.getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: "Activate selected assembly" }).click();
  await expect(page.getByText(/Assembly queued/)).toBeVisible();
  await expect(page.getByText(/Assembly activated as the project source recording/)).toBeVisible({ timeout: 8_000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Review clips, coverage, and the final source" })).toBeVisible();
  await expect(page.getByText("1/1 verified")).toBeVisible();

  expect(state.mutations).toEqual(expect.arrayContaining(["discovery", "revise", "approve", "capture", "preview", "assembly"]));
});

test("keeps capture hidden when the isolated runtime is missing", async ({ page }) => {
  await page.route(/\/api\/gideon\/api\/v1\/.*/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session")) return respond(route, session());
    return respond(route, { capture: { available: false, environmentValidation: true, credentialVault: true, isolatedRuntime: false, discovery: true, capture: true, assembly: true, clipPreview: true, coverage: true, audit: true } });
  });
  await page.goto("/projects/project-1/capture");
  await expect(page.getByRole("heading", { name: "This deployment isn’t ready to record products safely." })).toBeVisible();
  await expect(page.getByText("Missing: isolated runtime")).toBeVisible();
  await expect(page.getByRole("button", { name: "Discover workflows" })).toHaveCount(0);
});

async function mockCaptureApi(page: Page, state: { discoveryReads: number; captureReads: number; approved: boolean; flowRevision: number; flowTitle: string; mutations: string[] }) {
  await page.route(/\/api\/gideon\/api\/v1\/.*/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET") expect(request.headers()["x-csrf-token"]).toBe("csrf-1");
    if (path.endsWith("/auth/session")) return respond(route, session());
    if (path.endsWith("/capture-capabilities")) return respond(route, { capture: { available: true, environmentValidation: true, credentialVault: true, isolatedRuntime: true, discovery: true, capture: true, assembly: true, clipPreview: true, coverage: true, audit: true } });
    if (path.endsWith("/capture-environments") && method === "GET") return respond(route, { environments: [environment] });
    if (path.endsWith("/capture-personas") && method === "GET") return respond(route, { personas: [persona] });
    if (path.endsWith("/product-flows") && method === "GET") return respond(route, { flows: [flow(state)] });
    if (path.endsWith("/discovery-runs") && method === "POST") { state.mutations.push("discovery"); expect(request.headers()["idempotency-key"]).toBeTruthy(); return respond(route, { discoveryRun: discoveryRun("queued"), job: job("discovery-job"), reused: false }, 202); }
    if (path.endsWith("/discovery-runs/discovery-1") && method === "GET") { state.discoveryReads += 1; return respond(route, { discoveryRun: discoveryRun(state.discoveryReads >= 1 ? "ready_for_review" : "inventory") }); }
    if (path.endsWith("/product-flows/flow-1") && method === "PATCH") { const body = request.postDataJSON() as { flow: { revision: number; title: string } }; state.mutations.push("revise"); state.flowRevision = body.flow.revision; state.flowTitle = body.flow.title; state.approved = false; return respond(route, { flow: flow(state) }); }
    if (path.endsWith("/product-flows/flow-1/approve")) { state.mutations.push("approve"); state.approved = true; return respond(route, { flow: flow(state) }); }
    if (path.endsWith("/capture-runs") && method === "POST") { state.mutations.push("capture"); expect(request.headers()["idempotency-key"]).toBeTruthy(); return respond(route, { captureRun: captureRun("queued"), job: job("capture-job"), reused: false }, 202); }
    if (path.endsWith("/capture-runs/capture-1") && method === "GET") { state.captureReads += 1; return respond(route, { captureRun: captureRun(state.captureReads >= 1 ? "completed" : "recording"), executions: state.captureReads >= 1 ? [execution] : [] }); }
    if (path.endsWith("/flow-executions/execution-1/preview-url")) { state.mutations.push("preview"); return respond(route, { preview: { executionId: "execution-1", artifactId: "artifact-1", contentType: "video/mp4", url: "data:video/mp4;base64,AAAA", expiresAt: "2026-07-14T10:05:00.000Z" } }); }
    if (path.endsWith("/coverage-snapshots/latest")) return respond(route, { coverageSnapshot: { id: "coverage-1", projectId: "project-1", environmentVersionId: "version-1", calculationVersion: "capture-coverage-v1", createdAt: "2026-07-14T10:00:00.000Z", dimensions: [{ key: "approved_flow", denominator: 1, denominatorSource: "current_approved_flow_revisions", coveredIds: ["flow-1"], uncoveredIds: [], excluded: [], blocked: [] }] } });
    if (path.endsWith("/capture-runs/capture-1/assemblies")) { state.mutations.push("assembly"); expect(request.headers()["idempotency-key"]).toBeTruthy(); return respond(route, { job: job("assembly-job"), reused: false }, 202); }
    if (path.endsWith("/jobs/assembly-job")) return respond(route, { job: { ...job("assembly-job"), status: "succeeded", userMessage: "Assembly activated" } });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: `No mock for ${method} ${path}` } }) });
  });
}

const environment = { id: "environment-1", projectId: "project-1", name: "Demo", type: "staging", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "ready", resetAdapter: "fixture_api", revision: 1, currentVersionId: "version-1", safeErrorCode: null, updatedAt: "2026-07-14T10:00:00.000Z" };
const persona = { id: "persona-1", projectId: "project-1", environmentId: "environment-1", key: "admin", displayName: "Demo admin", roleDescription: "Administrator", status: "active", revision: 1 };
const execution = { id: "execution-1", captureRunId: "capture-1", flowId: "flow-1", flowRevision: 2, status: "verified", attempt: 1, blockerCode: null, normalizedClipArtifactId: "artifact-1", quality: { status: "warning", checks: [{ code: "frozen_frames", status: "warning" }] }, updatedAt: "2026-07-14T10:00:00.000Z" };
function flow(state: { approved: boolean; flowRevision: number; flowTitle: string }) { return { schemaVersion: "1", id: "flow-1", revision: state.flowRevision, projectId: "project-1", environmentVersionId: "version-1", personaId: "persona-1", title: state.flowTitle, goal: "Create a campaign and verify its dashboard.", startingState: { entryPath: "/app" }, steps: [{ id: "step-1", intent: "Open campaign creation.", riskClass: "navigate", action: { type: "click" } }], finalAssertions: [{ type: "visible" }], approval: state.approved ? { status: "approved", approvedRevision: state.flowRevision } : { status: "draft" }, sourceEvidenceIds: ["goal-1", "page-dashboard"] }; }
function discoveryRun(status: string) { return { id: "discovery-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "discovery-job", status, safeErrorCode: null, updatedAt: "2026-07-14T10:00:00.000Z" }; }
function captureRun(status: string) { return { id: "capture-1", projectId: "project-1", environmentVersionId: "version-1", jobId: "capture-job", status, flowRevisionIds: ["flow-1:revision:2"], estimatedBrowserSeconds: 48, updatedAt: "2026-07-14T10:00:00.000Z" }; }
function job(id: string) { return { id, projectId: "project-1", kind: "test", status: "queued", userMessage: "Queued", updatedAt: "2026-07-14T10:00:00.000Z" }; }
function session() { return { session: { user: { id: "user-1", displayName: "Founder" }, workspace: { id: "workspace-1", name: "Demo" }, role: "owner" }, csrfToken: "csrf-1" }; }
async function respond(route: Route, data: unknown, status = 200) { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data, meta: { requestId: "req-e2e" } }) }); }
