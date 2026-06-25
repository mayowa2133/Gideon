import { createHash, createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import type { ArtifactKind, ArtifactProvider, ArtifactRecord } from "../shared/types";

export interface PutFileInput {
  workspaceId: string;
  projectId: string;
  kind: ArtifactKind;
  sourcePath: string;
  originalFileName?: string;
  contentType?: string;
  now?: string;
}

export interface StoredArtifact {
  artifact: ArtifactRecord;
  filePath: string;
  fileUrl: string;
}

export interface PrivateObjectStorage {
  putFile(input: PutFileInput): Promise<StoredArtifact>;
}

export type StorageProviderMode = "local_private" | "s3" | "r2";

export interface StorageConfig {
  provider: StorageProviderMode;
  endpoint: string | null;
  bucket: string | null;
  region: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  publicBaseUrl: string | null;
}

export interface PrivateObjectStorageFactoryInput {
  localRootDir: string;
  cloudCacheRootDir?: string;
  env?: NodeJS.ProcessEnv;
}

interface S3CompatibleObjectStorageConfig {
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  cacheRootDir: string;
  publicBaseUrl?: string | null;
}

interface UploadObjectInput {
  sourcePath: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  contentType: string;
}

export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    provider: normalizeStorageProvider(env.GIDEON_STORAGE_PROVIDER),
    endpoint: nonEmpty(env.GIDEON_STORAGE_ENDPOINT),
    bucket: nonEmpty(env.GIDEON_STORAGE_BUCKET),
    region: env.GIDEON_STORAGE_REGION?.trim() || "auto",
    accessKeyId: nonEmpty(env.GIDEON_STORAGE_ACCESS_KEY_ID),
    secretAccessKey: nonEmpty(env.GIDEON_STORAGE_SECRET_ACCESS_KEY),
    publicBaseUrl: nonEmpty(env.GIDEON_STORAGE_PUBLIC_BASE_URL)
  };
}

export function isCloudStorageConfigured(config: StorageConfig = loadStorageConfig()): boolean {
  return (
    (config.provider === "s3" || config.provider === "r2") &&
    Boolean(config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey)
  );
}

export function createPrivateObjectStorage(input: PrivateObjectStorageFactoryInput): PrivateObjectStorage {
  const config = loadStorageConfig(input.env);
  if (config.provider === "local_private") {
    return new LocalPrivateObjectStorage(input.localRootDir);
  }
  if (!isCloudStorageConfigured(config)) {
    throw new Error(
      `Cloud storage provider ${config.provider} requires GIDEON_STORAGE_ENDPOINT, GIDEON_STORAGE_BUCKET, GIDEON_STORAGE_ACCESS_KEY_ID, and GIDEON_STORAGE_SECRET_ACCESS_KEY.`
    );
  }
  return new S3CompatibleObjectStorage({
    provider: config.provider,
    endpoint: config.endpoint!,
    bucket: config.bucket!,
    region: config.region,
    accessKeyId: config.accessKeyId!,
    secretAccessKey: config.secretAccessKey!,
    publicBaseUrl: config.publicBaseUrl,
    cacheRootDir: input.cloudCacheRootDir ?? path.join(input.localRootDir, "_cloud-cache")
  });
}

export class LocalPrivateObjectStorage implements PrivateObjectStorage {
  constructor(private readonly rootDir: string) {}

  async putFile(input: PutFileInput): Promise<StoredArtifact> {
    const artifactId = randomUUID();
    const originalFileName = input.originalFileName ?? path.basename(input.sourcePath);
    const storageKey = storageKeyFor(input, artifactId, originalFileName);
    const destinationPath = path.join(this.rootDir, storageKey);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    const { byteSize, sha256 } = await copyWithSha256(input.sourcePath, destinationPath);
    const fileUrl = pathToFileURL(destinationPath).toString();
    return {
      filePath: destinationPath,
      fileUrl,
      artifact: {
        id: artifactId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: input.kind,
        provider: "local_private",
        storageKey,
        contentType: input.contentType ?? inferContentType(originalFileName),
        byteSize,
        sha256,
        originalFileName,
        localPath: destinationPath,
        localUrl: fileUrl,
        createdAt: input.now ?? new Date().toISOString()
      }
    };
  }
}

export class S3CompatibleObjectStorage implements PrivateObjectStorage {
  constructor(private readonly config: S3CompatibleObjectStorageConfig) {}

  async putFile(input: PutFileInput): Promise<StoredArtifact> {
    const artifactId = randomUUID();
    const originalFileName = input.originalFileName ?? path.basename(input.sourcePath);
    const storageKey = storageKeyFor(input, artifactId, originalFileName);
    const cachePath = path.join(this.config.cacheRootDir, storageKey);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const { byteSize, sha256 } = await copyWithSha256(input.sourcePath, cachePath);
    const contentType = input.contentType ?? inferContentType(originalFileName);
    await this.uploadObject({
      sourcePath: cachePath,
      storageKey,
      byteSize,
      sha256,
      contentType
    });
    const fileUrl = pathToFileURL(cachePath).toString();
    return {
      filePath: cachePath,
      fileUrl,
      artifact: {
        id: artifactId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: input.kind,
        provider: this.config.provider,
        storageKey,
        contentType,
        byteSize,
        sha256,
        originalFileName,
        localPath: cachePath,
        localUrl: fileUrl,
        createdAt: input.now ?? new Date().toISOString()
      }
    };
  }

  private async uploadObject(input: UploadObjectInput): Promise<void> {
    const target = s3ObjectUrl(this.config.endpoint, this.config.bucket, input.storageKey);
    const headers = signedPutHeaders({
      url: target,
      bucket: this.config.bucket,
      storageKey: input.storageKey,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      now: new Date()
    });
    await putStream(target, headers, input.sourcePath);
  }
}

export function remoteArtifactUrl(publicBaseUrl: string | null | undefined, storageKey: string): string | undefined {
  if (!publicBaseUrl) {
    return undefined;
  }
  return `${publicBaseUrl.replace(/\/+$/g, "")}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

async function copyWithSha256(sourcePath: string, destinationPath: string): Promise<{ byteSize: number; sha256: string }> {
  const hash = createHash("sha256");
  let byteSize = 0;
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(sourcePath);
    const output = createWriteStream(destinationPath, { mode: 0o600 });
    input.on("data", (chunk: Buffer) => {
      byteSize += chunk.length;
      hash.update(chunk);
    });
    input.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve);
    input.pipe(output);
  });
  return { byteSize, sha256: hash.digest("hex") };
}

function storageKeyFor(input: PutFileInput, artifactId: string, originalFileName: string): string {
  return [
    "workspaces",
    safePathSegment(input.workspaceId),
    "projects",
    safePathSegment(input.projectId),
    input.kind,
    `${artifactId}-${safeFileName(originalFileName)}`
  ].join("/");
}

function signedPutHeaders(input: {
  url: URL;
  bucket: string;
  storageKey: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  now: Date;
}): Record<string, string> {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const host = input.url.host;
  const headers = {
    "content-length": String(input.byteSize),
    "content-type": input.contentType,
    host,
    "x-amz-content-sha256": input.sha256,
    "x-amz-date": amzDate
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((header) => `${header}:${headers[header as keyof typeof headers]}\n`)
    .join("");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const canonicalRequest = [
    "PUT",
    canonicalUri(input.url.pathname),
    "",
    canonicalHeaders,
    signedHeaders,
    input.sha256
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  return {
    "Content-Length": headers["content-length"],
    "Content-Type": headers["content-type"],
    Host: headers.host,
    "X-Amz-Content-Sha256": headers["x-amz-content-sha256"],
    "X-Amz-Date": headers["x-amz-date"],
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function hmac(key: string | Buffer, value: string): Buffer;
function hmac(key: string | Buffer, value: string, encoding: "hex"): string;
function hmac(key: string | Buffer, value: string, encoding?: "hex"): Buffer | string {
  const result = createHmac("sha256", key).update(value).digest();
  return encoding === "hex" ? result.toString("hex") : result;
}

function s3ObjectUrl(endpoint: string, bucket: string, storageKey: string): URL {
  const target = new URL(endpoint);
  const basePath = target.pathname.replace(/\/+$/g, "");
  target.pathname = `${basePath}/${encodeURIComponent(bucket)}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
  target.search = "";
  return target;
}

async function putStream(url: URL, headers: Record<string, string>, sourcePath: string): Promise<void> {
  const client = url.protocol === "https:" ? https : http;
  await new Promise<void>((resolve, reject) => {
    const request = client.request(url, { method: "PUT", headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        reject(
          new Error(
            `Cloud storage upload failed with HTTP ${response.statusCode ?? "unknown"}: ${Buffer.concat(chunks).toString("utf8").slice(0, 180)}`
          )
        );
      });
    });
    request.on("error", reject);
    void pipeline(createReadStream(sourcePath), request).catch(reject);
  });
}

function toAmzDate(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalUri(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function normalizeStorageProvider(value: string | undefined): StorageProviderMode {
  if (value === "s3" || value === "r2") {
    return value;
  }
  return "local_private";
}

function nonEmpty(value: string | undefined): string | null {
  return value?.trim() || null;
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function safeFileName(value: string): string {
  const extension = path.extname(value);
  const base = path.basename(value, extension).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "artifact";
  return `${base}${extension.toLowerCase()}`;
}

function inferContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".mp4") {
    return "video/mp4";
  }
  if (extension === ".mov") {
    return "video/quicktime";
  }
  if (extension === ".webm") {
    return "video/webm";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".png") {
    return "image/png";
  }
  return "application/octet-stream";
}
