#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const outputDir = path.resolve(process.env.GIDEON_LIVE_FIXTURE_DIR?.trim() || path.join("tmp", "live-fixtures"));
const maxBytes = positiveInteger(process.env.GIDEON_LIVE_FIXTURE_MAX_BYTES, 250 * 1024 * 1024);

const fixtures = [
  {
    envName: "GIDEON_PROVIDER_CANARY_AUDIO_BASE64",
    fileName: "provider-audio.wav",
    label: "provider ASR audio fixture"
  },
  {
    envName: "GIDEON_PROVIDER_CANARY_IMAGE_BASE64",
    fileName: "provider-image.png",
    label: "provider OCR image fixture"
  },
  {
    envName: "GIDEON_STAGING_SMOKE_RECORDING_BASE64",
    fileName: "staging-recording.mp4",
    label: "upload-to-export staging recording fixture"
  }
];

if (dryRun) {
  console.log("Live promotion fixture materialization dry-run:");
  fixtures.forEach((fixture, index) => {
    console.log(`${index + 1}. Decode ${fixture.envName} into ${path.join(outputDir, fixture.fileName)}.`);
  });
  console.log(`Maximum decoded fixture size: ${maxBytes} bytes.`);
  process.exit(0);
}

const errors = [];
const materialized = [];

fs.mkdirSync(outputDir, { recursive: true });
for (const fixture of fixtures) {
  const encoded = process.env[fixture.envName]?.trim();
  if (!encoded) {
    errors.push(`${fixture.envName} is required for ${fixture.label}.`);
    continue;
  }
  const decoded = decodeBase64(encoded, fixture.envName);
  if (!decoded) {
    continue;
  }
  if (decoded.length < 1) {
    errors.push(`${fixture.envName} decoded to an empty ${fixture.label}.`);
    continue;
  }
  if (decoded.length > maxBytes) {
    errors.push(`${fixture.envName} decoded to ${decoded.length} bytes, exceeding ${maxBytes}.`);
    continue;
  }
  const filePath = path.join(outputDir, fixture.fileName);
  fs.writeFileSync(filePath, decoded, { mode: 0o600 });
  materialized.push({ label: fixture.label, filePath, bytes: decoded.length });
}

if (errors.length > 0) {
  console.error("Live promotion fixture materialization failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

for (const fixture of materialized) {
  console.log(`Wrote ${fixture.label} to ${path.relative(process.cwd(), fixture.filePath)} (${fixture.bytes} bytes).`);
}

function decodeBase64(value, envName) {
  const normalized = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    errors.push(`${envName} must be valid base64.`);
    return null;
  }
  try {
    return Buffer.from(normalized, "base64");
  } catch {
    errors.push(`${envName} must be valid base64.`);
    return null;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
