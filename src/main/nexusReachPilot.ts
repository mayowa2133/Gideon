import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { runCapturePilot } from "./capturePilot";
import { parseCapturePilotManifest, type CapturePilotAdapterRegistry, type CapturePilotManifest } from "./capturePilotManifest";

const execFileAsync = promisify(execFile);
const APPROVED_REPOSITORY = "/Users/mayowaadesanya/Documents/Projects/NexusReach";
const APPROVED_BASE_URL = "http://127.0.0.1:5173";
const APPROVED_API_URL = "http://127.0.0.1:8000";
const DEFAULT_MANIFEST = path.join(process.cwd(), "capture-pilots", "nexusreach.json");

export async function loadNexusReachPilotManifest(manifestPath = DEFAULT_MANIFEST): Promise<CapturePilotManifest> {
  const raw = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8")) as unknown;
  const manifest = parseCapturePilotManifest(raw);
  if (manifest.key !== "nexusreach") throw new Error("NexusReach pilot requires the registered nexusreach manifest key.");
  return manifest;
}

export function createNexusReachPilotAdapters(): CapturePilotAdapterRegistry {
  return {
    startup: {
      "nexusreach-demo": {
        approvedRepositoryRoot: APPROVED_REPOSITORY,
        approvedBaseUrl: APPROVED_BASE_URL,
        async assertReady({ manifest }) { await assertReachable(`${manifest.environment.baseUrl}/dashboard`); }
      }
    },
    reset: {
      "nexusreach-onboarding": { async reset() { await approvedReset("onboarding"); } },
      "nexusreach-returning": { async reset() { await approvedReset("returning"); } }
    },
    verification: {
      "nexusreach-onboarding": { async verify() { return verifyNexusReachOnboarding(); } },
      "nexusreach-returning": { async verify({ workflowId }) { return verifyNexusReachReturning(workflowId); } }
    }
  };
}

export async function runNexusReachPilot(input: { outputRoot?: string; executablePath?: string; manifestPath?: string; workflowIds?: string[] } = {}) {
  const manifest = await loadNexusReachPilotManifest(input.manifestPath);
  return runCapturePilot({ manifest, adapters: createNexusReachPilotAdapters(), outputRoot: input.outputRoot, executablePath: input.executablePath, workflowIds: input.workflowIds });
}

export function parseNexusReachPilotArguments(argv: string[]): { workflowIds?: string[] } {
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

async function approvedReset(scenario: "onboarding" | "returning") {
  await execFileAsync(path.join(APPROVED_REPOSITORY, "scripts", "demo_reset.sh"), [scenario], { cwd: APPROVED_REPOSITORY, env: process.env, timeout: 120_000, maxBuffer: 10_000_000 });
}

async function assertReachable(url: string) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!response?.ok) throw new Error(`NexusReach safe demo is not reachable at ${APPROVED_BASE_URL}. Start it with ./scripts/demo_start.sh --scenario onboarding.`);
}

async function verifyNexusReachOnboarding() {
  const [profileResponse, guardrailsResponse] = await Promise.all([fetch(`${APPROVED_API_URL}/api/profile`), fetch(`${APPROVED_API_URL}/api/settings/guardrails`)]);
  if (!profileResponse.ok || !guardrailsResponse.ok) throw new Error("NexusReach persistence verification failed.");
  const profile = await profileResponse.json() as Record<string, unknown>;
  const guardrails = await guardrailsResponse.json() as Record<string, unknown>;
  if (profile.full_name !== "Jordan Demo" || guardrails.onboarding_completed !== true) throw new Error("NexusReach onboarding state was not persisted.");
  return { profile: { full_name: profile.full_name, target_roles: profile.target_roles, target_locations: profile.target_locations }, guardrails: { onboarding_completed: guardrails.onboarding_completed } };
}

async function verifyNexusReachReturning(workflowId: string) {
  if (workflowId === "browse-filter-jobs") {
    const jobs = await fetchApiCollection("/api/jobs");
    const productEngineer = jobs.items.find((item) => item.title === "Product Engineer");
    const scoreBreakdown = productEngineer && asRecord(productEngineer.score_breakdown);
    if (jobs.total !== 5 || !productEngineer || productEngineer.company_name !== "Northstar Labs" || productEngineer.location !== "Toronto, Canada" || scoreBreakdown?.demo_fixture !== 91) throw new Error("NexusReach job browsing evidence was not present in the deterministic fixture.");
    return { total: jobs.total, job: { title: productEngineer.title, company_name: productEngineer.company_name, location: productEngineer.location, fixture_score: scoreBreakdown.demo_fixture } };
  }
  if (workflowId === "review-saved-contacts") {
    const people = await fetchApiCollection("/api/people");
    const avery = people.items.find((item) => item.full_name === "Avery Chen");
    const company = avery && asRecord(avery.company);
    if (!avery || company?.name !== "Northstar Labs" || avery.work_email !== "avery@example.test" || avery.current_company_verification_evidence !== "Synthetic fixture; not a real person.") throw new Error("NexusReach saved-contact evidence was not present.");
    return { contact: { full_name: avery.full_name, title: avery.title, company: company.name, work_email: avery.work_email, evidence: avery.current_company_verification_evidence } };
  }
  if (workflowId === "update-job-tracker") {
    const mutated = await findProductEngineer();
    if (mutated.stage !== "interviewing") throw new Error("NexusReach tracker mutation was not persisted.");
    await approvedReset("returning");
    const restored = await findProductEngineer();
    if (restored.stage !== "interested" || restored.notes != null) throw new Error("NexusReach tracker reset did not restore the deterministic fixture.");
    return { mutated: { stage: mutated.stage, notes: mutated.notes }, restored: { stage: restored.stage, notes: restored.notes } };
  }
  if (workflowId === "review-draft-outreach") {
    const [messages, people] = await Promise.all([fetchApiCollection("/api/messages"), fetchApiCollection("/api/people")]);
    const draft = messages.items.find((item) => item.subject === "Learning about Northstar Labs");
    const person = draft && people.items.find((item) => item.id === draft.person_id);
    if (!draft || person?.full_name !== "Avery Chen" || draft.status !== "draft" || draft.body !== "Hi Avery — this is a synthetic, unsent demo draft." || draft.scheduled_send_at != null) throw new Error("NexusReach seeded outreach draft was not local and unsent.");
    return { draft: { person_name: person.full_name, status: draft.status, subject: draft.subject, body: draft.body, scheduled_send_at: draft.scheduled_send_at } };
  }
  throw new Error(`NexusReach returning workflow ${workflowId} is not registered for verification.`);
}

async function findProductEngineer(): Promise<Record<string, unknown>> {
  const jobs = await fetchApiCollection("/api/jobs");
  const job = jobs.items.find((item) => item.title === "Product Engineer");
  if (!job) throw new Error("NexusReach Product Engineer fixture was not found.");
  return job;
}

async function fetchApiCollection(pathname: string): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  const response = await fetch(`${APPROVED_API_URL}${pathname}`);
  if (!response.ok) throw new Error("NexusReach verification API request failed.");
  const value = await response.json() as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NexusReach verification API returned an invalid collection.");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items) || record.items.some((item) => !item || typeof item !== "object" || Array.isArray(item)) || typeof record.total !== "number") throw new Error("NexusReach verification API returned an invalid collection.");
  return { items: record.items as Array<Record<string, unknown>>, total: record.total };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function runCli() {
  const result = await runNexusReachPilot(parseNexusReachPilotArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ ok: true, pilotRoot: result.pilotRoot, runRoot: result.runRoot, clips: result.report.results.map((item) => ({ workflowId: item.workflowId, normalizedClip: item.normalizedClip.localPath, sourceRecording: item.sourceArtifact?.localPath })), coverage: result.report.coverage?.dimensions }, null, 2)}\n`);
}

if (require.main === module) runCli().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "NexusReach pilot failed."}\n`); process.exitCode = 1; });
