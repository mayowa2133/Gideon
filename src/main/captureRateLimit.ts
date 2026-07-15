export interface CaptureRateLimiter {
  consume(input: { workspaceId: string; userId: string; nowMs: number }): Promise<void> | void;
}

export function createInMemoryCaptureRateLimiter(options: { limit?: number; windowMs?: number } = {}): CaptureRateLimiter {
  const limit = options.limit ?? 30;
  const windowMs = options.windowMs ?? 60_000;
  const windows = new Map<string, { startedAt: number; count: number }>();
  return {
    consume(input) {
      const key = `${input.workspaceId}:${input.userId}`;
      const current = windows.get(key);
      const bucket = !current || input.nowMs - current.startedAt >= windowMs ? { startedAt: input.nowMs, count: 0 } : current;
      bucket.count += 1;
      windows.set(key, bucket);
      if (bucket.count > limit) throw new Error("Capture API rate limit exceeded.");
      if (windows.size > 10_000) for (const [candidate, value] of windows) if (input.nowMs - value.startedAt >= windowMs) windows.delete(candidate);
    }
  };
}
