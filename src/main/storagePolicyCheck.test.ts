import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-storage-policy.mjs";

describe("storage lifecycle policy check", () => {
  it("prints the storage policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Storage lifecycle policy check dry-run:");
    expect(result.stdout).toContain("Require temp/failed/source/export retention windows");
    expect(result.stdout).toContain("signed URL lifetime");
  });

  it("passes with production-shaped private storage lifecycle configuration", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: storageEnv()
    });

    expect(result.stdout).toContain("Storage lifecycle policy check passed.");
  });

  it("rejects public or long-lived storage policy configuration", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: storageEnv({
          GIDEON_STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test/gideon",
          GIDEON_SIGNED_URL_MAX_SECONDS: "86400"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_STORAGE_PUBLIC_BASE_URL must be unset")
    });
  });

  it("rejects local storage and missing lifecycle windows", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", GIDEON_STORAGE_PROVIDER: "local" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_STORAGE_PROVIDER must be s3 or r2")
    });
  });
});

function storageEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_STORAGE_PROVIDER: "r2",
    GIDEON_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
    GIDEON_STORAGE_BUCKET: "gideon-private-prod",
    GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
    GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
    GIDEON_STORAGE_TEMP_RETENTION_DAYS: "3",
    GIDEON_STORAGE_FAILED_RETENTION_DAYS: "14",
    GIDEON_STORAGE_SOURCE_RETENTION_DAYS: "365",
    GIDEON_STORAGE_EXPORT_RETENTION_DAYS: "365",
    GIDEON_STORAGE_DELETION_SLA_HOURS: "24",
    GIDEON_SIGNED_URL_MAX_SECONDS: "900",
    ...overrides
  };
}
