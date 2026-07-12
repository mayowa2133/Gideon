import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAvatarSourceImage } from "./avatarSource";

describe("custom avatar source validation", () => {
  it("accepts PNG content based on its signature rather than extension", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-source-"));
    const filePath = path.join(directory, "portrait.txt");
    await fs.writeFile(filePath, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32)
    ]));

    await expect(validateAvatarSourceImage(filePath)).resolves.toMatchObject({ contentType: "image/png", byteSize: 40 });
  });

  it("rejects renamed untrusted content", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-source-"));
    const filePath = path.join(directory, "portrait.png");
    await fs.writeFile(filePath, Buffer.alloc(64, 0x41));

    await expect(validateAvatarSourceImage(filePath)).rejects.toThrow("content must be PNG or JPEG");
  });
});
