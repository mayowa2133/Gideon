import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ArtifactKind, ArtifactRecord } from "../shared/types";

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

export class LocalPrivateObjectStorage {
  constructor(private readonly rootDir: string) {}

  async putFile(input: PutFileInput): Promise<StoredArtifact> {
    const artifactId = randomUUID();
    const originalFileName = input.originalFileName ?? path.basename(input.sourcePath);
    const storageKey = [
      "workspaces",
      safePathSegment(input.workspaceId),
      "projects",
      safePathSegment(input.projectId),
      input.kind,
      `${artifactId}-${safeFileName(originalFileName)}`
    ].join("/");
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
