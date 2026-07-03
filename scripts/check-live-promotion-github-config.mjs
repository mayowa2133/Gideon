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
  "GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY",
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
  "GIDEON_BULLMQ_CONCURRENCY",
  "GIDEON_BULLMQ_ATTEMPTS",
  "GIDEON_BULLMQ_BACKOFF_TYPE",
  "GIDEON_BULLMQ_BACKOFF_DELAY_MS",
  "GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT",
  "GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT",
  "GIDEON_BULLMQ_DEAD_LETTER_POLICY",
  "GIDEON_WORKER_ID",
  "GIDEON_DATABASE_POOL_MAX",
  "GIDEON_DATABASE_STATEMENT_TIMEOUT_MS",
  "GIDEON_DATABASE_IDLE_TIMEOUT_MS",
  "GIDEON_POSTGRES_BACKUP_RETENTION_DAYS",
  "GIDEON_POSTGRES_PITR_ENABLED",
  "GIDEON_POSTGRES_RESTORE_DRILL_AT",
  "GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS",
  "GIDEON_POSTGRES_MIGRATION_POLICY",
  "GIDEON_STORAGE_PROVIDER",
  "GIDEON_STORAGE_ENDPOINT",
  "GIDEON_STORAGE_BUCKET",
  "GIDEON_STORAGE_TEMP_RETENTION_DAYS",
  "GIDEON_STORAGE_FAILED_RETENTION_DAYS",
  "GIDEON_STORAGE_SOURCE_RETENTION_DAYS",
  "GIDEON_VOICEOVER_RETENTION_DAYS",
  "GIDEON_STORAGE_EXPORT_RETENTION_DAYS",
  "GIDEON_STORAGE_DELETION_SLA_HOURS",
  "GIDEON_SIGNED_URL_MAX_SECONDS",
  "GIDEON_OPENAI_TTS_MODEL",
  "GIDEON_OPENAI_TTS_VOICE",
  "GIDEON_TTS_APPROVED_VOICES",
  "GIDEON_TTS_VOICE_REVIEWED_AT",
  "GIDEON_VOICEOVER_DELETION_SLA_HOURS",
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
  "GIDEON_STAGING_MCP_METRIC_PROBE_URL",
  "GIDEON_MCP_SSO_PROVIDER",
  "GIDEON_MCP_SESSION_MAX_AGE_SECONDS",
  "GIDEON_MCP_SESSION_ROTATION_HOURS",
  "GIDEON_MCP_REQUIRE_CSRF",
  "GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS",
  "GIDEON_MCP_LOAD_CONCURRENCY",
  "GIDEON_MCP_LOAD_REQUESTS",
  "GIDEON_MCP_LOAD_P95_MS",
  "GIDEON_MCP_LOAD_ERROR_RATE_MAX",
  "GIDEON_OBSERVABILITY_BACKEND",
  "GIDEON_OBSERVABILITY_METRIC_EXPORT_URL",
  "GIDEON_OBSERVABILITY_DASHBOARD_URL",
  "GIDEON_OBSERVABILITY_RUNBOOK_URL",
  "GIDEON_OBSERVABILITY_ALERT_ROUTE",
  "GIDEON_OBSERVABILITY_PAGING_ENABLED",
  "GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS",
  "GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR",
  "GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS",
  "GIDEON_OBSERVABILITY_STORAGE_P95_MS",
  "GIDEON_RELEASE_RECEIPT_PATH"
];
const commands = [
  "pnpm production:live-env:check",
  "pnpm production:fixtures:materialize",
  "pnpm production:promote:check -- --live",
  "pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json",
  "tmp/release-receipt.json"
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
