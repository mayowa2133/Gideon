import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-production-promotion-evidence.mjs");

describe("production promotion evidence check", () => {
  it("prints the evidence verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Production promotion evidence check dry-run:");
    expect(result.stdout).toContain("Require all live staging/provider/MCP/release steps");
    expect(result.stdout).toContain("Scan evidence fields for secret-like material");
  });

  it("accepts successful live promotion evidence with release steps", async () => {
    const evidencePath = await writeEvidenceFixture();

    const result = await runEvidenceCheck(evidencePath);

    expect(result.stdout).toContain("Production promotion evidence check passed");
  });

  it("allows infrastructure-only rehearsal evidence only when explicitly allowed", async () => {
    const evidencePath = await writeEvidenceFixture({ skipPackage: true });

    await expect(runEvidenceCheck(evidencePath)).rejects.toMatchObject({
      stderr: expect.stringContaining("skipPackage=true")
    });

    const allowed = await execFileAsync(process.execPath, [scriptPath, "--path", evidencePath, "--allow-skip-package"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });
    expect(allowed.stdout).toContain("Production promotion evidence check passed");
  });

  it("rejects failed or incomplete promotion evidence", async () => {
    const evidencePath = await writeEvidenceFixture({ failedStep: "live provider canaries" });

    await expect(runEvidenceCheck(evidencePath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Evidence status must be succeeded")
    });
  });

  it("rejects evidence containing session cookies or secret-like material", async () => {
    const evidencePath = await writeEvidenceFixture({ unsafeCommandPart: "gideon_session=abc123" });

    await expect(runEvidenceCheck(evidencePath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Evidence contains sensitive material")
    });
  });
});

async function runEvidenceCheck(evidencePath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--path", evidencePath], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
}

async function writeEvidenceFixture(
  input: { skipPackage?: boolean; failedStep?: string; unsafeCommandPart?: string } = {}
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-production-evidence-"));
  const evidencePath = path.join(tempDir, "promotion-evidence.json");
  const now = "2026-06-30T12:00:00.000Z";
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
  const steps = stepNames.map((name, index) => ({
    name,
    command: ["pnpm", name.replaceAll(" ", "-"), ...(input.unsafeCommandPart && index === 0 ? [input.unsafeCommandPart] : [])],
    env:
      name === "production macOS release metadata"
        ? { GIDEON_RELEASE_CHANNEL: "production" }
        : name === "live provider canaries" || name === "provider canary report"
          ? { GIDEON_PROVIDER_CANARY_REPORT_PATH: "tmp/provider-canary-report.json" }
          : {},
    startedAt: now,
    finishedAt: now,
    durationMs: 10,
    status: input.failedStep === name ? "failed" : "succeeded",
    exitCode: input.failedStep === name ? 1 : 0,
    error: input.failedStep === name ? "Command exited with non-zero status." : null
  }));
  const evidence = {
    schemaVersion: 1,
    generatedAt: now,
    finishedAt: now,
    status: input.failedStep ? "failed" : "succeeded",
    failedStep: input.failedStep ?? null,
    mode: "live",
    skipPackage: Boolean(input.skipPackage),
    gitCommit: "0123456789abcdef0123456789abcdef01234567",
    steps,
    safety: {
      secretPolicy:
        "Commands, step names, exit codes, safe env overrides, and timings are recorded. Process environment, cookies, API keys, signed URLs, provider payloads, transcripts, prompts, and media paths are not recorded."
    }
  };
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidencePath;
}
