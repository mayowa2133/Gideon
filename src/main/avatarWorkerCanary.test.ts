import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("avatar worker canary", () => {
  it("documents the isolated model-backed checks without loading models in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/run-avatar-worker-canary.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(result.stdout).toContain("Avatar worker canary dry-run:");
    expect(result.stdout).toContain("Orbit fictional avatar");
    expect(result.stdout).toContain("Remove temporary media");
  });
});
