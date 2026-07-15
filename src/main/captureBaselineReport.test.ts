import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateCaptureBaselineReport, parseCaptureBaselineConfig, type BaselineMediaProbe } from "./captureBaselineReport";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((target) => fs.rm(target, { recursive: true, force: true })));
});

describe("capture baseline report", () => {
  it("strictly validates thresholds and unique pilot/workflow identities", () => {
    expect(parseCaptureBaselineConfig(config())).toMatchObject({ schemaVersion: "1", pilots: [{ key: "fixture", expectedWorkflowIds: ["flow-one"] }] });
    expect(() => parseCaptureBaselineConfig({ ...config(), extra: true })).toThrow("extra is not supported");
    expect(() => parseCaptureBaselineConfig({ ...config(), pilots: [{ key: "fixture", expectedWorkflowIds: ["flow-one", "flow-one"] }] })).toThrow("must not contain duplicates");
    expect(() => parseCaptureBaselineConfig({ ...config(), thresholds: { ...config().thresholds, minimumDurationMs: 20_000, maximumDurationMs: 10_000 } })).toThrow("threshold ranges are invalid");
  });

  it("generates a passing path-free report from verified private artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-baseline-"));
    cleanup.push(root);
    const runId = "2026-07-15T00-00-00-000Z-fixture";
    const runRoot = path.join(root, "tmp", "capture-pilot", "fixture", "runs", runId);
    const artifactRoot = path.join(runRoot, "private-artifacts");
    await fs.mkdir(artifactRoot, { recursive: true });
    const source = await artifact(artifactRoot, "source.mp4", "source_recording", "source media");
    const normalized = await artifact(artifactRoot, "normalized.mp4", "normalized_flow_clip", "normalized media");
    const vertical = await artifact(artifactRoot, "vertical.mp4", "render", "vertical media");
    const captions = await artifact(artifactRoot, "captions.vtt", "caption_track", "WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nSynthetic step\n");
    await writeJson(path.join(root, "config.json"), config());
    await writeJson(path.join(root, "tmp", "capture-pilot", "fixture", "latest.json"), { schemaVersion: "1", runId, runRoot: "/private/path/ignored", reportPath: "/private/path/ignored/report.json", updatedAt: "2026-07-15T00:00:00.000Z" });
    await writeJson(path.join(runRoot, "pilot-checkpoint.json"), { schemaVersion: "1", manifestKey: "fixture", runId, status: "completed", attempts: [{ workflowId: "flow-one", status: "verified" }] });
    await writeJson(path.join(runRoot, "pilot-report.json"), {
      schemaVersion: "1",
      manifestKey: "fixture",
      runId,
      repositoryEvidence: { extractorVersion: "repository-evidence-v1", evidenceHash: "a".repeat(64), filesInspected: 4, bytesInspected: 400, excludedPaths: 2 },
      results: [{
        workflowId: "flow-one",
        sourceArtifact: source,
        normalizedClip: normalized,
        interactionSummary: { counts: { navigate: 0, click: 1, fill: 1, select: 0, key: 0, wait_for: 1 }, presentation: { showPointer: true, pointerMoveMs: 350, typingDelayMs: 30 } },
        presentationOutput: { verticalRender: vertical, captions, validation: { frameQa: { sampledFrames: 3, informativeFrames: 3 } } }
      }],
      coverage: { dimensions: [
        { key: "goal", denominatorSource: "declared_goals", denominator: 1, coveredIds: ["goal:flow-one"], uncoveredIds: [], excluded: [], blocked: [] },
        { key: "approved_flow", denominatorSource: "approved_flows", denominator: 1, coveredIds: ["flow-one"], uncoveredIds: [], excluded: [], blocked: [] },
        { key: "route", denominator: "unknown", coveredIds: [], uncoveredIds: [], excluded: [], blocked: [] }
      ] }
    });
    const landscape: BaselineMediaProbe = { durationMs: 20_000, width: 1440, height: 900, fps: 30, videoCodec: "h264", audioCodec: null };
    const result = await generateCaptureBaselineReport({
      repositoryRoot: root,
      configPath: path.join(root, "config.json"),
      pilotRoot: path.join(root, "tmp", "capture-pilot"),
      outputPath: path.join(root, "tmp", "capture-baseline", "report.json"),
      now: () => "2026-07-15T01:00:00.000Z",
      probeMedia: async (filePath) => filePath.endsWith("vertical.mp4") ? { ...landscape, width: 1080, height: 1920, audioCodec: "aac" } : landscape
    });
    expect(result.report.status).toBe("passed");
    expect(result.report.summary).toMatchObject({ pilots: 1, workflows: 1, verifiedWorkflows: 1, landscapeClips: 1, verticalRenders: 1, captionTracks: 1, failures: 0 });
    const serialized = JSON.stringify(result.report);
    for (const forbidden of [root, "localPath", "storageKey", "localUrl", "file://", "Synthetic step"]) expect(serialized).not.toContain(forbidden);
    expect((await fs.stat(result.outputPath)).mode & 0o777).toBe(0o600);
    const outside = path.join(root, "must-not-overwrite.json");
    await fs.writeFile(outside, "sentinel");
    await fs.rm(result.outputPath);
    await fs.symlink(outside, result.outputPath);
    await expect(generateCaptureBaselineReport({ repositoryRoot: root, configPath: path.join(root, "config.json"), pilotRoot: path.join(root, "tmp", "capture-pilot"), outputPath: result.outputPath, probeMedia: async () => landscape })).rejects.toThrow("regular non-symlink file");
    expect(await fs.readFile(outside, "utf8")).toBe("sentinel");
  });

  it("fails quality without leaking the private artifact path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-capture-baseline-failure-"));
    cleanup.push(root);
    const runId = "fixture-run";
    const runRoot = path.join(root, "tmp", "capture-pilot", "fixture", "runs", runId);
    const artifactRoot = path.join(runRoot, "private-artifacts");
    await fs.mkdir(artifactRoot, { recursive: true });
    const source = await artifact(artifactRoot, "source.mp4", "source_recording", "source");
    const normalized = await artifact(artifactRoot, "normalized.mp4", "normalized_flow_clip", "normalized");
    const vertical = await artifact(artifactRoot, "vertical.mp4", "render", "vertical");
    const captions = await artifact(artifactRoot, "captions.vtt", "caption_track", "WEBVTT\n");
    await writeJson(path.join(root, "config.json"), config());
    await writeJson(path.join(root, "tmp", "capture-pilot", "fixture", "latest.json"), { schemaVersion: "1", runId });
    await writeJson(path.join(runRoot, "pilot-checkpoint.json"), { schemaVersion: "1", manifestKey: "fixture", runId, status: "completed", attempts: [{ workflowId: "flow-one", status: "verified" }] });
    await writeJson(path.join(runRoot, "pilot-report.json"), {
      schemaVersion: "1", manifestKey: "fixture", runId,
      repositoryEvidence: { extractorVersion: "repository-evidence-v1", evidenceHash: "b".repeat(64), filesInspected: 1, bytesInspected: 1, excludedPaths: 1 },
      results: [{ workflowId: "flow-one", sourceArtifact: source, normalizedClip: normalized, interactionSummary: { counts: { navigate: 0, click: 0, fill: 0, select: 0, key: 0, wait_for: 1 }, presentation: { showPointer: false, pointerMoveMs: 0, typingDelayMs: 0 } }, presentationOutput: { verticalRender: vertical, captions, validation: { frameQa: { sampledFrames: 3, informativeFrames: 1 } } } }],
      coverage: { dimensions: [
        { key: "goal", denominator: 1, coveredIds: ["goal:flow-one"], uncoveredIds: [], excluded: [], blocked: [] },
        { key: "approved_flow", denominator: 1, coveredIds: ["flow-one"], uncoveredIds: [], excluded: [], blocked: [] }
      ] }
    });
    const result = await generateCaptureBaselineReport({ repositoryRoot: root, configPath: path.join(root, "config.json"), pilotRoot: path.join(root, "tmp", "capture-pilot"), outputPath: path.join(root, "tmp", "capture-baseline", "report.json"), probeMedia: async () => ({ durationMs: 1_000, width: 320, height: 200, fps: 10, videoCodec: "vp9", audioCodec: null }) });
    expect(result.report.status).toBe("failed");
    expect(result.report.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["duration_out_of_range", "frame_rate_out_of_range", "video_codec_mismatch", "pointer_disabled", "pointer_too_fast", "typing_pacing_out_of_range", "captions_missing", "uninformative_frame"]));
    expect(JSON.stringify(result.report)).not.toContain(root);
  });
});

function config() {
  return {
    schemaVersion: "1",
    pilots: [{ key: "fixture", expectedWorkflowIds: ["flow-one"] }],
    thresholds: {
      minimumDurationMs: 5_000, maximumDurationMs: 180_000,
      normalizedMinimumWidth: 1280, normalizedMinimumHeight: 720,
      verticalWidth: 1080, verticalHeight: 1920,
      minimumFps: 24, maximumFps: 60,
      requiredVideoCodec: "h264", requiredVerticalAudioCodec: "aac",
      minimumPointerMoveMs: 250, minimumTypingDelayMs: 15, maximumTypingDelayMs: 80,
      requirePointer: true, requireCaptions: true, requireFullDeclaredCoverage: true
    }
  };
}

async function artifact(root: string, name: string, kind: string, content: string) {
  const localPath = path.join(root, name);
  await fs.writeFile(localPath, content);
  const bytes = Buffer.from(content);
  return { id: `${kind}-id`, kind, provider: "local_private", byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), localPath, storageKey: `private/${name}`, localUrl: `file://${localPath}` };
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value));
}
