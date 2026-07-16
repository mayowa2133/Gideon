import { randomUUID } from "node:crypto";
import type { AuditAction, AuditActorType, AuditEvent, AuditMetadataValue, AuditTargetType } from "../shared/types";
import { redactCaptureDiagnostic } from "./captureSupportBundle";

export interface CaptureAuditRepository { upsertAuditEvent(event: AuditEvent): Promise<AuditEvent> }

const summaries: Partial<Record<AuditAction, string>> = {
  "capture_environment.create": "Created a capture environment.",
  "capture_environment.update": "Updated a capture environment.",
  "capture_environment.validate": "Requested capture environment validation.",
  "capture_persona.create": "Created a capture persona.",
  "capture_credential_grant.create": "Created a capture credential grant.",
  "capture_credential_grant.use": "Used a capture credential grant.",
  "capture_credential_grant.expire": "Expired a capture credential grant.",
  "capture_credential_grant.revoke": "Revoked a capture credential grant.",
  "flow_discovery.start": "Started product flow discovery.",
  "flow_discovery.cancel": "Canceled product flow discovery.",
  "flow_discovery.complete": "Completed product flow discovery.",
  "product_flow.revise": "Revised a product flow.",
  "product_flow.approve": "Approved a product flow revision.",
  "product_flow.reject": "Rejected a product flow revision.",
  "capture_run.start": "Started a product flow capture run.",
  "capture_run.cancel": "Canceled a product flow capture run.",
  "capture_run.retry": "Retried a product flow capture.",
  "capture_run.complete": "Completed a product flow capture run.",
  "capture_assembly.activate": "Activated a captured assembly as the source recording.",
  "capture_assembly.delete": "Deleted a captured assembly."
};

export function createCaptureAuditSink(options: { repository: CaptureAuditRepository; makeId?: () => string; now?: () => string }) {
  const makeId = options.makeId ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  return {
    async record(input: { workspaceId: string; projectId: string; actorUserId: string; actorType: AuditActorType; action: AuditAction; targetType: AuditTargetType; targetId?: string; metadata?: Record<string, AuditMetadataValue> }): Promise<AuditEvent> {
      const summary = summaries[input.action];
      if (!summary) throw new Error("Capture audit action is not supported.");
      const metadata = sanitizeMetadata(input.metadata);
      return options.repository.upsertAuditEvent({ id: makeId(), workspaceId: boundedId(input.workspaceId), projectId: boundedId(input.projectId), actorUserId: boundedId(input.actorUserId), actorType: input.actorType, action: input.action, targetType: input.targetType, targetId: input.targetId ? boundedId(input.targetId) : undefined, summary, metadata, createdAt: now() });
    }
  };
}

export type CaptureAuditSink = ReturnType<typeof createCaptureAuditSink>;

function sanitizeMetadata(value: Record<string, AuditMetadataValue> | undefined) {
  if (!value) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error("Capture audit metadata is too large.");
  const result: Record<string, AuditMetadataValue> = {};
  for (const [key, item] of entries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || /(?:secret|token|password|credential|cookie|authorization|url|path|prompt|transcript|object_key|storage_key|filename|selector|media|screenshot|frame|html|dom|value)/.test(key)) throw new Error("Capture audit metadata key is unsafe.");
    if (typeof item === "string" && item.length > 200) throw new Error("Capture audit metadata value is too large.");
    if (typeof item === "string" && redactCaptureDiagnostic(item) !== item) throw new Error("Capture audit metadata value is unsafe.");
    result[key] = item;
  }
  return result;
}
function boundedId(value: string) { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:@-]+$/.test(id)) throw new Error("Capture audit identifier is invalid."); return id; }
