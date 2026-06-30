#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.env.GIDEON_LINT_ROOT?.trim() || process.cwd());
const errors = [];
const warnings = [];
const secretRules = [
  {
    label: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/
  },
  {
    label: "AWS access key material",
    pattern: /AKIA[0-9A-Z]{16}/
  },
  {
    label: "live OpenAI API key material",
    pattern: /sk-live-[A-Za-z0-9_-]{12,}/
  },
  {
    label: "GitHub personal access token material",
    pattern: /ghp_[A-Za-z0-9_]{20,}/
  },
  {
    label: "Slack token material",
    pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/
  },
  {
    label: "literal signed storage URL",
    pattern: /https?:\/\/\S+[?&](?:X-Amz-Signature|X-Goog-Signature)=/
  }
];
const files = listRepositoryFiles(rootDir);

checkTrackedPathPolicy(files);
checkTextFilePolicy(files);
checkCompletionEstimateSync();
checkPackageContract();

if (errors.length > 0) {
  console.error("Repository lint failed:");
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

console.log("Repository lint passed.");
if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

function listRepositoryFiles(root) {
  if (fs.existsSync(path.join(root, ".git"))) {
    try {
      return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean)
        .sort();
    } catch (error) {
      errors.push(`Could not list git-tracked files: ${error instanceof Error ? error.message : "unknown error"}.`);
      return [];
    }
  }
  return walk(root)
    .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"))
    .sort();
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const filesInDir = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      filesInDir.push(...walk(fullPath));
    } else if (entry.isFile()) {
      filesInDir.push(fullPath);
    }
  }
  return filesInDir;
}

function checkTrackedPathPolicy(fileList) {
  const generatedPrefixes = ["dist/", "release/", "node_modules/", "tmp/"];
  const privateEnvPattern = /^\.env(?:\.|$)/;
  const privateMediaExtensions = new Set([
    ".aac",
    ".avi",
    ".dmg",
    ".m4a",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".wav",
    ".zip"
  ]);

  for (const file of fileList) {
    if (file === ".env.example") {
      continue;
    }
    if (privateEnvPattern.test(file)) {
      errors.push(`Do not track local environment files: ${file}.`);
    }
    if (generatedPrefixes.some((prefix) => file.startsWith(prefix))) {
      errors.push(`Do not track generated or private runtime artifacts: ${file}.`);
    }
    if (privateMediaExtensions.has(path.extname(file).toLowerCase())) {
      errors.push(`Do not track generated media/release binaries in source control: ${file}.`);
    }
  }
}

function checkTextFilePolicy(fileList) {
  for (const file of fileList) {
    const absolutePath = path.join(rootDir, file);
    if (!isTextCandidate(file, absolutePath)) {
      continue;
    }
    const text = fs.readFileSync(absolutePath, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/.test(line)) {
        errors.push(`${file}:${index + 1} contains a git conflict marker.`);
      }
    });
    for (const rule of secretRules) {
      if (rule.pattern.test(text)) {
        errors.push(`${file} appears to contain ${rule.label}. Use environment variables or documented fake placeholders.`);
      }
    }
  }
}

function isTextCandidate(file, absolutePath) {
  const extension = path.extname(file).toLowerCase();
  if (
    [
      ".bmp",
      ".gif",
      ".ico",
      ".icns",
      ".jpg",
      ".jpeg",
      ".pdf",
      ".png",
      ".webp"
    ].includes(extension)
  ) {
    return false;
  }
  const stats = fs.statSync(absolutePath);
  return stats.size <= 2_000_000;
}

function checkCompletionEstimateSync() {
  const readmePath = path.join(rootDir, "README.md");
  const auditPath = path.join(rootDir, "docs/production-readiness-audit.md");
  if (!fs.existsSync(readmePath) || !fs.existsSync(auditPath)) {
    return;
  }
  const readmeEstimate = readCompletionEstimate(fs.readFileSync(readmePath, "utf8"));
  const auditEstimate = readCompletionEstimate(fs.readFileSync(auditPath, "utf8"));
  if (!readmeEstimate || !auditEstimate) {
    errors.push("README.md and docs/production-readiness-audit.md must both include the current engineering estimate.");
    return;
  }
  if (readmeEstimate !== auditEstimate) {
    errors.push(`README/audit completion estimates differ: README=${readmeEstimate}%, audit=${auditEstimate}%.`);
  }
}

function readCompletionEstimate(text) {
  return text.match(/Current engineering estimate: \*\*([0-9]+(?:\.[0-9]+)?)% complete\*\*/)?.[1] ?? null;
}

function checkPackageContract() {
  const packagePath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    return;
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  for (const scriptName of [
    "lint",
    "typecheck",
    "test",
    "build",
    "db:migrate",
    "provider:canary",
    "staging:check",
    "production:check"
  ]) {
    if (typeof packageJson.scripts?.[scriptName] !== "string") {
      errors.push(`package.json must define ${scriptName}.`);
    }
  }
}
