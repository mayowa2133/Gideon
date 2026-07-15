import { describe, expect, it } from "vitest";
import { StorageCapturePreviewSigner } from "./storageCapturePreviewSigner";

describe("storage capture preview signer", () => {
  it("signs a bounded private S3 GET without exposing credentials in the response", async () => {
    const signer = new StorageCapturePreviewSigner({ GIDEON_STORAGE_PROVIDER: "s3", GIDEON_STORAGE_ENDPOINT: "https://s3.example.test", GIDEON_STORAGE_BUCKET: "private", GIDEON_STORAGE_REGION: "us-east-1", GIDEON_STORAGE_ACCESS_KEY_ID: "access-id", GIDEON_STORAGE_SECRET_ACCESS_KEY: "secret-value" }, () => new Date("2026-07-14T10:00:00.000Z"));
    const signed = await signer.sign({ artifact: { id: "artifact-1", workspaceId: "workspace-1", projectId: "project-1", kind: "normalized_flow_clip", provider: "s3", storageKey: "workspaces/workspace-1/clip.mp4", contentType: "video/mp4", byteSize: 1, sha256: "a".repeat(64), originalFileName: "clip.mp4", createdAt: "2026-07-14T09:00:00.000Z" }, expiresInSeconds: 300 });
    expect(signed.expiresAt).toBe("2026-07-14T10:05:00.000Z");
    expect(signed.url).toContain("X-Amz-Expires=300");
    expect(signed.url).not.toContain("secret-value");
  });
});
