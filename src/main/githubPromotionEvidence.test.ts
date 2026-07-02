import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-github-promotion-evidence.mjs");

describe("GitHub promotion evidence artifact check", () => {
  it("prints the artifact verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run", "--run-id", "12345"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("GitHub promotion evidence artifact check dry-run:");
    expect(result.stdout).toContain("Download artifact Gideon-production-promotion-evidence");
    expect(result.stdout).toContain("provider-canary-report.json");
    expect(result.stdout).toContain("release receipt evidence");
    expect(result.stdout).toContain("Verify the promotion evidence, provider canary report, and release receipt summary with local checkers.");
    expect(result.stdout).toContain("verify evidence gitCommit matches gh run view headSha");
    expect(result.stdout).toContain("write a safe verification receipt with SHA-256 artifact digests");
  });

  it("verifies an already downloaded evidence artifact", async () => {
    const downloadDir = await writeDownloadedArtifactFixture();

    const result = await execFileAsync(process.execPath, [scriptPath, "--skip-download", "--download-dir", downloadDir], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("Provider canary report check passed");
    expect(result.stdout).toContain("GitHub promotion evidence artifact check passed");
  });

  it("requires the archived provider canary report", async () => {
    const downloadDir = await writeDownloadedArtifactFixture({ includeProviderReport: false });

    await expect(
      execFileAsync(process.execPath, [scriptPath, "--skip-download", "--download-dir", downloadDir], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Could not find provider-canary-report.json")
    });
  });

  it("requires the archived release receipt for package promotion evidence", async () => {
    const downloadDir = await writeDownloadedArtifactFixture({ includeReleaseReceipt: false });

    await expect(
      execFileAsync(process.execPath, [scriptPath, "--skip-download", "--download-dir", downloadDir], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Could not find release-receipt.json")
    });
  });

  it("rejects archived release receipts containing secret-like material", async () => {
    const downloadDir = await writeDownloadedArtifactFixture({ releaseReceiptOverrides: { notes: "APPLE_APP_SPECIFIC_PASSWORD=secret" } });

    await expect(
      execFileAsync(process.execPath, [scriptPath, "--skip-download", "--download-dir", downloadDir], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Release receipt contains sensitive material")
    });
  });

  it("requires a GitHub run id when downloading the artifact", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath, "--download-dir", path.join(os.tmpdir(), "gideon-missing-run-id")], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", GITHUB_RUN_ID: "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("--run-id or GITHUB_RUN_ID is required")
    });
  });

  it("verifies the evidence commit against GitHub run metadata when a run id is supplied", async () => {
    const downloadDir = await writeDownloadedArtifactFixture();
    const fakeGhDir = await writeFakeGh({ headSha: "0123456789abcdef0123456789abcdef01234567" });

    const result = await execFileAsync(
      process.execPath,
      [scriptPath, "--skip-download", "--download-dir", downloadDir, "--run-id", "12345", "--repo", "example/Gideon"],
      {
        cwd: process.cwd(),
        env: { PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}` }
      }
    );

    expect(result.stdout).toContain("GitHub promotion evidence artifact check passed");
  });

  it("writes a safe verification receipt for archived release evidence", async () => {
    const downloadDir = await writeDownloadedArtifactFixture();
    const fakeGhDir = await writeFakeGh({ headSha: "0123456789abcdef0123456789abcdef01234567" });
    const receiptPath = path.join(downloadDir, "receipt.json");

    await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--skip-download",
        "--download-dir",
        downloadDir,
        "--run-id",
        "12345",
        "--repo",
        "example/Gideon",
        "--write-receipt",
        receiptPath
      ],
      {
        cwd: process.cwd(),
        env: { PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}` }
      }
    );

    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8")) as {
      repository: string;
      runId: string;
      evidence: { gitCommit: string; stepCount: number; sha256: string };
      providerCanaryReport: { mode: string; capabilityCount: number; capabilities: string[]; sha256: string };
      releaseReceipt: { product: string; channel: string; notarizationStatus: string; installSmokeResult: string; sha256: string };
      githubRun: { headSha: string; event: string };
      checks: { secretPolicy: string; runMetadata: string; providerCanaryReport: string; releaseReceipt: string };
    };
    expect(receipt.repository).toBe("example/Gideon");
    expect(receipt.runId).toBe("12345");
    expect(receipt.evidence.gitCommit).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(receipt.evidence.stepCount).toBe(16);
    expect(receipt.evidence.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.providerCanaryReport.mode).toBe("live");
    expect(receipt.providerCanaryReport.capabilityCount).toBe(4);
    expect(receipt.providerCanaryReport.capabilities).toEqual(["analysis", "ocr", "transcription", "tts"]);
    expect(receipt.providerCanaryReport.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.releaseReceipt.product).toBe("Gideon");
    expect(receipt.releaseReceipt.channel).toBe("production");
    expect(receipt.releaseReceipt.notarizationStatus).toBe("accepted");
    expect(receipt.releaseReceipt.installSmokeResult).toBe("passed");
    expect(receipt.releaseReceipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.githubRun.headSha).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(receipt.githubRun.event).toBe("workflow_dispatch");
    expect(receipt.checks.runMetadata).toBe("passed");
    expect(receipt.checks.providerCanaryReport).toBe("passed");
    expect(receipt.checks.releaseReceipt).toBe("passed");
    expect(receipt.checks.secretPolicy).toContain("excludes environment");
    expect(JSON.stringify(receipt)).not.toContain("secretPolicy:");
  });

  it("rejects evidence whose git commit does not match the GitHub run head SHA", async () => {
    const downloadDir = await writeDownloadedArtifactFixture();
    const fakeGhDir = await writeFakeGh({ headSha: "fedcba9876543210fedcba9876543210fedcba98" });

    await expect(
      execFileAsync(
        process.execPath,
        [scriptPath, "--skip-download", "--download-dir", downloadDir, "--run-id", "12345", "--repo", "example/Gideon"],
        {
          cwd: process.cwd(),
          env: { PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}` }
        }
      )
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("does not match GitHub run headSha")
    });
  });
});

async function writeDownloadedArtifactFixture(
  input: { includeProviderReport?: boolean; includeReleaseReceipt?: boolean; releaseReceiptOverrides?: Record<string, unknown> } = {}
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-github-promotion-evidence-"));
  const artifactDir = path.join(tempDir, "artifact");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, "production-promotion-evidence.json"), `${JSON.stringify(createEvidence(), null, 2)}\n`);
  if (input.includeProviderReport !== false) {
    await fs.writeFile(path.join(artifactDir, "provider-canary-report.json"), `${JSON.stringify(createProviderCanaryReport(), null, 2)}\n`);
  }
  if (input.includeReleaseReceipt !== false) {
    await fs.writeFile(
      path.join(artifactDir, "release-receipt.json"),
      `${JSON.stringify({ ...createReleaseReceipt(), ...input.releaseReceiptOverrides }, null, 2)}\n`
    );
  }
  return tempDir;
}

async function writeFakeGh(input: { headSha: string }): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-fake-gh-evidence-"));
  const ghPath = path.join(tempDir, "gh");
  await fs.writeFile(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "run" && args[1] === "view") {
  process.stdout.write(JSON.stringify({
    databaseId: 12345,
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    headSha: ${JSON.stringify(input.headSha)}
  }));
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`
  );
  await fs.chmod(ghPath, 0o755);
  return tempDir;
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

function createProviderCanaryReport() {
  const now = "2026-07-01T12:00:00.000Z";
  return {
    mode: "live",
    providerConfigured: true,
    baseUrl: "https://api.openai.com/v1",
    generatedAt: now,
    results: [
      providerResult("analysis", "gpt-4.1-mini", 0.003, 0.02),
      providerResult("transcription", "gpt-4o-transcribe", 0.001, 0.01),
      providerResult("ocr", "gpt-4.1-mini", 0.002, 0.02),
      providerResult("tts", "gpt-4o-mini-tts", 0.001, 0.01)
    ]
  };
}

function createReleaseReceipt() {
  const now = "2026-07-01T12:00:00.000Z";
  return {
    schemaVersion: 1,
    product: "Gideon",
    version: "0.1.0",
    channel: "production",
    generatedAt: now,
    source: {
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
      workflowRunId: "12345"
    },
    artifacts: [
      { fileName: "Gideon-0.1.0-arm64.dmg", size: 1, sha256: "0".repeat(64) },
      { fileName: "Gideon-0.1.0-arm64-mac.zip", size: 1, sha256: "1".repeat(64) },
      { fileName: "latest-mac.yml", size: 1, sha256: "2".repeat(64) },
      { fileName: "provenance.json", size: 1, sha256: "3".repeat(64) }
    ],
    notarization: {
      status: "accepted",
      requestId: "notary-123456",
      completedAt: now
    },
    stapling: {
      dmg: "accepted"
    },
    gatekeeper: {
      spctlAssessment: "accepted",
      checkedAt: now
    },
    installSmoke: {
      result: "passed",
      checkedAt: now
    }
  };
}

function providerResult(capability: string, model: string, costUsd: number, maxCostUsd: number) {
  return {
    capability,
    provider: "openai",
    status: "passed",
    model,
    message: `${capability} canary passed.`,
    durationMs: 10,
    costUsd,
    maxCostUsd
  };
}
