import { describe, expect, it } from "vitest";
import { loadProviderConfig } from "./config";
import { OpenAiProvider, parseWalkthroughAnalysis } from "./openai";
import type { ProductProfile, RecordingMetadata } from "../../shared/types";

const profile: ProductProfile = {
  productName: "LeadPilot",
  targetCustomer: "B2B SaaS founders",
  productDescription: "Finds qualified leads and drafts personalized outreach from one workflow.",
  preferredTone: "direct",
  toneGuidance: "No hype.",
  platforms: ["tiktok"],
  walkthroughNotes: "Show setup, lead research, and final draft."
};

const recording: RecordingMetadata = {
  filePath: "/tmp/source.mp4",
  fileUrl: "file:///tmp/source.mp4",
  fileName: "source.mp4",
  sizeBytes: 1000,
  durationMs: 30_000,
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  validatedAt: "2026-06-25T00:00:00.000Z"
};

describe("OpenAI provider config", () => {
  it("loads safe defaults and API key aliases", () => {
    const config = loadProviderConfig({
      OPENAI_API_KEY: "sk-test",
      GIDEON_OPENAI_BASE_URL: "https://example.test/v1/",
      GIDEON_OPENAI_LLM_MODEL: "custom-llm"
    });
    expect(config.openai.apiKey).toBe("sk-test");
    expect(config.openai.baseUrl).toBe("https://example.test/v1");
    expect(config.openai.llmModel).toBe("custom-llm");
    expect(config.openai.transcriptionModel).toBe("gpt-4o-transcribe");
    expect(config.openai.ttsModel).toBe("gpt-4o-mini-tts");
  });
});

describe("OpenAI structured analysis parsing", () => {
  it("parses output_text JSON and clamps timestamps to recording duration", () => {
    const parsed = parseWalkthroughAnalysis(
      {
        output_text: JSON.stringify({
          summary: "The walkthrough shows a lead research workflow ending in a draft.",
          moments: [
            {
              label: "Lead research result",
              startMs: -50,
              endMs: 35_000,
              evidence: "Transcript and visible result both support the generated lead list.",
              confidence: 0.8
            }
          ]
        })
      },
      30_000
    );
    expect(parsed.summary).toContain("lead research");
    expect(parsed.moments[0]).toMatchObject({
      label: "Lead research result",
      startMs: 0,
      endMs: 30_000,
      confidence: 0.8
    });
  });

  it("parses nested Responses API output content", () => {
    const parsed = parseWalkthroughAnalysis(
      {
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  summary: "The demo shows setup, product action, and final outcome.",
                  moments: [
                    {
                      label: "Setup",
                      startMs: 0,
                      endMs: 5000,
                      evidence: "The first screen establishes the setup.",
                      confidence: 0.7
                    }
                  ]
                })
              }
            ]
          }
        ]
      },
      30_000
    );
    expect(parsed.moments).toHaveLength(1);
  });
});

describe("OpenAI provider requests", () => {
  it("posts structured analysis requests to the Responses API", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new OpenAiProvider({
      config: {
        apiKey: "sk-test",
        baseUrl: "https://api.example.test/v1",
        llmModel: "gpt-test",
        transcriptionModel: "gpt-4o-transcribe",
        ttsModel: "gpt-4o-mini-tts",
        ttsVoice: "coral"
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              summary: "The walkthrough contains a clear product proof moment.",
              moments: [
                {
                  label: "Proof moment",
                  startMs: 1000,
                  endMs: 5000,
                  evidence: "The transcript and fallback moment both describe the result.",
                  confidence: 0.82
                }
              ]
            })
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });

    const result = await provider.analyzeWalkthrough({
      profile,
      recording,
      moments: [
        {
          id: "moment-1",
          label: "Fallback",
          startMs: 0,
          endMs: 5000,
          evidence: "Fallback evidence",
          confidence: 0.7,
          enabled: true
        }
      ]
    });

    expect(result.moments[0]?.label).toBe("Proof moment");
    expect(requests[0]?.url).toBe("https://api.example.test/v1/responses");
    const body = JSON.parse(String(requests[0]?.init.body)) as { model: string; text: { format: { type: string } } };
    expect(body.model).toBe("gpt-test");
    expect(body.text.format.type).toBe("json_schema");
  });
});

