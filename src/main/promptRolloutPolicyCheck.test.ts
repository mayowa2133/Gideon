import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-prompt-rollout-policy.mjs";

describe("production prompt rollout policy check", () => {
  it("prints the prompt rollout policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production prompt rollout policy check dry-run:");
    expect(result.stdout).toContain("approved prompt versions");
    expect(result.stdout).toContain("rollback version");
    expect(result.stdout).toContain("stage-specific rollout bounds");
  });

  it("passes with production-shaped prompt rollout configuration", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: promptPolicyEnv()
    });

    expect(result.stdout).toContain("Production prompt rollout policy check passed.");
  });

  it("rejects unapproved active prompt versions", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: promptPolicyEnv({
          GIDEON_ANALYSIS_PROMPT_VERSION: "analysis-v3",
          GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS: "analysis-v1,analysis-v2"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_ANALYSIS_PROMPT_VERSION must be included in GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS")
    });
  });

  it("rejects missing rollback separation and stale prompt reviews", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: promptPolicyEnv({
          GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION: "analysis-v2",
          GIDEON_ANALYSIS_PROMPT_REVIEWED_AT: "2020-01-01T00:00:00.000Z"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION must differ from GIDEON_ANALYSIS_PROMPT_VERSION")
    });
  });

  it("rejects unsafe production rollout percentages", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: promptPolicyEnv({
          GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE: "production",
          GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT: "25",
          GIDEON_ANALYSIS_MODEL_CANARY_PERCENT: "10"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT must be 100")
    });
  });
});

function promptPolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_OPENAI_LLM_MODEL: "gpt-5.1",
    GIDEON_ANALYSIS_PROMPT_VERSION: "analysis-v2",
    GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS: "analysis-v1,analysis-v2",
    GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION: "analysis-v1",
    GIDEON_ANALYSIS_PROMPT_REVIEWED_AT: new Date().toISOString(),
    GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE: "production",
    GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT: "100",
    GIDEON_ANALYSIS_MODEL_CANARY_PERCENT: "0",
    ...overrides
  };
}
