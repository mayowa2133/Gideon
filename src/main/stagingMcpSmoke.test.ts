import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("staging MCP smoke runner", () => {
  it("prints the live hosted MCP smoke plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/run-staging-mcp-smoke.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Staging MCP smoke dry-run:");
    expect(result.stdout).toContain("Fetch the hosted session and CSRF token");
    expect(result.stdout).toContain("Fetch sanitized MCP project context");
    expect(result.stdout).toContain("verify 409 revision_conflict");
    expect(result.stdout).toContain("GIDEON_STAGING_MCP_API_BASE_URL");
  });

  it("fails live mode before network calls when required env is missing", async () => {
    await expect(
      execFileAsync(process.execPath, ["scripts/run-staging-mcp-smoke.mjs", "--live"], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_STAGING_MCP_API_BASE_URL is required")
    });
  });
});
