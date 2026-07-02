import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/run-storage-download-smoke.mjs";

describe("storage signed-download smoke", () => {
  it("prints the signed-download smoke plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Storage signed-download smoke dry-run:");
    expect(result.stdout).toContain("Mint a short-lived signed GET URL without printing it");
    expect(result.stdout).toContain("GET byte range 0-0");
  });

  it("passes without leaking object keys or secrets when fetch is explicitly skipped", async () => {
    const env = storageEnv();
    const result = await execFileAsync(process.execPath, [scriptPath, "--skip-fetch"], {
      cwd: process.cwd(),
      env
    });

    expect(result.stdout).toContain("Storage signed-download smoke passed.");
    expect(result.stdout).toContain("Signed download range fetch: skipped");
    expect(result.stdout).not.toContain(env.GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY);
    expect(result.stdout).not.toContain(env.GIDEON_STORAGE_SECRET_ACCESS_KEY);
    expect(result.stdout).not.toContain("X-Amz-Signature");
  });

  it("rejects public buckets, local storage, and unscoped smoke keys", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath, "--skip-fetch"], {
        cwd: process.cwd(),
        env: storageEnv({
          GIDEON_STORAGE_PROVIDER: "local",
          GIDEON_STORAGE_BUCKET: "public-website",
          GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY: "exports/demo.mp4"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_STORAGE_PROVIDER must be s3 or r2")
    });
  });

  it("rejects overlong signed URL lifetimes", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath, "--skip-fetch"], {
        cwd: process.cwd(),
        env: storageEnv({ GIDEON_SIGNED_URL_MAX_SECONDS: "86400" })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_SIGNED_URL_MAX_SECONDS must be an integer between 60 and 3600")
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
    GIDEON_SIGNED_URL_MAX_SECONDS: "900",
    GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY: "workspaces/workspace-1/projects/project-1/export/export-1.mp4",
    ...overrides
  };
}
