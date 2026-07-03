# Live evidence status

Last updated: 2026-07-03

This file records the current live-evidence attempt for Gideon. It is intentionally limited to safe command outcomes and missing configuration names; it must not contain secret values, signed URLs, raw provider payloads, transcripts, recordings, private object keys beyond variable names, or session cookie values.

## Current result

Live evidence is not complete yet. The guarded live promotion path reaches GitHub and stops before dispatch because the repository is missing required live-promotion Secrets and Variables. No `workflow_dispatch` live promotion run was created, so there is no `Gideon-production-promotion-evidence` archive, provider canary report, release receipt, or verification receipt to validate yet.

Latest known green CI on `main`:

- Commit: `a75ca28`
- Workflow: `Build macOS app`
- Run: `28684721566`
- Result: success

## Commands run during this live-evidence attempt

| Command | Result | Meaning |
| --- | --- | --- |
| `pnpm staging:check -- --strict` | Failed before live execution | Production-shaped staging infrastructure and credentials are not configured in the local environment. |
| `pnpm production:live-env:check` | Failed before live execution | Live promotion environment variables and fixture secrets are absent. |
| `pnpm production:github-settings:check -- --repo mayowa2133/Gideon` | Failed before dispatch | GitHub repository is missing required Secret and Variable names. Values were not read. |
| `pnpm production:github-promote:run -- --confirm-live` | Failed before dispatch | The guarded runner correctly stopped at the GitHub settings preflight. |
| `pnpm staging:smoke -- --live` | Failed before live smoke | `GIDEON_STAGING_API_BASE_URL` is missing. |
| `pnpm staging:mcp:smoke -- --live --require-metric-export` | Failed before live smoke | `GIDEON_STAGING_MCP_API_BASE_URL` is missing. |
| `pnpm provider:canary -- --live` | Failed before provider calls | `GIDEON_OPENAI_API_KEY` / `OPENAI_API_KEY` is missing, so analysis, ASR, OCR, and TTS canaries did not call the provider. |
| `pnpm production:release-receipt:check` | Failed before verification | `release/release-receipt.json` does not exist because a signed/notarized release receipt has not been produced. |
| `pnpm production:db:check` | Failed before live DB validation | PostgreSQL production policy variables are absent. |
| `pnpm production:queue:check` | Failed before live queue validation | BullMQ/Redis production policy variables are absent. |
| `pnpm production:storage:check -- --verify-bucket-lifecycle` | Failed before live storage validation | S3/R2 storage policy variables are absent. |
| `pnpm production:mcp:check` | Failed before policy validation | Hosted MCP SSO/session/load policy variables are absent. |
| `pnpm production:observability:check` | Failed before policy validation | Observability backend/dashboard/runbook/alert variables are absent. |
| `pnpm production:prompt:check` | Failed before policy validation | Prompt/model rollout policy variables are absent. |
| `pnpm production:tts:check` | Failed before policy validation | TTS model/voice/review/retention policy variables are absent. |
| `pnpm production:billing:check` | Failed before reconciliation | Stripe billing provider, webhook trust, price mapping, and offline/live mode configuration are absent. |

## GitHub Secrets required before live promotion can dispatch

Configure these repository Secrets in `mayowa2133/Gideon` before re-running `pnpm production:github-promote:run -- --confirm-live`:

- `GIDEON_PROVIDER_CANARY_AUDIO_BASE64`
- `GIDEON_PROVIDER_CANARY_IMAGE_BASE64`
- `GIDEON_STAGING_SMOKE_RECORDING_BASE64`
- `GIDEON_REDIS_URL`
- `GIDEON_DATABASE_URL`
- `GIDEON_SESSION_SECRET`
- `GIDEON_STORAGE_ACCESS_KEY_ID`
- `GIDEON_STORAGE_SECRET_ACCESS_KEY`
- `GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY`
- `GIDEON_OPENAI_API_KEY`
- `GIDEON_AUTH_CALLBACK_SECRET`
- `GIDEON_STAGING_MCP_SESSION_COOKIE`
- `GIDEON_STAGING_MCP_METRIC_PROBE_BEARER_TOKEN`
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `CSC_LINK`
- `CSC_NAME`
- `CSC_KEY_PASSWORD`

## GitHub Variables required before live promotion can dispatch

Configure these repository Variables in `mayowa2133/Gideon` before re-running the guarded live promotion:

- `GIDEON_BULLMQ_QUEUE_NAME`
- `GIDEON_BULLMQ_PREFIX`
- `GIDEON_BULLMQ_CONCURRENCY`
- `GIDEON_BULLMQ_ATTEMPTS`
- `GIDEON_BULLMQ_BACKOFF_TYPE`
- `GIDEON_BULLMQ_BACKOFF_DELAY_MS`
- `GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT`
- `GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT`
- `GIDEON_BULLMQ_DEAD_LETTER_POLICY`
- `GIDEON_ANALYSIS_QUEUE_CONCURRENCY`
- `GIDEON_TRANSCRIPTION_QUEUE_CONCURRENCY`
- `GIDEON_OCR_QUEUE_CONCURRENCY`
- `GIDEON_TTS_QUEUE_CONCURRENCY`
- `GIDEON_RENDER_QUEUE_CONCURRENCY`
- `GIDEON_WORKER_ID`
- `GIDEON_DATABASE_POOL_MAX`
- `GIDEON_DATABASE_STATEMENT_TIMEOUT_MS`
- `GIDEON_DATABASE_IDLE_TIMEOUT_MS`
- `GIDEON_POSTGRES_BACKUP_RETENTION_DAYS`
- `GIDEON_POSTGRES_PITR_ENABLED`
- `GIDEON_POSTGRES_RESTORE_DRILL_AT`
- `GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS`
- `GIDEON_POSTGRES_MIGRATION_POLICY`
- `GIDEON_STORAGE_PROVIDER`
- `GIDEON_STORAGE_ENDPOINT`
- `GIDEON_STORAGE_BUCKET`
- `GIDEON_STORAGE_TEMP_RETENTION_DAYS`
- `GIDEON_STORAGE_FAILED_RETENTION_DAYS`
- `GIDEON_STORAGE_SOURCE_RETENTION_DAYS`
- `GIDEON_VOICEOVER_RETENTION_DAYS`
- `GIDEON_STORAGE_EXPORT_RETENTION_DAYS`
- `GIDEON_STORAGE_DELETION_SLA_HOURS`
- `GIDEON_SIGNED_URL_MAX_SECONDS`
- `GIDEON_OPENAI_TTS_MODEL`
- `GIDEON_OPENAI_TTS_VOICE`
- `GIDEON_TTS_APPROVED_VOICES`
- `GIDEON_TTS_VOICE_REVIEWED_AT`
- `GIDEON_VOICEOVER_DELETION_SLA_HOURS`
- `GIDEON_OPENAI_LLM_MODEL`
- `GIDEON_ANALYSIS_PROMPT_VERSION`
- `GIDEON_ANALYSIS_PROMPT_APPROVED_VERSIONS`
- `GIDEON_ANALYSIS_PROMPT_ROLLBACK_VERSION`
- `GIDEON_ANALYSIS_PROMPT_REVIEWED_AT`
- `GIDEON_ANALYSIS_PROMPT_ROLLOUT_STAGE`
- `GIDEON_ANALYSIS_MODEL_ROLLOUT_PERCENT`
- `GIDEON_ANALYSIS_MODEL_CANARY_PERCENT`
- `GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD`
- `GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD`
- `GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD`
- `GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD`
- `GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD`
- `GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD`
- `GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD`
- `GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD`
- `GIDEON_STAGING_API_BASE_URL`
- `GIDEON_STAGING_MCP_API_BASE_URL`
- `GIDEON_STAGING_MCP_PROJECT_ID`
- `GIDEON_STAGING_MCP_METRIC_PROBE_URL`
- `GIDEON_MCP_SSO_PROVIDER`
- `GIDEON_MCP_SESSION_MAX_AGE_SECONDS`
- `GIDEON_MCP_SESSION_ROTATION_HOURS`
- `GIDEON_MCP_REQUIRE_CSRF`
- `GIDEON_MCP_REQUIRE_REVISION_PRECONDITIONS`
- `GIDEON_MCP_LOAD_CONCURRENCY`
- `GIDEON_MCP_LOAD_REQUESTS`
- `GIDEON_MCP_LOAD_P95_MS`
- `GIDEON_MCP_LOAD_ERROR_RATE_MAX`
- `GIDEON_OBSERVABILITY_BACKEND`
- `GIDEON_OBSERVABILITY_METRIC_EXPORT_URL`
- `GIDEON_OBSERVABILITY_DASHBOARD_URL`
- `GIDEON_OBSERVABILITY_RUNBOOK_URL`
- `GIDEON_OBSERVABILITY_ALERT_ROUTE`
- `GIDEON_OBSERVABILITY_PAGING_ENABLED`
- `GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS`
- `GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR`
- `GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS`
- `GIDEON_OBSERVABILITY_STORAGE_P95_MS`
- `GIDEON_RELEASE_RECEIPT_PATH`

## Re-run order after configuration is supplied

1. `pnpm production:github-settings:check -- --repo mayowa2133/Gideon`
2. `pnpm staging:check -- --strict`
3. `pnpm production:live-env:check`
4. `pnpm production:github-promote:run -- --confirm-live`
5. `pnpm production:github-receipt:check -- --path tmp/github-production-promotion-evidence/verification-receipt.json`
6. `pnpm production:github-archive:check -- --archive-dir tmp/github-production-promotion-evidence`

Completion requires the live promotion workflow to dispatch, finish successfully, upload `Gideon-production-promotion-evidence`, and produce verified `production-promotion-evidence.json`, `provider-canary-report.json`, `release-receipt.json`, and `verification-receipt.json`.
