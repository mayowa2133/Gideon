import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("staging smoke runner", () => {
  it("prints the live upload-to-export smoke plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/run-staging-smoke.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Staging smoke dry-run:");
    expect(result.stdout).toContain("Create or sync a hosted auth session");
    expect(result.stdout).toContain("PUT the recording fixture to the signed upload URL");
    expect(result.stdout).toContain("Create a signed private download URL");
    expect(result.stdout).toContain("GIDEON_STAGING_API_BASE_URL");
  });

  it("fails live mode before network calls when required env is missing", async () => {
    await expect(
      execFileAsync(process.execPath, ["scripts/run-staging-smoke.mjs", "--live"], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_STAGING_API_BASE_URL is required")
    });
  });
});
