import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("hosted review policy gate", () => {
  it("passes when hosted MCP/API review protections and retry policies are present", async () => {
    const result = await execFileAsync(process.execPath, ["scripts/check-hosted-review-policy.mjs"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Hosted review policy check passed.");
  });
});
