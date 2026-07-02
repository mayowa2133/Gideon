import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-observability-policy.mjs";

describe("production observability policy check", () => {
  it("prints the observability policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production observability policy check dry-run:");
    expect(result.stdout).toContain("HTTPS metric/dashboard/runbook URLs");
    expect(result.stdout).toContain("enabled paging");
    expect(result.stdout).toContain("queue-age");
  });

  it("passes with production-shaped observability configuration", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: observabilityPolicyEnv()
    });

    expect(result.stdout).toContain("Production observability policy check passed.");
  });

  it("rejects local metric export and disabled paging", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: observabilityPolicyEnv({
          GIDEON_OBSERVABILITY_METRIC_EXPORT_URL: "http://localhost:9090/metrics",
          GIDEON_OBSERVABILITY_PAGING_ENABLED: "false"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_OBSERVABILITY_METRIC_EXPORT_URL must be an https:// URL")
    });
  });

  it("rejects thresholds outside the production policy bounds", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: observabilityPolicyEnv({
          GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS: "86400",
          GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR: "0"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS must be an integer between 60 and 3600")
    });
  });
});

function observabilityPolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_OBSERVABILITY_BACKEND: "datadog",
    GIDEON_OBSERVABILITY_METRIC_EXPORT_URL: "https://observability.example.test/gideon/metrics",
    GIDEON_OBSERVABILITY_DASHBOARD_URL: "https://observability.example.test/dashboards/gideon-production",
    GIDEON_OBSERVABILITY_RUNBOOK_URL: "https://runbooks.example.test/gideon/production-incidents",
    GIDEON_OBSERVABILITY_ALERT_ROUTE: "pagerduty/gideon-production",
    GIDEON_OBSERVABILITY_PAGING_ENABLED: "true",
    GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS: "300",
    GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR: "3",
    GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS: "15000",
    GIDEON_OBSERVABILITY_STORAGE_P95_MS: "5000",
    ...overrides
  };
}
