import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { permittedFlows, prohibitedFlows, runHostileCaptureMatrix, startHostileCaptureFixture } from "./hostileCaptureFixture";

const executablePath = findBrowserExecutable();

describe("hostile capture fixture contracts", () => {
  it("declares bounded approved and prohibited workflow matrices", () => {
    expect(permittedFlows().map((flow) => flow.id)).toEqual(["member-navigation", "empty-beta-state", "modal-details", "delayed-recovery", "admin-multi-step-form"]);
    const prohibited = prohibitedFlows().map((item) => [item.flow.id, item.expectedCode]);
    expect(prohibited).toHaveLength(17);
    expect(prohibited).toEqual(expect.arrayContaining([
      ["blocked-financial", "sensitive_action_misclassified"],
      ["blocked-destructive", "sensitive_action_misclassified"],
      ["blocked-invitation", "sensitive_action_misclassified"],
      ["blocked-publishing", "sensitive_action_misclassified"],
      ["blocked-outbound-send", "sensitive_action_misclassified"],
      ["blocked-security", "sensitive_action_misclassified"],
      ["blocked-download", "sensitive_action_misclassified"],
      ["blocked-popup", "sensitive_action_misclassified"],
      ["blocked-prompt-injection", "sensitive_action_misclassified"],
      ["blocked-classified-financial", "risk_not_allowed"],
      ["blocked-classified-destructive", "risk_not_allowed"],
      ["blocked-classified-publish-invite", "risk_not_allowed"],
      ["blocked-classified-external", "risk_not_allowed"],
      ["blocked-classified-security", "risk_not_allowed"],
      ["blocked-classified-prompt-injection", "risk_not_allowed"],
      ["blocked-external-domain", "domain_not_allowed"],
      ["unsupported-file-input", "browser_action_failed"]
    ]));
  });
});

describe.skipIf(!executablePath)("hostile capture fixture browser matrix", () => {
  it("verifies safe flows and leaves every dangerous side-effect trap untouched", async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-hostile-matrix-"));
    try {
      const report = await runHostileCaptureMatrix({ executablePath: executablePath!, outputDir, now: () => "2026-07-15T08:30:00.000Z" });
      expect(report).toMatchObject({ schemaVersion: "1", fixtureRevision: "hostile-capture-app-v1", browserExercised: true, createdAt: "2026-07-15T08:30:00.000Z" });
      expect(report.permitted).toHaveLength(5);
      expect(report.permitted.every((item) => item.status === "verified")).toBe(true);
      expect(report.prohibited).toHaveLength(17);
      const expected = new Map(prohibitedFlows().map((item) => [item.flow.id, item.expectedCode]));
      expect(report.prohibited.every((item) => expected.get(item.flowId) === item.blockerCode)).toBe(true);
      expect(report.sideEffects).toEqual({ billing: 0, deletion: 0, invitation: 0, publishing: 0, outbound_send: 0, security: 0, download: 0, popup: 0, prompt_injection: 0 });
      expect(JSON.stringify(report)).not.toContain("fixture-password-not-a-secret");
      expect(JSON.stringify(report)).not.toContain("tok_fixture");
      expect(JSON.stringify(report)).not.toContain("4242 4242");
      expect(JSON.stringify(report)).not.toContain(outputDir);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("exposes local-only synthetic upload/download controls without network side effects", async () => {
    const fixture = await startHostileCaptureFixture();
    const browser = await chromium.launch({ headless: true, executablePath });
    try {
      const page = await browser.newPage();
      await page.goto(fixture.baseUrl);
      await page.getByRole("button", { name: "Continue as admin" }).click();
      await page.getByRole("button", { name: "Open workspace menu" }).click();
      await page.getByRole("menuitem", { name: "Settings" }).click();
      await page.getByLabel("Synthetic fixture file").setInputFiles({ name: "fixture.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic only") });
      expect(await page.getByText("Synthetic upload selected", { exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole("link", { name: "Download synthetic report" }).getAttribute("href")).toMatch(/^data:text\/plain,/);
      expect(fixture.sideEffects()).toEqual({ billing: 0, deletion: 0, invitation: 0, publishing: 0, outbound_send: 0, security: 0, download: 0, popup: 0, prompt_injection: 0 });
    } finally {
      await browser.close();
      await fixture.close();
    }
  }, 20_000);
});

function findBrowserExecutable(): string | undefined {
  const candidates = [process.env.GIDEON_CAPTURE_BROWSER_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}
