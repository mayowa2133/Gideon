import fs from "node:fs/promises";
import path from "node:path";

const MAX_AVATAR_SOURCE_BYTES = 20 * 1024 * 1024;

export async function validateAvatarSourceImage(filePath: string): Promise<{
  byteSize: number;
  contentType: "image/png" | "image/jpeg";
}> {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Avatar source image must use a private absolute path.");
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < 32 || stat.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error("Avatar source image must be a file between 32 bytes and 20 MB.");
  }
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    await handle.read(header, 0, header.length, 0);
    if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return { byteSize: stat.size, contentType: "image/png" };
    }
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return { byteSize: stat.size, contentType: "image/jpeg" };
    }
  } finally {
    await handle.close();
  }
  throw new Error("Avatar source image content must be PNG or JPEG.");
}
