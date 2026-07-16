import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRedactedCaptureSupportBundle, redactCaptureDiagnostic } from "./captureSupportBundle";

describe("redacted capture support bundles", () => {
  const roots: string[] = [];
  afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

  it("writes only bounded redacted diagnostics as a private regular file", async () => {
    const root = await tempRoot();
    const localPath = `${root}/repos/customer/.env.production`;
    const result = await createRedactedCaptureSupportBundle({
      privateRoot: root, bundleId: "support-1", captureId: "capture-1", now: () => "2026-07-16T12:00:00.000Z",
      diagnostics: [{
        code: "capture_failed",
        message: `Provider token=tok_fixture_123456 failed for founder@example.test card 4242 4242 4242 4242 at ${localPath} object workspace/private/video.webm https://storage.test/file?signature=private`,
        metadata: { objectKey: "workspace/private/video.webm", selector: "#api-token", filename: "../../.env", safeCount: 2, nested: { message: "password=fixture-secret-value" } }
      }]
    });
    const bytes = await fs.readFile(result.path, "utf8");
    expect(result).toMatchObject({ byteSize: Buffer.byteLength(bytes), sha256: expect.stringMatching(/^[a-f0-9]{64}$/), report: { exclusions: expect.arrayContaining(["media", "credentials", "object_keys", "signed_urls"]) } });
    expect(bytes).not.toContain("tok_fixture_123456");
    expect(bytes).not.toContain("founder@example.test");
    expect(bytes).not.toContain("4242 4242");
    expect(bytes).not.toContain(root);
    expect(bytes).not.toContain("workspace/private");
    expect(bytes).not.toContain("#api-token");
    expect(bytes).not.toContain("fixture-secret-value");
    expect((await fs.stat(result.path)).mode & 0o777).toBe(0o600);
  });

  it("rejects traversal IDs and symlinked roots or output directories", async () => {
    const root = await tempRoot();
    await expect(createRedactedCaptureSupportBundle({ privateRoot: root, bundleId: "../escape", captureId: "capture-1", diagnostics: [] })).rejects.toThrow("bundle ID is invalid");
    const link = `${root}-link`;
    roots.push(link);
    await fs.symlink(root, link);
    await expect(createRedactedCaptureSupportBundle({ privateRoot: link, bundleId: "support-1", captureId: "capture-1", diagnostics: [] })).rejects.toThrow("private real directory");

    const hostileRoot = await tempRoot();
    await fs.symlink(root, path.join(hostileRoot, "support-bundles"));
    await expect(createRedactedCaptureSupportBundle({ privateRoot: hostileRoot, bundleId: "support-1", captureId: "capture-1", diagnostics: [] })).rejects.toThrow("output directory is unsafe");
  });

  it("redacts secret-shaped filenames, paths, signed URLs, and control characters without throwing their values", () => {
    const result = redactCaptureDiagnostic("\u0000 /Users/demo/private/id_rsa https://example.test/a?X-Amz-Signature=secret password=fixture-password");
    expect(result).toContain("[redacted-path]");
    expect(result).toContain("?[redacted]");
    expect(result).toContain("[redacted-secret]");
    expect(result).not.toMatch(/id_rsa|fixture-password|X-Amz-Signature/);
  });

  async function tempRoot(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-support-"));
    roots.push(root);
    return root;
  }
});
