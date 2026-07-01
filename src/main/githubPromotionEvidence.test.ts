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
    expect(result.stdout).toContain("Verify the evidence with the production evidence checker.");
    expect(result.stdout).toContain("verify evidence gitCommit matches gh run view headSha");
  });

  it("verifies an already downloaded evidence artifact", async () => {
    const downloadDir = await writeDownloadedArtifactFixture();

    const result = await execFileAsync(process.execPath, [scriptPath, "--skip-download", "--download-dir", downloadDir], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production promotion evidence check passed");
    expect(result.stdout).toContain("GitHub promotion evidence artifact check passed");
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

async function writeDownloadedArtifactFixture(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-github-promotion-evidence-"));
  const artifactDir = path.join(tempDir, "artifact");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, "production-promotion-evidence.json"), `${JSON.stringify(createEvidence(), null, 2)}\n`);
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
    "live provider canaries",
    "live staging upload-to-export smoke",
    "live staging hosted MCP smoke",
    "signed macOS package",
    "production macOS release metadata",
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
