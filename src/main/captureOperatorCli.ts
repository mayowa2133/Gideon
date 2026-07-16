import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;

export interface CaptureOperatorConfig {
  baseUrl: string;
  sessionCookie: string;
  csrfToken?: string;
}

export interface CaptureOperatorIo {
  stdout(value: string): void;
  stderr(value: string): void;
  readFile(path: string): Promise<string>;
  fetcher: FetchLike;
  env: NodeJS.ProcessEnv;
}

export class CaptureOperatorError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message);
  }
}

export class CaptureOperatorClient {
  private csrfToken: string | undefined;

  constructor(private readonly config: CaptureOperatorConfig, private readonly fetcher: FetchLike = fetch) {
    this.csrfToken = config.csrfToken;
  }

  async request(method: "GET" | "POST", path: string, body?: JsonObject, idempotencyKey?: string): Promise<JsonObject> {
    if (method !== "GET" && !this.csrfToken) await this.loadSession();
    const headers = new Headers({ accept: "application/json", cookie: this.config.sessionCookie });
    if (body) headers.set("content-type", "application/json");
    if (this.csrfToken) headers.set("x-csrf-token", this.csrfToken);
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
    const response = await this.fetcher(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    const envelope = await response.json().catch(() => ({})) as { data?: JsonObject; error?: { code?: string; message?: string }; meta?: { requestId?: string } };
    if (!response.ok || !envelope.data) {
      const requestId = envelope.meta?.requestId ? ` Request ID: ${envelope.meta.requestId}.` : "";
      throw new CaptureOperatorError(`${envelope.error?.message ?? `Gideon returned HTTP ${response.status}.`} (${envelope.error?.code ?? "request_failed"}).${requestId}`);
    }
    return envelope.data;
  }

  private async loadSession(): Promise<void> {
    const data = await this.request("GET", "/api/v1/auth/session");
    const token = data.csrfToken;
    if (typeof token !== "string" || !token) {
      throw new CaptureOperatorError("The hosted session did not provide a CSRF token. Sign in again or set GIDEON_CAPTURE_CSRF_TOKEN.");
    }
    this.csrfToken = token;
  }
}

export async function runCaptureOperator(
  argv: string[],
  overrides: Partial<CaptureOperatorIo> = {}
): Promise<number> {
  const io: CaptureOperatorIo = {
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
    readFile: (path) => fs.readFile(path, "utf8"),
    fetcher: fetch,
    env: process.env,
    ...overrides
  };
  try {
    const { command, flags } = parseArguments(argv);
    if (command === "help") {
      io.stdout(helpText());
      return 0;
    }
    if (command === "manifest:template") {
      io.stdout(JSON.stringify(environmentManifestTemplate(), null, 2));
      return 0;
    }
    const client = new CaptureOperatorClient(configFromEnvironment(io.env), io.fetcher);
    const output = await executeCommand(client, command, flags, io);
    io.stdout(JSON.stringify(output, null, 2));
    return 0;
  } catch (error) {
    const safe = error instanceof Error ? error.message : "Unknown operator error.";
    io.stderr(`Gideon capture operator: ${safe}`);
    return error instanceof CaptureOperatorError ? error.exitCode : 1;
  }
}

async function executeCommand(
  client: CaptureOperatorClient,
  command: string,
  flags: Map<string, string>,
  io: CaptureOperatorIo
): Promise<JsonObject> {
  const projectId = () => requiredFlag(flags, "project");
  const projectPath = (suffix: string) => `/api/v1/projects/${encodeURIComponent(projectId())}${suffix}`;
  switch (command) {
    case "capabilities":
      return client.request("GET", "/api/v1/capture-capabilities");
    case "environment:list":
      return client.request("GET", projectPath("/capture-environments"));
    case "environment:create": {
      const manifest = await readManifest(flags, io);
      return client.request("POST", projectPath("/capture-environments"), environmentBody(manifest));
    }
    case "environment:validate": {
      const id = requiredFlag(flags, "environment");
      return client.request("POST", projectPath(`/capture-environments/${encodeURIComponent(id)}/validate`), {}, operationKey("environment-validation", id, flags));
    }
    case "discovery:start": {
      const manifest = await readManifest(flags, io, false);
      const environmentId = requiredFlag(flags, "environment", manifest.environmentId);
      const goals = manifest.goals ?? parseJsonFlag(flags, "goals");
      if (!Array.isArray(goals) || goals.length === 0) throw new CaptureOperatorError("Provide discovery goals with --goals '<json-array>' or a --manifest file containing goals.");
      return client.request("POST", projectPath("/discovery-runs"), { environmentId, goals, maxCandidates: optionalInteger(flags, "max-candidates") }, operationKey("discovery", environmentId, flags));
    }
    case "discovery:status":
      return client.request("GET", projectPath(`/discovery-runs/${encodedFlag(flags, "run")}`));
    case "discovery:cancel":
      return client.request("POST", projectPath(`/discovery-runs/${encodedFlag(flags, "run")}/cancel`), {});
    case "flow:list":
      return client.request("GET", projectPath("/product-flows"));
    case "flow:inspect":
      return client.request("GET", projectPath(`/product-flows/${encodedFlag(flags, "flow")}`));
    case "flow:approve":
    case "flow:reject": {
      const action = command === "flow:approve" ? "approve" : "reject";
      const revision = requiredInteger(flags, "revision");
      return client.request("POST", projectPath(`/product-flows/${encodedFlag(flags, "flow")}/${action}`), { revision });
    }
    case "capture:start": {
      const environmentId = requiredFlag(flags, "environment");
      const flowIds = requiredCsv(flags, "flows");
      return client.request("POST", projectPath("/capture-runs"), { environmentId, flowIds }, operationKey("capture", `${environmentId}:${flowIds.join(",")}`, flags));
    }
    case "capture:status":
      return client.request("GET", projectPath(`/capture-runs/${encodedFlag(flags, "run")}`));
    case "capture:cancel":
      return client.request("POST", projectPath(`/capture-runs/${encodedFlag(flags, "run")}/cancel`), {});
    case "execution:retry": {
      const executionId = requiredFlag(flags, "execution");
      return client.request("POST", projectPath(`/flow-executions/${encodeURIComponent(executionId)}/retry`), {}, operationKey("retry", executionId, flags));
    }
    case "evidence:inspect": {
      const capture = await client.request("GET", projectPath(`/capture-runs/${encodedFlag(flags, "run")}`));
      let coverage: JsonObject | null = null;
      try { coverage = await client.request("GET", projectPath("/coverage-snapshots/latest")); } catch (error) {
        if (!(error instanceof CaptureOperatorError) || !error.message.includes("not_found")) throw error;
      }
      return { capture, coverage, note: "Artifact IDs and bounded quality/coverage receipts are shown; signed media URLs and credentials are intentionally omitted." };
    }
    case "cleanup": {
      const resource = requiredFlag(flags, "resource");
      const id = requiredFlag(flags, "id");
      if (resource === "capture") return client.request("POST", projectPath(`/capture-runs/${encodeURIComponent(id)}/cancel`), {});
      if (resource === "discovery") return client.request("POST", projectPath(`/discovery-runs/${encodeURIComponent(id)}/cancel`), {});
      throw new CaptureOperatorError("--resource must be capture or discovery. Cleanup is bounded to canceling active disposable work; it never deletes source evidence.");
    }
    default:
      throw new CaptureOperatorError(`Unknown command '${command}'. Run capture:operator -- help for supported commands.`);
  }
}

function parseArguments(argv: string[]): { command: string; flags: Map<string, string> } {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const command = normalized[0] ?? "help";
  const flags = new Map<string, string>();
  for (let index = 1; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new CaptureOperatorError(`Expected --name value near '${key ?? "end of command"}'.`);
    if (flags.has(key.slice(2))) throw new CaptureOperatorError(`Flag ${key} may only be provided once.`);
    flags.set(key.slice(2), value);
  }
  return { command, flags };
}

function configFromEnvironment(env: NodeJS.ProcessEnv): CaptureOperatorConfig {
  const sessionCookie = env.GIDEON_CAPTURE_SESSION_COOKIE?.trim();
  if (!sessionCookie) throw new CaptureOperatorError("Set GIDEON_CAPTURE_SESSION_COOKIE from an authenticated Gideon session. Cookies are accepted only through the environment, never command arguments or manifest files.");
  const baseUrl = (env.GIDEON_CAPTURE_API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new CaptureOperatorError("GIDEON_CAPTURE_API_BASE_URL must use HTTPS except for loopback development.");
  return { baseUrl, sessionCookie, csrfToken: env.GIDEON_CAPTURE_CSRF_TOKEN?.trim() || undefined };
}

async function readManifest(flags: Map<string, string>, io: CaptureOperatorIo, required = true): Promise<JsonObject> {
  const path = flags.get("manifest");
  if (!path) {
    if (required) throw new CaptureOperatorError("Provide --manifest path. Generate a secret-free starter with 'pnpm capture:operator -- manifest:template'.");
    return {};
  }
  const value = JSON.parse(await io.readFile(path)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CaptureOperatorError("The manifest root must be a JSON object.");
  const manifest = value as JsonObject;
  for (const forbidden of ["password", "cookie", "token", "secret", "command", "headers"]) {
    if (containsKey(manifest, forbidden)) throw new CaptureOperatorError(`Manifest key '${forbidden}' is forbidden. Put session material in environment variables and keep process commands outside manifests.`);
  }
  return manifest;
}

function environmentBody(manifest: JsonObject): JsonObject {
  for (const key of ["name", "type", "baseUrl", "allowedDomains", "resetAdapter"]) if (manifest[key] === undefined) throw new CaptureOperatorError(`Environment manifest is missing '${key}'.`);
  return { name: manifest.name, type: manifest.type, baseUrl: manifest.baseUrl, allowedDomains: manifest.allowedDomains, resetAdapter: manifest.resetAdapter };
}

function environmentManifestTemplate(): JsonObject {
  return {
    name: "Product demo",
    type: "demo",
    baseUrl: "https://demo.example.com",
    allowedDomains: ["demo.example.com"],
    resetAdapter: "fixture_api",
    goals: [{ id: "primary-workflow", text: "Demonstrate the primary customer outcome", priority: 100 }],
    note: "Do not add passwords, cookies, tokens, commands, or request headers. Configure authentication through Gideon's credential vault or operator environment variables."
  };
}

function containsKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsKey(entry, key));
  return Object.entries(value as JsonObject).some(([candidate, nested]) => candidate.toLowerCase().includes(key) || containsKey(nested, key));
}

function requiredFlag(flags: Map<string, string>, name: string, fallback?: unknown): string {
  const value = flags.get(name) ?? (typeof fallback === "string" ? fallback : undefined);
  if (!value?.trim()) throw new CaptureOperatorError(`Missing --${name}.`);
  return value.trim();
}
function encodedFlag(flags: Map<string, string>, name: string): string { return encodeURIComponent(requiredFlag(flags, name)); }
function requiredInteger(flags: Map<string, string>, name: string): number {
  const value = Number(requiredFlag(flags, name));
  if (!Number.isSafeInteger(value) || value < 1) throw new CaptureOperatorError(`--${name} must be a positive integer.`);
  return value;
}
function optionalInteger(flags: Map<string, string>, name: string): number | undefined { return flags.has(name) ? requiredInteger(flags, name) : undefined; }
function requiredCsv(flags: Map<string, string>, name: string): string[] {
  const values = requiredFlag(flags, name).split(",").map((value) => value.trim()).filter(Boolean);
  if (!values.length) throw new CaptureOperatorError(`--${name} must contain at least one ID.`);
  return values;
}
function parseJsonFlag(flags: Map<string, string>, name: string): unknown {
  const value = flags.get(name);
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { throw new CaptureOperatorError(`--${name} must be valid JSON.`); }
}
function operationKey(kind: string, identity: string, flags: Map<string, string>): string { return flags.get("idempotency-key") ?? `${kind}:${identity}:${randomUUID()}`; }

function helpText(): string {
  return `Gideon structured capture operator

Authentication (environment only): GIDEON_CAPTURE_SESSION_COOKIE, optional GIDEON_CAPTURE_CSRF_TOKEN and GIDEON_CAPTURE_API_BASE_URL.

Commands:
  manifest:template
  capabilities
  environment:list --project ID
  environment:create --project ID --manifest FILE
  environment:validate --project ID --environment ID
  discovery:start --project ID --environment ID --goals JSON
  discovery:status|discovery:cancel --project ID --run ID
  flow:list --project ID
  flow:inspect --project ID --flow ID
  flow:approve|flow:reject --project ID --flow ID --revision N
  capture:start --project ID --environment ID --flows ID,ID
  capture:status|capture:cancel --project ID --run ID
  execution:retry --project ID --execution ID
  evidence:inspect --project ID --run ID
  cleanup --project ID --resource capture|discovery --id ID`;
}

if (require.main === module) {
  void runCaptureOperator(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
