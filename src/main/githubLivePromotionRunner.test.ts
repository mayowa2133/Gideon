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
    expect(result.stdout).toContain("Download and verify Gideon-production-promotion-evidence");
    expect(result.stdout).toContain("Write a safe verification receipt");
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
        GIDEON_FAKE_EVIDENCE_JSON: JSON.stringify(createEvidence())
      }
    });

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("GitHub promotion evidence artifact check passed");
    expect(result.stdout).toContain("GitHub live promotion workflow passed and evidence verified for run 12345.");
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
          GIDEON_FAKE_EVIDENCE_JSON: JSON.stringify(createEvidence({ skipPackage: true }))
        }
      }
    );

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("GitHub live promotion repo settings check passed");
    expect(result.stdout).toContain("GitHub live promotion workflow passed and evidence verified for run 67890.");
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
    "production storage lifecycle policy",
    "live provider canaries",
    "live staging upload-to-export smoke",
    "live staging hosted MCP smoke"
  ];
  const releaseSteps = ["signed macOS package", "production macOS release metadata", "production macOS DMG verification"];
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
      env: name === "production macOS release metadata" ? { GIDEON_RELEASE_CHANNEL: "production" } : {},
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
