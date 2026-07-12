import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("SadTalker host launcher", () => {
  it("maps and cleans private audio and authorized source files around the isolated worker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gideon-avatar-launcher-"));
    const work = path.join(root, "work");
    const fakeBin = path.join(root, "bin");
    const audioPath = path.join(root, "voice.wav");
    const sourcePath = path.join(root, "founder.png");
    const outputPath = path.join(root, "result.mp4");
    const requestPath = path.join(root, "request.json");
    await Promise.all([fs.mkdir(work), fs.mkdir(fakeBin)]);
    await fs.writeFile(audioPath, "audio");
    await fs.writeFile(sourcePath, "portrait");
    await fs.writeFile(requestPath, JSON.stringify({
      provider: "sadtalker",
      avatarId: "orbit",
      audioPath,
      sourceImagePath: sourcePath,
      outputPath,
      durationMs: 1_000,
      disclosure: "AI-generated brand presenter",
      consent: {
        assetType: "real_likeness",
        status: "granted",
        sourceArtifactId: "avatar-source-1",
        consentVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
        consentPolicyVersion: "self-avatar-v1",
        subjectRelationship: "self"
      }
    }));
    const fakeDockerPath = path.join(fakeBin, "docker");
    await fs.writeFile(fakeDockerPath, fakeDockerScript(), { mode: 0o755 });

    const result = await execFileAsync(path.join(process.cwd(), "scripts/run-sadtalker-avatar-worker.mjs"), [
      "--request",
      requestPath
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        GIDEON_AVATAR_WORK_DIR: work,
        GIDEON_AVATAR_COMPOSE_FILE: path.join(process.cwd(), "docker-compose.avatar-worker.yml")
      }
    });

    expect(JSON.parse(result.stdout)).toMatchObject({
      outputPath,
      receipt: { avatarProvenance: "user_authorized_likeness" }
    });
    await expect(fs.readFile(outputPath, "utf8")).resolves.toBe("avatar-video");
    await expect(fs.readdir(path.join(work, "input"))).resolves.toEqual([]);
    await expect(fs.readdir(path.join(work, "output"))).resolves.toEqual([]);
  });
});

function fakeDockerScript(): string {
  return `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const requestPath = path.join(process.env.GIDEON_AVATAR_WORK_DIR, "output", path.basename(process.argv.at(-1)));
const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const hostPath = (containerPath) => path.join(process.env.GIDEON_AVATAR_WORK_DIR, containerPath.replace(/^\\/work\\//, ""));
if (!fs.existsSync(hostPath(request.audioPath)) || !fs.existsSync(hostPath(request.sourceImagePath))) process.exit(3);
fs.writeFileSync(hostPath(request.outputPath), "avatar-video");
process.stdout.write(JSON.stringify({
  outputPath: request.outputPath,
  receipt: {
    provider: "sadtalker",
    modelVersion: "test",
    modelLicense: "reviewed",
    avatarId: request.avatarId,
    avatarProvenance: "user_authorized_likeness",
    disclosure: request.disclosure,
    generatedAt: new Date().toISOString()
  }
}));
`;
}
