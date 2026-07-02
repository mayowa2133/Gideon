import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-github-promotion-archive.mjs");

describe("GitHub promotion archive bundle check", () => {
  it("prints the archive verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("GitHub promotion archive bundle check dry-run:");
    expect(result.stdout).toContain("Re-run production evidence and GitHub receipt validators");
    expect(result.stdout).toContain("Compare the receipt evidence summary");
  });

  it("accepts a consistent archived evidence and receipt bundle", async () => {
    const archiveDir = await writeArchiveFixture();

    const result = await runArchiveCheck(archiveDir);

    expect(result.stdout).toContain("GitHub promotion archive bundle check passed");
  });

  it("rejects receipt summaries that drift from the archived evidence", async () => {
    const archiveDir = await writeArchiveFixture({ receiptStepCount: 15 });

    await expect(runArchiveCheck(archiveDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Receipt evidence.stepCount must match archived promotion evidence")
    });
  });

  it("rejects archives with ambiguous evidence files", async () => {
    const archiveDir = await writeArchiveFixture();
    await fs.mkdir(path.join(archiveDir, "duplicate"));
    await fs.copyFile(
      path.join(archiveDir, "artifact", "production-promotion-evidence.json"),
      path.join(archiveDir, "duplicate", "production-promotion-evidence.json")
    );

    await expect(runArchiveCheck(archiveDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Found multiple production-promotion-evidence.json files")
    });
  });
});

async function runArchiveCheck(archiveDir: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--archive-dir", archiveDir], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
}

async function writeArchiveFixture(input: { receiptStepCount?: number } = {}): Promise<string> {
  const archiveDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-promotion-archive-"));
  const artifactDir = path.join(archiveDir, "artifact");
  await fs.mkdir(artifactDir);
  const evidence = createEvidence();
  await fs.writeFile(path.join(artifactDir, "production-promotion-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await fs.writeFile(
    path.join(archiveDir, "verification-receipt.json"),
    `${JSON.stringify(createReceipt(evidence, input), null, 2)}\n`
  );
  return archiveDir;
}

function createEvidence() {
  const now = "2026-07-01T12:00:00.000Z";
  const stepNames = [
    "local production readiness gate",
    "strict staging readiness gate",
    "production billing reconciliation",
    "production PostgreSQL policy",
    "production BullMQ policy",
    "production observability policy",
    "production storage lifecycle policy",
    "production storage signed-download smoke",
    "live provider canaries",
    "provider canary report",
    "live staging upload-to-export smoke",
    "live staging hosted MCP smoke",
    "signed macOS package",
    "production macOS release metadata",
    "production release notarization receipt",
    "production macOS DMG verification"
  ];
  return {
    schemaVersion: 1,
    generatedAt: now,
    finishedAt: now,
    status: "succeeded",
    failedStep: null,
    mode: "live",
    skipPackage: false,
    gitCommit: "0123456789abcdef0123456789abcdef01234567",
    steps: stepNames.map((name) => ({
      name,
      command: ["pnpm", name.replaceAll(" ", "-")],
      env:
        name === "production macOS release metadata"
          ? { GIDEON_RELEASE_CHANNEL: "production" }
          : name === "live provider canaries" || name === "provider canary report"
            ? { GIDEON_PROVIDER_CANARY_REPORT_PATH: "tmp/provider-canary-report.json" }
            : {},
      startedAt: now,
      finishedAt: now,
      durationMs: 10,
      status: "succeeded",
      exitCode: 0,
      error: null
    })),
    safety: {
      secretPolicy:
        "Commands, step names, exit codes, safe env overrides, and timings are recorded. Process environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, and media paths are not recorded."
    }
  };
}

function createReceipt(evidence: ReturnType<typeof createEvidence>, input: { receiptStepCount?: number } = {}) {
  return {
    schemaVersion: 1,
    verifiedAt: "2026-07-01T12:01:00.000Z",
    repository: "example/Gideon",
    runId: "12345",
    artifactName: "Gideon-production-promotion-evidence",
    evidencePath: "artifact/production-promotion-evidence.json",
    evidence: {
      schemaVersion: evidence.schemaVersion,
      mode: evidence.mode,
      status: evidence.status,
      gitCommit: evidence.gitCommit,
      generatedAt: evidence.generatedAt,
      finishedAt: evidence.finishedAt,
      skipPackage: evidence.skipPackage,
      stepCount: input.receiptStepCount ?? evidence.steps.length
    },
    githubRun: {
      databaseId: 12345,
      status: "completed",
      conclusion: "success",
      event: "workflow_dispatch",
      headSha: evidence.gitCommit
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
