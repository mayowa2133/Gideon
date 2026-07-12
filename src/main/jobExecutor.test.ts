import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createJob } from "../shared/jobState";
import {
  createGideonJobExecutor,
  minutesForDuration,
  type GideonJobExecutorMetricEvent,
  type GideonJobExecutorStore
} from "./jobExecutor";
import type {
  ArtifactRecord,
  DetectedMoment,
  FrameEvidence,
  JobEvent,
  JobRecord,
  ProductProfile,
  Project,
  ProviderRun,
  RecordingMetadata,
  RenderedVideo,
  ScriptDraft,
  TranscriptArtifact
} from "../shared/types";

describe("Gideon job executor", () => {
  it("runs analysis jobs through injected analysis pipeline and records job events", async () => {
    const store = new FakeExecutorStore(projectFixture());
    const metrics: GideonJobExecutorMetricEvent[] = [];
    store.project.jobs = [createJob({ id: "job-1", projectId: store.project.id, kind: "analysis", now: "2026-06-25T12:00:00.000Z" })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      nowMs: numberSequence([0, 25]),
      onMetric(event) {
        metrics.push(event);
      },
      runAnalysisPipeline: async (_project, moments) => ({
        moments,
        transcript: transcriptFixture(),
        analysisSummary: "Provider analysis summary.",
        frameEvidence: [frameFixture()],
        providerRuns: [
          {
            id: "provider-run-1",
            kind: "analysis",
            provider: "openai",
            model: "gpt-test",
            status: "completed",
            startedAt: "2026-06-25T12:00:01.000Z",
            finishedAt: "2026-06-25T12:00:02.000Z"
          }
        ]
      }),
      loadProviderConfig: () => providerConfig(false)
    });

    const project = await executor.runAnalysisJob(store.project.id, "job-1");

    expect(project.jobs[0]).toMatchObject({ id: "job-1", status: "succeeded", userMessage: "Analysis completed." });
    expect(project.transcript).toMatchObject({ id: "transcript-1", status: "completed" });
    expect(project.analysisSummary).toBe("Provider analysis summary.");
    expect(project.frameEvidence).toHaveLength(1);
    expect(store.events.map((event) => `${event.kind}:${event.stage}`)).toEqual([
      "started:queued",
      "stage:quota",
      "stage:frame_extraction",
      "stage:transcription",
      "stage:ocr",
      "stage:semantic_analysis",
      "stage:usage",
      "succeeded:finalize"
    ]);
    expect(store.events.map((event) => event.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
        expect.objectContaining({ attempt: 1, maxAttempts: 3, providerRuns: 1 }),
        expect.objectContaining({ attempt: 1, maxAttempts: 3, moments: 1, frameEvidence: 1 })
      ])
    );
    expect(store.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "llm_runs", quantity: 1, source: "analysis" }),
        expect.objectContaining({ metric: "llm_runs", quantity: 1, source: "ocr" })
      ])
    );
    expect(metrics).toEqual([
      expect.objectContaining({
        name: "analysis_pipeline_finished",
        projectId: "project-1",
        jobId: "job-1",
        durationMs: 25,
        providerRuns: 1,
        transcript: true
      }),
      expect.objectContaining({ name: "usage_recorded", metric: "llm_runs", source: "analysis", quantity: 1 }),
      expect.objectContaining({ name: "usage_recorded", metric: "llm_runs", source: "ocr", quantity: 1 })
    ]);
  });

  it("runs render jobs through injected renderer and private storage", async () => {
    const project = projectFixture({
      concepts: [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: ["moment-1"],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      moments: [momentFixture()],
      scripts: [scriptFixture()]
    });
    const store = new FakeExecutorStore(project);
    const metrics: GideonJobExecutorMetricEvent[] = [];
    store.project.jobs = [createJob({ id: "job-1", projectId: store.project.id, kind: "render", now: "2026-06-25T12:00:00.000Z" })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      nowMs: numberSequence([0, 12, 20, 35]),
      onMetric(event) {
        metrics.push(event);
      },
      makeId: idSequence(["render-1"]),
      loadProviderConfig: () => providerConfig(false),
      statFile: async () => ({ size: 4096 }),
      renderDraft: async () => ({
        outputPath: "/tmp/render.mp4",
        validation: {
          width: 1080,
          height: 1920,
          durationMs: 30_000,
          videoCodec: "h264",
          audioCodec: "aac",
          fastStart: true
        }
      }),
      createPrivateObjectStorage: () => ({
        async putFile() {
          return {
            filePath: "/private/storage/render.mp4",
            fileUrl: "file:///private/storage/render.mp4",
            artifact: artifactFixture({ id: "artifact-render-1", kind: "render", byteSize: 4096 })
          };
        }
      })
    });

    const rendered = await executor.runRenderJob(store.project.id, "job-1");

    expect(rendered.jobs[0]).toMatchObject({ id: "job-1", status: "succeeded", userMessage: "Rendering completed." });
    expect(rendered.renders).toEqual([
      expect.objectContaining({
        id: "render-1",
        status: "completed",
        artifactId: "artifact-render-1",
        sizeBytes: 4096
      })
    ]);
    expect(rendered.artifacts).toEqual([expect.objectContaining({ id: "artifact-render-1", kind: "render" })]);
    expect(store.events.map((event) => event.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
        expect.objectContaining({ attempt: 1, maxAttempts: 3, renders: 1 }),
        expect.objectContaining({ attempt: 1, maxAttempts: 3, completed: 1, failed: 0 })
      ])
    );
    expect(store.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "render_minutes", quantity: 1, source: "render" }),
        expect.objectContaining({ metric: "storage_bytes", quantity: 4096, source: "render" })
      ])
    );
    expect(metrics).toEqual([
      expect.objectContaining({
        name: "render_draft_finished",
        projectId: "project-1",
        jobId: "job-1",
        scriptId: "script-1",
        renderId: "render-1",
        durationMs: 12,
        outputDurationMs: 30_000
      }),
      expect.objectContaining({
        name: "artifact_storage_finished",
        projectId: "project-1",
        kind: "render",
        artifactId: "artifact-render-1",
        byteSize: 4096,
        durationMs: 15
      }),
      expect.objectContaining({ name: "usage_recorded", metric: "render_minutes", source: "render", quantity: 1 }),
      expect.objectContaining({ name: "usage_recorded", metric: "storage_bytes", source: "render", quantity: 4096 })
    ]);
  });

  it("renders only the scoped draft and preserves other completed renders", async () => {
    const secondScript = scriptFixture({ id: "script-2", conceptId: "concept-2" });
    const project = projectFixture({
      concepts: [
        { id: "concept-1", title: "First", formatFamily: "demo", targetPain: "slow", hookDirection: "show", proofMomentIds: ["moment-1"], platformFit: ["youtube_shorts"], estimatedDurationSec: 30, rationale: "proof", selected: true, brief: "first" },
        { id: "concept-2", title: "Second", formatFamily: "demo", targetPain: "slow", hookDirection: "show", proofMomentIds: ["moment-1"], platformFit: ["youtube_shorts"], estimatedDurationSec: 30, rationale: "proof", selected: true, brief: "second" }
      ],
      moments: [momentFixture()],
      scripts: [scriptFixture(), secondScript],
      renders: [{ id: "render-2-old", scriptId: "script-2", title: "Second", status: "completed", createdAt: "2026-06-25T12:00:00.000Z" }]
    });
    const store = new FakeExecutorStore(project);
    store.project.jobs = [createJob({
      id: "job-1",
      projectId: store.project.id,
      kind: "render",
      now: "2026-06-25T12:00:00.000Z",
      renderScope: { scriptIds: ["script-1"], voiceoverMode: "regenerate" }
    })];
    const renderedScriptIds: string[] = [];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      loadProviderConfig: () => providerConfig(false),
      makeId: idSequence(["render-1"]),
      statFile: async () => ({ size: 4096 }),
      renderDraft: async (input) => {
        renderedScriptIds.push(input.script.id);
        return { outputPath: "/tmp/render.mp4", validation: { width: 1080, height: 1920, durationMs: 30_000, videoCodec: "h264", audioCodec: "aac", fastStart: true } };
      },
      createPrivateObjectStorage: () => ({
        async putFile() {
          return { filePath: "/private/storage/render.mp4", fileUrl: "file:///private/storage/render.mp4", artifact: artifactFixture({ id: "artifact-render-1" }) };
        }
      })
    });

    const rendered = await executor.runRenderJob(store.project.id, "job-1");

    expect(renderedScriptIds).toEqual(["script-1"]);
    expect(rendered.renders.map((render) => render.scriptId)).toEqual(expect.arrayContaining(["script-1", "script-2"]));
    expect(rendered.renders.find((render) => render.scriptId === "script-2")?.id).toBe("render-2-old");
  });

  it("reuses a validated scoped voiceover without calling synthesis", async () => {
    const voiceoverDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-voiceover-"));
    const voiceoverPath = path.join(voiceoverDir, "voiceovers", "script-1.wav");
    const avatarPath = path.join(voiceoverDir, "avatar-presenters", "script-1.mp4");
    await fs.mkdir(path.dirname(voiceoverPath), { recursive: true });
    await fs.writeFile(voiceoverPath, "fixture-audio");
    await fs.mkdir(path.dirname(avatarPath), { recursive: true });
    await fs.writeFile(avatarPath, "fixture-avatar");
    const project = projectFixture({
      profile: { ...profileFixture(), brandPresenterEnabled: true, avatarPresenterId: "orbit" },
      concepts: [{ id: "concept-1", title: "First", formatFamily: "demo", targetPain: "slow", hookDirection: "show", proofMomentIds: ["moment-1"], platformFit: ["youtube_shorts"], estimatedDurationSec: 30, rationale: "proof", selected: true, brief: "first" }],
      moments: [momentFixture()],
      scripts: [scriptFixture()],
      artifacts: [artifactFixture({
        id: "artifact-avatar-1",
        kind: "avatar_presenter",
        originalFileName: "script-1-orbit.mp4",
        localPath: avatarPath,
        createdAt: "2026-06-25T12:00:01.000Z",
        avatarModelReceipt: {
          provider: "sadtalker",
          modelVersion: "test",
          modelLicense: "reviewed",
          avatarId: "orbit",
          avatarProvenance: "gideon_fictional_catalog",
          disclosure: "AI-generated brand presenter",
          generatedAt: "2026-06-25T12:00:01.000Z"
        },
        avatarPresenterLineage: {
          sourceScriptId: "script-1",
          sourceScriptUpdatedAt: "2026-06-25T12:00:00.000Z"
        }
      })]
    });
    const store = new FakeExecutorStore(project, voiceoverDir);
    store.project.jobs = [createJob({
      id: "job-1",
      projectId: store.project.id,
      kind: "render",
      now: "2026-06-25T12:00:00.000Z",
      renderScope: { scriptIds: ["script-1"], voiceoverMode: "reuse" }
    })];
    let receivedVoiceoverPath: string | undefined;
    let receivedAvatarPresenterPath: string | undefined;
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      loadProviderConfig: () => providerConfig(true),
      validateVoiceoverAudio: async (candidate) => {
        expect(candidate).toBe(voiceoverPath);
        return { byteSize: 13, dataBytes: 13 };
      },
      createSpeechProvider: () => ({
        synthesize: async () => {
          throw new Error("Voice synthesis should not run when a reusable voiceover exists.");
        }
      }),
      makeId: idSequence(["render-1"]),
      statFile: async () => ({ size: 4096 }),
      renderDraft: async (input) => {
        receivedVoiceoverPath = input.voiceoverPath;
        receivedAvatarPresenterPath = input.avatarPresenterPath;
        return { outputPath: "/tmp/render.mp4", validation: { width: 1080, height: 1920, durationMs: 30_000, videoCodec: "h264", audioCodec: "aac", fastStart: true } };
      },
      createPrivateObjectStorage: () => ({
        async putFile() {
          return { filePath: "/private/storage/render.mp4", fileUrl: "file:///private/storage/render.mp4", artifact: artifactFixture({ id: "artifact-render-1" }) };
        }
      })
    });

    await executor.runRenderJob(store.project.id, "job-1");

    expect(receivedVoiceoverPath).toBe(voiceoverPath);
    expect(receivedAvatarPresenterPath).toBe(avatarPath);
  });

  it("requires an approved selected script before rendering", async () => {
    const project = projectFixture({
      concepts: [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: ["moment-1"],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      moments: [momentFixture()],
      scripts: [scriptFixture({ approved: false })]
    });
    const store = new FakeExecutorStore(project);
    store.project.jobs = [createJob({ id: "job-1", projectId: store.project.id, kind: "render", now: "2026-06-25T12:00:00.000Z" })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      loadProviderConfig: () => providerConfig(false)
    });

    await expect(executor.runRenderJob(store.project.id, "job-1")).rejects.toThrow(
      "Approve at least one selected script without blocking warnings before rendering."
    );
  });

  it("requires approved selected scripts to be free of blocking warnings before rendering", async () => {
    const project = projectFixture({
      concepts: [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: ["moment-1"],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      moments: [momentFixture()],
      scripts: [
        scriptFixture({
          qualityWarnings: [{ code: "missing_evidence", message: "Add evidence before rendering." }]
        })
      ]
    });
    const store = new FakeExecutorStore(project);
    store.project.jobs = [createJob({ id: "job-1", projectId: store.project.id, kind: "render", now: "2026-06-25T12:00:00.000Z" })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      loadProviderConfig: () => providerConfig(false)
    });

    await expect(executor.runRenderJob(store.project.id, "job-1")).rejects.toThrow(
      "Approve at least one selected script without blocking warnings before rendering."
    );
  });

  it("rejects invalid provider voiceover audio before private storage import", async () => {
    const project = projectFixture({
      concepts: [
        {
          id: "concept-1",
          title: "Fast export",
          formatFamily: "demo",
          targetPain: "Manual clipping",
          hookDirection: "show outcome",
          proofMomentIds: ["moment-1"],
          platformFit: ["youtube_shorts"],
          estimatedDurationSec: 30,
          rationale: "Good proof",
          selected: true,
          brief: "Show fast export"
        }
      ],
      moments: [momentFixture()],
      scripts: [scriptFixture()]
    });
    const store = new FakeExecutorStore(project);
    store.project.jobs = [createJob({ id: "job-1", projectId: store.project.id, kind: "render", now: "2026-06-25T12:00:00.000Z" })];
    const metrics: GideonJobExecutorMetricEvent[] = [];
    let storedVoiceover = false;
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      nowMs: numberSequence([0, 10, 20]),
      onMetric(event) {
        metrics.push(event);
      },
      loadProviderConfig: () => providerConfig(true),
      createSpeechProvider: () => ({
        isConfigured: () => true,
        async synthesizeSpeech() {
          return {
            outputPath: "/tmp/invalid-voiceover.wav",
            provider: "openai",
            model: "tts-test"
          };
        }
      }),
      validateVoiceoverAudio: async () => {
        throw new Error("Generated voiceover is not valid WAV audio.");
      },
      renderDraft: async (input) => ({
        outputPath: input.voiceoverPath ? "/tmp/render-with-voice.mp4" : "/tmp/render-without-voice.mp4",
        validation: {
          width: 1080,
          height: 1920,
          durationMs: 30_000,
          videoCodec: "h264",
          audioCodec: "aac",
          fastStart: true
        }
      }),
      statFile: async () => ({ size: 4096 }),
      createPrivateObjectStorage: () => ({
        async putFile(input) {
          if (input.kind === "voiceover") {
            storedVoiceover = true;
          }
          return {
            filePath: `/private/storage/${input.kind}.bin`,
            fileUrl: `file:///private/storage/${input.kind}.bin`,
            artifact: artifactFixture({
              id: `artifact-${input.kind}`,
              kind: input.kind,
              byteSize: 4096,
              contentType: input.contentType
            })
          };
        }
      })
    });

    const rendered = await executor.runRenderJob(store.project.id, "job-1");

    expect(storedVoiceover).toBe(false);
    expect(rendered.renders[0]).toMatchObject({
      status: "completed",
      outputPath: "/private/storage/render.bin"
    });
    expect(rendered.artifacts).toEqual([expect.objectContaining({ kind: "render" })]);
    expect(rendered.providerRuns).toEqual([
      expect.objectContaining({
        kind: "tts",
        provider: "openai",
        promptVersion: "tts-v2",
        status: "failed",
        error: "Generated voiceover is not valid WAV audio."
      })
    ]);
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "tts_provider_finished", model: "tts-test" }),
        expect.objectContaining({ name: "render_draft_finished" })
      ])
    );
  });

  it("regenerates a voiceover without rendering a video", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-tts-"));
    const project = projectFixture({ scripts: [scriptFixture()] });
    const store = new FakeExecutorStore(project, projectDir);
    store.project.jobs = [createJob({
      id: "job-tts-1",
      projectId: store.project.id,
      kind: "tts",
      now: "2026-06-25T12:00:00.000Z",
      renderScope: { scriptIds: ["script-1"], voiceoverMode: "regenerate" }
    })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      loadProviderConfig: () => providerConfig(true),
      createSpeechProvider: () => ({
        isConfigured: () => true,
        synthesizeSpeech: async ({ outputPath }) => {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, "fixture-audio");
          return { outputPath, provider: "openai", model: "tts-test" };
        }
      }),
      validateVoiceoverAudio: async () => ({ byteSize: 13, dataBytes: 13 }),
      statFile: async () => ({ size: 13 }),
      createPrivateObjectStorage: () => ({
        async putFile() {
          return { filePath: "/private/storage/voiceover.wav", fileUrl: "file:///private/storage/voiceover.wav", artifact: artifactFixture({ id: "artifact-voice-1", kind: "voiceover", byteSize: 13 }) };
        }
      })
    });

    const completed = await executor.runVoiceoverJob(store.project.id, "job-tts-1");

    expect(completed.jobs[0]).toMatchObject({ status: "succeeded", userMessage: "Voiceover regenerated." });
    expect(completed.renders).toEqual([]);
    expect(completed.artifacts).toEqual([expect.objectContaining({ id: "artifact-voice-1", kind: "voiceover" })]);
    expect(store.usage).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "tts_characters", source: "tts" })]));
  });

  it("generates a fictional avatar clip from an approved private voiceover and stores its model receipt", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-job-"));
    const voiceoverPath = path.join(projectDir, "voiceovers", "script-1.wav");
    await fs.mkdir(path.dirname(voiceoverPath), { recursive: true });
    await fs.writeFile(voiceoverPath, "fixture-audio");
    const project = projectFixture({
      profile: { ...profileFixture(), avatarPresenterId: "orbit" },
      scripts: [scriptFixture({ approved: true })]
    });
    const store = new FakeExecutorStore(project, projectDir);
    store.project.jobs = [createJob({
      id: "job-avatar-1",
      projectId: store.project.id,
      kind: "avatar",
      now: "2026-06-25T12:00:00.000Z",
      renderScope: { scriptIds: ["script-1"], voiceoverMode: "reuse" }
    })];
    let receivedRequest: { avatarId: string; audioPath: string; outputPath: string } | undefined;
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      validateVoiceoverAudio: async () => ({ byteSize: 13, dataBytes: 13 }),
      statFile: async () => ({ size: 29 }),
      createAvatarWorker: () => ({
        async render(input) {
          receivedRequest = input;
          await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
          await fs.writeFile(input.outputPath, "fixture-avatar-video");
          return {
            outputPath: input.outputPath,
            receipt: {
              provider: "sadtalker",
              modelVersion: "sadtalker-test",
              modelLicense: "Apache-2.0-reviewed",
              avatarId: "orbit",
              avatarProvenance: "gideon_fictional_catalog",
              disclosure: "AI-generated brand presenter",
              generatedAt: "2026-06-25T12:00:00.000Z"
            }
          };
        }
      }),
      createPrivateObjectStorage: () => ({
        async putFile(input) {
          expect(input.kind).toBe("avatar_presenter");
          expect(input.avatarModelReceipt).toMatchObject({ avatarId: "orbit", provider: "sadtalker" });
          expect(input.avatarPresenterLineage).toMatchObject({
            sourceScriptId: "script-1",
            sourceScriptUpdatedAt: "2026-06-25T12:00:00.000Z"
          });
          return {
            filePath: "/private/storage/avatar.mp4",
            fileUrl: "file:///private/storage/avatar.mp4",
            artifact: artifactFixture({
              id: "artifact-avatar-1",
              kind: "avatar_presenter",
              byteSize: 29,
              avatarModelReceipt: input.avatarModelReceipt,
              avatarPresenterLineage: input.avatarPresenterLineage
            })
          };
        }
      })
    });

    const completed = await executor.runAvatarJob(store.project.id, "job-avatar-1");

    expect(receivedRequest).toMatchObject({
      avatarId: "orbit",
      audioPath: voiceoverPath,
      consent: { assetType: "fictional_catalog", status: "not_required" }
    });
    expect(completed.jobs[0]).toMatchObject({ status: "succeeded", userMessage: "Avatar presenter clip generated." });
    expect(completed.artifacts).toEqual([expect.objectContaining({ id: "artifact-avatar-1", kind: "avatar_presenter" })]);
    expect(store.usage).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "storage_bytes", source: "render", quantity: 29 })]));
  });

  it("passes a project-owned authorized self portrait to the avatar worker and records its lineage", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-custom-avatar-job-"));
    const voiceoverPath = path.join(projectDir, "voiceovers", "script-1.wav");
    const sourcePath = path.join(projectDir, "avatar-source", "founder.png");
    await fs.mkdir(path.dirname(voiceoverPath), { recursive: true });
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(voiceoverPath, "fixture-audio");
    await fs.writeFile(sourcePath, "fixture-image");
    const consentVerifiedAt = new Date(Date.now() - 60_000).toISOString();
    const sourceArtifact = artifactFixture({
      id: "avatar-source-1",
      kind: "avatar_source_image",
      localPath: sourcePath,
      originalFileName: "founder.png",
      avatarConsentRecord: {
        assetType: "real_likeness",
        status: "granted",
        sourceArtifactId: "avatar-source-1",
        consentVerifiedAt,
        consentPolicyVersion: "self-avatar-v1",
        subjectRelationship: "self"
      }
    });
    const project = projectFixture({
      profile: {
        ...profileFixture(),
        avatarPresenterId: "orbit",
        customAvatarSource: {
          artifactId: sourceArtifact.id,
          displayName: "Founder portrait",
          importedAt: consentVerifiedAt,
          consent: {
            assetType: "real_likeness",
            status: "granted",
            sourceArtifactId: sourceArtifact.id,
            consentVerifiedAt,
            consentPolicyVersion: "self-avatar-v1",
            subjectRelationship: "self"
          }
        }
      },
      scripts: [scriptFixture({ approved: true })],
      artifacts: [sourceArtifact]
    });
    const store = new FakeExecutorStore(project, projectDir);
    store.project.jobs = [createJob({
      id: "job-avatar-custom",
      projectId: project.id,
      kind: "avatar",
      now: "2026-06-25T12:00:00.000Z",
      renderScope: { scriptIds: ["script-1"], voiceoverMode: "reuse" }
    })];
    const executor = createGideonJobExecutor({
      store,
      now: clock(),
      validateVoiceoverAudio: async () => ({ byteSize: 13, dataBytes: 13 }),
      statFile: async () => ({ size: 31 }),
      createAvatarWorker: () => ({
        async render(input) {
          expect(input.sourceImagePath).toBe(sourcePath);
          expect(input.consent).toMatchObject({
            assetType: "real_likeness",
            status: "granted",
            sourceArtifactId: sourceArtifact.id
          });
          return {
            outputPath: input.outputPath,
            receipt: {
              provider: "sadtalker",
              modelVersion: "sadtalker-test",
              modelLicense: "Apache-2.0-reviewed",
              avatarId: "orbit",
              avatarProvenance: "user_authorized_likeness",
              disclosure: "AI-generated brand presenter",
              generatedAt: "2026-06-25T12:00:00.000Z"
            }
          };
        }
      }),
      createPrivateObjectStorage: () => ({
        async putFile(input) {
          expect(input.avatarPresenterLineage?.sourceAvatarArtifactId).toBe(sourceArtifact.id);
          return {
            filePath: "/private/storage/custom-avatar.mp4",
            fileUrl: "file:///private/storage/custom-avatar.mp4",
            artifact: artifactFixture({
              id: "artifact-avatar-custom",
              kind: "avatar_presenter",
              avatarModelReceipt: input.avatarModelReceipt,
              avatarPresenterLineage: input.avatarPresenterLineage
            })
          };
        }
      })
    });

    const completed = await executor.runAvatarJob(project.id, "job-avatar-custom");
    expect(completed.jobs[0]).toMatchObject({ status: "succeeded" });
    expect(completed.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "artifact-avatar-custom", kind: "avatar_presenter" })
    ]));
  });

  it("rounds media durations up to billable minutes", () => {
    expect(minutesForDuration(1)).toBe(1);
    expect(minutesForDuration(60_000)).toBe(1);
    expect(minutesForDuration(60_001)).toBe(2);
  });
});

class FakeExecutorStore implements GideonJobExecutorStore {
  events: Array<Omit<JobEvent, "id" | "createdAt" | "projectId"> & { createdAt?: string }> = [];
  usage: Array<{ metric: string; quantity: number; source: string }> = [];

  constructor(readonly project: Project, private readonly projectDirectory = "/tmp/project") {}

  async getProject(): Promise<Project> {
    return this.project;
  }

  async getJob(_projectId: string, jobId: string): Promise<JobRecord> {
    const job = this.project.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      throw new Error("Job not found.");
    }
    return job;
  }

  async updateJob(_projectId: string, job: JobRecord): Promise<Project> {
    this.project.jobs = this.project.jobs.map((candidate) => (candidate.id === job.id ? job : candidate));
    return this.project;
  }

  async appendJobEvent(_projectId: string, input: Omit<JobEvent, "id" | "createdAt" | "projectId"> & { createdAt?: string }): Promise<Project> {
    this.events.push(input);
    this.project.jobEvents.push({
      id: `event-${this.events.length}`,
      projectId: this.project.id,
      createdAt: input.createdAt ?? "2026-06-25T12:00:00.000Z",
      ...input
    });
    return this.project;
  }

  async runAnalysis(
    _projectId: string,
    enrich: (project: Project, moments: DetectedMoment[]) => Promise<{
      moments: DetectedMoment[];
      transcript?: TranscriptArtifact;
      analysisSummary?: string;
      frameEvidence?: FrameEvidence[];
      providerRuns?: ProviderRun[];
    }>
  ): Promise<Project> {
    const analysis = await enrich(this.project, [momentFixture()]);
    this.project.moments = analysis.moments;
    this.project.transcript = analysis.transcript;
    this.project.analysisSummary = analysis.analysisSummary;
    this.project.frameEvidence = analysis.frameEvidence ?? [];
    this.project.providerRuns = [...this.project.providerRuns, ...(analysis.providerRuns ?? [])];
    return this.project;
  }

  async assertUsageAvailable(): Promise<void> {}

  async recordUsage(_projectId: string, input: { metric: string; quantity: number; source: string }): Promise<Project> {
    this.usage.push(input);
    return this.project;
  }

  async finishJobCancel(_projectId: string, jobId: string): Promise<Project> {
    const job = await this.getJob(this.project.id, jobId);
    job.status = "canceled";
    return this.updateJob(this.project.id, job);
  }

  async replaceRenders(_projectId: string, renders: RenderedVideo[]): Promise<Project> {
    this.project.renders = renders;
    return this.project;
  }

  async appendArtifact(_projectId: string, artifact: ArtifactRecord): Promise<Project> {
    this.project.artifacts.push(artifact);
    return this.project;
  }

  async appendProviderRuns(_projectId: string, providerRuns: ProviderRun[]): Promise<Project> {
    this.project.providerRuns.push(...providerRuns);
    return this.project;
  }

  projectDir(): string {
    return this.projectDirectory;
  }

  storageRoot(): string {
    return "/tmp/storage";
  }
}

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Project",
    status: "recording_ready",
    profile: profileFixture(),
    recording: recordingFixture(),
    moments: [],
    concepts: [],
    scripts: [],
    renders: [],
    exports: [],
    artifacts: [],
    uploadSessions: [],
    jobs: [],
    jobEvents: [],
    providerRuns: [],
    frameEvidence: [],
    usage: [],
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function profileFixture(): ProductProfile {
  return {
    productName: "Gideon",
    targetCustomer: "SaaS founders",
    productDescription: "Turns walkthroughs into shorts.",
    preferredTone: "founder",
    toneGuidance: "clear",
    platforms: ["youtube_shorts"],
    walkthroughNotes: "Show upload to export."
  };
}

function recordingFixture(): RecordingMetadata {
  return {
    filePath: "/tmp/source.mov",
    fileUrl: "file:///tmp/source.mov",
    fileName: "source.mov",
    artifactId: "recording-artifact-1",
    storageKey: "source/source.mov",
    sha256: "a".repeat(64),
    sizeBytes: 1024,
    durationMs: 42_000,
    width: 1280,
    height: 720,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
    validatedAt: "2026-06-25T12:00:00.000Z"
  };
}

function momentFixture(): DetectedMoment {
  return {
    id: "moment-1",
    label: "Upload",
    startMs: 0,
    endMs: 5_000,
    evidence: "Upload appears.",
    confidence: 0.9,
    enabled: true
  };
}

function scriptFixture(overrides: Partial<ScriptDraft> = {}): ScriptDraft {
  return {
    id: "script-1",
    conceptId: "concept-1",
    hook: "Ship clips faster.",
    voiceoverText: "Gideon turns one walkthrough into short-form drafts.",
    captions: [{ startMs: 0, endMs: 2_000, text: "Ship clips faster" }],
    cta: "Try Gideon",
    visualBeats: [{ startMs: 0, endMs: 2_000, momentId: "moment-1", instruction: "Show upload." }],
    approved: true,
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function transcriptFixture(): TranscriptArtifact {
  return {
    id: "transcript-1",
    status: "completed",
    provider: "openai",
    model: "transcribe-test",
    text: "Upload a recording.",
    segments: [],
    createdAt: "2026-06-25T12:00:00.000Z"
  };
}

function frameFixture(): FrameEvidence {
  return {
    id: "frame-1",
    momentId: "moment-1",
    timestampMs: 0,
    ocrProvider: "openai",
    ocrText: "Upload",
    createdAt: "2026-06-25T12:00:00.000Z"
  };
}

function artifactFixture(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: "artifact-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    kind: "render",
    provider: "local_private",
    storageKey: "render/render-1.mp4",
    contentType: "video/mp4",
    byteSize: 4096,
    sha256: "b".repeat(64),
    originalFileName: "render.mp4",
    localPath: "/private/storage/render.mp4",
    localUrl: "file:///private/storage/render.mp4",
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides
  };
}

function providerConfig(configured: boolean) {
  return {
    openai: {
      apiKey: configured ? "sk-test" : null,
      baseUrl: "https://api.openai.test/v1",
      llmModel: "gpt-test",
      transcriptionModel: "transcribe-test",
      ttsModel: "tts-test",
      ttsVoice: "coral",
      ttsPromptVersion: "tts-v2"
    }
  };
}

function clock(): () => string {
  let tick = 0;
  return () => new Date(Date.parse("2026-06-25T12:00:00.000Z") + tick++ * 1000).toISOString();
}

function idSequence(ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `id-${index}`;
}

function numberSequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? values[values.length - 1] ?? Date.now();
}
