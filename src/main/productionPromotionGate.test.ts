import { execFile } from "node:child_process";
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
    expect(result.stdout).toContain("live provider canaries");
    expect(result.stdout).toContain("live staging upload-to-export smoke");
    expect(result.stdout).toContain("signed macOS package");
    expect(result.stdout).toContain("GIDEON_RELEASE_CHANNEL=production");
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
    expect(result.stdout).not.toContain("signed macOS package");
  });
});
