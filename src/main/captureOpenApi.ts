type Schema = Record<string, unknown>;

export interface CaptureRuntimeOperation {
  operationId: string;
  method: "get" | "post";
  path: string;
  summary: string;
  mutation?: boolean;
  idempotent?: boolean;
  requestSchema?: Schema;
}

const id = { type: "string", minLength: 1, maxLength: 200 };
const projectParameters = [{ name: "projectId", in: "path", required: true, schema: id }];
const resource = (name: string) => ({ name, in: "path", required: true, schema: id });
const object = (properties: Schema, required: string[] = []): Schema => ({ type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) });

export const CAPTURE_RUNTIME_OPERATIONS: readonly CaptureRuntimeOperation[] = [
  { operationId: "getCaptureCapabilities", method: "get", path: "/api/v1/capture-capabilities", summary: "Inspect enabled capture capabilities" },
  { operationId: "listCaptureEnvironments", method: "get", path: "/api/v1/projects/{projectId}/capture-environments", summary: "List capture environments" },
  { operationId: "createCaptureEnvironment", method: "post", path: "/api/v1/projects/{projectId}/capture-environments", summary: "Create a secret-free capture environment", mutation: true, requestSchema: object({ name: { type: "string", minLength: 1, maxLength: 160 }, type: { enum: ["local_preview", "staging", "demo", "production_sandbox"] }, baseUrl: { type: "string", format: "uri" }, allowedDomains: { type: "array", minItems: 1, items: { type: "string" } }, resetAdapter: { enum: ["none", "fixture_api", "snapshot_restore"] } }, ["name", "type", "baseUrl", "allowedDomains", "resetAdapter"]) },
  { operationId: "validateCaptureEnvironment", method: "post", path: "/api/v1/projects/{projectId}/capture-environments/{environmentId}/validate", summary: "Validate reachability and freeze an environment revision", mutation: true, idempotent: true, requestSchema: object({}) },
  { operationId: "startFlowDiscovery", method: "post", path: "/api/v1/projects/{projectId}/discovery-runs", summary: "Start bounded product-flow discovery", mutation: true, idempotent: true, requestSchema: object({ environmentId: id, goals: { type: "array", minItems: 1, maxItems: 100, items: object({ id, text: { type: "string", minLength: 1, maxLength: 600 }, priority: { type: "integer", minimum: 0, maximum: 100 } }, ["id", "text", "priority"]) }, maxCandidates: { type: "integer", minimum: 1, maximum: 100 } }, ["environmentId", "goals"]) },
  { operationId: "getFlowDiscovery", method: "get", path: "/api/v1/projects/{projectId}/discovery-runs/{discoveryRunId}", summary: "Inspect discovery status" },
  { operationId: "cancelFlowDiscovery", method: "post", path: "/api/v1/projects/{projectId}/discovery-runs/{discoveryRunId}/cancel", summary: "Cancel and clean up discovery work", mutation: true, requestSchema: object({}) },
  { operationId: "listProductFlows", method: "get", path: "/api/v1/projects/{projectId}/product-flows", summary: "List proposed and reviewed flows" },
  { operationId: "getProductFlow", method: "get", path: "/api/v1/projects/{projectId}/product-flows/{flowId}", summary: "Inspect one flow revision" },
  { operationId: "approveProductFlowRevision", method: "post", path: "/api/v1/projects/{projectId}/product-flows/{flowId}/approve", summary: "Approve exactly one reviewed flow revision", mutation: true, requestSchema: object({ revision: { type: "integer", minimum: 1 } }, ["revision"]) },
  { operationId: "rejectProductFlowRevision", method: "post", path: "/api/v1/projects/{projectId}/product-flows/{flowId}/reject", summary: "Reject exactly one reviewed flow revision", mutation: true, requestSchema: object({ revision: { type: "integer", minimum: 1 } }, ["revision"]) },
  { operationId: "startCaptureRun", method: "post", path: "/api/v1/projects/{projectId}/capture-runs", summary: "Capture current approved flow revisions", mutation: true, idempotent: true, requestSchema: object({ environmentId: id, flowIds: { type: "array", minItems: 1, maxItems: 50, items: id } }, ["environmentId", "flowIds"]) },
  { operationId: "getCaptureRun", method: "get", path: "/api/v1/projects/{projectId}/capture-runs/{captureRunId}", summary: "Inspect run, execution, quality, repair, and artifact receipts" },
  { operationId: "cancelCaptureRun", method: "post", path: "/api/v1/projects/{projectId}/capture-runs/{captureRunId}/cancel", summary: "Cancel and clean up active capture work", mutation: true, requestSchema: object({}) },
  { operationId: "retryFlowExecution", method: "post", path: "/api/v1/projects/{projectId}/flow-executions/{executionId}/retry", summary: "Queue a bounded one-flow retry", mutation: true, idempotent: true, requestSchema: object({}) },
  { operationId: "createFlowExecutionPreview", method: "post", path: "/api/v1/projects/{projectId}/flow-executions/{executionId}/preview-url", summary: "Create a private short-lived clip preview", mutation: true, requestSchema: object({}) },
  { operationId: "getLatestCaptureCoverage", method: "get", path: "/api/v1/projects/{projectId}/coverage-snapshots/latest", summary: "Inspect bounded versioned coverage denominators" }
] as const;

export function generateCaptureOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of CAPTURE_RUNTIME_OPERATIONS) {
    const parameters = operation.path.includes("{projectId}") ? [...projectParameters] : [];
    for (const match of operation.path.matchAll(/\{([^}]+)\}/g)) {
      if (match[1] !== "projectId") parameters.push(resource(match[1]!));
    }
    const headers = operation.idempotent ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 200 } }] : [];
    paths[operation.path] ??= {};
    paths[operation.path]![operation.method] = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: ["Structured product capture"],
      security: [{ sessionCookie: [] }],
      parameters: [...parameters, ...headers],
      ...(operation.mutation ? { description: "Requires the session CSRF token in X-CSRF-Token." } : {}),
      ...(operation.requestSchema ? { requestBody: { required: true, content: { "application/json": { schema: operation.requestSchema } } } } : {}),
      responses: {
        "200": { description: "Successful response" },
        "202": { description: "Asynchronous work accepted" },
        "4XX": { description: "Actionable validation, authorization, conflict, or state error" },
        "5XX": { description: "Safe service error without provider internals" }
      }
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Gideon Structured Product Capture API", version: "1.0.0", description: "Runtime contract for bounded environment discovery, revision review, capture, retry, evidence, and cleanup operations." },
    servers: [{ url: "/" }],
    paths,
    components: { securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "gideon_session" } } }
  };
}
