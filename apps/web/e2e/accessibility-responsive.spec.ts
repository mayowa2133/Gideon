import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const evidence: Array<{ viewport: string; width: number; height: number; axeViolations: Array<{ id: string; impact: string | null; nodes: number }>; passes: number; horizontalOverflow: boolean }> = [];
const outputPath = path.resolve(__dirname, "../../../tmp/capture-accessibility/accessibility-evidence.json");

test.afterAll(async () => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    scope: "synthetic hosted structured-capture setup surface",
    automatedStandard: "axe-core WCAG 2 A/AA plus responsive overflow, keyboard focus, announcements, and reduced-motion checks",
    results: evidence,
    totals: { viewports: evidence.length, violations: evidence.reduce((sum, item) => sum + item.axeViolations.length, 0), horizontalOverflow: evidence.filter((item) => item.horizontalOverflow).length },
    redaction: { pageText: "omitted", html: "omitted", selectors: "omitted", urls: "omitted", screenshots: "local_ignored_only" },
    humanReviewRequired: ["assistive-technology usability", "meaningful focus order across complete real workflows", "visual contrast under real displays", "caption accuracy and comprehension", "touch ergonomics", "zoom and reflow at 200–400 percent"]
  }, null, 2)}\n`, { mode: 0o600 });
});

test("passes automated accessibility and responsive checks at desktop, tablet, and mobile sizes", async ({ page }) => {
  await mockSetupApi(page);
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/projects/project-1/capture");
    await expect(page.getByRole("heading", { name: "Prepare a resettable product environment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add persona" })).toHaveAttribute("aria-describedby", "persona-disabled-reason");
    await expect(page.getByRole("button", { name: "Store disposable login" })).toHaveAttribute("aria-describedby", "credential-disabled-reason");
    const analysis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    evidence.push({ viewport: viewport.name, width: viewport.width, height: viewport.height, axeViolations: analysis.violations.map((violation) => ({ id: violation.id, impact: violation.impact ?? null, nodes: violation.nodes.length })), passes: analysis.passes.length, horizontalOverflow });
    await page.screenshot({ path: path.resolve(`output/playwright/phase11-${viewport.name}.png`), fullPage: true });
    expect(analysis.violations, `${viewport.name} axe violations: ${analysis.violations.map((item) => item.id).join(", ")}`).toEqual([]);
    expect(horizontalOverflow, `${viewport.name} document overflow`).toBe(false);
  }
});

test("supports keyboard navigation, focus restoration, validation association, and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockSetupApi(page);
  await page.goto("/projects/project-1/capture");
  await expect(page.getByRole("heading", { name: "Prepare a resettable product environment" })).toBeVisible();

  await page.getByRole("link", { name: "Skip to capture content" }).focus();
  await expect(page.getByRole("link", { name: "Skip to capture content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "1 Setup Environment & roles" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("link", { name: "Skip to capture content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#capture-content")).toBeFocused();

  await page.getByRole("button", { name: "2 Discover Propose workflows" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Tell Gideon what matters" })).toBeFocused();
  await expect(page.getByRole("button", { name: "2 Discover Propose workflows" })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Validate the selected environment before discovery.")).toBeVisible();

  await page.getByRole("button", { name: "1 Setup Environment & roles" }).click();
  await page.getByRole("button", { name: "Save environment" }).click();
  await expect(page.getByLabel("Base URL")).toBeFocused();
  await expect(page.getByLabel("Base URL")).toHaveJSProperty("validity.valid", false);

  const transitionDuration = await page.getByRole("button", { name: "1 Setup Environment & roles" }).evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
});

async function mockSetupApi(page: Page) {
  await page.route(/\/api\/gideon\/api\/v1\/.*/, async (route) => {
    const request = route.request();
    const routePath = new URL(request.url()).pathname;
    if (routePath.endsWith("/auth/session")) return respond(route, { session: { user: { id: "user-synthetic", displayName: "Founder" }, workspace: { id: "workspace-synthetic", name: "Synthetic" }, role: "owner" }, csrfToken: "csrf-synthetic" });
    if (routePath.endsWith("/capture-capabilities")) return respond(route, { capture: { available: true, environmentValidation: true, credentialVault: true, isolatedRuntime: true, discovery: true, capture: true, assembly: true, clipPreview: true, coverage: true, audit: true } });
    if (routePath.endsWith("/capture-environments")) return respond(route, { environments: [{ id: "environment-1", projectId: "project-1", name: "Synthetic demo", type: "demo", baseUrl: "https://demo.example.test", allowedDomains: ["demo.example.test"], status: "draft", resetAdapter: "fixture_api", revision: 1, currentVersionId: null, safeErrorCode: null, updatedAt: "2026-07-16T10:00:00.000Z" }] });
    if (routePath.endsWith("/capture-personas")) return respond(route, { personas: [] });
    if (routePath.endsWith("/product-flows")) return respond(route, { flows: [] });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: "Synthetic route not found." }, meta: { requestId: "req-accessibility" } }) });
  });
}

async function respond(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data, meta: { requestId: "req-accessibility" } }) });
}
