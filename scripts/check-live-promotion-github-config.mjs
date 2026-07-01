#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
const list = args.has("--list");
const json = args.has("--json");
const workflowPath = path.resolve(".github/workflows/mac-build.yml");
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, "utf8") : "";
const errors = [];

const inputs = ["run_live_promotion", "skip_package"];
const secrets = [
  "GIDEON_PROVIDER_CANARY_AUDIO_BASE64",
  "GIDEON_PROVIDER_CANARY_IMAGE_BASE64",
  "GIDEON_STAGING_SMOKE_RECORDING_BASE64",
  "GIDEON_REDIS_URL",
  "GIDEON_DATABASE_URL",
  "GIDEON_SESSION_SECRET",
  "GIDEON_STORAGE_ACCESS_KEY_ID",
  "GIDEON_STORAGE_SECRET_ACCESS_KEY",
  "GIDEON_OPENAI_API_KEY",
  "GIDEON_AUTH_CALLBACK_SECRET",
  "GIDEON_STAGING_MCP_SESSION_COOKIE",
  "GIDEON_STAGING_MCP_METRIC_PROBE_BEARER_TOKEN",
  "APPLE_TEAM_ID",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "CSC_LINK",
  "CSC_NAME",
  "CSC_KEY_PASSWORD"
];
const vars = [
  "GIDEON_BULLMQ_QUEUE_NAME",
  "GIDEON_BULLMQ_PREFIX",
  "GIDEON_WORKER_ID",
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_TEMP_RETENTION_DAYS",
  "GIDEON_STORAGE_FAILED_RETENTION_DAYS",
  "GIDEON_STORAGE_SOURCE_RETENTION_DAYS",
  "GIDEON_STORAGE_EXPORT_RETENTION_DAYS",
  "GIDEON_STORAGE_DELETION_SLA_HOURS",
  "GIDEON_SIGNED_URL_MAX_SECONDS",
  "GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD",
  "GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD",
  "GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD",
  "GIDEON_STAGING_API_BASE_URL",
  "GIDEON_STAGING_MCP_API_BASE_URL",
  "GIDEON_STAGING_MCP_PROJECT_ID",
  "GIDEON_STAGING_MCP_METRIC_PROBE_URL"
];
const commands = [
  "pnpm production:live-env:check",
  "pnpm production:fixtures:materialize",
  "pnpm production:promote:check -- --live",
  "pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json"
];

if (json) {
  console.log(JSON.stringify({ inputs, secrets, vars, commands }, null, 2));
  process.exit(0);
}

if (list) {
  console.log("Live promotion GitHub configuration checklist:");
  console.log("Inputs:");
  inputs.forEach((name) => console.log(`- ${name}`));
  console.log("Secrets:");
  secrets.forEach((name) => console.log(`- ${name}`));
  console.log("Variables:");
  vars.forEach((name) => console.log(`- ${name}`));
  console.log("Workflow commands:");
  commands.forEach((command) => console.log(`- ${command}`));
  process.exit(0);
}

if (!workflow) {
  errors.push(`Missing workflow file ${path.relative(process.cwd(), workflowPath)}.`);
} else {
  for (const input of inputs) {
    requireWorkflowText(`${input}:`, `workflow_dispatch input ${input}`);
  }
  requireWorkflowText("if: ${{ github.event_name == 'workflow_dispatch' && inputs.run_live_promotion }}", "manual live-promotion job guard");
  requireWorkflowText("Gideon-production-promotion-evidence", "promotion evidence artifact upload");
  for (const secret of secrets) {
    requireWorkflowText(`secrets.${secret}`, `GitHub Secret ${secret}`);
  }
  for (const variable of vars) {
    requireWorkflowText(`vars.${variable}`, `GitHub Variable ${variable}`);
  }
  for (const command of commands) {
    requireWorkflowText(command, `workflow command ${command}`);
  }
}

if (errors.length > 0) {
  console.error("Live promotion GitHub configuration check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Live promotion GitHub configuration check passed.");

function requireWorkflowText(text, label) {
  if (!workflow.includes(text)) {
    errors.push(`Missing ${label}.`);
  }
}
