import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("production promotion gate", () => {
  it("prints the live production promotion plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/run-production-promotion-gate.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production promotion gate dry-run:");
    expect(result.stdout).toContain("local production readiness gate");
    expect(result.stdout).toContain("strict staging readiness gate");
    expect(result.stdout).toContain("production billing reconciliation");
    expect(result.stdout).toContain("live provider canaries");
    expect(result.stdout).toContain("live staging upload-to-export smoke");
    expect(result.stdout).toContain("live staging hosted MCP smoke");
    expect(result.stdout).toContain("signed macOS package");
    expect(result.stdout).toContain("GIDEON_RELEASE_CHANNEL=production");
    expect(result.stdout).toContain("Live evidence report path:");
    expect(result.stdout).toContain("GIDEON_PRODUCTION_PROMOTION_LIVE=true");
  });

  it("keeps package/release steps optional for infrastructure-only live rehearsals", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/run-production-promotion-gate.mjs", "--dry-run", "--skip-package"],
      {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      }
    );

    expect(result.stdout).toContain("live staging upload-to-export smoke");
    expect(result.stdout).toContain("live staging hosted MCP smoke");
    expect(result.stdout).not.toContain("signed macOS package");
  });

  it("writes a safe live evidence report for promotion runs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-promotion-gate-"));
    const fakePnpm = path.join(tempDir, "fake-pnpm.mjs");
    const evidencePath = path.join(tempDir, "promotion-evidence.json");
    const invocationsPath = path.join(tempDir, "invocations.log");
    await fs.writeFile(
      fakePnpm,
      `#!/usr/bin/env node\nimport fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(invocationsPath)}, process.argv.slice(2).join(" ") + "\\n");\n`
    );
    await fs.chmod(fakePnpm, 0o755);

    const result = await execFileAsync(
      process.execPath,
      ["scripts/run-production-promotion-gate.mjs", "--live", "--skip-package"],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_PNPM_BIN: fakePnpm,
          GIDEON_PRODUCTION_PROMOTION_EVIDENCE_PATH: evidencePath
        }
      }
    );

    const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
    const invocations = await fs.readFile(invocationsPath, "utf8");
    expect(result.stdout).toContain(`Production promotion evidence written to ${evidencePath}`);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      status: "succeeded",
      mode: "live",
      skipPackage: true,
      failedStep: null
    });
    expect(evidence.steps).toHaveLength(6);
    expect(evidence.steps.every((step: { status: string }) => step.status === "succeeded")).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("gideon_session");
    expect(JSON.stringify(evidence)).not.toContain("OPENAI_API_KEY");
    expect(invocations).toContain("production:billing:check -- --live");
    expect(invocations).toContain("staging:mcp:smoke -- --live --require-metric-export");
  });
});
