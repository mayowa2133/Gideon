import { describe, expect, it } from "vitest";
import { redactSecrets, runProviderCanaries, type ProviderCanaryAdapter } from "./providerCanary";

function fakeAdapter(calls: string[] = []): ProviderCanaryAdapter {
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
        ]
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
        segments: [],
        createdAt: "2026-06-29T00:00:00.000Z"
      };
    },
    async extractFrameText() {
      calls.push("ocr");
      return {
        text: "Canary UI text",
        confidence: 0.8
      };
    },
    async synthesizeSpeech() {
      calls.push("tts");
      return {
        outputPath: "/tmp/canary.wav",
        provider: "openai",
        model: "tts-test"
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

  it("runs live analysis and TTS while skipping fixture-dependent ASR and OCR when media paths are absent", async () => {
    const calls: string[] = [];
    const report = await runProviderCanaries({
      mode: "live",
      env: {
        GIDEON_OPENAI_API_KEY: "sk-test"
      },
      adapter: fakeAdapter(calls),
      now: () => new Date("2026-06-29T00:00:00.000Z")
    });

    expect(report.results.find((result) => result.capability === "analysis")?.status).toBe("passed");
    expect(report.results.find((result) => result.capability === "tts")?.status).toBe("passed");
    expect(report.results.find((result) => result.capability === "transcription")?.status).toBe("skipped");
    expect(report.results.find((result) => result.capability === "ocr")?.status).toBe("skipped");
    expect(calls).toEqual(["analysis", "tts"]);
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
});
