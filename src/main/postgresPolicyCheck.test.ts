import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-postgres-policy.mjs";

describe("PostgreSQL production policy check", () => {
  it("prints the PostgreSQL policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("PostgreSQL production policy check dry-run:");
    expect(result.stdout).toContain("sslmode=require");
    expect(result.stdout).toContain("point-in-time recovery");
    expect(result.stdout).toContain("restore-drill timestamp");
  });

  it("passes with production-shaped PostgreSQL persistence policy", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: postgresPolicyEnv()
    });

    expect(result.stdout).toContain("PostgreSQL production policy check passed.");
  });

  it("rejects insecure local database configuration", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: postgresPolicyEnv({
          GIDEON_DATABASE_URL: "postgres://gideon:secret@localhost:5432/gideon",
          GIDEON_POSTGRES_PITR_ENABLED: "false"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_DATABASE_URL must point to managed production PostgreSQL")
    });
  });

  it("rejects stale restore drills", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: postgresPolicyEnv({
          GIDEON_POSTGRES_RESTORE_DRILL_AT: "2020-01-01T00:00:00.000Z",
          GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS: "30"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_POSTGRES_RESTORE_DRILL_AT must be within the last 30 days")
    });
  });
});

function postgresPolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_STORE_PROVIDER: "postgres_snapshot",
    GIDEON_DATABASE_URL: "postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require",
    GIDEON_DATABASE_POOL_MAX: "10",
    GIDEON_DATABASE_STATEMENT_TIMEOUT_MS: "30000",
    GIDEON_DATABASE_IDLE_TIMEOUT_MS: "30000",
    GIDEON_POSTGRES_BACKUP_RETENTION_DAYS: "30",
    GIDEON_POSTGRES_PITR_ENABLED: "true",
    GIDEON_POSTGRES_RESTORE_DRILL_AT: new Date().toISOString(),
    GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS: "90",
    GIDEON_POSTGRES_MIGRATION_POLICY: "predeploy_migrate",
    ...overrides
  };
}
