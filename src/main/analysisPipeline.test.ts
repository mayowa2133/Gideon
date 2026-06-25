import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
    expect(result.providerRuns.some((run) => run.kind === "analysis" && run.status === "skipped")).toBe(true);
    expect(result.providerRuns.some((run) => run.kind === "ocr" && run.status === "skipped")).toBe(true);

    if (oldKey) {
      process.env.OPENAI_API_KEY = oldKey;
    }
    if (oldGideonKey) {
      process.env.GIDEON_OPENAI_API_KEY = oldGideonKey;
    }
  });
});
