import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-hosted-worker-config.mjs");

describe("hosted worker deployment config preflight", () => {
  it("accepts a production-hardened BullMQ worker configuration", async () => {
    const result = await runPreflight({
      GIDEON_DEPLOYMENT_ENV: "production",
      GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
      GIDEON_REDIS_URL: "rediss://default:secret@redis.example.test:6380/0",
      GIDEON_BULLMQ_QUEUE_NAME: "gideon-prod-workers",
      GIDEON_BULLMQ_PREFIX: "gideon-prod",
      GIDEON_WORKER_ID: "worker-prod-1",
      GIDEON_WORKER_LEASE_SECONDS: "300",
      GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
      GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker",
      GIDEON_STORE_PATH: "/var/lib/gideon-worker/store.json",
      GIDEON_PROJECTS_DIR: "/var/lib/gideon-worker/projects",
      GIDEON_STORAGE_ROOT: "/var/lib/gideon-worker/cache",
      GIDEON_STORAGE_PROVIDER: "s3",
      GIDEON_STORAGE_BUCKET: "gideon-private-prod",
      GIDEON_STORAGE_ACCESS_KEY_ID: "storage-key",
      GIDEON_STORAGE_SECRET_ACCESS_KEY: "storage-secret",
      GIDEON_OPENAI_API_KEY: "provider-key"
    });

    expect(result.stdout).toContain("Hosted worker deployment configuration looks usable.");
  });

  it("rejects insecure production Redis, local storage, tmp state, missing provider keys, and invalid lease cadence", async () => {
    await expect(
      runPreflight({
        GIDEON_DEPLOYMENT_ENV: "production",
        GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
        GIDEON_REDIS_URL: "redis://localhost:6379/0",
        GIDEON_WORKER_ID: "worker-prod-1",
        GIDEON_WORKER_LEASE_SECONDS: "60",
        GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "60000",
        GIDEON_USER_DATA_DIR: "/tmp/gideon-worker",
        GIDEON_STORE_PATH: "/tmp/gideon-worker/store.json",
        GIDEON_PROJECTS_DIR: "/tmp/gideon-worker/projects",
        GIDEON_STORAGE_ROOT: "/tmp/gideon-worker/storage"
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Production hosted workers must use rediss:// Redis")
    });
  });

  it("allows explicitly acknowledged local-production exceptions for controlled private deployments", async () => {
    const result = await runPreflight({
      GIDEON_DEPLOYMENT_ENV: "production",
      GIDEON_HOSTED_QUEUE_PROVIDER: "bullmq",
      GIDEON_REDIS_URL: "redis://redis.internal:6379/0",
      GIDEON_ALLOW_INSECURE_REDIS: "true",
      GIDEON_ALLOW_LOCAL_PRODUCTION_STORAGE: "true",
      GIDEON_ALLOW_NO_PROVIDER_KEYS: "true",
      GIDEON_BULLMQ_QUEUE_NAME: "gideon-private-workers",
      GIDEON_BULLMQ_PREFIX: "gideon-private",
      GIDEON_WORKER_ID: "worker-private-1",
      GIDEON_WORKER_LEASE_SECONDS: "300",
      GIDEON_WORKER_HEARTBEAT_INTERVAL_MS: "30000",
      GIDEON_USER_DATA_DIR: "/var/lib/gideon-worker",
      GIDEON_STORE_PATH: "/var/lib/gideon-worker/store.json",
      GIDEON_PROJECTS_DIR: "/var/lib/gideon-worker/projects",
      GIDEON_STORAGE_ROOT: "/var/lib/gideon-worker/storage"
    });

    expect(result.stdout).toContain("Hosted worker deployment configuration looks usable.");
  });
});

async function runPreflight(env: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath], {
    env: {
      PATH: process.env.PATH ?? "",
      ...env
    }
  });
}
