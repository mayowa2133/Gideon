#!/usr/bin/env node

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const dryRun = args.has("--dry-run");
const errors = [];

const requiredEnv = [
  "GIDEON_OPENAI_TTS_MODEL",
  "GIDEON_OPENAI_TTS_VOICE",
  "GIDEON_TTS_APPROVED_VOICES",
  "GIDEON_TTS_VOICE_REVIEWED_AT",
  "GIDEON_VOICEOVER_RETENTION_DAYS",
  "GIDEON_VOICEOVER_DELETION_SLA_HOURS"
];

if (dryRun) {
  console.log("Production TTS policy check dry-run:");
  console.log(`1. Require explicit TTS model, voice, reviewed-at timestamp, and approved voice allowlist: ${requiredEnv.join(", ")}.`);
  console.log("2. Reject unreviewed/default voice choices by requiring the configured voice to appear in GIDEON_TTS_APPROVED_VOICES.");
  console.log("3. Require a recent voice review timestamp so production voice selection is an explicit rollout decision.");
  console.log("4. Require bounded private voiceover artifact retention and deletion SLA.");
  process.exit(0);
}

for (const name of requiredEnv) {
  requireNonEmpty(name);
}

validateSafeIdentifier("GIDEON_OPENAI_TTS_MODEL", 2, 80);
validateSafeIdentifier("GIDEON_OPENAI_TTS_VOICE", 2, 80);
validateApprovedVoices();
validateRecentIsoTimestamp("GIDEON_TTS_VOICE_REVIEWED_AT", 180);
validateRetentionWindow("GIDEON_VOICEOVER_RETENTION_DAYS", 1, 3650);
validateRetentionWindow("GIDEON_VOICEOVER_DELETION_SLA_HOURS", 1, 168);

if (errors.length > 0) {
  console.error("Production TTS policy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production TTS policy check passed.");

function requireNonEmpty(name) {
  if (!value(name)) {
    errors.push(`${name} is required for production TTS policy checks.`);
  }
}

function validateSafeIdentifier(name, minLength, maxLength) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  if (raw.length < minLength || raw.length > maxLength || !/^[A-Za-z0-9._-]+$/.test(raw)) {
    errors.push(`${name} must be ${minLength}-${maxLength} characters using only letters, numbers, dots, underscores, and hyphens.`);
  }
}

function validateApprovedVoices() {
  const voice = value("GIDEON_OPENAI_TTS_VOICE");
  const voices = value("GIDEON_TTS_APPROVED_VOICES")
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  if (voices.length === 0) {
    return;
  }
  for (const candidate of voices) {
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(candidate)) {
      errors.push("GIDEON_TTS_APPROVED_VOICES must be a comma-separated list of safe voice identifiers.");
      break;
    }
  }
  if (voice && !voices.includes(voice)) {
    errors.push("GIDEON_OPENAI_TTS_VOICE must be included in GIDEON_TTS_APPROVED_VOICES.");
  }
}

function validateRecentIsoTimestamp(name, maxAgeDays) {
  const raw = value(name);
  if (!raw) {
    return;
  }
  const parsedMs = Date.parse(raw);
  if (!Number.isFinite(parsedMs)) {
    errors.push(`${name} must be an ISO-8601 timestamp.`);
    return;
  }
  if (parsedMs > Date.now() + 60_000) {
    errors.push(`${name} must not be in the future.`);
  }
  if (Date.now() - parsedMs > maxAgeDays * 24 * 60 * 60 * 1_000) {
    errors.push(`${name} must be within the last ${maxAgeDays} days.`);
  }
}

function validateRetentionWindow(name, min, max) {
  const raw = value(name);
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}.`);
  }
}

function value(name) {
  return process.env[name]?.trim() ?? "";
}
