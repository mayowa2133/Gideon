# Gideon production-readiness audit

Last updated: 2026-07-01

This audit maps the original full-product gaps to the current implementation evidence and the remaining production work. It is intentionally evidence-based: a capability is counted only when there is code, documentation, or a verification command that demonstrates the path.

## Executive summary

Gideon is no longer only a local deterministic desktop prototype. The repository now contains the local upload-to-export loop, provider-neutral AI/media boundaries, OpenAI-backed analysis/TTS adapters, private artifact storage, local and hosted job execution, MCP agent control for Codex/Claude Code without Gideon-held model API keys, workspace/team/billing foundations, hosted direct-upload and download primitives, signed queue handoff, BullMQ-backed hosted worker infrastructure, observability snapshots/alerts, and macOS release provenance checks.

The remaining production gap is narrower and mostly operational: replace local JSON-backed hosted state with production database-backed persistence, run Redis/BullMQ and object storage as managed production services, complete deployment/release operations, and execute a final end-to-end production smoke with real infrastructure. Social posting, scheduling, avatar generation, and voice cloning remain explicit post-MVP items.

Current engineering estimate: **99.999998% complete** toward the full original product vision.

## Capability audit

| Original gap | Current status | Evidence | Remaining production work |
| --- | --- | --- | --- |
| Local upload-to-export loop | Implemented | Desktop app accepts walkthrough recordings, stores project artifacts, detects moments, generates scripts, renders vertical drafts, and packages macOS builds. See `src/main/main.ts`, `src/main/store.ts`, `src/main/render.ts`, `src/renderer/App.tsx`, and `pnpm package:mac`. | Run final signed/notarized release candidate and production install smoke. |
| Real AI/LLM semantic analysis | Implemented behind provider boundary | `src/main/providers/openai.ts`, `src/main/providerCanary.ts`, `src/main/analysisPipeline.ts`, `src/main/jobExecutor.ts`, and tests in `src/main/providers/openai.test.ts`, `src/main/providerCanary.test.ts`, and `src/main/analysisPipeline.test.ts` validate structured provider parsing, fallback behavior, executor handoff, dry-run provider readiness, explicit live canary mode, and required live cost ceilings. | Run production canaries with real provider credentials/media and prompt/version rollout controls. |
| Transcription / ASR from recordings | Implemented behind provider boundary | `src/main/providers/openai.ts`, `src/main/providerCanary.ts`, and job executor tests cover the provider-backed transcription adapter, quota accounting, dry-run readiness, opt-in live ASR canary fixtures, and transcription canary cost ceilings. | Run live ASR canaries against staging media and tune hosted worker lane separation for ASR-heavy jobs. |
| OCR / UI understanding | Implemented behind provider boundary | `src/main/providers/openai.ts`, `src/main/providerCanary.ts`, `docs/technical-spec.md`, and analysis pipeline tests document transcript/frame/OCR evidence handling, prompt-injection treatment, structured OCR parsing, opt-in live OCR canary fixtures, and OCR canary cost ceilings. | Run live OCR canaries against noisy/prompt-injection staging screenshots and persist any additional frame-level OCR artifacts needed for hosted review. |
| Cloud auth, workspaces, teams, RBAC, billing, quotas | Implemented as foundations | `src/main/auth.ts`, `src/shared/rbac.ts`, `src/main/billing.ts`, `src/shared/usage.ts`, `src/main/hostedApi.ts`, `scripts/check-billing-reconciliation.mjs`, `scripts/check-postgres-policy.mjs`, and related tests cover roles, hosted API boundaries, billing-session wiring, usage records, quota foundations, Stripe price mapping, webhook trust configuration, workspace metadata, duplicate active subscription detection, offline/live-capable billing reconciliation preflight, and production PostgreSQL TLS/pool/timeout/backup/PITR/restore-drill/migration policy verification. `src/main/persistence.ts` adds a pluggable app-state persistence boundary plus a `pg`-backed PostgreSQL snapshot adapter, `src/main/hostedWorkerProcess.ts` wires it from `GIDEON_STORE_PROVIDER=postgres_snapshot`, `migrations/0001_hosted_jobs_artifacts.sql`, `migrations/0002_usage_audit_events.sql`, and `migrations/0003_core_identity_projects.sql` define relational hosted projections, `src/main/postgresCoreRepository.ts` exposes scoped auth subject, user workspace, membership, billing customer/subscription, project-list, and project reads, `src/main/postgresJobArtifactRepository.ts` exposes scoped job and artifact reads, and `GideonStore` mirrors live users, workspaces, workspace members, projects, upload sessions, jobs, artifacts, usage, and audit records into those projections after successful saves. | Operate the PostgreSQL projections in staging, run the live PostgreSQL policy check against managed infrastructure, and run live billing reconciliation against production Stripe before public paid launch. |
| Direct-to-cloud uploads and private object storage | Implemented as primitives | `src/main/storage.ts`, `src/main/store.ts`, `src/main/hostedApi.ts`, `src/main/storage.test.ts`, `src/main/hostedApi.test.ts`, `scripts/run-staging-smoke.mjs`, `scripts/check-staging-readiness.mjs`, `scripts/check-storage-policy.mjs`, `scripts/run-storage-download-smoke.mjs`, and API docs cover direct upload sessions, private artifact records, signed downloads, sanitized hosted render discovery, a live-capable upload-to-export smoke runner, strict readiness checks for the deployed smoke configuration, lifecycle/deletion/signed-URL policy preflight, signed S3/R2 lifecycle XML verification for temp/failed/source/export retention coverage, independent signed-download smoke verification without URL/key leakage, and non-public storage behavior. | Run the live staging smoke against real S3-compatible storage and add multipart/resumable upload if required. |
| Async queues and hosted workers | Implemented through local, memory, HTTP, and BullMQ paths | `src/main/jobQueue.ts`, `src/main/hostedWorker.ts`, `src/main/hostedWorkerProcess.ts`, `src/main/jobExecutorAdapter.ts`, `src/main/postgresCoreRepository.ts`, `src/main/postgresJobArtifactRepository.ts`, `src/main/postgresUsageAuditRepository.ts`, `Dockerfile.hosted-worker`, `docker-compose.hosted-worker.yml`, `scripts/check-hosted-worker-config.mjs`, `scripts/check-bullmq-policy.mjs`, `scripts/check-staging-readiness.mjs`, and `src/main/jobQueue.redis.test.ts` prove the queue, signed intake, leases, heartbeat, recovery, worker process, Redis smoke path, hosted persistence preflight, PostgreSQL store selection, live relational mirroring, production BullMQ policy preflight, aggregate staging-readiness preflight, relational core/jobs/artifacts/usage/audit projections, and scoped PostgreSQL reads for hosted project, job, and export lookups. | Operate managed Redis/BullMQ and PostgreSQL in staging/production, run the live policy check against real infrastructure, and add infrastructure-level dashboards. |
| Provider-backed TTS | Implemented behind provider boundary | `src/main/jobExecutor.ts` creates the speech provider through the same provider config as analysis; worker metrics include provider TTS latency/failure, and provider canaries now enforce TTS cost ceilings. | Production voice selection and audio artifact retention policy. |
| Stage-level retry/cancel jobs | Implemented for the current job model | `src/main/jobQueue.ts`, `src/main/store.ts`, and `src/main/jobQueue.test.ts` cover job states, retryability, canceling, leases, heartbeats, expired lease recovery, and safe failure mapping. | Extend stage-specific worker lanes as ASR/OCR become fully hosted services. |
| Observability and safe operations | Implemented for hosted workers and hosted MCP/API review edits | `src/main/observability.ts`, `src/main/hostedApi.ts`, `scripts/lint-repository.mjs`, `scripts/check-hosted-review-policy.mjs`, `scripts/check-observability-policy.mjs`, `scripts/run-staging-mcp-smoke.mjs`, `scripts/run-production-readiness-gate.mjs`, `scripts/run-production-promotion-gate.mjs`, `scripts/run-github-live-promotion.mjs`, `scripts/check-production-promotion-evidence.mjs`, `scripts/check-live-promotion-github-config.mjs`, `scripts/check-github-live-promotion-settings.mjs`, `scripts/check-github-promotion-evidence.mjs`, `scripts/check-github-promotion-receipt.mjs`, `scripts/check-github-promotion-archive.mjs`, `scripts/check-live-promotion-env.mjs`, `scripts/materialize-live-promotion-fixtures.mjs`, `scripts/run-staging-smoke.mjs`, `.github/workflows/mac-build.yml`, `docs/observability-alerts.md`, `docs/hosted-worker-deployment.md`, and worker/API/lint/gate/smoke tests cover metrics, alert rules, safe summaries, deployment checks, production observability backend/dashboard/runbook/paging threshold policy, hosted review retry/revision policy checks, hosted MCP context and review-edit success/failure metrics, hosted MCP metric-export smoke probing, self-verified safe promotion evidence artifacts, live GitHub Secrets/Vars workflow contract checks, repo-level GitHub Secrets/Vars name preflight without reading values, guarded GitHub live-promotion dispatch/watch/download/verify automation that runs the repo settings check before dispatch, local re-verification of archived GitHub promotion evidence artifacts including evidence `gitCommit` to GitHub run `headSha` matching and safe verification receipts, independent validation of archived verification receipt metadata and secret policy, offline archive-bundle consistency checks for the stored evidence and receipt, live environment preflight, validated live-fixture materialization, workflow artifact upload for opt-in live promotion evidence, conflict-marker detection, generated/private artifact checks, secret-like material checks, README/audit progress consistency, a single-command local production-readiness gate, a live upload-to-export staging smoke gate, and a live production promotion gate. | Connect the configured observability backend to deployed infrastructure and tune paging thresholds after staging load tests. |
| macOS packaging and release provenance | Implemented for unsigned local builds and preflighted production candidates | `package.json`, `.github/workflows/mac-build.yml`, `scripts/check-macos-release.mjs`, `scripts/check-release-receipt.mjs`, `src/main/macosReleaseCheck.test.ts`, `src/main/releaseReceiptCheck.test.ts`, `src/main/ciWorkflow.test.ts`, `docs/release-hardening.md`, and the release workflow validate DMG/ZIP metadata, checksums, provenance, signing/notarization env, safe notarization/stapling/Gatekeeper/install-smoke receipt evidence, repository lint, production gate dry-runs, and production release preflight. | Run Apple Developer ID signing/notarization with production credentials, archive the verified receipt, and publish the first release artifact. |
| Codex/Claude Code MCP control without Gideon API keys | Implemented as a first-class path | `src/mcp/server.ts`, `src/mcp/server.test.ts`, `src/main/hostedApi.ts`, `src/main/hostedApi.test.ts`, `src/main/observability.ts`, `scripts/check-hosted-review-policy.mjs`, `scripts/run-staging-mcp-smoke.mjs`, `docs/mcp-agent-control.md`, `docs/implementation-plan.md`, and README document Palmier-style MCP tools for local and hosted project inspection, bounded script/moment edits, audit events, analysis/render enqueueing, hosted context metrics, review-edit success/failure alerts, and a live-capable hosted MCP staging smoke. Hosted MCP mode uses the authenticated hosted API session, CSRF-protected edit/job routes, sanitized project context, optimistic revision preconditions for script/moment edits, and transient-only hosted API retries that do not retry auth/validation/precondition/revision failures. The agent supplies model reasoning; Gideon does not require LLM provider API keys for this control path. | Run remote/enterprise MCP access through staging SSO/session policy and production load testing. |
| Human approval gates | Preserved | Product docs and UI flow keep users in control of reviewing moments, scripts, and generated outputs before export. MCP mutations are bounded, audited, and protected from stale hosted overwrites with revision conflicts. | Extend revision conflict UX across future collaborative review surfaces. |
| Social posting, scheduling, analytics | Out of MVP by design | `AGENTS.md` and `docs/productionization-roadmap.md` explicitly defer publishing and social automation. | Revisit only after the evidence-to-render loop is production-grade and explicitly approved. |
| Avatar generation, voice cloning | Out of MVP by design | `AGENTS.md`, `docs/security-rules.md`, and roadmap constraints exclude avatar generation and voice cloning without explicit instruction. | Requires separate consent, anti-impersonation, safety, and legal review before implementation. |

## Verification commands

Run these from the repository root before promoting a production-readiness slice:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:redis
GIDEON_HOSTED_QUEUE_PROVIDER=bullmq \
GIDEON_REDIS_URL=redis://localhost:6379/0 \
GIDEON_WORKER_ID=hosted-worker-1 \
GIDEON_WORKER_LEASE_SECONDS=300 \
GIDEON_WORKER_HEARTBEAT_INTERVAL_MS=30000 \
GIDEON_USER_DATA_DIR=/var/lib/gideon-worker \
pnpm worker:hosted:check
GIDEON_DEPLOYMENT_ENV=production \
GIDEON_HOSTED_QUEUE_PROVIDER=bullmq \
GIDEON_REDIS_URL=rediss://default:secret@redis.example.test:6380/0 \
GIDEON_STORE_PROVIDER=postgres_snapshot \
GIDEON_DATABASE_URL='postgres://gideon:secret@db.example.test:5432/gideon?sslmode=require' \
GIDEON_DATABASE_POOL_MAX=10 \
GIDEON_DATABASE_STATEMENT_TIMEOUT_MS=30000 \
GIDEON_DATABASE_IDLE_TIMEOUT_MS=30000 \
GIDEON_POSTGRES_BACKUP_RETENTION_DAYS=30 \
GIDEON_POSTGRES_PITR_ENABLED=true \
GIDEON_POSTGRES_RESTORE_DRILL_AT=2026-07-01T00:00:00.000Z \
GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS=90 \
GIDEON_POSTGRES_MIGRATION_POLICY=predeploy_migrate \
GIDEON_BULLMQ_QUEUE_NAME=gideon-prod-workers \
GIDEON_BULLMQ_PREFIX=gideon-prod \
GIDEON_BULLMQ_CONCURRENCY=4 \
GIDEON_BULLMQ_ATTEMPTS=3 \
GIDEON_BULLMQ_BACKOFF_TYPE=exponential \
GIDEON_BULLMQ_BACKOFF_DELAY_MS=5000 \
GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT=1000 \
GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT=5000 \
GIDEON_BULLMQ_DEAD_LETTER_POLICY=retain_failed \
GIDEON_WORKER_ID=worker-prod-1 \
GIDEON_WORKER_LEASE_SECONDS=300 \
GIDEON_WORKER_HEARTBEAT_INTERVAL_MS=30000 \
GIDEON_USER_DATA_DIR=/var/lib/gideon-worker \
GIDEON_STORE_PATH=/var/lib/gideon-worker/store.json \
GIDEON_PROJECTS_DIR=/var/lib/gideon-worker/projects \
GIDEON_STORAGE_ROOT=/var/lib/gideon-worker/cache \
GIDEON_STORAGE_PROVIDER=s3 \
GIDEON_STORAGE_BUCKET=gideon-private-prod \
GIDEON_STORAGE_ACCESS_KEY_ID=storage-key \
GIDEON_STORAGE_SECRET_ACCESS_KEY=storage-secret \
GIDEON_OPENAI_API_KEY=provider-key \
pnpm worker:hosted:check
docker compose -f docker-compose.hosted-worker.yml config
pnpm db:migrate -- --dry-run
pnpm provider:canary -- --dry-run
pnpm hosted:review:check
pnpm staging:check
pnpm staging:smoke -- --dry-run
pnpm staging:mcp:smoke -- --dry-run
pnpm production:github-config:check
pnpm production:github-settings:check -- --dry-run
pnpm production:github-evidence:check -- --dry-run
pnpm production:github-receipt:check -- --dry-run
pnpm production:github-archive:check -- --dry-run
pnpm production:github-promote:run -- --dry-run
pnpm production:live-env:check -- --dry-run
pnpm production:fixtures:materialize -- --dry-run
pnpm production:billing:check -- --dry-run
pnpm production:db:check -- --dry-run
pnpm production:queue:check -- --dry-run
pnpm production:observability:check -- --dry-run
pnpm production:storage:check -- --dry-run
pnpm production:storage:check -- --verify-bucket-lifecycle
pnpm production:storage-download:smoke -- --dry-run
pnpm production:provider-canary-report:check -- --dry-run
pnpm production:release-receipt:check -- --dry-run
pnpm production:promote:check -- --dry-run
pnpm production:evidence:check -- --dry-run
pnpm package:mac
pnpm release:mac:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
git diff --check
pnpm production:check
```

## Go-live blockers

1. Production database-backed hosted persistence is mostly closed by the pluggable persistence boundary, hosted-worker PostgreSQL snapshot wiring, live relational mirroring for users, workspaces, members, projects, upload sessions, jobs, artifacts, usage, and audit records, scoped core/job/artifact service-query reads, billing reconciliation preflight, production PostgreSQL policy verification through `pnpm production:db:check`, and an aggregate staging-readiness gate; remaining work is running strict checks against real staging infrastructure and live Stripe data.
2. Managed Redis/BullMQ operations live execution. Production retention, concurrency, retry, and dead-letter policy validation is now covered by `pnpm production:queue:check`.
3. Production object storage credentials. The private S3/R2 lifecycle/deletion/signed-URL policy preflight, actual bucket lifecycle XML coverage check, and signed-download smoke are now covered by `pnpm production:storage:check -- --verify-bucket-lifecycle` and `pnpm production:storage-download:smoke`.
4. Live provider canary execution for analysis, ASR/OCR where configured, and TTS with production credentials and staging fixtures; cost ceilings are now enforced by `pnpm provider:canary -- --live`, persisted safe report verification through `pnpm production:provider-canary-report:check`, and strict staging/live env checks.
5. Signed and notarized macOS release artifact, plus production release provenance. Safe notarization/stapling/Gatekeeper/install-smoke receipt verification is now covered by `pnpm production:release-receipt:check`.
6. End-to-end staging smoke from upload to private export package and hosted MCP smoke using production-shaped infrastructure; `pnpm staging:check -- --strict` now guards the required deployed API, auth callback, live flags, recording fixture, scratch MCP session/project, provider, storage lifecycle policy, queue, database, observability, and release configuration, `pnpm staging:smoke -- --live` executes the deployed upload-to-export path, `pnpm staging:mcp:smoke -- --live --require-metric-export` verifies the hosted Codex/Claude control path, `pnpm production:check` runs the local non-credential promotion gate, and `pnpm production:promote:check -- --live` now composes billing reconciliation, production PostgreSQL policy verification, production BullMQ policy verification, production observability policy verification, actual bucket lifecycle verification, live provider canary report verification, the live promotion sequence, and writes plus self-verifies a safe promotion evidence report.

## Next engineering slice

The next slice should run `pnpm production:github-promote:run -- --confirm-live` against staging credentials/fixtures, a scratch hosted MCP project/session, deployed metric export, and Apple signing credentials, then archive the verified uploaded `Gideon-production-promotion-evidence` artifact and validate the safe receipt plus bundle consistency with `pnpm production:github-receipt:check -- --path tmp/github-production-promotion-evidence/verification-receipt.json` and `pnpm production:github-archive:check -- --archive-dir tmp/github-production-promotion-evidence`.
