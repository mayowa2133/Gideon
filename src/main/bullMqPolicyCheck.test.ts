import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/check-bullmq-policy.mjs";

describe("BullMQ production policy check", () => {
  it("prints the BullMQ policy plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("BullMQ production policy check dry-run:");
    expect(result.stdout).toContain("Validate retry attempts");
    expect(result.stdout).toContain("dead-letter policy");
  });

  it("passes with production-shaped BullMQ retry and retention policy", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: queuePolicyEnv()
    });

    expect(result.stdout).toContain("BullMQ production policy check passed.");
  });

  it("rejects insecure Redis and missing retry policy", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
          GIDEON_REDIS_URL: "redis://localhost:6379/0",
          GIDEON_BULLMQ_QUEUE_NAME: "gideon-prod-workers",
          GIDEON_BULLMQ_PREFIX: "gideon-prod"
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_REDIS_URL must be a rediss:// URL")
    });
  });

  it("rejects failed job retention below completed job retention", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: queuePolicyEnv({
          GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT: "5000",
          GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT: "1000"
        })
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT must be greater than or equal")
    });
  });
});

function queuePolicyEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
    GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
    GIDEON_BULLMQ_QUEUE_NAME: "gideon-prod-workers",
    GIDEON_BULLMQ_PREFIX: "gideon-prod",
    GIDEON_BULLMQ_CONCURRENCY: "4",
    GIDEON_BULLMQ_ATTEMPTS: "3",
    GIDEON_BULLMQ_BACKOFF_TYPE: "exponential",
    GIDEON_BULLMQ_BACKOFF_DELAY_MS: "5000",
    GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT: "1000",
    GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT: "5000",
    GIDEON_BULLMQ_DEAD_LETTER_POLICY: "retain_failed",
    ...overrides
  };
}
