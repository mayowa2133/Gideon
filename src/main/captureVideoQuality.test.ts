import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowExecutionReceipt, type FlowExecutionReceipt, type ProductFlowRevision } from "../shared/productFlowCapture";
import { analyzeCaptureVideoQuality, parseCaptureQualityThresholds } from "./captureVideoQuality";
import thresholds from "./captureQualityThresholds.json";

describe("capture video quality", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

  it("passes a moving, paced, evidenced interface fixture and writes private evidence", async () => {
    const root = await fixtureRoot(roots);
    const video = path.join(root, "moving.mp4");
    await createVideo(video, "testsrc2=size=960x600:rate=30", 12);
    const result = await analyzeCaptureVideoQuality({ videoPath: video, outputDir: path.join(root, "quality"), profile: "landscape", flow: flow(), receipt: receipt(), minimumSourceTextPx: 12, presentation: { showPointer: true, clickFeedback: true, pointerMoveMs: 300, typingDelayMs: 35, afterActionMs: 750 }, now: () => "2026-07-15T10:00:00.000Z" });
    expect(result.report.status).toBe("ready");
    expect(result.report.checks.every((check) => check.status === "pass")).toBe(true);
    expect(result.report.reportHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(fs.stat(result.contactSheetPath)).resolves.toMatchObject({ mode: expect.any(Number), size: expect.any(Number) });
    expect((await fs.stat(result.reportPath)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(result.report)).not.toContain(root);
  }, 30_000);

  it("fails black and long-frozen fixtures automatically", async () => {
    const root = await fixtureRoot(roots);
    const black = path.join(root, "black.mp4");
    const frozen = path.join(root, "frozen.mp4");
    await Promise.all([createVideo(black, "color=c=black:size=960x600:rate=30", 12), createVideo(frozen, "color=c=blue:size=960x600:rate=30", 12)]);
    const [blackResult, frozenResult] = await Promise.all([
      analyzeCaptureVideoQuality({ videoPath: black, outputDir: path.join(root, "black-quality"), profile: "landscape", flow: flow(), receipt: receipt(), minimumSourceTextPx: 12, presentation: presentation() }),
      analyzeCaptureVideoQuality({ videoPath: frozen, outputDir: path.join(root, "frozen-quality"), profile: "landscape", flow: flow(), receipt: receipt(), minimumSourceTextPx: 12, presentation: presentation() })
    ]);
    expect(blackResult.report).toMatchObject({ status: "failed", checks: expect.arrayContaining([expect.objectContaining({ code: "black_frames", status: "fail" }), expect.objectContaining({ code: "blank_frames", status: "fail" })]) });
    expect(frozenResult.report).toMatchObject({ status: "failed", checks: expect.arrayContaining([expect.objectContaining({ code: "frozen_frames", status: "fail" })]) });
  }, 30_000);

  it("fails unreadable, rushed, caption-overflow, and browser-error evidence", async () => {
    const root = await fixtureRoot(roots);
    const video = path.join(root, "vertical.mp4");
    await createVideo(video, "testsrc2=size=1080x1920:rate=30", 8);
    const failedReceipt = receipt("browser_error");
    const result = await analyzeCaptureVideoQuality({
      videoPath: video, outputDir: path.join(root, "quality"), profile: "vertical", flow: flow(), receipt: failedReceipt,
      cues: [{ startMs: 0, endMs: 200, text: "An intentionally excessive caption ".repeat(12) }],
      minimumSourceTextPx: 4,
      presentation: { showPointer: false, clickFeedback: false, pointerMoveMs: 0, typingDelayMs: 0, afterActionMs: 0 }
    });
    expect(result.report.status).toBe("failed");
    expect(result.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "page_state", status: "fail" }),
      expect.objectContaining({ code: "effective_ui_text", status: "fail" }),
      expect.objectContaining({ code: "caption_lines", status: "fail" }),
      expect.objectContaining({ code: "pointer_presentation", status: "fail" }),
      expect.objectContaining({ code: "typing_presentation", status: "fail" }),
      expect.objectContaining({ code: "action_dwell", status: "fail" }),
      expect.objectContaining({ code: "caption_dwell", status: "fail" })
    ]));
  }, 30_000);

  it("warns instead of failing when a readable caption lingers", async () => {
    const root = await fixtureRoot(roots);
    const video = path.join(root, "lingering.mp4");
    await createVideo(video, "testsrc2=size=960x600:rate=30", 12);
    const result = await analyzeCaptureVideoQuality({
      videoPath: video,
      outputDir: path.join(root, "quality"),
      profile: "landscape",
      flow: flow(),
      receipt: receipt(),
      cues: [{ startMs: 0, endMs: 9_000, text: "A concise caption remains visible during a slow local analysis." }],
      minimumSourceTextPx: 12,
      presentation: presentation()
    });
    expect(result.report).toMatchObject({ status: "warning", checks: expect.arrayContaining([expect.objectContaining({ code: "caption_dwell", status: "warning" })]) });
  }, 30_000);

  it("rejects threshold drift and unknown fields", () => {
    expect(parseCaptureQualityThresholds(thresholds).thresholdsVersion).toBe("capture-quality-thresholds-v1");
    expect(() => parseCaptureQualityThresholds({ ...thresholds, surprise: true })).toThrow("unknown or missing");
    expect(() => parseCaptureQualityThresholds({ ...thresholds, sampleFrames: 2 })).toThrow("4 to 16");
  });
});

function flow(): ProductFlowRevision {
  return { schemaVersion: "1", id: "quality-flow", revision: 1, projectId: "project", environmentVersionId: "version", personaId: "persona", title: "Quality flow", goal: "Exercise a safe interface.", startingState: { entryPath: "/" }, steps: [
    { id: "click", intent: "Click a safe control.", action: { type: "click", target: { strategy: "role", role: "button", value: "Continue" } }, riskClass: "navigate" },
    { id: "fill", intent: "Type synthetic content.", action: { type: "fill", target: { strategy: "label", value: "Name" }, valueRef: "fixture:name" }, riskClass: "synthetic_write" }
  ], finalAssertions: [{ type: "url", path: "/done" }], approval: { status: "approved", approvedBy: "user", approvedAt: "2026-07-15T10:00:00.000Z", approvedRevision: 1 }, sourceEvidenceIds: ["fixture:quality"] };
}

function receipt(pageSignal?: "failure" | "browser_error" | "login" | "loading"): FlowExecutionReceipt {
  const approved = flow();
  const policyDecision = { allowed: true, effectiveRisk: "navigate" as const, code: "allowed" as const, reason: "Allowed." };
  return createFlowExecutionReceipt({ id: "quality-receipt", workspaceId: "workspace", projectId: approved.projectId, flowId: approved.id, flowRevision: approved.revision, environmentVersionId: approved.environmentVersionId, compiledPlanHash: "a".repeat(64), steps: approved.steps.map((step, index) => ({ stepId: step.id, status: "succeeded" as const, policyDecision, assertions: [], startedAt: `2026-07-15T10:00:0${index}.000Z`, completedAt: `2026-07-15T10:00:0${index + 1}.000Z`, visualEvidence: { schemaVersion: "1" as const, viewport: { width: 960, height: 600, scrollX: 0, scrollY: 0 }, actionTarget: { x: 100 + index * 200, y: 100, width: 120, height: 40 }, ...(pageSignal && index === 1 ? { pageSignal } : {}) } })), finalAssertions: [{ assertion: { type: "url", path: "/done" }, passed: true, safeMessage: "Passed." }], startedAt: "2026-07-15T10:00:00.000Z", completedAt: "2026-07-15T10:00:02.000Z" });
}

function presentation() { return { showPointer: true, clickFeedback: true, pointerMoveMs: 300, typingDelayMs: 35, afterActionMs: 750 }; }
async function fixtureRoot(roots: string[]) { const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-quality-test-")); roots.push(root); return root; }
async function createVideo(outputPath: string, source: string, durationSeconds: number): Promise<void> { await run(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", source, "-t", String(durationSeconds), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]); }
async function run(args: string[]): Promise<void> { await new Promise<void>((resolve, reject) => { const child = spawn(process.env.GIDEON_FFMPEG_PATH ?? "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] }); child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))); }); }
