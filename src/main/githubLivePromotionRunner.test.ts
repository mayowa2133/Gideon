import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/run-github-live-promotion.mjs");
const configScriptPath = path.join(process.cwd(), "scripts/check-live-promotion-github-config.mjs");

describe("GitHub live promotion runner", () => {
  it("prints the live workflow plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("GitHub live promotion runner dry-run:");
    expect(result.stdout).toContain("Live promotion input run_live_promotion=true.");
    expect(result.stdout).toContain("Run GitHub Secrets/Vars repo settings preflight before dispatch.");
    expect(result.stdout).toContain("Dispatch the workflow only when --confirm-live is present.");
    expect(result.stdout).toContain("Download and verify Gideon-production-promotion-evidence, including provider-canary-report.json and release-receipt.json");
    expect(result.stdout).toContain("Write a safe verification receipt");
    expect(result.stdout).toContain("Re-run receipt and archive-bundle validators");
  });

  it("requires explicit confirmation before dispatching the live workflow", async () => {
    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "", GITHUB_RUN_ID: "" }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("requires --confirm-live")
    });
  });

  it("watches and verifies an existing run without dispatching", async () => {
    const expected = await readExpectedConfiguration();
    const fakeGhDir = await writeFakeGh(expected.secrets, expected.vars);

    const result = await execFileAsync(process.execPath, [scriptPath, "--run-id", "12345", "--repo", "example/Gideon"], {
      cwd: process.cwd(),
      env: {
        PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}`,
        GIDEON_FAKE_EVIDENCE_JSON: JSON.stringify(createEvidence()),
        GIDEON_FAKE_PROVIDER_CANARY_REPORT_JSON: JSON.stringify(createProviderCanaryReport()),
        GIDEON_FAKE_RELEASE_RECEIPT_JSON: JSON.stringify(createReleaseReceipt())
      }
    });

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("GitHub promotion evidence artifact check passed");
    expect(result.stdout).toContain("GitHub promotion verification receipt check passed");
    expect(result.stdout).toContain("GitHub promotion archive bundle check passed");
    expect(result.stdout).toContain("GitHub live promotion workflow passed and archived evidence verified for run 12345.");
  });

  it("dispatches, resolves, watches, and verifies a confirmed live workflow", async () => {
    const expected = await readExpectedConfiguration();
    const fakeGhDir = await writeFakeGh(expected.secrets, expected.vars);
    const receiptPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "gideon-live-runner-receipt-")), "receipt.json");

    const result = await execFileAsync(
      process.execPath,
      [
        scriptPath,
        "--confirm-live",
        "--skip-package",
        "--repo",
        "example/Gideon",
        "--ref",
        "main",
        "--receipt-path",
        receiptPath
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}`,
          GIDEON_FAKE_EVIDENCE_JSON: JSON.stringify(createEvidence({ skipPackage: true })),
          GIDEON_FAKE_PROVIDER_CANARY_REPORT_JSON: JSON.stringify(createProviderCanaryReport())
        }
      }
    );

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("GitHub live promotion repo settings check passed");
    expect(result.stdout).toContain("GitHub promotion verification receipt check passed");
    expect(result.stdout).toContain("GitHub promotion archive bundle check passed");
    expect(result.stdout).toContain("GitHub live promotion workflow passed and archived evidence verified for run 67890.");
    const receipt = JSON.parse(await fs.readFile(receiptPath, "utf8")) as { runId: string; githubRun: { headSha: string } };
    expect(receipt.runId).toBe("67890");
    expect(receipt.githubRun.headSha).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("fails before dispatch when required GitHub settings are missing", async () => {
    const expected = await readExpectedConfiguration();
    const fakeGhDir = await writeFakeGh(expected.secrets.slice(1), expected.vars);

    await expect(
      execFileAsync(process.execPath, [scriptPath, "--confirm-live", "--repo", "example/Gideon"], {
        cwd: process.cwd(),
        env: {
          PATH: `${fakeGhDir}${path.delimiter}${process.env.PATH ?? ""}`,
          GIDEON_FAKE_EVIDENCE_JSON: JSON.stringify(createEvidence())
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(expected.secrets[0])
    });
  });
});

async function readExpectedConfiguration(): Promise<{ secrets: string[]; vars: string[] }> {
  const result = await execFileAsync(process.execPath, [configScriptPath, "--json"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
  return JSON.parse(result.stdout) as { secrets: string[]; vars: string[] };
}

async function writeFakeGh(secrets: string[], vars: string[]): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-fake-gh-"));
  const ghPath = path.join(tempDir, "gh");
  await fs.writeFile(
    ghPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "secret" && args[1] === "list") {
  process.stdout.write(JSON.stringify(${JSON.stringify(secrets.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === "variable" && args[1] === "list") {
  process.stdout.write(JSON.stringify(${JSON.stringify(vars.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === "workflow" && args[1] === "run") {
  process.exit(0);
}
if (args[0] === "run" && args[1] === "list") {
  process.stdout.write(JSON.stringify([{ databaseId: 67890, createdAt: new Date().toISOString(), status: "queued", conclusion: null, headBranch: "main" }]));
  process.exit(0);
}
if (args[0] === "run" && args[1] === "view") {
  process.stdout.write(JSON.stringify({
    databaseId: Number(args[2]),
    status: "completed",
    conclusion: "success",
    event: "workflow_dispatch",
    headSha: "0123456789abcdef0123456789abcdef01234567"
  }));
  process.exit(0);
}
if (args[0] === "run" && args[1] === "watch") {
  process.exit(0);
}
if (args[0] === "run" && args[1] === "download") {
  const dir = args[args.indexOf("--dir") + 1];
  fs.mkdirSync(path.join(dir, "artifact"), { recursive: true });
  fs.writeFileSync(path.join(dir, "artifact", "production-promotion-evidence.json"), process.env.GIDEON_FAKE_EVIDENCE_JSON + "\\n");
  fs.writeFileSync(path.join(dir, "artifact", "provider-canary-report.json"), process.env.GIDEON_FAKE_PROVIDER_CANARY_REPORT_JSON + "\\n");
  if (process.env.GIDEON_FAKE_RELEASE_RECEIPT_JSON) {
    fs.writeFileSync(path.join(dir, "artifact", "release-receipt.json"), process.env.GIDEON_FAKE_RELEASE_RECEIPT_JSON + "\\n");
  }
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`
  );
  await fs.chmod(ghPath, 0o755);
  return tempDir;
}

function createEvidence(input: { skipPackage?: boolean } = {}) {
  const now = "2026-07-01T12:00:00.000Z";
  const baseSteps = [
    "local production readiness gate",
    "strict staging readiness gate",
    "production billing reconciliation",
    "production PostgreSQL policy",
    "production BullMQ policy",
    "production observability policy",
    "production storage lifecycle policy",
    "production storage signed-download smoke",
    "production TTS policy",
    "live provider canaries",
    "provider canary report",
    "live staging upload-to-export smoke",
    "live staging hosted MCP smoke"
  ];
  const releaseSteps = [
    "signed macOS package",
    "production macOS release metadata",
    "production release notarization receipt",
    "production macOS DMG verification"
  ];
  const stepNames = input.skipPackage ? baseSteps : [...baseSteps, ...releaseSteps];
  return {
    schemaVersion: 1,
    generatedAt: now,
    finishedAt: now,
    status: "succeeded",
    failedStep: null,
    mode: "live",
    skipPackage: Boolean(input.skipPackage),
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
