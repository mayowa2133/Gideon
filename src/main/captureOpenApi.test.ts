import { describe, expect, it } from "vitest";
import { CAPTURE_RUNTIME_OPERATIONS, generateCaptureOpenApi } from "./captureOpenApi";

describe("capture OpenAPI runtime contract", () => {
  it("generates unique operations for the complete operator lifecycle", () => {
    type Operation = { operationId: string; parameters?: Array<{ name: string; required: boolean }>; requestBody?: { content: { "application/json": { schema: { required?: string[] } } } } };
    const document = generateCaptureOpenApi() as { openapi: string; paths: Record<string, Record<string, Operation>> };
    const operations = Object.values(document.paths).flatMap((path) => Object.values(path));
    expect(document.openapi).toBe("3.1.0");
    expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(CAPTURE_RUNTIME_OPERATIONS.length);
    expect(operations.map((operation) => operation.operationId)).toEqual(expect.arrayContaining(["validateCaptureEnvironment", "startFlowDiscovery", "approveProductFlowRevision", "startCaptureRun", "retryFlowExecution", "getLatestCaptureCoverage"]));
    const approval = document.paths["/api/v1/projects/{projectId}/product-flows/{flowId}/approve"]!.post!;
    expect(approval.requestBody?.content["application/json"].schema.required).toContain("revision");
    const capture = document.paths["/api/v1/projects/{projectId}/capture-runs"]!.post!;
    expect(capture.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: true }));
  });
});
