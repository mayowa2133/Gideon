# Release hardening

This document defines the current macOS release gate for Gideon desktop artifacts.

## Local package gate

Local builds can remain unsigned for development:

```bash
pnpm package:mac
pnpm release:mac:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
```

`pnpm release:mac:check` validates the expected DMG/ZIP/blockmap/latest metadata and writes `release/provenance.json` with artifact sizes and hashes. The `release/` directory remains ignored by git.

## Production package gate

Production releases should use the signed packaging command:

```bash
pnpm package:mac:signed
GIDEON_RELEASE_CHANNEL=production pnpm release:mac:check
pnpm production:release-receipt:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
```

Production mode requires:

- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `CSC_LINK` or `CSC_NAME` for the Developer ID Application signing identity

The check also validates that `latest-mac.yml` hashes and sizes match the generated DMG/ZIP artifacts.

`pnpm production:release-receipt:check` verifies a safe `release/release-receipt.json` by default, or `GIDEON_RELEASE_RECEIPT_PATH` when set. The receipt must show production channel, matching artifact hashes/sizes for the generated DMG, ZIP, `latest-mac.yml`, and `provenance.json`, accepted notarization, accepted DMG stapling, accepted Gatekeeper assessment, and a passed install smoke. The receipt is intentionally secret-free: it must not contain Apple passwords, certificate passwords, private keys, provider keys, signed URLs, or download URLs.

## Provenance manifest

`release/provenance.json` records:

- Gideon version and release channel;
- source repository, commit, and workflow run ID when running in GitHub Actions;
- Node and package manager versions;
- file names, sizes, SHA-256 hashes, and SHA-512 hashes for generated artifacts.

The GitHub macOS build uploads the DMG, ZIP, blockmaps, `latest-mac.yml`, and `provenance.json` as workflow artifacts.

## Live promotion evidence workflow

The macOS workflow has a manual `workflow_dispatch` live promotion path. Run `pnpm production:github-config:check -- --list` to print the required GitHub Secrets/Vars checklist, then `pnpm production:github-settings:check -- --repo mayowa2133/Gideon` to confirm those names exist on the repository without reading secret or variable values. Set `run_live_promotion=true` only after staging infrastructure, provider credentials, object storage, Redis/PostgreSQL, hosted MCP session/project, metric probe configuration, base64-encoded fixture secrets, and Apple signing credentials are configured in GitHub Secrets/Vars.

Live provider canaries also require explicit GitHub Variables for per-capability cost controls: `GIDEON_PROVIDER_CANARY_ANALYSIS_MAX_COST_USD`, `GIDEON_PROVIDER_CANARY_ANALYSIS_ESTIMATED_COST_USD`, `GIDEON_PROVIDER_CANARY_TRANSCRIPTION_MAX_COST_USD`, `GIDEON_PROVIDER_CANARY_TRANSCRIPTION_ESTIMATED_COST_USD`, `GIDEON_PROVIDER_CANARY_OCR_MAX_COST_USD`, `GIDEON_PROVIDER_CANARY_OCR_ESTIMATED_COST_USD`, `GIDEON_PROVIDER_CANARY_TTS_MAX_COST_USD`, and `GIDEON_PROVIDER_CANARY_TTS_ESTIMATED_COST_USD`. The live promotion gate writes `tmp/provider-canary-report.json` and verifies it with `pnpm production:provider-canary-report:check`; that report must show passed analysis, transcription, OCR, and TTS canaries with costs within ceiling and no secret-like material. Production PostgreSQL promotion requires GitHub Variables for `GIDEON_DATABASE_POOL_MAX`, `GIDEON_DATABASE_STATEMENT_TIMEOUT_MS`, `GIDEON_DATABASE_IDLE_TIMEOUT_MS`, `GIDEON_POSTGRES_BACKUP_RETENTION_DAYS`, `GIDEON_POSTGRES_PITR_ENABLED`, `GIDEON_POSTGRES_RESTORE_DRILL_AT`, `GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS`, and `GIDEON_POSTGRES_MIGRATION_POLICY`, plus the GitHub Secret `GIDEON_DATABASE_URL`. Production BullMQ promotion requires GitHub Variables for `GIDEON_BULLMQ_CONCURRENCY`, `GIDEON_BULLMQ_ATTEMPTS`, `GIDEON_BULLMQ_BACKOFF_TYPE`, `GIDEON_BULLMQ_BACKOFF_DELAY_MS`, `GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT`, `GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT`, and `GIDEON_BULLMQ_DEAD_LETTER_POLICY`. Production observability promotion requires GitHub Variables for `GIDEON_OBSERVABILITY_BACKEND`, `GIDEON_OBSERVABILITY_METRIC_EXPORT_URL`, `GIDEON_OBSERVABILITY_DASHBOARD_URL`, `GIDEON_OBSERVABILITY_RUNBOOK_URL`, `GIDEON_OBSERVABILITY_ALERT_ROUTE`, `GIDEON_OBSERVABILITY_PAGING_ENABLED`, `GIDEON_OBSERVABILITY_QUEUE_AGE_WARNING_SECONDS`, `GIDEON_OBSERVABILITY_TERMINAL_FAILURES_PER_HOUR`, `GIDEON_OBSERVABILITY_PROVIDER_TTS_P95_MS`, and `GIDEON_OBSERVABILITY_STORAGE_P95_MS`. Production release promotion requires the GitHub Variable `GIDEON_RELEASE_RECEIPT_PATH` when the receipt is not written to `release/release-receipt.json`. Production storage promotion also requires GitHub Variables for `GIDEON_STORAGE_ENDPOINT`, `GIDEON_STORAGE_TEMP_RETENTION_DAYS`, `GIDEON_STORAGE_FAILED_RETENTION_DAYS`, `GIDEON_STORAGE_SOURCE_RETENTION_DAYS`, `GIDEON_STORAGE_EXPORT_RETENTION_DAYS`, `GIDEON_STORAGE_DELETION_SLA_HOURS`, and `GIDEON_SIGNED_URL_MAX_SECONDS`, plus the GitHub Secret `GIDEON_STORAGE_SIGNED_DOWNLOAD_SMOKE_KEY` for an existing private export/render/source object.

The live job first runs `pnpm production:live-env:check` to fail fast on missing or weak staging/provider/storage/MCP/signing configuration, then runs `pnpm production:fixtures:materialize` to validate and decode the base64 private fixture secrets into ignored `tmp/live-fixtures` files. It then runs `pnpm production:promote:check -- --live`, including production billing reconciliation, PostgreSQL policy verification, BullMQ policy verification, observability policy verification, signed S3/R2 bucket lifecycle XML verification, signed-download smoke against the private smoke object key, live provider canaries plus safe provider canary report verification, signed release metadata, notarization receipt verification, and DMG verification. It self-verifies `tmp/production-promotion-evidence.json`, runs `pnpm production:evidence:check -- --path tmp/production-promotion-evidence.json`, copies the configured release receipt to `tmp/release-receipt.json` for full package runs, and uploads `Gideon-production-promotion-evidence` with the promotion evidence, provider canary report, and release receipt. The evidence artifact is designed to contain step names, commands, safe env overrides, timings, exit codes, and failure status only; it must not contain cookies, API keys, signed URLs, object keys, provider payloads, transcripts, prompts, or media paths. After the run completes, verify the archived artifact from a workstation with `pnpm production:github-evidence:check -- --run-id <github-run-id> --write-receipt tmp/github-production-promotion-evidence/verification-receipt.json` before treating the promotion as release evidence; this also re-validates `provider-canary-report.json`, requires `release-receipt.json` for non-skip-package releases, confirms the evidence `gitCommit` matches the GitHub run `headSha`, and writes a safe verification receipt summarizing the archived files with byte sizes and SHA-256 digests. Then run `pnpm production:github-receipt:check -- --path tmp/github-production-promotion-evidence/verification-receipt.json` to validate the receipt remains safe, time-ordered, internally consistent, and linked to the same GitHub run as the release receipt after archival, followed by `pnpm production:github-archive:check -- --archive-dir tmp/github-production-promotion-evidence` to validate the stored evidence, provider canary report, release receipt, verification receipt, and receipt-recorded byte sizes plus SHA-256 digests still match each other. To run the settings preflight, dispatch, watch, download, verify, receipt, and archive-bundle checks in one guarded command, run `pnpm production:github-promote:run -- --confirm-live`; add `--skip-package` only for infrastructure rehearsals.
