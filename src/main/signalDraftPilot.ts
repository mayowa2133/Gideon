import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { runCapturePilot } from "./capturePilot";
import { parseCapturePilotManifest, type CapturePilotAdapterRegistry, type CapturePilotManifest } from "./capturePilotManifest";

const execFileAsync = promisify(execFile);
const APPROVED_REPOSITORY = "/Users/mayowaadesanya/Documents/Projects/SignalDraft";
const APPROVED_BASE_URL = "http://127.0.0.1:8501";
const APPROVED_API_URL = "http://127.0.0.1:8000";
const APPROVED_DATABASE = "/tmp/gideon-signaldraft-pilot/signaldraft.db";
const DEFAULT_MANIFEST = path.join(process.cwd(), "capture-pilots", "signaldraft.json");

export async function loadSignalDraftPilotManifest(manifestPath = DEFAULT_MANIFEST): Promise<CapturePilotManifest> {
  const raw = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8")) as unknown;
  const manifest = parseCapturePilotManifest(raw);
  if (manifest.key !== "signaldraft") throw new Error("SignalDraft pilot requires the registered signaldraft manifest key.");
  return manifest;
}

export function createSignalDraftPilotAdapters(): CapturePilotAdapterRegistry {
  return {
    startup: {
      "signaldraft-local": {
        approvedRepositoryRoot: APPROVED_REPOSITORY,
        approvedBaseUrl: APPROVED_BASE_URL,
        async assertReady({ manifest }) {
          const readiness = await fetchApi("/readiness");
          if (readiness.status !== "ready" || readiness.environment !== "pilot" || readiness.llm_runtime_mode !== "heuristic" || readiness.openai_key_present !== false || readiness.backend_auth_enabled !== true || readiness.db_writable !== true) {
            throw new Error("SignalDraft must run in the isolated pilot environment with heuristic mode, API auth, no OpenAI key, and a writable temporary database.");
          }
          await assertReachable(manifest.environment.baseUrl);
        }
      }
    },
    reset: {
      "signaldraft-empty": {
        async reset() {
          const databaseStat = await fs.lstat(APPROVED_DATABASE);
          const approvedTmpRoot = await fs.realpath("/tmp");
          const databaseParent = await fs.realpath(path.dirname(APPROVED_DATABASE));
          if (!databaseStat.isFile() || databaseStat.isSymbolicLink() || databaseParent !== path.join(approvedTmpRoot, "gideon-signaldraft-pilot")) {
            throw new Error("SignalDraft pilot database is not the approved regular file in the isolated temporary directory.");
          }
          await execFileAsync("/usr/bin/sqlite3", [APPROVED_DATABASE, "DELETE FROM run_feedback; DELETE FROM runs; DELETE FROM candidate_profile;"], { timeout: 10_000, maxBuffer: 1_000_000 });
          const runs = await fetchApi("/runs");
          if (!Array.isArray(runs.items) || runs.items.length !== 0) throw new Error("SignalDraft pilot reset did not produce an empty run history.");
        }
      }
    },
    verification: {
      "signaldraft-analysis": { async verify({ workflowId }) { return verifySignalDraftAnalysis(workflowId); } }
    }
  };
}

export async function runSignalDraftPilot(input: { outputRoot?: string; executablePath?: string; manifestPath?: string; workflowIds?: string[] } = {}) {
  const manifest = await loadSignalDraftPilotManifest(input.manifestPath);
  return runCapturePilot({ manifest, adapters: createSignalDraftPilotAdapters(), outputRoot: input.outputRoot, executablePath: input.executablePath, workflowIds: input.workflowIds });
}

export function parseSignalDraftPilotArguments(argv: string[]): { workflowIds?: string[] } {
  const workflowIds: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--" && index === 0) continue;
    if (argument === "--workflow") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--workflow requires a registered workflow id.");
      workflowIds.push(value);
      index += 1;
      continue;
    }
    if (argument.startsWith("--workflow=")) {
      const value = argument.slice("--workflow=".length);
      if (!value) throw new Error("--workflow requires a registered workflow id.");
      workflowIds.push(value);
      continue;
    }
    throw new Error(`Unsupported capture pilot argument: ${argument}`);
  }
  return workflowIds.length > 0 ? { workflowIds } : {};
}

async function verifySignalDraftAnalysis(workflowId: string) {
  const runs = await fetchApi("/runs");
  if (!Array.isArray(runs.items) || runs.items.length !== 1) throw new Error("SignalDraft verification expected exactly one isolated analysis run.");
  const summary = asRecord(runs.items[0]);
  const runId = summary.run_id;
  if (typeof runId !== "string") throw new Error("SignalDraft verification did not receive a run id.");
  const run = await fetchApi(`/runs/${encodeURIComponent(runId)}`);
  const expected = workflowId === "analyze-recruiter-outreach"
    ? { message_type: "recruiter_outreach", recommended_action: "draft_reply", needs_human_review: false }
    : workflowId === "review-sensitive-compensation"
      ? { message_type: "offer_related", recommended_action: "escalate_human_review", needs_human_review: true }
      : undefined;
  if (!expected || run.message_type !== expected.message_type || run.recommended_action !== expected.recommended_action || run.needs_human_review !== expected.needs_human_review || run.status !== "analyzed" || run.llm_runtime_mode !== "heuristic") {
    throw new Error(`SignalDraft ${workflowId} outcome did not match the deterministic review-safe fixture.`);
  }
  const blockedSend = await fetch(`${APPROVED_API_URL}/runs/${encodeURIComponent(runId)}/mock-send`, { method: "POST", headers: apiHeaders(), body: JSON.stringify({}) });
  const blockedBody = await blockedSend.json() as unknown;
  if (blockedSend.status !== 409 || asRecord(asRecord(blockedBody).detail).code !== "mock_send_requires_approval") throw new Error("SignalDraft mock-send gate did not fail closed before approval.");
  return { run_id: runId, message_type: run.message_type, recommended_action: run.recommended_action, needs_human_review: run.needs_human_review, status: run.status, llm_runtime_mode: run.llm_runtime_mode, mock_send_gate: "blocked_before_approval" };
}

async function assertReachable(url: string) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) throw new Error("SignalDraft UI is not reachable at the registered loopback origin.");
}

async function fetchApi(pathname: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${APPROVED_API_URL}${pathname}`, { headers: apiHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("SignalDraft verification API request failed.");
  return asRecord(await response.json() as unknown);
}

function apiHeaders(): Record<string, string> {
  const token = process.env.SIGNALDRAFT_API_TOKEN;
  if (!token || token.length < 12) throw new Error("SIGNALDRAFT_API_TOKEN must contain the disposable local pilot token.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SignalDraft API returned an invalid object.");
  return value as Record<string, unknown>;
}

async function runCli() {
  const result = await runSignalDraftPilot(parseSignalDraftPilotArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ ok: true, pilotRoot: result.pilotRoot, runRoot: result.runRoot, clips: result.report.results.map((item) => ({ workflowId: item.workflowId, normalizedClip: item.normalizedClip.localPath, verticalRender: item.presentationOutput?.verticalRender.localPath, captions: item.presentationOutput?.captions.localPath, sourceRecording: item.sourceArtifact?.localPath })), coverage: result.report.coverage?.dimensions }, null, 2)}\n`);
}

if (require.main === module) runCli().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "SignalDraft pilot failed."}\n`); process.exitCode = 1; });
