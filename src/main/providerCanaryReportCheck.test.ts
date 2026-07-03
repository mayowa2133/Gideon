import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-provider-canary-report.mjs");

describe("provider canary report check", () => {
  it("prints the report verification plan in dry-run mode", async () => {
    const result = await execFileAsync(process.execPath, [scriptPath, "--dry-run"], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    });

    expect(result.stdout).toContain("Provider canary report check dry-run:");
    expect(result.stdout).toContain("Require passed analysis, transcription, OCR, and TTS canaries.");
    expect(result.stdout).toContain("Require prompt/model provenance");
    expect(result.stdout).toContain("Scan report fields for secret-like material");
  });

  it("accepts a safe successful live provider canary report", async () => {
    const reportPath = await writeReportFixture();

    const result = await runReportCheck(reportPath);

    expect(result.stdout).toContain("Provider canary report check passed");
  });

  it("rejects missing or skipped required capabilities", async () => {
    const reportPath = await writeReportFixture({ transcriptionStatus: "skipped" });

    await expect(runReportCheck(reportPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Report transcription status must be passed")
    });
  });

  it("rejects canary costs above the configured ceiling", async () => {
    const reportPath = await writeReportFixture({ ttsCostUsd: 0.05, ttsMaxCostUsd: 0.01 });

    await expect(runReportCheck(reportPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Report tts costUsd must not exceed maxCostUsd")
    });
  });

  it("rejects missing prompt provenance for prompt-backed canaries", async () => {
    const reportPath = await writeReportFixture({ omitPromptProvenance: true });

    await expect(runReportCheck(reportPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Report analysis promptVersion must be a safe non-empty prompt version")
    });
  });

  it("rejects report fields containing secret-like material", async () => {
    const reportPath = await writeReportFixture({ analysisMessage: "provider returned sk-this-is-not-safe-to-log" });

    await expect(runReportCheck(reportPath)).rejects.toMatchObject({
      stderr: expect.stringContaining("Report contains sensitive material")
    });
  });
});

async function runReportCheck(reportPath: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, [scriptPath, "--path", reportPath], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "" }
  });
}

async function writeReportFixture(
  input: {
    transcriptionStatus?: string;
    ttsCostUsd?: number;
    ttsMaxCostUsd?: number;
    analysisMessage?: string;
    omitPromptProvenance?: boolean;
  } = {}
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-provider-canary-report-"));
  const reportPath = path.join(tempDir, "provider-canary-report.json");
  const now = "2026-07-01T12:00:00.000Z";
  const report = {
    mode: "live",
    providerConfigured: true,
    baseUrl: "https://api.openai.com/v1",
    generatedAt: now,
    results: [
      result("analysis", "gpt-4.1-mini", input.analysisMessage ?? "Analysis canary passed.", 0.003, 0.02, "passed", input.omitPromptProvenance),
      result("transcription", "gpt-4o-transcribe", "Transcription canary passed.", 0.001, 0.01, input.transcriptionStatus),
      result("ocr", "gpt-4.1-mini", "OCR canary passed.", 0.002, 0.02, "passed", input.omitPromptProvenance),
      result("tts", "gpt-4o-mini-tts", "TTS canary passed.", input.ttsCostUsd ?? 0.001, input.ttsMaxCostUsd ?? 0.01, "passed", input.omitPromptProvenance)
    ]
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function result(
  capability: string,
  model: string,
  message: string,
  costUsd: number,
  maxCostUsd: number,
  status = "passed",
  omitPromptProvenance = false
) {
  const base = {
    capability,
    provider: "openai",
    status,
    model,
    message,
    durationMs: 12,
    costUsd,
    maxCostUsd
  };
  if (omitPromptProvenance || capability === "transcription") {
    return base;
  }
  if (capability === "analysis") {
    return {
      ...base,
      promptVersion: "analysis-v2",
      promptReviewedAt: "2026-07-01T00:00:00.000Z",
      promptRolloutStage: "production",
      promptRolloutPercent: 100,
      promptCanaryPercent: 0
    };
  }
  return {
    ...base,
    promptVersion: `${capability}-v2`
  };
}
