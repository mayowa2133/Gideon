import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-mcp-access-policy.mjs";

describe("production MCP access policy check", () => {
  it("prints the MCP access policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production MCP access policy check dry-run:");
    expect(result.stdout).toContain("SSO/session policy");
    expect(result.stdout).toContain("load-test thresholds");
  });

  it("passes with production-shaped SSO/session and load policy", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: mcpPolicyEnv()
    });

    expect(result.stdout).toContain("Production MCP access policy check passed.");
  });

  it("rejects local providers and weak session controls", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: mcpPolicyEnv({
          GIDEON_MCP_SSO_PROVIDER: "local",
          GIDEON_MCP_REQUIRE_CSRF: "false"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_MCP_SSO_PROVIDER must be one of")
    });
  });

  it("rejects missing production MCP load-test thresholds", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: mcpPolicyEnv({
          GIDEON_MCP_LOAD_CONCURRENCY: "0",
          GIDEON_MCP_LOAD_ERROR_RATE_MAX: "0.2"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_MCP_LOAD_CONCURRENCY must be an integer between 1 and 100")
    });
  });
});

function mcpPolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_MCP_SSO_PROVIDER: "oidc",
    GIDEON_MCP_SESSION_MAX_AGE_SECONDS: "3600",
    GIDEON_MCP_SESSION_ROTATION_HOURS: "12",
    GIDEON_MCP_REQUIRE_CSRF: "true",
    GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS: "true",
    GIDEON_MCP_LOAD_CONCURRENCY: "10",
    GIDEON_MCP_LOAD_REQUESTS: "500",
    GIDEON_MCP_LOAD_P95_MS: "1500",
    GIDEON_MCP_LOAD_ERROR_RATE_MAX: "0.01",
    ...overrides
  };
}
