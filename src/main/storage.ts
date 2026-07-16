import { createHash, createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import type { ArtifactKind, ArtifactProvider, ArtifactRecord, AvatarModelReceipt, AvatarPresenterLineage } from "../shared/types";

export interface PutFileInput {
  workspaceId: string;
  projectId: string;
  kind: ArtifactKind;
  sourcePath: string;
  originalFileName?: string;
  contentType?: string;
  avatarModelReceipt?: AvatarModelReceipt;
  avatarPresenterLineage?: AvatarPresenterLineage;
  now?: string;
}

export interface CreateDirectUploadSessionInput {
  workspaceId: string;
  projectId: string;
  kind: ArtifactKind;
  originalFileName: string;
  byteSize: number;
  contentType?: string;
  now?: Date;
  expiresInSeconds?: number;
}

export interface CompleteDirectUploadSessionInput {
  workspaceId: string;
  projectId: string;
  kind: ArtifactKind;
  artifactId: string;
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  storageKey: string;
  originalFileName: string;
  contentType: string;
  expectedByteSize: number;
  now?: string;
}

export interface StoredArtifact {
  artifact: ArtifactRecord;
  filePath: string;
  fileUrl: string;
}

export interface DirectUploadSession {
  id: string;
  provider: Extract<ArtifactProvider, "s3" | "r2">;
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  contentType: string;
  originalFileName: string;
}

export interface PrivateObjectStorage {
  putFile(input: PutFileInput): Promise<StoredArtifact>;
  deleteObject(input: { workspaceId: string; projectId: string; storageKey: string }): Promise<void>;
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

type StorageKeyInput = Pick<PutFileInput, "workspaceId" | "projectId" | "kind">;

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

export function createDirectUploadSession(
  factoryInput: PrivateObjectStorageFactoryInput,
  sessionInput: CreateDirectUploadSessionInput
): DirectUploadSession {
  const config = loadStorageConfig(factoryInput.env);
  if (!isCloudStorageConfigured(config)) {
    throw new Error("Direct upload sessions require configured S3-compatible cloud storage.");
  }
  return new S3CompatibleObjectStorage({
    provider: config.provider as Extract<ArtifactProvider, "s3" | "r2">,
    endpoint: config.endpoint!,
    bucket: config.bucket!,
    region: config.region,
    accessKeyId: config.accessKeyId!,
    secretAccessKey: config.secretAccessKey!,
    publicBaseUrl: config.publicBaseUrl,
    cacheRootDir: factoryInput.cloudCacheRootDir ?? path.join(factoryInput.localRootDir, "_cloud-cache")
  }).createDirectUploadSession(sessionInput);
}

export async function completeDirectUploadSession(
  factoryInput: PrivateObjectStorageFactoryInput,
  sessionInput: CompleteDirectUploadSessionInput
): Promise<StoredArtifact> {
  const config = loadStorageConfig(factoryInput.env);
  if (!isCloudStorageConfigured(config)) {
    throw new Error("Completing direct upload sessions requires configured S3-compatible cloud storage.");
  }
  if (config.provider !== sessionInput.provider) {
    throw new Error(`Direct upload session provider ${sessionInput.provider} does not match configured ${config.provider} storage.`);
  }
  return new S3CompatibleObjectStorage({
    provider: config.provider as Extract<ArtifactProvider, "s3" | "r2">,
    endpoint: config.endpoint!,
    bucket: config.bucket!,
    region: config.region,
    accessKeyId: config.accessKeyId!,
    secretAccessKey: config.secretAccessKey!,
    publicBaseUrl: config.publicBaseUrl,
    cacheRootDir: factoryInput.cloudCacheRootDir ?? path.join(factoryInput.localRootDir, "_cloud-cache")
  }).cacheUploadedObject(sessionInput);
}

export function createPrivateArtifactDownloadUrl(input: { artifact: ArtifactRecord; env?: NodeJS.ProcessEnv; expiresInSeconds?: number; now?: Date }): { url: string; expiresAt: string } {
  const config = loadStorageConfig(input.env);
  if ((input.artifact.provider !== "s3" && input.artifact.provider !== "r2") || config.provider !== input.artifact.provider || !isCloudStorageConfigured(config)) throw new Error("Private artifact download signing is not configured for this artifact provider.");
  if (!input.artifact.storageKey || input.artifact.storageKey.startsWith("/") || input.artifact.storageKey.includes("..")) throw new Error("Private artifact storage key is invalid.");
  const expiresInSeconds = clamp(input.expiresInSeconds ?? 300, 60, 600);
  const now = input.now ?? new Date();
  return {
    url: presignedGetUrl({ url: s3ObjectUrl(config.endpoint!, config.bucket!, input.artifact.storageKey), region: config.region, accessKeyId: config.accessKeyId!, secretAccessKey: config.secretAccessKey!, expiresInSeconds, now }),
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString()
  };
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
        avatarModelReceipt: input.avatarModelReceipt,
        avatarPresenterLineage: input.avatarPresenterLineage,
        createdAt: input.now ?? new Date().toISOString()
      }
    };
  }

  async deleteObject(input: { workspaceId: string; projectId: string; storageKey: string }): Promise<void> {
    assertScopedStorageKey(input);
    const root = path.resolve(this.rootDir);
    const target = path.resolve(root, input.storageKey);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Private artifact storage key escapes its root.");
    await fs.unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

export class S3CompatibleObjectStorage implements PrivateObjectStorage {
  constructor(private readonly config: S3CompatibleObjectStorageConfig) {}

  createDirectUploadSession(input: CreateDirectUploadSessionInput): DirectUploadSession {
    const artifactId = randomUUID();
    const contentType = input.contentType ?? inferContentType(input.originalFileName);
    const storageKey = storageKeyFor(input, artifactId, input.originalFileName);
    const expiresInSeconds = clamp(input.expiresInSeconds ?? 900, 60, 3600);
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
    const uploadUrl = presignedPutUrl({
      url: s3ObjectUrl(this.config.endpoint, this.config.bucket, storageKey),
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      contentType,
      expiresInSeconds,
      now
    });
    return {
      id: artifactId,
      provider: this.config.provider,
      storageKey,
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      expiresAt,
      maxBytes: input.byteSize,
      contentType,
      originalFileName: input.originalFileName
    };
  }

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
        avatarModelReceipt: input.avatarModelReceipt,
        avatarPresenterLineage: input.avatarPresenterLineage,
        createdAt: input.now ?? new Date().toISOString()
      }
    };
  }

  async cacheUploadedObject(input: CompleteDirectUploadSessionInput): Promise<StoredArtifact> {
    const cachePath = path.join(this.config.cacheRootDir, input.storageKey);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const downloadUrl = presignedGetUrl({
      url: s3ObjectUrl(this.config.endpoint, this.config.bucket, input.storageKey),
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds: 300,
      now: new Date()
    });
    const { byteSize, sha256 } = await downloadWithSha256(new URL(downloadUrl), cachePath);
    if (byteSize !== input.expectedByteSize) {
      await fs.unlink(cachePath).catch(() => undefined);
      throw new Error(`Uploaded object size mismatch. Expected ${input.expectedByteSize} bytes, received ${byteSize}.`);
    }
    const fileUrl = pathToFileURL(cachePath).toString();
    return {
      filePath: cachePath,
      fileUrl,
      artifact: {
        id: input.artifactId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: input.kind,
        provider: input.provider,
        storageKey: input.storageKey,
        contentType: input.contentType,
        byteSize,
        sha256,
        originalFileName: input.originalFileName,
        localPath: cachePath,
        localUrl: fileUrl,
        createdAt: input.now ?? new Date().toISOString()
      }
    };
  }

  async deleteObject(input: { workspaceId: string; projectId: string; storageKey: string }): Promise<void> {
    assertScopedStorageKey(input);
    const target = s3ObjectUrl(this.config.endpoint, this.config.bucket, input.storageKey);
    await deleteRemoteObject(target, signedDeleteHeaders({ url: target, region: this.config.region, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, now: new Date() }));
    const cacheRoot = path.resolve(this.config.cacheRootDir);
    const cachePath = path.resolve(cacheRoot, input.storageKey);
    if (!cachePath.startsWith(`${cacheRoot}${path.sep}`)) throw new Error("Private artifact cache key escapes its root.");
    await fs.unlink(cachePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
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

function storageKeyFor(input: StorageKeyInput, artifactId: string, originalFileName: string): string {
  return [
    "workspaces",
    safePathSegment(input.workspaceId),
    "projects",
    safePathSegment(input.projectId),
    input.kind,
    `${artifactId}-${safeFileName(originalFileName)}`
  ].join("/");
}

function presignedPutUrl(input: {
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  contentType: string;
  expiresInSeconds: number;
  now: Date;
}): string {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const signedHeaders = "content-type;host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders
  });
  const canonicalQueryString = canonicalQuery(query);
  const canonicalHeaders = `content-type:${input.contentType}\nhost:${input.url.host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri(input.url.pathname),
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  input.url.search = canonicalQuery(query);
  return input.url.toString();
}

function presignedGetUrl(input: {
  url: URL;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  now: Date;
}): string {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const signedHeaders = "host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders
  });
  const canonicalQueryString = canonicalQuery(query);
  const canonicalHeaders = `host:${input.url.host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri(input.url.pathname),
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  query.set("X-Amz-Signature", signature);
  input.url.search = canonicalQuery(query);
  return input.url.toString();
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

function signedDeleteHeaders(input: { url: URL; region: string; accessKeyId: string; secretAccessKey: string; now: Date }): Record<string, string> {
  const amzDate = toAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update("").digest("hex");
  const headers = { host: input.url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((header) => `${header}:${headers[header as keyof typeof headers]}\n`).join("");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const canonicalRequest = ["DELETE", canonicalUri(input.url.pathname), "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signature = hmac(signingKey(input.secretAccessKey, dateStamp, input.region), stringToSign, "hex");
  return { Host: headers.host, "X-Amz-Content-Sha256": payloadHash, "X-Amz-Date": amzDate, Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
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

async function deleteRemoteObject(url: URL, headers: Record<string, string>): Promise<void> {
  const client = url.protocol === "https:" ? https : http;
  await new Promise<void>((resolve, reject) => {
    const request = client.request(url, { method: "DELETE", headers }, (response) => {
      response.resume();
      response.once("end", () => response.statusCode && response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(new Error(`Cloud storage deletion failed with HTTP ${response.statusCode ?? "unknown"}.`)));
    });
    request.on("error", reject);
    request.end();
  });
}

async function downloadWithSha256(url: URL, destinationPath: string): Promise<{ byteSize: number; sha256: string }> {
  const client = url.protocol === "https:" ? https : http;
  const hash = createHash("sha256");
  let byteSize = 0;
  await new Promise<void>((resolve, reject) => {
    const request = client.request(url, { method: "GET" }, (response) => {
      const chunks: Buffer[] = [];
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          reject(
            new Error(
              `Cloud storage download failed with HTTP ${response.statusCode ?? "unknown"}: ${Buffer.concat(chunks).toString("utf8").slice(0, 180)}`
            )
          )
        );
        return;
      }
      const output = createWriteStream(destinationPath, { mode: 0o600 });
      response.on("data", (chunk: Buffer) => {
        byteSize += chunk.length;
        hash.update(chunk);
      });
      response.on("error", reject);
      output.on("error", reject);
      output.on("finish", resolve);
      response.pipe(output);
    });
    request.on("error", reject);
    request.end();
  });
  return { byteSize, sha256: hash.digest("hex") };
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

function canonicalQuery(query: URLSearchParams): string {
  return [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
    .join("&");
}

function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function assertScopedStorageKey(input: { workspaceId: string; projectId: string; storageKey: string }): void {
  const prefix = `workspaces/${safePathSegment(input.workspaceId)}/projects/${safePathSegment(input.projectId)}/`;
  if (!input.storageKey.startsWith(prefix) || input.storageKey.includes("..") || input.storageKey.startsWith("/")) throw new Error("Private artifact storage key is outside the authorized project scope.");
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
