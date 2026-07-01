import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-github-promotion-receipt.mjs");

describe("GitHub promotion verification receipt check", () => {
  it("prints the receipt verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("GitHub promotion verification receipt check dry-run:");
    expect(result.stdout).toContain("Require successful live evidence metadata");
    expect(result.stdout).toContain("Scan receipt fields for secret-like material");
  });

  it("accepts a valid safe verification receipt", async () => {
    const receiptPath = await writeReceiptFixture();

    const result = await runReceiptCheck(receiptPath);

    expect(result.stdout).toContain("GitHub promotion verification receipt check passed");
  });

  it("rejects receipt metadata that does not match the GitHub run head SHA", async () => {
    const receiptPath = await writeReceiptFixture({ headSha: "fedcba9876543210fedcba9876543210fedcba98" });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("githubRun.headSha must match evidence.gitCommit")
    });
  });

  it("rejects receipts containing secret-like material", async () => {
    const receiptPath = await writeReceiptFixture({ repository: "sk-live-abc123abc123abc123abc123" });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Receipt contains sensitive material")
    });
  });
});

async function runReceiptCheck(receiptPath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--path", receiptPath], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
}

async function writeReceiptFixture(input: { headSha?: string; repository?: string } = {}): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-promotion-receipt-"));
  const receiptPath = path.join(tempDir, "verification-receipt.json");
  await fs.writeFile(receiptPath, `${JSON.stringify(createReceipt(input), null, 2)}\n`);
  return receiptPath;
}

function createReceipt(input: { headSha?: string; repository?: string } = {}) {
  const now = "2026-07-01T12:00:00.000Z";
  const gitCommit = "0123456789abcdef0123456789abcdef01234567";
  return {
    schemaVersion: 1,
    verifiedAt: now,
    repository: input.repository ?? "example/Gideon",
    runId: "12345",
    artifactName: "Gideon-production-promotion-evidence",
    evidencePath: "tmp/github-production-promotion-evidence/artifact/production-promotion-evidence.json",
    evidence: {
      schemaVersion: 1,
      mode: "live",
      status: "succeeded",
      gitCommit,
      generatedAt: now,
      finishedAt: now,
      skipPackage: false,
      stepCount: 8
    },
    githubRun: {
      databaseId: 12345,
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      headSha: input.headSha ?? gitCommit
    },
    checks: {
      productionEvidenceSchema: "passed",
      allowSkipPackage: false,
      runMetadata: "passed",
      secretPolicy:
        "receipt excludes environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, media paths, and artifact contents"
    }
  };
}
