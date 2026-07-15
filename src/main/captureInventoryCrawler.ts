import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright";
import type { BrowserExecutionPolicy } from "../shared/productFlowCapture";
import { validateCaptureNetworkDestination, type CaptureNetworkPolicyOptions } from "./captureNetworkPolicy";
import type { AccessibleControlEvidence, RenderedPageEvidence } from "./flowDiscovery";
import { stableSerialize } from "./productFlowCompiler";

export async function crawlRenderedInventory(input: {
  policy: BrowserExecutionPolicy;
  entryPaths: string[];
  maxPages: number;
  maxControlsPerPage?: number;
  executablePath?: string;
  browser?: Browser;
  networkPolicyOptions?: CaptureNetworkPolicyOptions;
}): Promise<RenderedPageEvidence[]> {
  if (input.maxPages < 1 || input.maxPages > 100) throw new Error("Inventory page budget must be 1–100.");
  const ownsBrowser = !input.browser;
  const browser = input.browser ?? await chromium.launch({ headless: true, executablePath: input.executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "UTC", reducedMotion: "reduce", acceptDownloads: false });
  const queue = input.entryPaths.map((entry) => new URL(entry, input.policy.baseUrl).toString());
  const seen = new Set<string>();
  const evidence: RenderedPageEvidence[] = [];
  try {
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
      try {
        await validateCaptureNetworkDestination(url, input.policy, input.networkPolicyOptions);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    while (queue.length && evidence.length < input.maxPages) {
      const requested = queue.shift()!;
      const normalized = inventoryUrl(requested);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      await page.goto(requested, { waitUntil: "domcontentloaded" });
      const title = (await page.title()).trim().slice(0, 160) || new URL(page.url()).pathname;
      const controls = await collectControls(page, input.maxControlsPerPage ?? 300);
      const structure = await page.locator("body").evaluate((body) => {
        const counts: Record<string, number> = {};
        for (const node of body.querySelectorAll("a,button,input,select,textarea,[role]")) {
          const key = `${node.tagName.toLowerCase()}:${node.getAttribute("role") ?? ""}`;
          counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
      });
      const accessibleSummary = controls.map(({ role, name, destinationPath }) => ({ role, name, destinationPath }));
      const screenshotHash = sha256(await page.screenshot({ animations: "disabled", type: "png" }));
      evidence.push({
        id: `page:${sha256(normalized).slice(0, 24)}`,
        url: inventoryUrl(page.url()),
        title,
        controls,
        accessibleTreeHash: sha256(stableSerialize(accessibleSummary)),
        domStructureHash: sha256(stableSerialize(structure)),
        screenshotHash
      });
      for (const control of controls) {
        if (control.role !== "link" || !control.destinationPath) continue;
        const target = new URL(control.destinationPath, input.policy.baseUrl);
        if (target.origin === new URL(input.policy.baseUrl).origin && !seen.has(inventoryUrl(target.toString()))) queue.push(target.toString());
      }
    }
    return evidence;
  } finally {
    await context.close().catch(() => undefined);
    if (ownsBrowser) await browser.close().catch(() => undefined);
  }
}

async function collectControls(page: import("playwright").Page, limit: number): Promise<AccessibleControlEvidence[]> {
  const raw = await page.locator("a[href],button,[role=tab],input,select,textarea").evaluateAll((nodes, max) => nodes.slice(0, max).map((node) => {
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const explicitRole = element.getAttribute("role");
    const role = explicitRole === "tab" ? "tab" : tag === "a" ? "link" : tag === "button" ? "button" : tag === "select" ? "combobox" : "textbox";
    const name = (element.getAttribute("aria-label") || element.getAttribute("title") || (element as HTMLInputElement).placeholder || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
    const destinationPath = tag === "a" ? (element as HTMLAnchorElement).href : undefined;
    return { role, name, destinationPath };
  }).filter((control) => control.name), limit) as AccessibleControlEvidence[];
  return raw.map((control) => ({ ...control, destinationPath: control.destinationPath ? inventoryUrl(control.destinationPath) : undefined }));
}

function inventoryUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString();
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
