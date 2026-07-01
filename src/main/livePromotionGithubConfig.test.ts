import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-live-promotion-github-config.mjs";

describe("live promotion GitHub configuration check", () => {
  it("passes when the workflow contains the required manual live promotion wiring", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Live promotion GitHub configuration check passed.");
  });

  it("prints the human setup checklist", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--list"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Live promotion GitHub configuration checklist:");
    expect(result.stdout).toContain("GIDEON_STAGING_MCP_SESSION_COOKIE");
    expect(result.stdout).toContain("GIDEON_STAGING_MCP_PROJECT_ID");
    expect(result.stdout).toContain("GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD");
    expect(result.stdout).toContain("GIDEON_STORAGE_ENDPOINT");
    expect(result.stdout).toContain("GIDEON_STORAGE_TEMP_RETENTION_DAYS");
    expect(result.stdout).toContain("pnpm production:promote:check -- --live");
  });

  it("prints machine-readable required secrets and variables", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--json"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    const parsed = JSON.parse(result.stdout) as { secrets: string[]; vars: string[]; commands: string[] };

    expect(parsed.secrets).toContain("GIDEON_OPENAI_API_KEY");
    expect(parsed.secrets).toContain("GIDEON_STAGING_MCP_SESSION_COOKIE");
    expect(parsed.vars).toContain("GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD");
    expect(parsed.vars).toContain("GIDEON_STORAGE_ENDPOINT");
    expect(parsed.vars).toContain("GIDEON_STORAGE_TEMP_RETENTION_DAYS");
    expect(parsed.vars).toContain("GIDEON_STAGING_MCP_PROJECT_ID");
    expect(parsed.commands).toContain("pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json");
  });
});
