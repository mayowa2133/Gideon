#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const releaseDir = path.resolve(env.GIDEON_RELEASE_DIR?.trim() || "release");
const channel = env.GIDEON_RELEASE_CHANNEL?.trim() || "local";
const production = channel === "production";
const errors = [];
const warnings = [];

const packageJson = readJson(path.resolve("package.json"));
const version = String(packageJson.version ?? "");
const packageScripts = packageJson.scripts ?? {};
const artifacts = findReleaseArtifacts(releaseDir, version);
const latest = readLatestMac(path.join(releaseDir, "latest-mac.yml"));

validatePackageScripts(packageScripts);
validateArtifacts(artifacts, latest);
validateProductionReleaseEnv();

if (errors.length > 0) {
  console.error("macOS release check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

const provenance = writeProvenance({ releaseDir, version, channel, artifacts });
console.log(`macOS release check passed for ${channel} channel.`);
console.log(`Wrote provenance manifest: ${path.relative(process.cwd(), provenance.path)}`);
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`Could not read ${path.relative(process.cwd(), filePath)}: ${error instanceof Error ? error.message : "unknown error"}.`);
    return {};
  }
}

function findReleaseArtifacts(dir, version) {
  const expectedNames = {
    dmg: `Gideon-${version}-arm64.dmg`,
    zip: `Gideon-${version}-arm64-mac.zip`,
    dmgBlockmap: `Gideon-${version}-arm64.dmg.blockmap`,
    zipBlockmap: `Gideon-${version}-arm64-mac.zip.blockmap`,
    latest: "latest-mac.yml"
  };
  return Object.fromEntries(
    Object.entries(expectedNames).map(([key, fileName]) => {
      const filePath = path.join(dir, fileName);
      return [key, fs.existsSync(filePath) ? artifactMetadata(filePath) : { fileName, path: filePath, exists: false }];
    })
  );
}

function artifactMetadata(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    fileName: path.basename(filePath),
    path: filePath,
    exists: true,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sha512: createHash("sha512").update(bytes).digest("base64")
  };
}

function readLatestMac(filePath) {
  if (!fs.existsSync(filePath)) {
    return { files: [] };
  }
  const text = fs.readFileSync(filePath, "utf8");
  const files = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const urlMatch = line.match(/^\s*-\s+url:\s+(.+)\s*$/);
    if (urlMatch) {
      current = { url: unquote(urlMatch[1]) };
      files.push(current);
      continue;
    }
    const shaMatch = line.match(/^\s+sha512:\s+(.+)\s*$/);
    if (shaMatch && current) {
      current.sha512 = unquote(shaMatch[1]);
      continue;
    }
    const sizeMatch = line.match(/^\s+size:\s+(\d+)\s*$/);
    if (sizeMatch && current) {
      current.size = Number(sizeMatch[1]);
    }
  }
  return { files };
}

function validatePackageScripts(scripts) {
  if (typeof scripts["package:mac"] !== "string") {
    errors.push("package.json must define package:mac.");
  }
  if (typeof scripts["package:mac:signed"] !== "string") {
    errors.push("package.json must define package:mac:signed for production releases.");
  }
  if (typeof scripts["release:mac:check"] !== "string") {
    errors.push("package.json must define release:mac:check.");
  }
  if (production && scripts["package:mac"]?.includes("identity=null")) {
    warnings.push("package:mac is intentionally unsigned. Use package:mac:signed for production release artifacts.");
  }
}

function validateArtifacts(artifacts, latest) {
  for (const key of ["dmg", "zip", "dmgBlockmap", "zipBlockmap", "latest"]) {
    if (!artifacts[key]?.exists) {
      errors.push(`Missing release artifact: ${path.relative(process.cwd(), artifacts[key].path)}.`);
    }
  }
  for (const key of ["dmg", "zip"]) {
    const artifact = artifacts[key];
    if (!artifact?.exists) {
      continue;
    }
    const entry = latest.files.find((candidate) => candidate.url === artifact.fileName);
    if (!entry) {
      errors.push(`latest-mac.yml does not reference ${artifact.fileName}.`);
      continue;
    }
    if (entry.sha512 !== artifact.sha512) {
      errors.push(`latest-mac.yml sha512 does not match ${artifact.fileName}.`);
    }
    if (entry.size !== artifact.size) {
      errors.push(`latest-mac.yml size does not match ${artifact.fileName}.`);
    }
  }
}

function validateProductionReleaseEnv() {
  if (!production) {
    warnings.push("Local release check does not require Apple signing/notarization credentials.");
    return;
  }
  requireEnv("APPLE_TEAM_ID", "Set APPLE_TEAM_ID for notarization.");
  requireEnv("APPLE_ID", "Set APPLE_ID for notarization.");
  requireEnv("APPLE_APP_SPECIFIC_PASSWORD", "Set APPLE_APP_SPECIFIC_PASSWORD for notarization.");
  if (!nonEmpty(env.CSC_LINK) && !nonEmpty(env.CSC_NAME)) {
    errors.push("Set CSC_LINK or CSC_NAME so electron-builder can sign with a Developer ID Application certificate.");
  }
}

function writeProvenance(input) {
  const manifest = {
    schemaVersion: 1,
    product: "Gideon",
    version: input.version,
    channel: input.channel,
    generatedAt: new Date().toISOString(),
    source: {
      repository: env.GITHUB_REPOSITORY || "local",
      commit: env.GITHUB_SHA || "local",
      workflowRunId: env.GITHUB_RUN_ID || null
    },
    build: {
      node: process.version,
      packageManager: packageJson.packageManager ?? null
    },
    artifacts: ["dmg", "zip", "dmgBlockmap", "zipBlockmap", "latest"]
      .map((key) => input.artifacts[key])
      .filter((artifact) => artifact?.exists)
      .map((artifact) => ({
        fileName: artifact.fileName,
        size: artifact.size,
        sha256: artifact.sha256,
        sha512: artifact.sha512
      }))
  };
  const outputPath = path.join(input.releaseDir, "provenance.json");
  fs.mkdirSync(input.releaseDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { path: outputPath, manifest };
}

function requireEnv(name, message) {
  if (!nonEmpty(env[name])) {
    errors.push(message);
  }
}

function nonEmpty(value) {
  return Boolean(value?.trim());
}

function unquote(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}
