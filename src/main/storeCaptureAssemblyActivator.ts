import type { Project } from "../shared/types";
import type { CaptureAssemblyActivator } from "./captureAssemblyWorker";

export interface CapturedAssemblyStore {
  activateCapturedAssemblyForSession(input: { userId: string; workspaceId: string; projectId: string; captureRunId: string; sourceArtifact: Parameters<CaptureAssemblyActivator["activate"]>[0]["sourceArtifact"]; manifestArtifact: Parameters<CaptureAssemblyActivator["activate"]>[0]["manifestArtifact"]; recording: Parameters<CaptureAssemblyActivator["activate"]>[0]["recording"] }): Promise<Project>;
}

export class StoreCaptureAssemblyActivator implements CaptureAssemblyActivator {
  constructor(private readonly store: CapturedAssemblyStore) {}
  async activate(input: Parameters<CaptureAssemblyActivator["activate"]>[0]) { await this.store.activateCapturedAssemblyForSession({ ...input, userId: input.actorUserId }); }
}
