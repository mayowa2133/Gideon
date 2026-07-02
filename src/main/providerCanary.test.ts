import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import { loadProviderCanaryCostConfig, redactSecrets, runProviderCanaries, type ProviderCanaryAdapter } from "./providerCanary";

function fakeAdapter(calls: string[] = [], costs: Partial<Record<string, number>> = {}): ProviderCanaryAdapter {
  return {
    async analyzeWalkthrough() {
      calls.push("analysis");
      return {
        summary: "Canary summary",
        moments: [
          {
            label: "Moment",
            startMs: 0,
            endMs: 1000,
            evidence: "Fixture evidence",
            confidence: 0.9
          }
        ],
        costUsd: costs.analysis
      };
    },
    async transcribeAudio() {
      calls.push("transcription");
      return {
        id: "transcript-1",
        status: "completed",
        provider: "openai",
        model: "transcribe-test",
        text: "Canary transcript",
        segments: [{ id: "segment-1", startMs: 0, endMs: 1000, text: "Canary transcript" }],
        createdAt: "2026-06-29T00:00:00.000Z",
        costUsd: costs.transcription
      };
    },
    async extractFrameText() {
      calls.push("ocr");
      return {
        text: "Canary UI text",
        uiElements: [{ id: "ui-1", kind: "button", text: "Canary UI text", confidence: 0.8 }],
        confidence: 0.8,
        costUsd: costs.ocr
      };
    },
    async synthesizeSpeech(input) {
      calls.push("tts");
      await fs.writeFile(input.outputPath, wavFixture(8));
      return {
        outputPath: input.outputPath,
        provider: "openai",
        model: "tts-test",
        costUsd: costs.tts
      };
    }
  };
}

describe("provider canary", () => {
  it("dry-runs without credentials and does not call providers", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      env: {},
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.mode).toBe("dry_run");
    expect(report.providerConfigured).toBe(false);
    expect(report.results).toHaveLength(4);
    expect(report.results.every((result) => result.status === "skipped")).toBe(true);
    expect(calls).toEqual([]);
  });

  it("reports configured dry-run coverage when credentials are present", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      env: {
        GIDEON_OPENAI_API_KEY: "sk-test",
        GIDEON_OPENAI_LLM_MODEL: "llm-test",
        GIDEON_OPENAI_TRANSCRIPTION_MODEL: "transcribe-test",
        GIDEON_OPENAI_TTS_MODEL: "tts-test"
      },
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.mode).toBe("dry_run");
    expect(report.results.map((result) => result.status)).toEqual([
      "configured",
      "configured",
      "configured",
      "configured"
    ]);
    expect(report.results.find((result) => result.capability === "transcription")?.model).toBe("transcribe-test");
    expect(calls).toEqual([]);
  });

  it("runs live analysis and TTS within configured cost ceilings while skipping fixture-dependent ASR and OCR when media paths are absent", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      mode: "live",
      env: {
        GIDEON_OPENAI_API_KEY: "sk-test",
        GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD: "0.05",
        GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD: "0.01",
        GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD: "0.02",
        GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD: "0.005"
      },
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.results.find((result) => result.capability === "analysis")?.status).toBe("passed");
    expect(report.results.find((result) => result.capability === "analysis")?.costUsd).toBe(0.01);
    expect(report.results.find((result) => result.capability === "analysis")?.maxCostUsd).toBe(0.05);
    expect(report.results.find((result) => result.capability === "tts")?.status).toBe("passed");
    expect(report.results.find((result) => result.capability === "transcription")?.status).toBe("skipped");
    expect(report.results.find((result) => result.capability === "ocr")?.status).toBe("skipped");
    expect(calls).toEqual(["analysis", "tts"]);
  });

  it("fails live canaries when required cost ceilings are missing", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      mode: "live",
      env: {
        GIDEON_OPENAI_API_KEY: "sk-test"
      },
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.results.find((result) => result.capability === "analysis")?.status).toBe("failed");
    expect(report.results.find((result) => result.capability === "analysis")?.message).toContain(
      "GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD"
    );
    expect(report.results.find((result) => result.capability === "tts")?.message).toContain(
      "GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD"
    );
    expect(calls).toEqual(["analysis", "tts"]);
  });

  it("fails live canaries when reported provider cost exceeds configured ceilings", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      mode: "live",
      env: {
        GIDEON_OPENAI_API_KEY: "sk-test",
        GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD: "0.01",
        GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD: "0.02"
      },
      adapter: fakeAdapter(calls, { analysis: 0.5, tts: 0.005 }),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.results.find((result) => result.capability === "analysis")?.status).toBe("failed");
    expect(report.results.find((result) => result.capability === "analysis")?.message).toContain("exceeded max");
    expect(report.results.find((result) => result.capability === "tts")?.status).toBe("passed");
  });

  it("fails all live canaries when credentials are missing", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      mode: "live",
      env: {},
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.results.every((result) => result.status === "failed")).toBe(true);
    expect(calls).toEqual([]);
  });

  it("redacts provider secrets from canary failures", () => {
    expect(redactSecrets("request failed for sk-supersecretvalue", ["sk-supersecretvalue"])).toBe(
      "request failed for [redacted]"
    );
  });

  it("loads provider canary cost ceilings from environment", () => {
    expect(
      loadProviderCanaryCostConfig({
        GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD: "0.0123456",
        GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD: "0.02",
        GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD: "bad"
      }).analysis
    ).toEqual({ estimatedCostUsd: 0.012346, maxCostUsd: 0.02 });
  });
});

function wavFixture(dataBytes: number): Buffer {
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
