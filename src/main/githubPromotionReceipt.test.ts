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
    expect(result.stdout).toContain("provider canary report summary");
    expect(result.stdout).toContain("release receipt summary");
    expect(result.stdout).toContain("byte sizes");
    expect(result.stdout).toContain("SHA-256 artifact digests");
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

  it("rejects receipts whose GitHub run database id does not match the receipt run id", async () => {
    const receiptPath = await writeReceiptFixture({ githubRunDatabaseId: 67890 });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("githubRun.databaseId must match receipt runId")
    });
  });

  it("rejects receipts whose release receipt came from another workflow run", async () => {
    const receiptPath = await writeReceiptFixture({ releaseWorkflowRunId: "67890" });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("releaseReceipt.workflowRunId must match receipt runId")
    });
  });

  it("rejects receipts verified before evidence finished", async () => {
    const receiptPath = await writeReceiptFixture({ verifiedAt: "2026-07-01T11:59:59.000Z" });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("verifiedAt must be at or after evidence.finishedAt")
    });
  });

  it("rejects evidence chronology where finish precedes generation", async () => {
    const receiptPath = await writeReceiptFixture({
      evidenceGeneratedAt: "2026-07-01T12:01:00.000Z",
      evidenceFinishedAt: "2026-07-01T12:00:00.000Z"
    });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("evidence.finishedAt must be at or after evidence.generatedAt")
    });
  });

  it("rejects receipts containing secret-like material", async () => {
    const receiptPath = await writeReceiptFixture({ repository: "contains-uploadUrl-marker" });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Receipt contains sensitive material")
    });
  });

  it("rejects receipts without a verified provider canary report summary", async () => {
    const receiptPath = await writeReceiptFixture({ omitProviderCanaryReport: true });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("providerCanaryReport must be an object")
    });
  });

  it("rejects package receipts without release receipt evidence", async () => {
    const receiptPath = await writeReceiptFixture({ omitReleaseReceipt: true });

    await expect(runReceiptCheck(receiptPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("releaseReceipt must be an object")
    });
  });
});

async function runReceiptCheck(receiptPath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--path", receiptPath], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
}

async function writeReceiptFixture(
  input: {
    headSha?: string;
    repository?: string;
    verifiedAt?: string;
    evidenceGeneratedAt?: string;
    evidenceFinishedAt?: string;
    githubRunDatabaseId?: number;
    releaseWorkflowRunId?: string;
    omitProviderCanaryReport?: boolean;
    omitReleaseReceipt?: boolean;
  } = {}
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-promotion-receipt-"));
  const receiptPath = path.join(tempDir, "verification-receipt.json");
  await fs.writeFile(receiptPath, `${JSON.stringify(createReceipt(input), null, 2)}\n`);
  return receiptPath;
}

function createReceipt(
  input: {
    headSha?: string;
    repository?: string;
    verifiedAt?: string;
    evidenceGeneratedAt?: string;
    evidenceFinishedAt?: string;
    githubRunDatabaseId?: number;
    releaseWorkflowRunId?: string;
    omitProviderCanaryReport?: boolean;
    omitReleaseReceipt?: boolean;
  } = {}
) {
  const now = "2026-07-01T12:00:00.000Z";
  const gitCommit = "0123456789abcdef0123456789abcdef01234567";
  const receipt = {
    schemaVersion: 1,
    verifiedAt: input.verifiedAt ?? now,
    repository: input.repository ?? "example/Gideon",
    runId: "12345",
    artifactName: "Gideon-production-promotion-evidence",
    evidencePath: "tmp/github-production-promotion-evidence/artifact/production-promotion-evidence.json",
    evidence: {
      schemaVersion: 1,
      mode: "live",
      status: "succeeded",
      gitCommit,
      generatedAt: input.evidenceGeneratedAt ?? now,
      finishedAt: input.evidenceFinishedAt ?? now,
      skipPackage: false,
      stepCount: 16,
      sizeBytes: 1024,
      sha256: "a".repeat(64)
    },
    providerCanaryReport: {
      path: "tmp/github-production-promotion-evidence/artifact/provider-canary-report.json",
      mode: "live",
      providerConfigured: true,
      generatedAt: now,
      capabilityCount: 4,
      capabilities: ["analysis", "ocr", "transcription", "tts"],
      sizeBytes: 512,
      sha256: "b".repeat(64)
    },
    releaseReceipt: {
      path: "tmp/github-production-promotion-evidence/artifact/release-receipt.json",
      product: "Gideon",
      version: "0.1.0",
      channel: "production",
      generatedAt: now,
      sourceGitCommit: gitCommit,
      workflowRunId: input.releaseWorkflowRunId ?? "12345",
      artifactCount: 4,
      notarizationStatus: "accepted",
      staplingDmg: "accepted",
      gatekeeperAssessment: "accepted",
      installSmokeResult: "passed",
      sizeBytes: 768,
      sha256: "c".repeat(64)
    },
    githubRun: {
      databaseId: input.githubRunDatabaseId ?? 12345,
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      headSha: input.headSha ?? gitCommit
    },
    checks: {
      productionEvidenceSchema: "passed",
      providerCanaryReport: "passed",
      releaseReceipt: "passed",
      allowSkipPackage: false,
      runMetadata: "passed",
      secretPolicy:
        "receipt excludes environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, media paths, and artifact contents"
    }
  };
  if (input.omitProviderCanaryReport) {
    delete (receipt as { providerCanaryReport?: unknown }).providerCanaryReport;
  }
  if (input.omitReleaseReceipt) {
    delete (receipt as { releaseReceipt?: unknown }).releaseReceipt;
  }
  return receipt;
}
