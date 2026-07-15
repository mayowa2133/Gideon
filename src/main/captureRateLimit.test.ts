import { describe, expect, it } from "vitest";
import { createInMemoryCaptureRateLimiter } from "./captureRateLimit";

describe("capture API rate limiter", () => {
  it("limits per workspace/user and resets after its window", async () => {
    const limiter = createInMemoryCaptureRateLimiter({ limit: 2, windowMs: 1000 });
    const input = { workspaceId: "workspace-1", userId: "user-1", nowMs: 0 };
    await limiter.consume(input); await limiter.consume(input);
    await expect(Promise.resolve().then(() => limiter.consume(input))).rejects.toThrow("rate limit exceeded");
    await expect(Promise.resolve().then(() => limiter.consume({ ...input, nowMs: 1000 }))).resolves.toBeUndefined();
  });
});
