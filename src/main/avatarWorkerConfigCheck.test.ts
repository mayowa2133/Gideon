import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), "scripts/check-avatar-worker-config.mjs");

describe("avatar worker configuration check", () => {
  it("rejects a worker without explicit provider approval", async () => {
    await expect(execFileAsync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "" }
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("GIDEON_AVATAR_WORKER_PROVIDER is required")
    });
  });

  it("validates reviewed model files and fictional catalog hashes without loading model data", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-check-"));
    const checkpoints = path.join(root, "checkpoints");
    const faceModels = path.join(root, "gfpgan");
    const work = path.join(root, "work");
    await Promise.all([fs.mkdir(checkpoints), fs.mkdir(faceModels), fs.mkdir(work)]);
    await Promise.all([
      sparseFile(path.join(checkpoints, "mapping_00109-model.pth.tar"), 155_779_231),
      sparseFile(path.join(checkpoints, "mapping_00229-model.pth.tar"), 155_521_183),
      sparseFile(path.join(checkpoints, "SadTalker_V0.0.2_256.safetensors"), 725_066_984),
      sparseFile(path.join(faceModels, "alignment_WFLW_4HG.pth"), 193_670_248),
      sparseFile(path.join(faceModels, "detection_Resnet50_Final.pth"), 109_497_761)
    ]);

    try {
      const result = await execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_AVATAR_WORKER_PROVIDER: "sadtalker",
          GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true",
          GIDEON_AVATAR_MODEL_VERSION: "sadtalker-v0.0.2-256",
          GIDEON_AVATAR_MODEL_LICENSE: "Apache-2.0",
          GIDEON_AVATAR_WORKER_COMMAND: path.join(process.cwd(), "scripts/run-sadtalker-avatar-worker.mjs"),
          GIDEON_AVATAR_CATALOG_DIR: path.join(process.cwd(), "assets/avatar-catalog"),
          GIDEON_SADTALKER_MODEL_DIR: checkpoints,
          GIDEON_SADTALKER_GFPGAN_MODEL_DIR: faceModels,
          GIDEON_AVATAR_WORK_DIR: work
        }
      });
      expect(result.stdout).toContain("Avatar worker configuration passed.");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("validates the pinned MuseTalk component model tree without loading model data", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-musetalk-check-"));
    const models = path.join(root, "models");
    const work = path.join(root, "work");
    const files: Array<[string, number]> = [
      ["musetalkV15/unet.pth", 1_000_000],
      ["musetalkV15/musetalk.json", 2],
      ["sd-vae/config.json", 2],
      ["sd-vae/diffusion_pytorch_model.bin", 1_000_000],
      ["whisper/config.json", 2],
      ["whisper/pytorch_model.bin", 1_000_000],
      ["whisper/preprocessor_config.json", 2],
      ["dwpose/dw-ll_ucoco_384.pth", 1_000_000],
      ["face-parse-bisent/79999_iter.pth", 1_000_000],
      ["face-parse-bisent/resnet18-5c106cde.pth", 1_000_000]
    ];
    await fs.mkdir(work);
    for (const [relativePath, byteSize] of files) {
      const filePath = path.join(models, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await sparseFile(filePath, byteSize);
    }
    try {
      const result = await execFileAsync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "",
          GIDEON_AVATAR_WORKER_PROVIDER: "musetalk",
          GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED: "true",
          GIDEON_AVATAR_MODEL_VERSION: "musetalk-1.5-pinned",
          GIDEON_AVATAR_MODEL_LICENSE: "reviewed-component-set",
          GIDEON_AVATAR_WORKER_COMMAND: path.join(process.cwd(), "scripts/run-sadtalker-avatar-worker.mjs"),
          GIDEON_AVATAR_CATALOG_DIR: path.join(process.cwd(), "assets/avatar-catalog"),
          GIDEON_MUSETALK_MODEL_DIR: models,
          GIDEON_AVATAR_WORK_DIR: work
        }
      });
      expect(result.stdout).toContain("Avatar worker configuration passed.");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

async function sparseFile(filePath: string, byteSize: number): Promise<void> {
  const handle = await fs.open(filePath, "w");
  try {
    await handle.truncate(byteSize);
  } finally {
    await handle.close();
  }
}
