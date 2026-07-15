import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractRepositoryEvidence } from "./repositoryEvidence";

describe("repository evidence extractor", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

  it("extracts structural facts without executing code or ingesting secrets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-repo-evidence-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "app", "projects", "[projectId]"), { recursive: true });
    await fs.mkdir(path.join(root, "tests"));
    await fs.writeFile(path.join(root, "app", "projects", "[projectId]", "page.tsx"), `export default () => <a href="/exports">Exports</a>; isEnabled("new-export");`);
    await fs.writeFile(path.join(root, "tests", "projects.spec.ts"), `test("opens project", async () => { await page.goto("/projects/123"); });`);
    await fs.writeFile(path.join(root, ".env"), "API_TOKEN=do-not-read");
    await fs.writeFile(path.join(root, "credentials.json"), `{"password":"do-not-read"}`);
    const result = await extractRepositoryEvidence({ rootDir: root, now: () => "2026-07-14T10:00:00.000Z" });
    expect(result.evidence.routePaths).toEqual(expect.arrayContaining([{ path: "/projects/:id", label: "detail" }, { path: "/exports" }]));
    expect(result.evidence.featureFlagIds).toEqual(["new-export"]);
    expect(result.evidence.tests[0]).toMatchObject({ title: "opens project", routePaths: ["/projects/:id"] });
    expect(JSON.stringify(result)).not.toContain("do-not-read");
    expect(result.manifest.excludedPaths).toBeGreaterThanOrEqual(2);
  });
});
