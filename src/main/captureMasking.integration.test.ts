import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { assertCaptureMaskingReady, defaultCaptureMaskingPolicy, installCaptureMasking } from "./captureMasking";

const executablePath = findBrowserExecutable();

describe.skipIf(!executablePath)("capture masking in real Chromium", () => {
  let server: http.Server;
  let baseUrl: string;
  let browser: Browser;

  beforeAll(async () => {
    server = http.createServer((_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html><head><style>
        body{margin:0;font:16px sans-serif} label{display:block;margin:12px;width:320px} input{width:280px;height:32px}
        canvas{width:240px;height:80px;margin:12px;display:block}.spacer{height:1100px}#private-panel{width:300px;height:80px;background:#ef4444}
        dialog{width:360px;height:140px}
      </style></head><body>
        <label>Email <input id="email" type="email" value="founder@example.test" autocomplete="email"></label>
        <label>Password <input id="password" type="password" value="fixture-password"></label>
        <label>API token <input id="token" name="api-token" value="tok_fixture_123456"></label>
        <label>Payment card <input id="card" name="payment-card" value="4242 4242 4242 4242"></label>
        <input id="hidden-secret" type="hidden" name="token-hidden" value="hidden_fixture_token">
        <p id="visible-email">Contact founder@example.test</p>
        <canvas id="private-canvas" width="240" height="80"></canvas>
        <button id="open" type="button">Open profile</button>
        <div class="spacer"></div><div id="private-panel" data-sensitive>Private profile text</div>
        <dialog id="profile"><p data-sensitive>Modal personal record</p><button>Close</button></dialog>
        <script>
          const context=document.querySelector('canvas').getContext('2d');context.fillStyle='#ef4444';context.fillRect(0,0,240,80);
          document.querySelector('#open').onclick=()=>document.querySelector('#profile').showModal();
        </script>
      </body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Masking fixture server failed.");
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, executablePath });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("masks autofilled fields, canvas, hidden data, scroll changes, responsive changes, and modal transitions before screenshot", async () => {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
    const policy = defaultCaptureMaskingPolicy(["#private-panel"]);
    await installCaptureMasking(context, policy);
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const initial = await assertCaptureMaskingReady(page, policy);
    expect(initial).toMatchObject({ status: "active", frameCount: 1, canvasCount: 1 });
    expect(initial.visibleSensitiveElementCount).toBeGreaterThanOrEqual(5);
    expect(initial.overlayCount).toBeGreaterThanOrEqual(initial.visibleSensitiveElementCount);
    expect(initial.hiddenSensitiveElementCount).toBeGreaterThanOrEqual(2);

    const screenshot = await page.screenshot({ type: "png", animations: "disabled" });
    for (const selector of ["#email", "#password", "#token", "#card", "#visible-email", "#private-canvas"]) {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`Missing masking fixture geometry for ${selector}`);
      expect(samplePixel(screenshot, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))).toEqual([17, 24, 39]);
    }

    await page.setViewportSize({ width: 640, height: 480 });
    await page.locator("#private-panel").scrollIntoViewIfNeeded();
    const scrolled = await assertCaptureMaskingReady(page, policy);
    expect(scrolled.visibleSensitiveElementCount).toBeGreaterThanOrEqual(1);
    await expectOverlayAligned(page, "#private-panel");

    await page.locator("#open").click();
    const modal = await assertCaptureMaskingReady(page, policy);
    expect(modal.visibleSensitiveElementCount).toBeGreaterThanOrEqual(2);
    await expectOverlayAligned(page, "#profile [data-sensitive]");
    await context.close();
  }, 20_000);

  it("fails closed for an invalid custom selector or a browser error document", async () => {
    const invalidContext = await browser.newContext();
    const invalidPolicy = defaultCaptureMaskingPolicy([":not("]);
    await installCaptureMasking(invalidContext, invalidPolicy);
    const invalidPage = await invalidContext.newPage();
    await invalidPage.goto(baseUrl);
    await expect(assertCaptureMaskingReady(invalidPage, invalidPolicy)).rejects.toThrow("capture_masking_unavailable");
    await invalidContext.close();

    const errorContext = await browser.newContext();
    const policy = defaultCaptureMaskingPolicy();
    await installCaptureMasking(errorContext, policy);
    const errorPage = await errorContext.newPage();
    await errorPage.goto("http://127.0.0.1:1", { waitUntil: "commit", timeout: 2_000 }).catch(() => undefined);
    await expect(assertCaptureMaskingReady(errorPage, policy)).rejects.toThrow("capture_masking_unavailable");
    await errorContext.close();
  }, 15_000);

  it("burns masking overlays into the browser recording before video leaves the context", async () => {
    const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), "gideon-masked-video-"));
    try {
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: { width: 900, height: 700 } } });
      const policy = defaultCaptureMaskingPolicy();
      await installCaptureMasking(context, policy);
      const page = await context.newPage();
      const video = page.video();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await assertCaptureMaskingReady(page, policy);
      const box = await page.locator("#email").boundingBox();
      if (!box || !video) throw new Error("Masked video fixture did not expose expected geometry.");
      await page.waitForTimeout(500);
      await context.close();
      const pixel = sampleVideoPixel(await video.path(), Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      expect(pixel.every((channel) => channel < 65)).toBe(true);
    } finally {
      fs.rmSync(videoDir, { recursive: true, force: true });
    }
  }, 15_000);
});

async function expectOverlayAligned(page: import("playwright").Page, selector: string): Promise<void> {
  const target = await page.locator(selector).boundingBox();
  const overlay = await page.locator('[data-gideon-mask-overlay="true"]').evaluateAll((nodes, targetSelector) => {
    const targetElement = document.querySelector(targetSelector as string);
    if (!targetElement) return undefined;
    const targetRect = targetElement.getBoundingClientRect();
    return nodes.map((node) => node.getBoundingClientRect()).find((rect) => Math.abs(rect.left - targetRect.left) < 1 && Math.abs(rect.top - targetRect.top) < 1 && Math.abs(rect.width - targetRect.width) < 1 && Math.abs(rect.height - targetRect.height) < 1);
  }, selector);
  expect(target).toBeTruthy();
  expect(overlay).toBeTruthy();
}

function samplePixel(png: Buffer, x: number, y: number): number[] {
  const result = spawnSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-vf", `crop=1:1:${x}:${y},format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { input: png, maxBuffer: 1_000_000 });
  if (result.status !== 0 || result.stdout.length < 3) throw new Error("FFmpeg could not sample the masking fixture screenshot.");
  return [...result.stdout.subarray(0, 3)];
}

function sampleVideoPixel(videoPath: string, x: number, y: number): number[] {
  const result = spawnSync("ffmpeg", ["-loglevel", "error", "-ss", "0.35", "-i", videoPath, "-vf", `crop=1:1:${x}:${y},format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1_000_000 });
  if (result.status !== 0 || result.stdout.length < 3) throw new Error("FFmpeg could not sample the masked video fixture.");
  return [...result.stdout.subarray(0, 3)];
}

function findBrowserExecutable(): string | undefined {
  const candidates = [process.env.GIDEON_CAPTURE_CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => fs.existsSync(candidate));
}
