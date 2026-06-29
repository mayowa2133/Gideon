import { describe, expect, it } from "vitest";
import {
  BullMqHostedWorkerJobBroker,
  createBrokeredHostedJobQueueService,
  redisConnectionFromUrl
} from "./jobQueue";

const redisUrl = process.env.GIDEON_REDIS_URL ?? process.env.REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("BullMQ Redis hosted worker broker smoke", () => {
  it("round trips analysis and render jobs through a real Redis-backed broker", async () => {
    const runId = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const broker = new BullMqHostedWorkerJobBroker({
      connection: redisConnectionFromUrl(redisUrl as string),
      queueName: `gideon-redis-smoke-${runId}`,
      prefix: `gideon-redis-smoke:${runId}`,
      concurrency: 2,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true
      }
    });
    const service = createBrokeredHostedJobQueueService(broker);
    const processed: string[] = [];
    const expected = new Set(["analysis:project-redis:job-analysis", "render:project-redis:job-render"]);
    const processedPromise = waitForProcessedJobs(processed, expected, 10_000);
    const unsubscribe = broker.subscribe(async (job) => {
      processed.push(`${job.kind}:${job.projectId}:${job.jobId}`);
    });

    try {
      await service.enqueueAnalysisJob({ projectId: "project-redis", jobId: "job-analysis" });
      await service.enqueueRenderJob({ projectId: "project-redis", jobId: "job-render" });

      await processedPromise;
      expect(new Set(processed)).toEqual(expected);
      await expectEventually(async () => {
        const stats = await broker.refreshStats();
        expect(stats).toMatchObject({ active: 0, pending: 0, concurrency: 2 });
      });
    } finally {
      unsubscribe();
      await broker.close();
    }
  });
});

function waitForProcessedJobs(processed: string[], expected: Set<string>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if ([...expected].every((item) => processed.includes(item))) {
        clearInterval(interval);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for Redis smoke jobs. Processed: ${processed.join(", ") || "none"}.`));
      }
    }, 25);
  });
}

async function expectEventually(assertion: () => Promise<void> | void, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for assertion.");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
