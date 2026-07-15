import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCapturePilot } from "./capturePilot";
import { parseCapturePilotManifest, type CapturePilotAdapterRegistry } from "./capturePilotManifest";

const executablePath = findBrowserExecutable();

describe.skipIf(!executablePath)("generic capture pilot", () => {
  let server: http.Server;
  let baseUrl: string;
  let root: string;

  beforeAll(async () => {
    server = http.createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html style="background:#fff"><body style="background:#fff;color:#102a43;font:24px sans-serif;padding:80px"><h1>Fixture product</h1><button onclick="document.querySelector('output').textContent='Done'">Complete</button><output style="display:block;margin-top:40px"></output></body></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Capture pilot fixture server did not start.");
    baseUrl = `http://localhost:${address.port}`;
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-pilot-"));
    await fs.writeFile(path.join(root, "fixture-route.ts"), "export const route = '/';\n", "utf8");
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });

  it("runs a manifest-selected registered workflow without deleting prior run history", async () => {
    const outputRoot = path.join(root, "output");
    await fs.mkdir(outputRoot, { recursive: true });
    const sentinel = path.join(outputRoot, "historical-run.json");
    await fs.writeFile(sentinel, "{}", "utf8");
    let resets = 0;
    const manifest = parseCapturePilotManifest(manifestValue(baseUrl, root));
    const adapters: CapturePilotAdapterRegistry = {
      startup: { fixture: { approvedRepositoryRoot: root, approvedBaseUrl: baseUrl, async assertReady() {} } },
      reset: { fixture: { async reset() { resets += 1; } } },
      verification: { fixture: { async verify() { return { outcome: "done" }; } } }
    };

    let result: Awaited<ReturnType<typeof runCapturePilot>>;
    try {
      result = await runCapturePilot({ manifest, adapters, outputRoot, executablePath });
    } catch (error) {
      const [runDirectory] = await fs.readdir(path.join(outputRoot, "runs"));
      const failure = runDirectory ? await fs.readFile(path.join(outputRoot, "runs", runDirectory, "pilot-failure.json"), "utf8") : "No pilot failure report was written.";
      throw new Error(`${error instanceof Error ? error.message : "Pilot failed."}\n${failure}`);
    }

    expect(resets).toBe(4);
    expect(result.report.results).toHaveLength(2);
    expect(result.report.results[0]).toMatchObject({ workflowId: "complete", execution: { status: "verified" }, verification: { outcome: "done" } });
    expect(result.report.coverage?.dimensions.find((dimension) => dimension.key === "goal")).toMatchObject({ denominator: 2, coveredIds: ["goal:complete", "goal:complete-again"], uncoveredIds: [] });
    expect(result.report.coverage?.dimensions.find((dimension) => dimension.key === "approved_flow")).toMatchObject({ denominator: 2, coveredIds: ["complete", "complete-again"], uncoveredIds: [] });
    await expect(fs.stat(result.report.results[0]!.normalizedClip.localPath!)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.readFile(sentinel, "utf8")).resolves.toBe("{}");
    const second = await runCapturePilot({ manifest, adapters, outputRoot, executablePath, now: () => new Date("2026-07-15T02:00:00.000Z") });
    expect(second.runRoot).not.toBe(result.runRoot);
    expect(second.report.results[0]?.flow.revision).toBe(4);
    expect(resets).toBe(8);
    await expect(fs.stat(path.join(result.runRoot, "pilot-report.json"))).resolves.toBeDefined();
    const durable = JSON.parse(await fs.readFile(path.join(outputRoot, "pilot-repository.json"), "utf8")) as { state: { captureRuns: unknown[]; environments: unknown[] } };
    expect(durable.state.captureRuns).toHaveLength(4);
    expect(durable.state.environments).toHaveLength(2);
    const latest = JSON.parse(await fs.readFile(path.join(outputRoot, "latest.json"), "utf8")) as { runRoot: string };
    expect(latest.runRoot).toBe(second.runRoot);
  }, 60_000);
});

function manifestValue(baseUrl: string, rootDir: string) {
  const workflow = (id: string) => ({ id, goalId: id, resetAdapterId: "fixture", verificationAdapterId: "fixture", scenario: {
    id, framework: "playwright", title: `Complete fixture ${id}`, entryPath: "/", sourcePath: "fixture-route.ts",
    steps: [{ intent: "Complete the fixture.", action: { type: "click", target: { strategy: "role", role: "button", value: "Complete", exact: true } }, riskClass: "navigate" }],
    finalAssertions: [{ type: "text", target: { strategy: "text", value: "Done", exact: true }, value: "Done" }]
  }});
  return {
    schemaVersion: "1", key: "fixture", workspaceId: "workspace", projectId: "project", name: "Fixture pilot", artifactDirectoryName: "fixture",
    repository: { rootDir, maxFiles: 100, maxBytes: 1_000_000 },
    environment: { name: "Fixture", type: "local_preview", baseUrl, allowedDomains: ["localhost"], startupAdapterId: "fixture" },
    persona: { key: "demo", displayName: "Demo", roleDescription: "Synthetic fixture persona.", fixtureProfileId: "fixture:demo", fixtureValues: { result: "Done" } },
    presentation: { viewport: { width: 960, height: 600 }, initialHoldMs: 1500, beforeActionMs: 200, afterActionMs: 500, finalHoldMs: 1000, showPointer: true, pointerMoveMs: 100, typingDelayMs: 0 },
    workflows: [workflow("complete"), workflow("complete-again")]
  };
}

function findBrowserExecutable(): string | undefined {
  const candidates = [process.env.GIDEON_CAPTURE_BROWSER_EXECUTABLE, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}
