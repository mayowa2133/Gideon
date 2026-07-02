import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProviderConfig } from "./config";
import {
  OpenAiProvider,
  parseFrameOcr,
  parseTranscriptSegments,
  parseWalkthroughAnalysis,
  validateWavAudioBuffer
} from "./openai";
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
              sourceEvidenceIds: ["transcript:segment-1"],
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
      confidence: 0.8,
      sourceEvidenceIds: ["transcript:segment-1"]
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
                      sourceEvidenceIds: ["moment:moment-1"],
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

  it("rejects provider moments that cite unknown source evidence when source grounding is required", () => {
    expect(() =>
      parseWalkthroughAnalysis(
        {
          output_text: JSON.stringify({
            summary: "The demo shows setup, product action, and final outcome.",
            moments: [
              {
                label: "Setup",
                startMs: 0,
                endMs: 5000,
                evidence: "The first screen establishes the setup.",
                sourceEvidenceIds: ["frame:missing"],
                confidence: 0.7
              }
            ]
          })
        },
        30_000,
        {
          allowedEvidenceIds: ["frame:frame-1"],
          requireSourceEvidence: true
        }
      )
    ).toThrow(/unknown source evidence/);
  });

  it("rejects provider moments without source evidence when source grounding is required", () => {
    expect(() =>
      parseWalkthroughAnalysis(
        {
          output_text: JSON.stringify({
            summary: "The demo shows setup, product action, and final outcome.",
            moments: [
              {
                label: "Setup",
                startMs: 0,
                endMs: 5000,
                evidence: "The first screen establishes the setup.",
                sourceEvidenceIds: [],
                confidence: 0.7
              }
            ]
          })
        },
        30_000,
        {
          allowedEvidenceIds: ["frame:frame-1"],
          requireSourceEvidence: true
        }
      )
    ).toThrow(/did not cite source evidence/);
  });

  it("rejects malformed source evidence references", () => {
    expect(() =>
      parseWalkthroughAnalysis(
        {
          output_text: JSON.stringify({
            summary: "The demo shows setup, product action, and final outcome.",
            moments: [
              {
                label: "Setup",
                startMs: 0,
                endMs: 5000,
                evidence: "The first screen establishes the setup.",
                sourceEvidenceIds: ["frame:frame-1", 42],
                confidence: 0.7
              }
            ]
          })
        },
        30_000,
        {
          allowedEvidenceIds: ["frame:frame-1"],
          requireSourceEvidence: true
        }
      )
    ).toThrow(/invalid sourceEvidenceIds/);
  });
});

describe("OpenAI frame OCR parsing", () => {
  it("parses OCR text and clamps confidence", () => {
    const parsed = parseFrameOcr({
      output_text: JSON.stringify({
        text: "Create campaign\nGenerate scripts",
        uiElements: [
          { kind: "heading", text: "Create campaign", confidence: 0.82 },
          { kind: "button", text: "Generate scripts", role: "primary action", confidence: 1.4 }
        ],
        confidence: 1.4
      })
    });
    expect(parsed).toEqual({
      text: "Create campaign\nGenerate scripts",
      confidence: 1,
      uiElements: [
        { id: "ui-1", kind: "heading", text: "Create campaign", role: undefined, confidence: 0.82 },
        { id: "ui-2", kind: "button", text: "Generate scripts", role: "primary action", confidence: 1 }
      ]
    });
  });

  it("rejects OCR output without structured UI elements", () => {
    expect(() =>
      parseFrameOcr({
        output_text: JSON.stringify({
          text: "Create campaign",
          confidence: 0.7
        })
      })
    ).toThrow(/missing uiElements/);
  });
});

describe("OpenAI transcription parsing", () => {
  it("normalizes timestamped transcript segments and skips empty text", () => {
    const segments = parseTranscriptSegments(
      {
        segments: [
          { start: -1, end: 1.4, text: "  First step  ", confidence: 0.91, speaker: "founder" },
          { start: 1.4, end: 1.4, text: "zero length" },
          { start: 2, end: 40, text: "Final result" },
          { start: 3, end: 4, text: "   " }
        ]
      },
      "First step Final result",
      30_000
    );

    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({
      startMs: 0,
      endMs: 1400,
      text: "First step",
      confidence: 0.91,
      speaker: "founder"
    });
    expect(segments[1]).toMatchObject({
      startMs: 1400,
      endMs: 1401,
      text: "zero length"
    });
    expect(segments[2]).toMatchObject({
      startMs: 2000,
      endMs: 30_000,
      text: "Final result"
    });
  });

  it("falls back to one full-duration segment for plain text transcription responses", () => {
    const segments = parseTranscriptSegments({}, "Here is the walkthrough.", 12_000);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startMs: 0,
      endMs: 12_000,
      text: "Here is the walkthrough."
    });
  });
});

describe("OpenAI speech audio validation", () => {
  it("validates WAV audio with a non-empty data chunk", () => {
    const wav = wavFixture(8);

    expect(validateWavAudioBuffer(wav)).toEqual({
      byteSize: wav.byteLength,
      dataBytes: 8
    });
  });

  it("rejects non-WAV provider audio", () => {
    expect(() => validateWavAudioBuffer(Buffer.from("not-a-wav"))).toThrow(/too small|RIFF\/WAVE/);
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
                  sourceEvidenceIds: ["frame:frame-moment-1", "moment:moment-1"],
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
      frameEvidence: [
        {
          id: "frame-moment-1",
          momentId: "moment-1",
          timestampMs: 1000,
          ocrProvider: "openai",
          ocrText: "Qualified leads generated",
          uiElements: [{ id: "ui-1", kind: "status", text: "Qualified leads generated", confidence: 0.9 }],
          confidence: 0.9,
          createdAt: "2026-06-25T00:00:00.000Z"
        }
      ],
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
    expect(result.moments[0]?.sourceEvidenceIds).toEqual(["frame:frame-moment-1", "moment:moment-1"]);
    expect(requests[0]?.url).toBe("https://api.example.test/v1/responses");
    const body = JSON.parse(String(requests[0]?.init.body)) as {
      model: string;
      input: Array<{ content: string }>;
      text: { format: { type: string } };
    };
    expect(body.model).toBe("gpt-test");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.input[1]?.content).toContain("Qualified leads generated");
    expect(body.input[1]?.content).toContain("status");
    expect(body.input[1]?.content).toContain("frame:frame-moment-1");
    expect(body.input[1]?.content).toContain("moment:moment-1");
  });

  it("posts image data URLs for frame OCR requests", async () => {
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
              text: "Generate scripts",
              uiElements: [{ kind: "button", text: "Generate scripts", role: "primary action", confidence: 0.74 }],
              confidence: 0.74
            })
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-ocr-"));
    const imagePath = path.join(tempDir, "frame.jpg");
    await fs.writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const result = await provider.extractFrameText({ imagePath, timestampMs: 1200, momentLabel: "Setup" });

    expect(result.text).toBe("Generate scripts");
    expect(result.uiElements).toEqual([
      {
        id: "ui-1",
        kind: "button",
        text: "Generate scripts",
        role: "primary action",
        confidence: 0.74
      }
    ]);
    expect(requests[0]?.url).toBe("https://api.example.test/v1/responses");
    const body = JSON.parse(String(requests[0]?.init.body)) as {
      input: Array<{ content: Array<{ type: string; image_url?: string; detail?: string }> }>;
      text: { format: { type: string; name: string } };
    };
    const imagePart = body.input[1]?.content.find((part) => part.type === "input_image");
    expect(imagePart?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(imagePart?.detail).toBe("low");
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "gideon_frame_ocr" });
    expect(String(body.input[1]?.content[0]?.type)).toBe("input_text");
  });

  it("requests verbose timestamped transcription segments", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new OpenAiProvider({
      config: {
        apiKey: "sk-test",
        baseUrl: "https://api.example.test/v1",
        llmModel: "gpt-test",
        transcriptionModel: "gpt-transcribe-test",
        ttsModel: "gpt-4o-mini-tts",
        ttsVoice: "coral"
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            text: "Create campaign. Generate scripts.",
            segments: [
              { start: 0, end: 1.2, text: "Create campaign." },
              { start: 1.2, end: 2.6, text: "Generate scripts." }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-transcribe-"));
    const audioPath = path.join(tempDir, "source.wav");
    await fs.writeFile(audioPath, Buffer.from("RIFF----WAVEfmt "));

    const result = await provider.transcribeAudio(audioPath, recording);

    expect(result.text).toBe("Create campaign. Generate scripts.");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ startMs: 0, endMs: 1200, text: "Create campaign." });
    expect(requests[0]?.url).toBe("https://api.example.test/v1/audio/transcriptions");
    const form = requests[0]?.init.body as FormData;
    expect(form.get("model")).toBe("gpt-transcribe-test");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.getAll("timestamp_granularities[]")).toEqual(["segment"]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("writes validated WAV audio for speech synthesis", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new OpenAiProvider({
      config: {
        apiKey: "sk-test",
        baseUrl: "https://api.example.test/v1",
        llmModel: "gpt-test",
        transcriptionModel: "gpt-transcribe-test",
        ttsModel: "tts-test",
        ttsVoice: "coral"
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(wavFixture(8), { status: 200, headers: { "Content-Type": "audio/wav" } });
      }
    });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-tts-"));
    const outputPath = path.join(tempDir, "speech.wav");

    const result = await provider.synthesizeSpeech({
      text: "Generate a short demo.",
      instructions: "Clear voice.",
      outputPath
    });

    expect(result).toEqual({ outputPath, provider: "openai", model: "tts-test" });
    expect(await fs.readFile(outputPath)).toEqual(wavFixture(8));
    const body = JSON.parse(String(requests[0]?.init.body)) as { model: string; voice: string; response_format: string };
    expect(body).toMatchObject({ model: "tts-test", voice: "coral", response_format: "wav" });
  });

  it("rejects invalid speech synthesis audio before writing output", async () => {
    const provider = new OpenAiProvider({
      config: {
        apiKey: "sk-test",
        baseUrl: "https://api.example.test/v1",
        llmModel: "gpt-test",
        transcriptionModel: "gpt-transcribe-test",
        ttsModel: "tts-test",
        ttsVoice: "coral"
      },
      fetchImpl: async () => new Response(Buffer.from("not audio"), { status: 200 })
    });
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-tts-invalid-"));
    const outputPath = path.join(tempDir, "speech.wav");

    await expect(
      provider.synthesizeSpeech({
        text: "Generate a short demo.",
        instructions: "Clear voice.",
        outputPath
      })
    ).rejects.toThrow(/too small|RIFF\/WAVE/);
    await expect(fs.stat(outputPath)).rejects.toThrow();
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
