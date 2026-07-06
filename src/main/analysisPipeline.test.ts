import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMoments } from "../shared/contentEngine";
import type { ProductProfile, Project, RecordingMetadata } from "../shared/types";
import { runAnalysisPipeline } from "./analysisPipeline";

const profile: ProductProfile = {
  productName: "LeadPilot",
  targetCustomer: "B2B SaaS founders",
  productDescription: "Finds qualified leads and drafts personalized outreach from one workflow.",
  preferredTone: "direct",
  toneGuidance: "No hype.",
  platforms: ["tiktok"],
  walkthroughNotes: "Show setup and final draft."
};

const recording: RecordingMetadata = {
  filePath: "/tmp/missing-source.mp4",
  fileUrl: "file:///tmp/missing-source.mp4",
  fileName: "missing-source.mp4",
  sizeBytes: 1000,
  durationMs: 30_000,
  width: 1280,
  height: 720,
  fps: 30,
  videoCodec: "h264",
  audioCodec: null,
  hasAudio: false,
  validatedAt: "2026-06-25T00:00:00.000Z"
};

describe("analysis pipeline", () => {
  it("falls back to local deterministic analysis when OpenAI is not configured", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldGideonKey = process.env.GIDEON_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GIDEON_OPENAI_API_KEY;

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-analysis-"));
    const project: Project = {
      id: "project-1",
      workspaceId: "workspace-1",
      name: "LeadPilot campaign",
      status: "recording_ready",
      profile,
      recording,
      frameEvidence: [],
      moments: [],
      concepts: [],
      scripts: [],
      renders: [],
      artifacts: [],
      uploadSessions: [],
      providerRuns: [],
      jobs: [],
      jobEvents: [],
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z"
    };
    const baseMoments = createMoments(profile, recording, randomUUID);

    const result = await runAnalysisPipeline(project, baseMoments, tempDir);

    expect(result.moments).toHaveLength(baseMoments.length);
    expect(result.analysisSummary).toContain("Local deterministic analysis");
    expect(result.transcript?.status).toBe("skipped");
    expect(result.frameEvidence).toHaveLength(baseMoments.length);
    expect(result.frameEvidence.every((frame) => frame.ocrProvider === "none")).toBe(true);
    expect(result.frameEvidence.every((frame) => typeof frame.proofScore === "number")).toBe(true);
    expect(result.frameEvidence.every((frame) => Boolean(frame.visualRole))).toBe(true);
    expect(result.frameEvidence.every((frame) => Boolean(frame.focus))).toBe(true);
    expect(result.moments.every((moment) => typeof moment.proofScore === "number")).toBe(true);
    expect(result.moments.every((moment) => Boolean(moment.focus))).toBe(true);
    expect(result.providerRuns.some((run) => run.kind === "analysis" && run.status === "skipped")).toBe(true);
    expect(result.providerRuns.some((run) => run.kind === "ocr" && run.status === "skipped")).toBe(true);

    if (oldKey) {
      process.env.OPENAI_API_KEY = oldKey;
    }
    if (oldGideonKey) {
      process.env.GIDEON_OPENAI_API_KEY = oldGideonKey;
    }
  });

  it("records prompt provenance on provider-backed semantic analysis runs", async () => {
    const oldEnv = snapshotEnv([
      "OPENAI_API_KEY",
      "GIDEON_OPENAI_API_KEY",
      "GIDEON_OPENAI_BASE_URL",
      "GIDEON_OPENAI_LLM_MODEL",
      "GIDEON_ANALYSIS_PROMPT_VERSION",
      "GIDEON_ANALYSIS_PROMPT_REVIEWED_AT",
      "GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE",
      "GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT",
      "GIDEON_ANALYSIS_MODEL_CANARY_PERCENT"
    ]);
    const originalFetch = globalThis.fetch;
    process.env.GIDEON_OPENAI_API_KEY = "sk-test";
    process.env.GIDEON_OPENAI_BASE_URL = "https://api.example.test/v1";
    process.env.GIDEON_OPENAI_LLM_MODEL = "gpt-analysis";
    process.env.GIDEON_ANALYSIS_PROMPT_VERSION = "analysis-v2";
    process.env.GIDEON_ANALYSIS_PROMPT_REVIEWED_AT = "2026-07-01T00:00:00.000Z";
    process.env.GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE = "production";
    process.env.GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT = "100";
    process.env.GIDEON_ANALYSIS_MODEL_CANARY_PERCENT = "0";

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-analysis-provider-"));
    const project = projectFixture();
    const baseMoments = createMoments(profile, recording, randomUUID);
    const firstMoment = baseMoments[0]!;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            summary: "The walkthrough proves the setup flow.",
            moments: [
              {
                label: "Setup proof",
                startMs: firstMoment.startMs,
                endMs: firstMoment.endMs,
                evidence: "The seeded moment supports the setup proof.",
                sourceEvidenceIds: [`moment:${firstMoment.id}`],
                confidence: 0.86
              }
            ]
          })
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const result = await runAnalysisPipeline(project, baseMoments, tempDir);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.analysisSummary).toContain("setup flow");
      expect(result.providerRuns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "analysis",
            provider: "openai",
            model: "gpt-analysis",
            promptVersion: "analysis-v2",
            promptReviewedAt: "2026-07-01T00:00:00.000Z",
            promptRolloutStage: "production",
            promptRolloutPercent: 100,
            promptCanaryPercent: 0,
            status: "completed"
          })
        ])
      );
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv(oldEnv);
    }
  });
});

function projectFixture(): Project {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "LeadPilot campaign",
    status: "recording_ready",
    profile,
    recording,
    frameEvidence: [],
    moments: [],
    concepts: [],
    scripts: [],
    renders: [],
    artifacts: [],
    uploadSessions: [],
    providerRuns: [],
    jobs: [],
    jobEvents: [],
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z"
  };
}

function snapshotEnv(names: string[]): Record<string, string | undefined> {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
