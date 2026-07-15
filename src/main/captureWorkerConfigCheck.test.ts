import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = "scripts/check-capture-worker-config.mjs";

describe("capture worker production configuration", () => {
  it("accepts a production-shaped isolated and pinned worker configuration", async () => {
    const result = await execFileAsync(process.execPath, [script], { cwd: process.cwd(), env: productionEnv() });
    expect(result.stdout).toContain("Capture worker configuration looks usable.");
  });

  it("rejects unpinned images, loopback runtimes, and missing policy versions", async () => {
    await expect(execFileAsync(process.execPath, [script], { cwd: process.cwd(), env: productionEnv({
      GIDEON_CAPTURE_RUNTIME_ENDPOINT: "https://127.0.0.1:8443?token=bad",
      GIDEON_CAPTURE_RUNTIME_IMAGE_DIGEST: "latest",
      GIDEON_CAPTURE_POLICY_VERSION: ""
    }) })).rejects.toMatchObject({ stderr: expect.stringContaining("must be a pinned SHA-256 image digest") });
    await expect(execFileAsync(process.execPath, [script], { cwd: process.cwd(), env: productionEnv({
      GIDEON_CAPTURE_RUNTIME_ENDPOINT: "https://127.0.0.1:8443?token=bad",
      GIDEON_CAPTURE_RUNTIME_IMAGE_DIGEST: "latest",
      GIDEON_CAPTURE_POLICY_VERSION: ""
    }) })).rejects.toMatchObject({ stderr: expect.stringContaining("must not target loopback in production") });
  });
});

function productionEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
    GIDEON_DATABASE_URL: "postgresql://gideon:private@example.test/gideon",
    GIDEON_REDIS_URL: "rediss://example.test:6379",
    GIDEON_CAPTURE_QUEUE_NAME: "capture",
    GIDEON_CAPTURE_WORKER_ID: "worker-1",
    GIDEON_CAPTURE_WORKER_CONCURRENCY: "2",
    GIDEON_CAPTURE_MAX_BROWSER_SECONDS: "300",
    GIDEON_CAPTURE_ISOLATION: "container",
    GIDEON_CAPTURE_RUNTIME_ENDPOINT: "https://capture.example.test",
    GIDEON_CAPTURE_RUNTIME_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
    GIDEON_CAPTURE_SECRET_PROVIDER: "vault",
    GIDEON_STORAGE_PROVIDER: "s3",
    GIDEON_CAPTURE_POLICY_VERSION: "capture-policy-v1",
    ...overrides
  };
}
