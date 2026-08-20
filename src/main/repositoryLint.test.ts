import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

// Both cases spawn a node process and wait for it, so their duration is set by
// how busy the machine is rather than by anything this repository does. The lint
// takes about 1.5 seconds on its own and tips past vitest's 5 second default
// when 268 test files are running beside it -- a red suite that says nothing
// about the code, which is worse than a slow one.
const SUBPROCESS_TIMEOUT_MS = 60_000;

describe("repository lint", () => {
  it("passes the current repository", { timeout: SUBPROCESS_TIMEOUT_MS }, async () => {
    const result = await execFileAsync(process.execPath, ["scripts/lint-repository.mjs"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Repository lint passed.");
  });

  it("rejects committed environment files, conflict markers, live secrets, and estimate drift", { timeout: SUBPROCESS_TIMEOUT_MS }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-lint-test-"));
    await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        scripts: {
          lint: "node scripts/lint-repository.mjs",
          typecheck: "tsc --noEmit",
          test: "vitest run",
          build: "tsc",
          "db:migrate": "node scripts/migrate-postgres.mjs",
          "provider:canary": "node dist/main/main/providerCanaryCli.js",
          "staging:check": "node scripts/check-staging-readiness.mjs"
        }
      })
    );
    await fs.writeFile(path.join(tempDir, "README.md"), "Current engineering estimate: **99% complete**\n");
    await fs.writeFile(
      path.join(tempDir, "docs/production-readiness-audit.md"),
      "Current engineering estimate: **98% complete**\n"
    );
    await fs.writeFile(path.join(tempDir, ".env"), `OPENAI_API_KEY=${"sk" + "-live-realisticsecretvalue"}\n`);
    await fs.writeFile(path.join(tempDir, "source.ts"), "<<<<<<< HEAD\nconst ok = true;\n=======\nconst ok = false;\n>>>>>>>\n");

    await expect(
      execFileAsync(process.execPath, ["scripts/lint-repository.mjs"], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_LINT_ROOT: tempDir
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Repository lint failed:")
    });
  });
});
