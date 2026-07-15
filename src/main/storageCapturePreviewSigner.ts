import type { CapturePreviewSigner } from "./capturePreviewService";
import { createPrivateArtifactDownloadUrl } from "./storage";

export class StorageCapturePreviewSigner implements CapturePreviewSigner {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly now: () => Date = () => new Date()) {}
  async sign(input: Parameters<CapturePreviewSigner["sign"]>[0]) { return createPrivateArtifactDownloadUrl({ artifact: input.artifact, env: this.env, expiresInSeconds: input.expiresInSeconds, now: this.now() }); }
}
