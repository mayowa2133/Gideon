import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCaptureOperationalReadiness } from "./captureOperationalReadinessCli";

describe("capture operational readiness CLI", () => {
  it("writes a private, safe, provider-free readiness receipt", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-operations-"));
    const outputPath = path.join(directory, "readiness.json");
    const { report } = await runCaptureOperationalReadiness(outputPath);
    const stat = await fs.stat(outputPath);
    const body = await fs.readFile(outputPath, "utf8");

    expect(stat.mode & 0o777).toBe(0o600);
    expect(Object.values(report.gates).every(Boolean)).toBe(true);
    expect(report.cost.providerCallsMade).toBe(0);
    expect(report.load).toMatchObject({ projects: 32, concurrencyLimit: 4, terminatedRunaways: 1 });
    expect(report.incidents).toHaveLength(6);
    expect(report.slos.every((item) => item.status === "met")).toBe(true);
    expect(body).not.toMatch(/(?:password|credential|cookie|signed_url|object_key|\.mp4|\/Users\/)/i);
  });
});
