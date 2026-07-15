import http from "node:http";
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { crawlRenderedInventory } from "./captureInventoryCrawler";

const chromePath = process.env.GIDEON_CAPTURE_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

describe.skipIf(!fs.existsSync(chromePath))("deterministic rendered inventory crawler", () => {
  const servers: http.Server[] = [];
  afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

  it("follows same-origin visible links without submitting forms or retaining queries", async () => {
    let submitted = false;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") submitted = true;
      response.setHeader("content-type", "text/html");
      response.end(request.url?.startsWith("/projects") ? "<title>Projects</title><h1>Projects</h1>" : "<title>Home</title><a href='/projects?private=value'>Projects</a><button>Delete account</button><form method='post'><button>Submit</button></form>");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture server failed");
    const baseUrl = `http://localhost:${address.port}`;
    const pages = await crawlRenderedInventory({
      policy: { baseUrl, allowedDomains: ["localhost"], allowedRisks: ["observe", "navigate"], allowedKeys: ["Enter"], allowHttpLocalhost: true, allowSubdomains: false, allowCredentialInjectionFromLoginAdapter: false, maxSteps: 20 },
      entryPaths: ["/"], maxPages: 5,
      executablePath: chromePath,
      networkPolicyOptions: { lookup: async () => [{ address: "127.0.0.1", family: 4 }] }
    });
    expect(pages.map((page) => new URL(page.url).pathname)).toEqual(["/", "/projects"]);
    expect(pages[0]?.controls).toEqual(expect.arrayContaining([{ role: "link", name: "Projects", destinationPath: `${baseUrl}/projects` }]));
    expect(submitted).toBe(false);
  }, 15_000);
});
