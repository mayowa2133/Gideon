import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("production readiness gate", () => {
  it("prints the promotion gate plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/run-production-readiness-gate.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production readiness gate dry-run:");
    expect(result.stdout).toContain("repository lint");
    expect(result.stdout).toContain("provider canary dry-run");
    expect(result.stdout).toContain("staging readiness dry-run");
    expect(result.stdout).toContain("staging upload-to-export smoke dry-run");
    expect(result.stdout).toContain("production promotion gate dry-run");
    expect(result.stdout).toContain("production-shaped hosted worker preflight");
    expect(result.stdout).toContain("macOS release metadata");
  });
});
