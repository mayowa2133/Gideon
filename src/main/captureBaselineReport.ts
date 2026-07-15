import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CaptureBaselineConfig {
  schemaVersion: "1";
  pilots: Array<{ key: string; expectedWorkflowIds: string[] }>;
  thresholds: {
    minimumDurationMs: number;
    maximumDurationMs: number;
    normalizedMinimumWidth: number;
    normalizedMinimumHeight: number;
    verticalWidth: number;
    verticalHeight: number;
    minimumFps: number;
    maximumFps: number;
    requiredVideoCodec: string;
    requiredVerticalAudioCodec: string;
    minimumPointerMoveMs: number;
    minimumTypingDelayMs: number;
    maximumTypingDelayMs: number;
    requirePointer: boolean;
    requireCaptions: boolean;
    requireQualityArtifacts: boolean;
    allowQualityWarnings: boolean;
    requireFullDeclaredCoverage: boolean;
  };
}

export interface BaselineMediaProbe {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
}

export interface CaptureBaselineFinding {
  code: string;
  severity: "warning" | "failure";
  pilotKey: string;
  workflowId?: string;
  message: string;
}

interface SafeArtifact {
  artifactId: string;
  sha256: string;
  byteSize: number;
  localPath: string;
}

interface PilotInput {
  key: string;
  runId: string;
  report: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  runRoot: string;
  expectedWorkflowIds: string[];
}

export async function generateCaptureBaselineReport(input: {
  repositoryRoot?: string;
  configPath?: string;
  pilotRoot?: string;
  outputPath?: string;
  now?: () => string;
  probeMedia?: (filePath: string) => Promise<BaselineMediaProbe>;
} = {}) {
  const repositoryRoot = path.resolve(input.repositoryRoot ?? process.cwd());
  const configPath = path.resolve(input.configPath ?? path.join(repositoryRoot, "capture-pilots", "baseline.json"));
  const pilotRoot = path.resolve(input.pilotRoot ?? path.join(repositoryRoot, "tmp", "capture-pilot"));
  const outputPath = path.resolve(input.outputPath ?? path.join(repositoryRoot, "tmp", "capture-baseline", "baseline-report.json"));
  assertContained(outputPath, path.join(repositoryRoot, "tmp"), "Capture baseline output");
  const config = parseCaptureBaselineConfig(JSON.parse(await fs.readFile(configPath, "utf8")) as unknown);
  const probeMedia = input.probeMedia ?? probeMediaFile;
  const pilots = [];
  const findings: CaptureBaselineFinding[] = [];

  for (const pilot of config.pilots) {
    const loaded = await loadPilotInput(pilotRoot, pilot.key, pilot.expectedWorkflowIds);
    const evaluated = await evaluatePilot(loaded, config, probeMedia);
    pilots.push(evaluated.pilot);
    findings.push(...evaluated.findings);
  }

  const report = {
    schemaVersion: "1" as const,
    reportType: "capture_pilot_baseline" as const,
    generatedAt: input.now?.() ?? new Date().toISOString(),
    status: findings.some((finding) => finding.severity === "failure") ? "failed" as const : "passed" as const,
    thresholds: structuredClone(config.thresholds),
    summary: {
      pilots: pilots.length,
      workflows: pilots.reduce((sum, pilot) => sum + pilot.workflows.length, 0),
      verifiedWorkflows: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.status === "passed").length, 0),
      landscapeClips: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.normalizedClip).length, 0),
      verticalRenders: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.verticalRender).length, 0),
      captionTracks: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.captions).length, 0),
      qualityReports: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.quality?.reportArtifact).length, 0),
      qualityContactSheets: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.quality?.contactSheetArtifact).length, 0),
      qualityReady: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.quality?.status === "ready").length, 0),
      qualityWarnings: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.quality?.status === "warning").length, 0),
      qualityFailed: pilots.reduce((sum, pilot) => sum + pilot.workflows.filter((workflow) => workflow.quality?.status === "failed").length, 0),
      failures: findings.filter((finding) => finding.severity === "failure").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length
    },
    pilots,
    findings
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const [outputParentReal, tmpRootReal] = await Promise.all([fs.realpath(path.dirname(outputPath)), fs.realpath(path.join(repositoryRoot, "tmp"))]);
  assertContained(outputParentReal, tmpRootReal, "Capture baseline output directory");
  try {
    const existing = await fs.lstat(outputPath);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("Capture baseline output must be a regular non-symlink file.");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.chmod(outputPath, 0o600);
  return { outputPath, report };
}

export function parseCaptureBaselineConfig(value: unknown): CaptureBaselineConfig {
  const root = record(value, "capture baseline config");
  exactKeys(root, ["schemaVersion", "pilots", "thresholds"], "capture baseline config");
  if (root.schemaVersion !== "1") throw new Error("Capture baseline config schemaVersion must be 1.");
  if (!Array.isArray(root.pilots) || root.pilots.length < 1 || root.pilots.length > 20) throw new Error("Capture baseline config pilots are invalid.");
  const seen = new Set<string>();
  const pilots = root.pilots.map((raw, index) => {
    const pilot = record(raw, `capture baseline config pilots[${index}]`);
    exactKeys(pilot, ["key", "expectedWorkflowIds"], `capture baseline config pilots[${index}]`);
    const key = identifier(pilot.key, `capture baseline config pilots[${index}].key`);
    if (seen.has(key)) throw new Error(`Capture baseline pilot ${key} is duplicated.`);
    seen.add(key);
    const expectedWorkflowIds = identifierArray(pilot.expectedWorkflowIds, `capture baseline config pilots[${index}].expectedWorkflowIds`, 100);
    return { key, expectedWorkflowIds };
  });
  const thresholds = record(root.thresholds, "capture baseline config thresholds");
  const thresholdKeys = ["minimumDurationMs", "maximumDurationMs", "normalizedMinimumWidth", "normalizedMinimumHeight", "verticalWidth", "verticalHeight", "minimumFps", "maximumFps", "requiredVideoCodec", "requiredVerticalAudioCodec", "minimumPointerMoveMs", "minimumTypingDelayMs", "maximumTypingDelayMs", "requirePointer", "requireCaptions", "requireQualityArtifacts", "allowQualityWarnings", "requireFullDeclaredCoverage"];
  exactKeys(thresholds, thresholdKeys, "capture baseline config thresholds");
  const parsed: CaptureBaselineConfig["thresholds"] = {
    minimumDurationMs: integer(thresholds.minimumDurationMs, "minimumDurationMs", 1, 3_600_000),
    maximumDurationMs: integer(thresholds.maximumDurationMs, "maximumDurationMs", 1, 3_600_000),
    normalizedMinimumWidth: integer(thresholds.normalizedMinimumWidth, "normalizedMinimumWidth", 1, 8_192),
    normalizedMinimumHeight: integer(thresholds.normalizedMinimumHeight, "normalizedMinimumHeight", 1, 8_192),
    verticalWidth: integer(thresholds.verticalWidth, "verticalWidth", 1, 8_192),
    verticalHeight: integer(thresholds.verticalHeight, "verticalHeight", 1, 8_192),
    minimumFps: numberValue(thresholds.minimumFps, "minimumFps", 1, 240),
    maximumFps: numberValue(thresholds.maximumFps, "maximumFps", 1, 240),
    requiredVideoCodec: identifier(thresholds.requiredVideoCodec, "requiredVideoCodec"),
    requiredVerticalAudioCodec: identifier(thresholds.requiredVerticalAudioCodec, "requiredVerticalAudioCodec"),
    minimumPointerMoveMs: integer(thresholds.minimumPointerMoveMs, "minimumPointerMoveMs", 0, 5_000),
    minimumTypingDelayMs: integer(thresholds.minimumTypingDelayMs, "minimumTypingDelayMs", 0, 1_000),
    maximumTypingDelayMs: integer(thresholds.maximumTypingDelayMs, "maximumTypingDelayMs", 0, 1_000),
    requirePointer: booleanValue(thresholds.requirePointer, "requirePointer"),
    requireCaptions: booleanValue(thresholds.requireCaptions, "requireCaptions"),
    requireQualityArtifacts: booleanValue(thresholds.requireQualityArtifacts, "requireQualityArtifacts"),
    allowQualityWarnings: booleanValue(thresholds.allowQualityWarnings, "allowQualityWarnings"),
    requireFullDeclaredCoverage: booleanValue(thresholds.requireFullDeclaredCoverage, "requireFullDeclaredCoverage")
  };
  if (parsed.minimumDurationMs >= parsed.maximumDurationMs || parsed.minimumFps > parsed.maximumFps || parsed.minimumTypingDelayMs > parsed.maximumTypingDelayMs) throw new Error("Capture baseline threshold ranges are invalid.");
  return { schemaVersion: "1", pilots, thresholds: parsed };
}

async function loadPilotInput(pilotRoot: string, key: string, expectedWorkflowIds: string[]): Promise<PilotInput> {
  const productRoot = path.join(pilotRoot, key);
  const latest = await readJsonObject(path.join(productRoot, "latest.json"), `${key} latest pointer`);
  if (latest.schemaVersion !== "1") throw new Error(`${key} latest pointer schemaVersion is invalid.`);
  const runId = identifier(latest.runId, `${key} latest runId`);
  const runRoot = path.join(productRoot, "runs", runId);
  assertContained(runRoot, path.join(productRoot, "runs"), `${key} run`);
  const [runStat, runReal, runsReal] = await Promise.all([fs.lstat(runRoot), fs.realpath(runRoot), fs.realpath(path.join(productRoot, "runs"))]);
  if (!runStat.isDirectory() || runStat.isSymbolicLink()) throw new Error(`${key} run must be a regular non-symlink directory.`);
  assertContained(runReal, runsReal, `${key} run`);
  const [report, checkpoint] = await Promise.all([
    readJsonObject(path.join(runRoot, "pilot-report.json"), `${key} pilot report`),
    readJsonObject(path.join(runRoot, "pilot-checkpoint.json"), `${key} pilot checkpoint`)
  ]);
  if (report.schemaVersion !== "1" || report.manifestKey !== key || report.runId !== runId) throw new Error(`${key} pilot report identity is invalid.`);
  if (checkpoint.schemaVersion !== "1" || checkpoint.manifestKey !== key || checkpoint.runId !== runId) throw new Error(`${key} pilot checkpoint identity is invalid.`);
  return { key, runId, report, checkpoint, runRoot, expectedWorkflowIds };
}

async function evaluatePilot(input: PilotInput, config: CaptureBaselineConfig, probeMedia: (filePath: string) => Promise<BaselineMediaProbe>) {
  const findings: CaptureBaselineFinding[] = [];
  const fail = (code: string, message: string, workflowId?: string) => findings.push({ code, severity: "failure" as const, pilotKey: input.key, workflowId, message });
  const checkpointAttempts = array(input.checkpoint.attempts, `${input.key} checkpoint attempts`).map((value) => record(value, `${input.key} checkpoint attempt`));
  if (input.checkpoint.status !== "completed") fail("checkpoint_not_completed", "The latest pilot checkpoint is not completed.");
  if (!sameSet(checkpointAttempts.map((attempt) => String(attempt.workflowId)), input.expectedWorkflowIds) || checkpointAttempts.some((attempt) => attempt.status !== "verified")) fail("reset_or_verification_incomplete", "Every expected workflow must have a verified completed attempt.");
  const results = array(input.report.results, `${input.key} report results`).map((value) => record(value, `${input.key} report result`));
  if (!sameSet(results.map((result) => String(result.workflowId)), input.expectedWorkflowIds)) fail("workflow_selection_mismatch", "The report does not contain exactly the expected workflows.");
  const coverage = record(input.report.coverage, `${input.key} report coverage`);
  const dimensions = array(coverage.dimensions, `${input.key} coverage dimensions`).map((value) => record(value, `${input.key} coverage dimension`));
  if (config.thresholds.requireFullDeclaredCoverage) {
    for (const key of ["goal", "approved_flow"]) {
      const dimension = dimensions.find((candidate) => candidate.key === key);
      if (!dimension || dimension.denominator !== input.expectedWorkflowIds.length || array(dimension.uncoveredIds, `${input.key} ${key} uncoveredIds`).length > 0 || array(dimension.blocked, `${input.key} ${key} blocked`).length > 0) fail("declared_coverage_incomplete", `The ${key} coverage dimension is incomplete.`);
    }
  }

  const workflows = [];
  for (const raw of results) {
    const workflowId = identifier(raw.workflowId, `${input.key} workflowId`);
    const workflowFailuresBefore = findings.filter((finding) => finding.severity === "failure").length;
    const normalized = safeArtifact(raw.normalizedClip, "normalized_flow_clip", input.key, workflowId);
    const source = safeArtifact(raw.sourceArtifact, "source_recording", input.key, workflowId);
    const presentation = record(raw.presentationOutput, `${input.key} ${workflowId} presentationOutput`);
    const vertical = safeArtifact(presentation.verticalRender, "render", input.key, workflowId);
    const captions = safeArtifact(presentation.captions, "caption_track", input.key, workflowId);
    const [normalizedProbe, sourceProbe, verticalProbe] = await Promise.all([
      inspectArtifact(normalized, input.runRoot, probeMedia),
      inspectArtifact(source, input.runRoot, probeMedia),
      inspectArtifact(vertical, input.runRoot, probeMedia)
    ]);
    evaluateLandscape(normalizedProbe.probe, config, fail, workflowId);
    evaluateVertical(verticalProbe.probe, config, fail, workflowId);
    if (sourceProbe.statBytes !== source.byteSize || normalizedProbe.statBytes !== normalized.byteSize || verticalProbe.statBytes !== vertical.byteSize) fail("artifact_size_mismatch", "A media artifact byte size does not match its lineage record.", workflowId);
    const captionInfo = await inspectCaptions(captions, input.runRoot);
    if (config.thresholds.requireCaptions && captionInfo.cueCount < 1) fail("captions_missing", "The editable WebVTT track has no cues.", workflowId);
    const quality = await inspectQuality(presentation, input.runRoot, input.key, workflowId, config, findings);
    const interaction = record(raw.interactionSummary, `${input.key} ${workflowId} interactionSummary`);
    const interactionPresentation = record(interaction.presentation, `${input.key} ${workflowId} interaction presentation`);
    const showPointer = interactionPresentation.showPointer === true;
    const pointerMoveMs = integer(interactionPresentation.pointerMoveMs, "pointerMoveMs", 0, 5_000);
    const typingDelayMs = integer(interactionPresentation.typingDelayMs, "typingDelayMs", 0, 1_000);
    if (config.thresholds.requirePointer && !showPointer) fail("pointer_disabled", "The capture presentation does not show the pointer.", workflowId);
    if (pointerMoveMs < config.thresholds.minimumPointerMoveMs) fail("pointer_too_fast", "Pointer motion is below the baseline comprehension threshold.", workflowId);
    if (typingDelayMs < config.thresholds.minimumTypingDelayMs || typingDelayMs > config.thresholds.maximumTypingDelayMs) fail("typing_pacing_out_of_range", "Typing delay is outside the baseline comprehension range.", workflowId);
    const validation = record(presentation.validation, `${input.key} ${workflowId} render validation`);
    const frameQa = record(validation.frameQa, `${input.key} ${workflowId} frame QA`);
    const sampledFrames = integer(frameQa.sampledFrames, "sampledFrames", 1, 10_000);
    const informativeFrames = integer(frameQa.informativeFrames, "informativeFrames", 0, 10_000);
    if (informativeFrames !== sampledFrames) fail("uninformative_frame", "The vertical render contains a sampled frame that did not pass informative-frame QA.", workflowId);
    workflows.push({
      workflowId,
      status: findings.filter((finding) => finding.severity === "failure").length === workflowFailuresBefore ? "passed" as const : "failed" as const,
      resetAndVerification: "verified" as const,
      interactions: { showPointer, pointerMoveMs, typingDelayMs, counts: safeCounts(interaction.counts) },
      sourceRecording: publicArtifact(source, sourceProbe),
      normalizedClip: publicArtifact(normalized, normalizedProbe),
      verticalRender: publicArtifact(vertical, verticalProbe),
      captions: { artifactId: captions.artifactId, sha256: captions.sha256, byteSize: captions.byteSize, cueCount: captionInfo.cueCount },
      quality,
      visualQa: { sampledFrames, informativeFrames }
    });
  }
  const repositoryEvidence = record(input.report.repositoryEvidence, `${input.key} repository evidence`);
  return {
    pilot: {
      key: input.key,
      runId: input.runId,
      status: findings.some((finding) => finding.severity === "failure") ? "failed" as const : "passed" as const,
      expectedWorkflowIds: [...input.expectedWorkflowIds],
      repositoryEvidence: {
        extractorVersion: text(repositoryEvidence.extractorVersion, "extractorVersion", 100),
        evidenceHash: sha256(repositoryEvidence.evidenceHash, "repository evidence hash"),
        filesInspected: integer(repositoryEvidence.filesInspected, "filesInspected", 0, 100_000),
        bytesInspected: integer(repositoryEvidence.bytesInspected, "bytesInspected", 0, 1_000_000_000),
        excludedPaths: integer(repositoryEvidence.excludedPaths, "excludedPaths", 0, 1_000_000)
      },
      coverage: dimensions.map((dimension) => ({ key: identifier(dimension.key, "coverage key"), denominatorSource: typeof dimension.denominatorSource === "string" ? text(dimension.denominatorSource, "denominatorSource", 200) : undefined, denominator: dimension.denominator === "unknown" ? "unknown" as const : integer(dimension.denominator, "coverage denominator", 0, 100_000), covered: array(dimension.coveredIds, "coveredIds").length, uncovered: array(dimension.uncoveredIds, "uncoveredIds").length, excluded: array(dimension.excluded, "excluded").length, blocked: array(dimension.blocked, "blocked").length })),
      workflows
    },
    findings
  };
}

function evaluateLandscape(probe: BaselineMediaProbe, config: CaptureBaselineConfig, fail: (code: string, message: string, workflowId?: string) => void, workflowId: string) {
  evaluateCommonMedia(probe, config, fail, workflowId);
  if (probe.width < config.thresholds.normalizedMinimumWidth || probe.height < config.thresholds.normalizedMinimumHeight) fail("landscape_resolution_too_small", "The normalized clip is below the minimum landscape resolution.", workflowId);
}

function evaluateVertical(probe: BaselineMediaProbe, config: CaptureBaselineConfig, fail: (code: string, message: string, workflowId?: string) => void, workflowId: string) {
  evaluateCommonMedia(probe, config, fail, workflowId);
  if (probe.width !== config.thresholds.verticalWidth || probe.height !== config.thresholds.verticalHeight) fail("vertical_resolution_mismatch", "The vertical render dimensions do not match the configured output profile.", workflowId);
  if (probe.audioCodec !== config.thresholds.requiredVerticalAudioCodec) fail("vertical_audio_codec_mismatch", "The vertical render audio codec does not match the configured output profile.", workflowId);
}

function evaluateCommonMedia(probe: BaselineMediaProbe, config: CaptureBaselineConfig, fail: (code: string, message: string, workflowId?: string) => void, workflowId: string) {
  if (probe.durationMs < config.thresholds.minimumDurationMs || probe.durationMs > config.thresholds.maximumDurationMs) fail("duration_out_of_range", "Media duration is outside the baseline comprehension range.", workflowId);
  if (probe.fps < config.thresholds.minimumFps || probe.fps > config.thresholds.maximumFps) fail("frame_rate_out_of_range", "Media frame rate is outside the configured range.", workflowId);
  if (probe.videoCodec !== config.thresholds.requiredVideoCodec) fail("video_codec_mismatch", "Media video codec does not match the configured output profile.", workflowId);
}

async function inspectArtifact(artifact: SafeArtifact, runRoot: string, probeMedia: (filePath: string) => Promise<BaselineMediaProbe>) {
  const statBytes = await assertPrivateRegularFile(artifact.localPath, runRoot);
  return { statBytes, probe: await probeMedia(artifact.localPath) };
}

async function inspectCaptions(artifact: SafeArtifact, runRoot: string) {
  const statBytes = await assertPrivateRegularFile(artifact.localPath, runRoot);
  if (statBytes !== artifact.byteSize) throw new Error("Caption artifact byte size does not match its lineage record.");
  const content = await fs.readFile(artifact.localPath, "utf8");
  if (!content.startsWith("WEBVTT\n") || content.length > 1_000_000) throw new Error("Caption artifact is not a bounded WebVTT file.");
  return { cueCount: [...content.matchAll(/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/gm)].length };
}

async function inspectQuality(
  presentation: Record<string, unknown>,
  runRoot: string,
  pilotKey: string,
  workflowId: string,
  config: CaptureBaselineConfig,
  findings: CaptureBaselineFinding[]
) {
  if (!config.thresholds.requireQualityArtifacts && presentation.quality === undefined) return undefined;
  const reportArtifact = safeArtifact(presentation.qualityReport, "quality_report", pilotKey, workflowId);
  const contactSheetArtifact = safeArtifact(presentation.qualityContactSheet, "quality_contact_sheet", pilotKey, workflowId);
  const quality = record(presentation.quality, `${pilotKey} ${workflowId} quality`);
  if (quality.schemaVersion !== "1" || quality.qualityVersion !== "capture-video-quality-v1" || quality.thresholdsVersion !== "capture-quality-thresholds-v1") throw new Error(`${pilotKey} ${workflowId} quality report version is invalid.`);
  const status = enumValue(quality.status, ["ready", "warning", "failed"] as const, `${pilotKey} ${workflowId} quality status`);
  const reportHash = sha256(quality.reportHash, `${pilotKey} ${workflowId} quality reportHash`);
  const checks = array(quality.checks, `${pilotKey} ${workflowId} quality checks`).map((raw, index) => {
    const check = record(raw, `${pilotKey} ${workflowId} quality check[${index}]`);
    return {
      code: identifier(check.code, `${pilotKey} ${workflowId} quality check code`),
      status: enumValue(check.status, ["pass", "warning", "fail"] as const, `${pilotKey} ${workflowId} quality check status`)
    };
  });
  if (checks.length < 1 || checks.length > 100) throw new Error(`${pilotKey} ${workflowId} quality checks are invalid.`);
  if ((status === "failed") !== checks.some((check) => check.status === "fail") || (status === "warning") !== (!checks.some((check) => check.status === "fail") && checks.some((check) => check.status === "warning"))) throw new Error(`${pilotKey} ${workflowId} quality status does not match its checks.`);

  const [reportBytes, contactSheetBytes] = await Promise.all([
    assertPrivateRegularFile(reportArtifact.localPath, runRoot),
    assertPrivateRegularFile(contactSheetArtifact.localPath, runRoot)
  ]);
  if (reportBytes !== reportArtifact.byteSize || contactSheetBytes !== contactSheetArtifact.byteSize) throw new Error(`${pilotKey} ${workflowId} quality artifact byte size does not match its lineage record.`);
  if (reportBytes > 1_000_000 || contactSheetBytes > 25_000_000) throw new Error(`${pilotKey} ${workflowId} quality artifact exceeds its inspection limit.`);
  const [storedReport, contactSheetHeader] = await Promise.all([
    readJsonObject(reportArtifact.localPath, `${pilotKey} ${workflowId} stored quality report`),
    readFileHeader(contactSheetArtifact.localPath, 3)
  ]);
  if (storedReport.reportHash !== reportHash || storedReport.status !== status || storedReport.qualityVersion !== quality.qualityVersion || storedReport.thresholdsVersion !== quality.thresholdsVersion) throw new Error(`${pilotKey} ${workflowId} stored quality report does not match the presentation result.`);
  if (contactSheetHeader.length < 3 || contactSheetHeader[0] !== 0xff || contactSheetHeader[1] !== 0xd8 || contactSheetHeader[2] !== 0xff) throw new Error(`${pilotKey} ${workflowId} quality contact sheet is not a JPEG image.`);

  const nonPassChecks = checks.filter((check) => check.status !== "pass");
  if (status === "failed") findings.push({ code: "video_quality_failed", severity: "failure", pilotKey, workflowId, message: "The automated video-quality gate failed." });
  if (status === "warning") findings.push({ code: "video_quality_warning", severity: config.thresholds.allowQualityWarnings ? "warning" : "failure", pilotKey, workflowId, message: "The automated video-quality gate requires human review." });
  return {
    status,
    thresholdsVersion: "capture-quality-thresholds-v1" as const,
    reportHash,
    reportArtifact: { artifactId: reportArtifact.artifactId, sha256: reportArtifact.sha256, byteSize: reportBytes },
    contactSheetArtifact: { artifactId: contactSheetArtifact.artifactId, sha256: contactSheetArtifact.sha256, byteSize: contactSheetBytes },
    nonPassChecks
  };
}

async function assertPrivateRegularFile(filePath: string, runRoot: string): Promise<number> {
  if (!path.isAbsolute(filePath)) throw new Error("Capture baseline artifact path must be absolute.");
  const [runReal, fileStat, fileReal] = await Promise.all([fs.realpath(runRoot), fs.lstat(filePath), fs.realpath(filePath)]);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("Capture baseline artifact must be a regular non-symlink file.");
  assertContained(fileReal, path.join(runReal, "private-artifacts"), "Capture baseline artifact");
  return fileStat.size;
}

export async function probeMediaFile(filePath: string): Promise<BaselineMediaProbe> {
  const { stdout } = await execFileAsync(process.env.FFPROBE_PATH ?? "ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", filePath], { timeout: 30_000, maxBuffer: 1_000_000 });
  const output = record(JSON.parse(stdout) as unknown, "ffprobe output");
  const streams = array(output.streams, "ffprobe streams").map((value) => record(value, "ffprobe stream"));
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const format = record(output.format, "ffprobe format");
  if (!video) throw new Error("Capture baseline media has no video stream.");
  const durationSeconds = numberFromString(format.duration, "ffprobe duration", 0.001, 3_600);
  return {
    durationMs: Math.round(durationSeconds * 1_000),
    width: integer(video.width, "ffprobe width", 1, 8_192),
    height: integer(video.height, "ffprobe height", 1, 8_192),
    fps: parseFrameRate(video.avg_frame_rate),
    videoCodec: identifier(video.codec_name, "ffprobe video codec"),
    audioCodec: audio ? identifier(audio.codec_name, "ffprobe audio codec") : null
  };
}

function safeArtifact(value: unknown, expectedKind: string, pilotKey: string, workflowId: string): SafeArtifact {
  const artifact = record(value, `${pilotKey} ${workflowId} ${expectedKind} artifact`);
  if (artifact.kind !== expectedKind || artifact.provider !== "local_private") throw new Error(`${pilotKey} ${workflowId} ${expectedKind} artifact identity is invalid.`);
  return {
    artifactId: identifier(artifact.id, `${expectedKind} artifact id`),
    sha256: sha256(artifact.sha256, `${expectedKind} artifact sha256`),
    byteSize: integer(artifact.byteSize, `${expectedKind} artifact byteSize`, 1, 10_000_000_000),
    localPath: text(artifact.localPath, `${expectedKind} artifact localPath`, 4_000)
  };
}

function publicArtifact(artifact: SafeArtifact, inspected: { statBytes: number; probe: BaselineMediaProbe }) {
  return { artifactId: artifact.artifactId, sha256: artifact.sha256, byteSize: inspected.statBytes, probe: structuredClone(inspected.probe) };
}

function safeCounts(value: unknown): Record<string, number> {
  const counts = record(value, "interaction counts");
  return Object.fromEntries(["navigate", "click", "fill", "select", "key", "wait_for"].map((key) => [key, integer(counts[key], `interaction count ${key}`, 0, 10_000)]));
}

function parseFrameRate(value: unknown): number {
  if (typeof value !== "string" || !/^\d+\/\d+$/.test(value)) throw new Error("ffprobe frame rate is invalid.");
  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) throw new Error("ffprobe frame rate is invalid.");
  return Math.round(numerator / denominator * 1_000) / 1_000;
}

function assertContained(candidate: string, parent: string, label: string) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  if (resolvedCandidate === resolvedParent || !resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`)) throw new Error(`${label} must stay inside ${path.basename(resolvedParent)}.`);
}

function sameSet(left: string[], right: string[]) { return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value)); }
async function readJsonObject(filePath: string, label: string) { const stat = await fs.lstat(filePath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 25_000_000) throw new Error(`${label} must be a bounded regular non-symlink file.`); return record(JSON.parse(await fs.readFile(filePath, "utf8")) as unknown, label); }
async function readFileHeader(filePath: string, length: number): Promise<Buffer> { const handle = await fs.open(filePath, "r"); try { const output = Buffer.alloc(length); const { bytesRead } = await handle.read(output, 0, length, 0); return output.subarray(0, bytesRead); } finally { await handle.close(); } }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} must be an array.`); return value; }
function exactKeys(value: Record<string, unknown>, allowed: string[], label: string) { const unknown = Object.keys(value).find((key) => !allowed.includes(key)); if (unknown) throw new Error(`${label}.${unknown} is not supported.`); const missing = allowed.find((key) => !(key in value)); if (missing) throw new Error(`${label}.${missing} is required.`); }
function text(value: unknown, label: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) throw new Error(`${label} is invalid.`); return value.trim(); }
function identifier(value: unknown, label: string): string { const result = text(value, label, 200); if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) throw new Error(`${label} must be an identifier.`); return result; }
function identifierArray(value: unknown, label: string, max: number): string[] { if (!Array.isArray(value) || value.length < 1 || value.length > max) throw new Error(`${label} is invalid.`); const output = value.map((item, index) => identifier(item, `${label}[${index}]`)); if (new Set(output).size !== output.length) throw new Error(`${label} must not contain duplicates.`); return output; }
function integer(value: unknown, label: string, min: number, max: number): number { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`); return value as number; }
function numberValue(value: unknown, label: string, min: number, max: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number from ${min} to ${max}.`); return value; }
function numberFromString(value: unknown, label: string, min: number, max: number): number { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is invalid.`); return numberValue(Number(value), label, min, max); }
function booleanValue(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`); return value; }
function sha256(value: unknown, label: string): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is invalid.`); return value; }
function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] { if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} is invalid.`); return value as T[number]; }

async function runCli() {
  const result = await generateCaptureBaselineReport();
  process.stdout.write(`${JSON.stringify({ ok: result.report.status === "passed", outputPath: result.outputPath, summary: result.report.summary, findings: result.report.findings }, null, 2)}\n`);
  if (result.report.status !== "passed") process.exitCode = 1;
}

if (require.main === module) runCli().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Capture baseline generation failed."}\n`); process.exitCode = 1; });
