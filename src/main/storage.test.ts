import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDirectUploadSession,
  createPrivateObjectStorage,
  isCloudStorageConfigured,
  loadStorageConfig,
  LocalPrivateObjectStorage,
  S3CompatibleObjectStorage
} from "./storage";

describe("local private object storage", () => {
  it("imports files into a workspace/project storage key with checksum metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-storage-"));
    const sourcePath = path.join(tempDir, "Product Demo.MP4");
    await fs.writeFile(sourcePath, Buffer.from("private recording bytes"));

    const storage = new LocalPrivateObjectStorage(path.join(tempDir, "objects"));
    const stored = await storage.putFile({
      workspaceId: "workspace 1",
      projectId: "project 1",
      kind: "source_recording",
      sourcePath
    });

    expect(stored.artifact.provider).toBe("local_private");
    expect(stored.artifact.storageKey).toContain("workspaces/workspace-1/projects/project-1/source_recording/");
    expect(stored.artifact.contentType).toBe("video/mp4");
    expect(stored.artifact.byteSize).toBe("private recording bytes".length);
    expect(stored.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(stored.filePath, "utf8")).toBe("private recording bytes");
    expect(stored.fileUrl).toMatch(/^file:\/\//);
  });

  it("loads cloud storage configuration from environment", () => {
    const config = loadStorageConfig({
      GIDEON_STORAGE_PROVIDER: "r2",
      GIDEON_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      GIDEON_STORAGE_BUCKET: "gideon-private",
      GIDEON_STORAGE_REGION: "auto",
      GIDEON_STORAGE_ACCESS_KEY_ID: "key",
      GIDEON_STORAGE_SECRET_ACCESS_KEY: "secret"
    });
    expect(config.provider).toBe("r2");
    expect(isCloudStorageConfigured(config)).toBe(true);
    expect(loadStorageConfig({}).provider).toBe("local_private");
  });

  it("creates local storage by default and rejects incomplete cloud settings", () => {
    expect(createPrivateObjectStorage({ localRootDir: "/tmp/gideon-test", env: {} })).toBeInstanceOf(LocalPrivateObjectStorage);
    expect(() =>
      createPrivateObjectStorage({
        localRootDir: "/tmp/gideon-test",
        env: { GIDEON_STORAGE_PROVIDER: "s3", GIDEON_STORAGE_BUCKET: "missing-endpoint" }
      })
    ).toThrow("Cloud storage provider s3 requires");
  });

  it("creates short-lived direct upload sessions for S3-compatible storage", () => {
    const storage = new S3CompatibleObjectStorage({
      provider: "s3",
      endpoint: "https://storage.example.com/base",
      bucket: "gideon-private",
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      cacheRootDir: "/tmp/gideon-cache"
    });

    const session = storage.createDirectUploadSession({
      workspaceId: "workspace 1",
      projectId: "project 1",
      kind: "source_recording",
      originalFileName: "Product Demo.MP4",
      byteSize: 1234,
      now: new Date("2026-06-25T12:00:00.000Z"),
      expiresInSeconds: 120
    });

    const uploadUrl = new URL(session.uploadUrl);
    expect(session.provider).toBe("s3");
    expect(session.method).toBe("PUT");
    expect(session.headers).toEqual({ "Content-Type": "video/mp4" });
    expect(session.expiresAt).toBe("2026-06-25T12:02:00.000Z");
    expect(session.maxBytes).toBe(1234);
    expect(session.storageKey).toContain("workspaces/workspace-1/projects/project-1/source_recording/");
    expect(uploadUrl.pathname).toContain("/base/gideon-private/workspaces/workspace-1/projects/project-1/source_recording/");
    expect(uploadUrl.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(uploadUrl.searchParams.get("X-Amz-Credential")).toContain("test-key/20260625/us-east-1/s3/aws4_request");
    expect(uploadUrl.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(uploadUrl.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates direct upload sessions from configured cloud storage only", () => {
    expect(() =>
      createDirectUploadSession(
        {
          localRootDir: "/tmp/gideon-cache",
          env: {}
        },
        {
          workspaceId: "workspace-1",
          projectId: "project-1",
          kind: "source_recording",
          originalFileName: "demo.mp4",
          byteSize: 100
        }
      )
    ).toThrow("Direct upload sessions require configured S3-compatible cloud storage.");

    const session = createDirectUploadSession(
      {
        localRootDir: "/tmp/gideon-cache",
        env: {
          GIDEON_STORAGE_PROVIDER: "r2",
          GIDEON_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
          GIDEON_STORAGE_BUCKET: "gideon-private",
          GIDEON_STORAGE_REGION: "auto",
          GIDEON_STORAGE_ACCESS_KEY_ID: "key",
          GIDEON_STORAGE_SECRET_ACCESS_KEY: "secret"
        }
      },
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        kind: "source_recording",
        originalFileName: "demo.mp4",
        byteSize: 100,
        now: new Date("2026-06-25T12:00:00.000Z")
      }
    );
    expect(session.provider).toBe("r2");
    expect(session.uploadUrl).toContain("X-Amz-Signature=");
  });

  it("uploads to S3-compatible private storage and keeps a local processing cache", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-s3-storage-"));
    const sourcePath = path.join(tempDir, "Product Demo.MP4");
    await fs.writeFile(sourcePath, Buffer.from("cloud recording bytes"));
    const received = await capturePutRequest();
    const storage = new S3CompatibleObjectStorage({
      provider: "r2",
      endpoint: received.endpoint,
      bucket: "gideon-private",
      region: "auto",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      cacheRootDir: path.join(tempDir, "cache")
    });

    try {
      const stored = await storage.putFile({
        workspaceId: "workspace 1",
        projectId: "project 1",
        kind: "source_recording",
        sourcePath
      });

      expect(stored.artifact.provider).toBe("r2");
      expect(stored.artifact.storageKey).toContain("workspaces/workspace-1/projects/project-1/source_recording/");
      expect(stored.artifact.localPath).toBe(stored.filePath);
      expect(await fs.readFile(stored.filePath, "utf8")).toBe("cloud recording bytes");
      expect(received.request?.method).toBe("PUT");
      expect(received.request?.url).toContain("/gideon-private/workspaces/workspace-1/projects/project-1/source_recording/");
      expect(received.headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=test-key/");
      expect(received.headers["x-amz-content-sha256"]).toBe(stored.artifact.sha256);
      expect(received.body).toBe("cloud recording bytes");
    } finally {
      await received.close();
    }
  });
});

async function capturePutRequest(): Promise<{
  endpoint: string;
  request?: http.IncomingMessage;
  headers: http.IncomingHttpHeaders;
  body: string;
  close: () => Promise<void>;
}> {
  const captured: {
    request?: http.IncomingMessage;
    headers: http.IncomingHttpHeaders;
    body: string;
  } = { headers: {}, body: "" };
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    captured.request = request;
    captured.headers = request.headers;
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      captured.body = Buffer.concat(chunks).toString("utf8");
      response.writeHead(200);
      response.end("ok");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local storage test server.");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    get request() {
      return captured.request;
    },
    get headers() {
      return captured.headers;
    },
    get body() {
      return captured.body;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
