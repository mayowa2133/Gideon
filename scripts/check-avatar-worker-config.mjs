#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const requirements = [
  ["mapping_00109-model.pth.tar", 100_000_000],
  ["mapping_00229-model.pth.tar", 100_000_000]
];
const faceRequirements = [
  ["alignment_WFLW_4HG.pth", 150_000_000],
  ["detection_Resnet50_Final.pth", 90_000_000]
];

try {
  assertEqual("GIDEON_AVATAR_WORKER_PROVIDER", "sadtalker");
  assertEqual("GIDEON_AVATAR_MODEL_COMMERCIAL_APPROVED", "true");
  requiredText("GIDEON_AVATAR_MODEL_VERSION");
  requiredText("GIDEON_AVATAR_MODEL_LICENSE");
  const commandPath = requiredAbsolutePath("GIDEON_AVATAR_WORKER_COMMAND");
  const catalogDir = requiredAbsolutePath("GIDEON_AVATAR_CATALOG_DIR");
  const checkpointDir = requiredAbsolutePath("GIDEON_SADTALKER_MODEL_DIR");
  const faceModelDir = requiredAbsolutePath("GIDEON_SADTALKER_GFPGAN_MODEL_DIR");
  const workDir = requiredAbsolutePath("GIDEON_AVATAR_WORK_DIR");

  await fs.access(commandPath, fs.constants.X_OK);
  await assertDirectory(workDir);
  await assertModelFiles(checkpointDir, requirements);
  await assertOnePackagedCheckpoint(checkpointDir);
  await assertModelFiles(faceModelDir, faceRequirements);
  await verifyCatalog(catalogDir);

  process.stdout.write("Avatar worker configuration passed.\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Avatar worker configuration failed."}\n`);
  process.exitCode = 1;
}

function requiredText(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requiredAbsolutePath(name) {
  const value = requiredText(name);
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path.`);
  }
  return value;
}

function assertEqual(name, expected) {
  if (requiredText(name) !== expected) {
    throw new Error(`${name} must equal ${expected}.`);
  }
}

async function assertDirectory(directory) {
  if (!(await fs.stat(directory)).isDirectory()) {
    throw new Error(`${directory} must be a directory.`);
  }
}

async function assertModelFiles(directory, expectedFiles) {
  await assertDirectory(directory);
  for (const [fileName, minimumBytes] of expectedFiles) {
    const filePath = path.join(directory, fileName);
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < minimumBytes) {
      throw new Error(`${fileName} is missing or smaller than the reviewed model artifact.`);
    }
  }
}

async function assertOnePackagedCheckpoint(directory) {
  const candidates = [
    ["SadTalker_V0.0.2_256.safetensors", 700_000_000],
    ["SadTalker_V0.0.2_512.safetensors", 700_000_000]
  ];
  for (const [fileName, minimumBytes] of candidates) {
    try {
      const stat = await fs.stat(path.join(directory, fileName));
      if (stat.isFile() && stat.size >= minimumBytes) {
        return;
      }
    } catch {
      // Try the other reviewed packaged checkpoint.
    }
  }
  throw new Error("A reviewed SadTalker 256 or 512 safetensors checkpoint is required.");
}

async function verifyCatalog(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  if (!manifest || !Array.isArray(manifest.entries)) {
    throw new Error("Avatar catalog manifest is invalid.");
  }
  for (const avatarId of ["orbit", "nova"]) {
    const entry = manifest.entries.find((candidate) => candidate?.id === avatarId);
    if (!entry || entry.commercialApproved !== true || entry.realLikeness !== false || entry.voiceCloning !== false) {
      throw new Error(`Avatar catalog policy is invalid for ${avatarId}.`);
    }
    const bytes = await fs.readFile(path.join(directory, entry.file));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) {
      throw new Error(`Avatar catalog hash mismatch for ${avatarId}.`);
    }
  }
}
