import http from "node:http";
import fs from "node:fs";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";
import { createUsernamePasswordLoginAdapter } from "./captureLoginAdapters";

const chromePath = process.env.GIDEON_CAPTURE_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe.skipIf(!fs.existsSync(chromePath))("capture login adapter", () => {
  const servers: http.Server[] = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  it("resolves credentials only inside the adapter and verifies login outcome", async () => {
    const server = http.createServer((_request, response) => { response.setHeader("content-type", "text/html"); response.end(`<label>Email<input id="email"></label><label>Password<input id="password" type="password"></label><button onclick="document.body.innerHTML='<h1>Dashboard</h1>'">Sign in</button>`); });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture failed");
    const browser = await chromium.launch({ headless: true, executablePath: chromePath });
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${address.port}`);
      const adapter = createUsernamePasswordLoginAdapter({ username: { strategy: "label", value: "Email" }, password: { strategy: "label", value: "Password" }, submit: { strategy: "role", role: "button", value: "Sign in" }, success: { type: "visible", target: { strategy: "text", value: "Dashboard" } } });
      await adapter.authenticate({ page, credentialGrantId: "grant-1", useCredential: async (consumer) => consumer(Object.freeze({ username: "robot@example.test", password: "secret-value" })) });
      await expect(page.getByText("Dashboard").isVisible()).resolves.toBe(true);
      expect(await page.content()).not.toContain("secret-value");
    } finally { await browser.close(); }
  }, 15_000);
});
