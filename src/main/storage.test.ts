import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalPrivateObjectStorage } from "./storage";

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
});
