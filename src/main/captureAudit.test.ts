import { describe, expect, it } from "vitest";
import { createCaptureAuditSink } from "./captureAudit";

describe("capture audit sink", () => {
  it("persists fixed safe summaries without secret-bearing metadata", async () => {
    const events: unknown[] = [];
    const sink = createCaptureAuditSink({ repository: { async upsertAuditEvent(event) { events.push(event); return event; } }, makeId: () => "audit-1", now: () => "2026-07-14T10:00:00.000Z" });
    await sink.record({ workspaceId: "workspace-1", projectId: "project-1", actorUserId: "user-1", actorType: "local_user", action: "capture_run.start", targetType: "capture_run", targetId: "capture-1", metadata: { flow_count: 3 } });
    expect(events[0]).toMatchObject({ summary: "Started a product flow capture run.", metadata: { flow_count: 3 } });
    await expect(sink.record({ workspaceId: "workspace-1", projectId: "project-1", actorUserId: "user-1", actorType: "local_user", action: "capture_run.start", targetType: "capture_run", metadata: { credential_token: "nope" } })).rejects.toThrow("unsafe");
  });
});
