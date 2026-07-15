import type { FlowStepVisualEvidence } from "../shared/productFlowCapture";

export interface CaptureFramingConfig {
  mode: "full_frame" | "automatic_focus" | "manual";
  maxZoom: number;
  transitionMs: number;
  manualFocus?: { x: number; y: number; width: number; height: number };
}

export interface CaptureFramingStepTiming {
  stepId: string;
  startedAt: string;
  completedAt: string;
  visualEvidence?: FlowStepVisualEvidence;
}

export interface CaptureFramingManifest {
  schemaVersion: "1";
  framingVersion: "capture-framing-v1";
  requestedMode: CaptureFramingConfig["mode"];
  appliedMode: "full_frame" | "focused";
  source: { width: number; height: number; durationMs: number };
  crop?: { width: number; height: number };
  transitionMs: number;
  keyframes: Array<{
    stepId: string;
    startMs: number;
    endMs: number;
    x: number;
    y: number;
    evidence: "manual" | "result_target" | "modal_region" | "action_target";
    confidence: "high" | "medium";
  }>;
  fallbackReason?: "full_frame_requested" | "insufficient_visual_evidence";
}

export function compileCaptureFraming(input: {
  config: CaptureFramingConfig;
  source: { width: number; height: number; durationMs: number };
  receiptStartedAt: string;
  stepTimings: CaptureFramingStepTiming[];
}): CaptureFramingManifest {
  assertConfig(input.config);
  const receiptStart = Date.parse(input.receiptStartedAt);
  if (!Number.isFinite(receiptStart) || !integer(input.source.width, 2, 7_680) || !integer(input.source.height, 2, 4_320) || !Number.isFinite(input.source.durationMs) || input.source.durationMs <= 0) {
    throw new Error("Capture framing source metadata is invalid.");
  }
  const base = {
    schemaVersion: "1" as const,
    framingVersion: "capture-framing-v1" as const,
    requestedMode: input.config.mode,
    source: { width: input.source.width, height: input.source.height, durationMs: Math.round(input.source.durationMs) },
    transitionMs: input.config.transitionMs
  };
  if (input.config.mode === "full_frame") return { ...base, appliedMode: "full_frame", keyframes: [], fallbackReason: "full_frame_requested" };

  const crop = evenCrop(input.source.width, input.source.height, input.config.maxZoom);
  if (input.config.mode === "manual") {
    const focus = input.config.manualFocus!;
    const centerX = (focus.x + focus.width / 2) * input.source.width;
    const centerY = (focus.y + focus.height / 2) * input.source.height;
    return {
      ...base,
      appliedMode: "focused",
      crop,
      keyframes: [{ stepId: "manual-focus", startMs: 0, endMs: Math.round(input.source.durationMs), ...cropOrigin(centerX, centerY, crop, input.source), evidence: "manual", confidence: "high" }]
    };
  }

  const keyframes: CaptureFramingManifest["keyframes"] = [];
  for (const timing of input.stepTimings) {
    const evidence = timing.visualEvidence;
    if (!evidence) continue;
    const candidate = evidence.resultTarget
      ? { region: evidence.resultTarget, kind: "result_target" as const, confidence: "high" as const }
      : evidence.modalRegion
        ? { region: evidence.modalRegion, kind: "modal_region" as const, confidence: "high" as const }
        : evidence.actionTarget
          ? { region: evidence.actionTarget, kind: "action_target" as const, confidence: "medium" as const }
          : undefined;
    if (!candidate) continue;
    const startMs = clamp(Date.parse(timing.startedAt) - receiptStart, 0, input.source.durationMs);
    const endMs = clamp(Math.max(startMs + 250, Date.parse(timing.completedAt) - receiptStart), startMs, input.source.durationMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const centerX = (candidate.region.x + candidate.region.width / 2) / evidence.viewport.width * input.source.width;
    const centerY = (candidate.region.y + candidate.region.height / 2) / evidence.viewport.height * input.source.height;
    keyframes.push({ stepId: timing.stepId, startMs: Math.round(startMs), endMs: Math.round(endMs), ...cropOrigin(centerX, centerY, crop, input.source), evidence: candidate.kind, confidence: candidate.confidence });
  }
  if (keyframes.length === 0) return { ...base, appliedMode: "full_frame", keyframes: [], fallbackReason: "insufficient_visual_evidence" };
  keyframes.sort((left, right) => left.startMs - right.startMs || left.stepId.localeCompare(right.stepId));
  return { ...base, appliedMode: "focused", crop, keyframes };
}

export function buildFocusedCropFilter(manifest: CaptureFramingManifest): string | undefined {
  if (manifest.appliedMode !== "focused" || !manifest.crop || manifest.keyframes.length === 0) return undefined;
  const x = motionExpression(manifest.keyframes.map((frame) => ({ atMs: frame.startMs, value: frame.x })), manifest.transitionMs);
  const y = motionExpression(manifest.keyframes.map((frame) => ({ atMs: frame.startMs, value: frame.y })), manifest.transitionMs);
  return `crop=${manifest.crop.width}:${manifest.crop.height}:x='${x}':y='${y}'`;
}

function motionExpression(points: Array<{ atMs: number; value: number }>, transitionMs: number): string {
  let expression = String(points[0]!.value);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const end = current.atMs / 1_000;
    const start = Math.max(previous.atMs / 1_000, end - transitionMs / 1_000);
    if (end <= start || previous.value === current.value) {
      expression = `if(lt(t,${end.toFixed(3)}),${expression},${current.value})`;
    } else {
      const interpolation = `${previous.value}+(${current.value - previous.value})*(t-${start.toFixed(3)})/${(end - start).toFixed(3)}`;
      expression = `if(lt(t,${start.toFixed(3)}),${expression},if(lt(t,${end.toFixed(3)}),${interpolation},${current.value}))`;
    }
  }
  return expression;
}

function evenCrop(width: number, height: number, zoom: number): { width: number; height: number } {
  return { width: Math.max(2, Math.floor(width / zoom / 2) * 2), height: Math.max(2, Math.floor(height / zoom / 2) * 2) };
}

function cropOrigin(centerX: number, centerY: number, crop: { width: number; height: number }, source: { width: number; height: number }) {
  return { x: Math.round(clamp(centerX - crop.width / 2, 0, source.width - crop.width)), y: Math.round(clamp(centerY - crop.height / 2, 0, source.height - crop.height)) };
}

function assertConfig(config: CaptureFramingConfig): void {
  if (!["full_frame", "automatic_focus", "manual"].includes(config.mode) || !Number.isFinite(config.maxZoom) || config.maxZoom < 1 || config.maxZoom > 2 || !integer(config.transitionMs, 0, 2_000)) throw new Error("Capture framing configuration is invalid.");
  if (config.mode === "manual") {
    const region = config.manualFocus;
    if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) throw new Error("Manual capture focus must be a normalized region inside the source frame.");
  } else if (config.manualFocus !== undefined) throw new Error("Manual capture focus is allowed only in manual framing mode.");
}

function integer(value: unknown, minimum: number, maximum: number): value is number { return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
