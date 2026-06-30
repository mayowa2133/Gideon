# Gideon

Gideon is a macOS desktop app that turns a product walkthrough recording into editable short-form video drafts.

## Implementation progress

Current engineering estimate: **99.99% complete** toward the full original product vision.

This estimate is intentionally conservative. Gideon has the local upload-to-export loop, provider-neutral AI/media adapters, private artifact storage, local queue controls, MCP control for Codex/Claude Code without Gideon API keys, workspace/team/billing foundations, hosted direct-upload completion, hosted analysis/render/export/download/billing-session primitives, sanitized hosted render discovery for export creation, Stripe REST session wiring, signed hosted worker-queue enqueue/intake HTTP dispatch boundaries, hosted worker lease/heartbeat/recovery coordination through the store layer, a reusable hosted worker runtime adapter for detached execution, hosted dependency auto-wiring for signed HTTP queues, the in-memory broker-backed queue path, a BullMQ Redis-backed broker with an optional real-Redis smoke gate, separately deployable hosted-worker container configuration, production hardening checks for Redis/BullMQ and worker persistence, macOS release provenance/signing preflight checks, a hosted worker process entrypoint with structured lifecycle/job metrics, persisted job observability snapshots, executable dashboard/alert definitions, a shared real analysis/render job executor adapter used by desktop, hosted worker, and MCP-enqueued analysis/render jobs with analysis, TTS, render, storage, and usage metrics, a pluggable app-state persistence boundary with a `pg`-backed PostgreSQL snapshot adapter selectable in hosted worker runtime configuration, migration-backed PostgreSQL repositories for core identity/project state, jobs/artifacts, and usage/audit events plus `pnpm db:migrate`, live relational mirroring of users/workspaces/members/projects/upload sessions/jobs/artifacts/usage/audit from store saves in hosted PostgreSQL mode, scoped PostgreSQL read paths for hosted auth/RBAC/billing/project/job/export queries, a safe provider canary runner for analysis, ASR, OCR, and TTS, an executable staging-readiness gate for production-shaped Redis/PostgreSQL/object-storage/provider/release configuration that now requires live upload-to-export smoke configuration, a live-capable staging upload-to-export smoke runner, a live production-promotion gate that composes local readiness, strict staging checks, live provider canaries, live upload-to-export smoke, signed packaging, release metadata, and DMG verification, a dependency-free repository lint gate for conflict markers, generated/private artifacts, secret-like material, and progress drift, a single-command local production-readiness gate, CI coverage for repository lint and production gate dry-runs on the macOS packaging workflow, and a production-readiness audit that maps original product gaps to current evidence and go-live blockers. Remaining work is mainly running the strict staging/live gates against deployed infrastructure, live provider canary execution with production credentials/media, final signed/notarized release operations, and later non-MVP expansion items.

## Local development

Use the bundled Codex runtime or any local Node.js 22+ environment.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate -- --dry-run
pnpm provider:canary -- --dry-run
pnpm staging:check
pnpm staging:smoke -- --dry-run
pnpm production:check -- --dry-run
pnpm production:promote:check -- --dry-run
pnpm start
```

When a local or managed Redis instance is available, run the hosted queue integration smoke:

```bash
GIDEON_REDIS_URL=redis://localhost:6379/0 pnpm test:redis
```

## Hosted worker deployment

The hosted worker can be deployed as a separately scaled process from the app/API surface:

```bash
pnpm build:main
GIDEON_HOSTED_QUEUE_PROVIDER=bullmq \
GIDEON_REDIS_URL=redis://localhost:6379/0 \
GIDEON_WORKER_ID=hosted-worker-1 \
GIDEON_WORKER_LEASE_SECONDS=300 \
GIDEON_WORKER_HEARTBEAT_INTERVAL_MS=30000 \
GIDEON_USER_DATA_DIR=/var/lib/gideon-worker \
pnpm worker:hosted:check
pnpm worker:hosted:run
```

Set `GIDEON_DEPLOYMENT_ENV=production` before `pnpm worker:hosted:check` to enable stricter production checks for `rediss://`, queue namespacing, lease/heartbeat cadence, durable paths, provider credentials, and private object storage. For containerized local smoke testing, use `docker-compose.hosted-worker.yml`; production deployments can build `Dockerfile.hosted-worker` and scale that worker service horizontally against a managed Redis/BullMQ backend. Keep the worker on a private network with no public ingress, mount durable `/data` only when using local store/artifact paths, and prefer private object storage for production artifacts. Dashboard panels and alert rules are documented in `docs/observability-alerts.md`.

Before staging promotion, run the aggregate staging gate. Dry-run mode checks the repository command and migration contract. Strict mode additionally requires production-shaped Redis, PostgreSQL, private storage, live provider canary fixtures, live upload-to-export smoke configuration, and signing/notarization environment:

```bash
pnpm staging:check
pnpm staging:check -- --strict
```

To run the deployed upload-to-export smoke against staging, set `GIDEON_STAGING_SMOKE_LIVE=true`, `GIDEON_STAGING_API_BASE_URL`, `GIDEON_AUTH_CALLBACK_SECRET`, and `GIDEON_STAGING_SMOKE_RECORDING_PATH`, then run:

```bash
pnpm staging:smoke -- --live
```

The live smoke creates a hosted session, creates a project, uploads a private recording through the signed direct-upload URL, completes recording validation, waits for analysis and render jobs, discovers a sanitized completed render ID, creates an export, and verifies the signed download URL without printing secrets or signed storage URLs.

To run every local non-credential promotion check as one command, use:

```bash
pnpm production:check
```

Use `pnpm production:check -- --dry-run` to print the exact gate plan without executing it.

To run the final live promotion sequence after staging credentials and Apple signing credentials are configured, use:

```bash
GIDEON_PRODUCTION_PROMOTION_LIVE=true pnpm production:promote:check -- --live
```

This command intentionally stays dry-run unless `--live` or `GIDEON_PRODUCTION_PROMOTION_LIVE=true` is present. The live sequence runs the local production gate, strict staging readiness, live provider canaries, live upload-to-export smoke, signed macOS packaging, production release metadata checks, and DMG verification.

Hosted state persistence is pluggable. The default remains the local private app-data JSON file for desktop and local worker runs. Production deployments can use the `pg`-backed PostgreSQL snapshot adapter by setting `GIDEON_STORE_PROVIDER=postgres_snapshot`, `GIDEON_DATABASE_URL`, and optionally `GIDEON_POSTGRES_SNAPSHOT_TABLE` / `GIDEON_POSTGRES_SNAPSHOT_ID`; `pnpm worker:hosted:check` validates this configuration before deploy. In PostgreSQL snapshot mode, store saves also mirror current users, workspaces, workspace members, projects, recording upload sessions, jobs, artifacts, usage events, and audit events into relational projections unless `GIDEON_RELATIONAL_MIRROR=false` is set during a controlled migration.

The relational migrations create queryable `gideon_users`, `gideon_workspaces`, `gideon_workspace_members`, `gideon_projects`, `gideon_recording_upload_sessions`, `gideon_jobs`, `gideon_artifacts`, `gideon_usage_events`, and `gideon_audit_events` projections while preserving full JSONB records for compatibility with the current store shape. The PostgreSQL repositories expose scoped reads for auth subjects, user workspaces, workspace membership, billing customer/subscription lookup, workspace project lists, project lookup, job status lookup, and export artifact lookup. Run `pnpm db:migrate -- --dry-run` to list migrations or `GIDEON_DATABASE_URL=postgres://... pnpm db:migrate` to apply them.

## Build a downloadable Mac app

```bash
pnpm package:mac
pnpm release:mac:check
```

The packaged `.dmg` and `.zip` artifacts are written to `release/`:

- `release/Gideon-0.1.0-arm64.dmg`
- `release/Gideon-0.1.0-arm64-mac.zip`

Local builds are unsigned unless Apple Developer ID signing credentials are configured. For local testing on a Mac, open the DMG and drag Gideon to Applications. A public internet download should be signed and notarized before release. Use `pnpm package:mac:signed` plus `GIDEON_RELEASE_CHANNEL=production pnpm release:mac:check` for production release candidates; see `docs/release-hardening.md`.

## GitHub packaging artifact

The `Build macOS app` workflow uses Node 22, installs from the lockfile, runs repository lint, production gate dry-runs, tests, typecheck, build, package, release artifact checks, and uploads the DMG/ZIP/blockmap/provenance files as workflow artifacts. After pushing to `main`, open the latest workflow run in GitHub Actions and download the Gideon macOS artifact.

## Runtime requirements

- macOS
- FFmpeg and ffprobe available on `PATH`, or at `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe`
- `/usr/bin/say` for local voiceover generation; if unavailable, Gideon renders with silent audio

## Hosted auth foundation

Gideon includes hosted-auth primitives for the future web/API service while keeping the current local desktop flow intact. `GIDEON_SESSION_SECRET` enables HMAC-signed session tokens with HttpOnly `SameSite=Lax` cookies, expiry checks, and CSRF validation. `GIDEON_SESSION_COOKIE_NAME`, `GIDEON_SESSION_DURATION_SECONDS`, and `GIDEON_SECURE_COOKIES=false` customize local/dev behavior. The hosted API foundation exposes typed handlers for `GET /api/v1/auth/session`, internal `POST /api/v1/auth/provider-callback`, CSRF-protected `POST /api/v1/auth/session/logout`, authenticated `GET/POST /api/v1/projects`, authenticated `GET /api/v1/projects/:id`, CSRF-protected `PATCH /api/v1/projects/:id/profile`, CSRF-protected `POST /api/v1/projects/:id/recordings/uploads`, CSRF-protected `POST /api/v1/projects/:id/recordings/:recordingId/complete`, CSRF-protected `POST /api/v1/projects/:id/analysis-runs`, CSRF-protected `POST /api/v1/projects/:id/render-jobs`, CSRF-protected `POST /api/v1/projects/:id/exports`, CSRF-protected `POST /api/v1/projects/:id/exports/:exportId/download-url`, CSRF-protected `POST /api/v1/workspaces/:workspaceId/billing/checkout-sessions`, CSRF-protected `POST /api/v1/workspaces/:workspaceId/billing/portal-sessions`, authenticated `GET /api/v1/jobs/:id`, CSRF-protected `POST /api/v1/jobs/:id/cancel`, CSRF-protected `POST /api/v1/jobs/:id/retry`, and verified `POST /api/v1/webhooks/stripe`. Auth provider callbacks must include `GIDEON_AUTH_CALLBACK_SECRET`; they sync the provider subject through the store, create or update the user, create a default owner workspace when needed, switch the active workspace, and record an `auth.user.sync` audit event.

## Optional AI provider configuration

Gideon runs without paid provider credentials using deterministic local fallbacks. To enable provider-backed semantic analysis, transcription, and TTS, launch the app with:

```bash
OPENAI_API_KEY=sk-... pnpm start
```

Supported provider variables:

- `OPENAI_API_KEY` or `GIDEON_OPENAI_API_KEY`
- `GIDEON_OPENAI_BASE_URL`, default `https://api.openai.com/v1`
- `GIDEON_OPENAI_LLM_MODEL`, default `gpt-5.1`
- `GIDEON_OPENAI_TRANSCRIPTION_MODEL`, default `gpt-4o-transcribe`
- `GIDEON_OPENAI_TTS_MODEL`, default `gpt-4o-mini-tts`
- `GIDEON_OPENAI_TTS_VOICE`, default `coral`

Check provider readiness safely without making live calls:

```bash
pnpm provider:canary -- --dry-run
```

To run live provider smoke checks, explicitly opt in and provide credentials. ASR and OCR live checks require small staging fixtures:

```bash
GIDEON_PROVIDER_CANARY_LIVE=true \
GIDEON_OPENAI_API_KEY=sk-... \
GIDEON_PROVIDER_CANARY_AUDIO_PATH=/path/to/small.wav \
GIDEON_PROVIDER_CANARY_IMAGE_PATH=/path/to/screenshot.png \
pnpm provider:canary -- --live
```

Provider outputs are treated as untrusted until parsed and validated. If a provider call fails, Gideon records a safe provider-run error and falls back to the local path where possible. Successful provider TTS output is stored as a private `voiceover` artifact before rendering. Completed render MP4s are imported into private storage as `render` artifacts. User exports create private `export` artifacts before copying to the selected destination, so rendered and exported media stay attached to the project and counted against storage quota.

## Local billing and quota controls

Workspace owners/admins can change a workspace between the local MVP, starter, team, and enterprise plan definitions from the sidebar. These plan definitions update the workspace entitlements used by quota checks for source minutes, transcription minutes, AI runs, TTS characters, render minutes, storage, exports, and project count. This is a provider-neutral billing foundation: hosted checkout and customer portal session routes enforce session workspace scope, CSRF, and billing-manager authorization, then a Stripe REST adapter can create provider sessions when configured. Invoices, tax settings, product catalog operations, and production reconciliation still need a deployed billing-provider setup before hosted production use.

The billing provider foundation includes Stripe-style webhook signature verification, subscription-event normalization, checkout session creation, and customer portal session creation. Hosted dependency creation auto-wires the Stripe billing adapter when `GIDEON_BILLING_PROVIDER=stripe` and `STRIPE_SECRET_KEY` or `GIDEON_STRIPE_SECRET_KEY` are present. Also set `STRIPE_WEBHOOK_SECRET` or `GIDEON_STRIPE_WEBHOOK_SECRET`, and price IDs with `GIDEON_STRIPE_STARTER_PRICE_ID`, `GIDEON_STRIPE_TEAM_PRICE_ID`, and `GIDEON_STRIPE_ENTERPRISE_PRICE_ID`. `GIDEON_STRIPE_API_BASE_URL` can point tests or private deployments at a Stripe-compatible API base; it defaults to `https://api.stripe.com`. Billing webhooks are idempotent by provider event ID and update workspace plan/status, provider customer/subscription IDs, entitlements, and audit history.

## Local worker queue controls

Gideon runs analysis and render work through a local worker queue. By default it runs one job at a time. For local stress testing you can raise the global queue limit and optionally cap specific job kinds:

```bash
GIDEON_QUEUE_CONCURRENCY=2 \
GIDEON_ANALYSIS_QUEUE_CONCURRENCY=1 \
GIDEON_RENDER_QUEUE_CONCURRENCY=1 \
pnpm start
```

The runtime panel shows active/pending queue counts and configured lanes. Hosted dependency creation can auto-wire a signed HTTP worker-queue handoff when `GIDEON_HOSTED_QUEUE_URL` or `GIDEON_WORKER_QUEUE_URL` is paired with `GIDEON_HOSTED_QUEUE_SECRET` or `GIDEON_WORKER_QUEUE_SECRET`; hosted analysis/render job routes then POST signed enqueue messages to that endpoint. Set `GIDEON_HOSTED_QUEUE_PROVIDER=memory` or `GIDEON_WORKER_QUEUE_PROVIDER=memory` to auto-wire the in-memory broker-backed queue service instead. Set `GIDEON_HOSTED_QUEUE_PROVIDER=bullmq` or `GIDEON_WORKER_QUEUE_PROVIDER=bullmq` with `GIDEON_REDIS_URL` or `REDIS_URL` to use the Redis-backed BullMQ broker; `GIDEON_BULLMQ_QUEUE_NAME` and `GIDEON_BULLMQ_PREFIX` customize queue naming and key prefixes. The shared queue module verifies signed worker-intake requests with timestamp tolerance and payload validation, dispatches verified analysis/render jobs through a worker dispatcher interface, and exposes an HTTP/Node handler that returns safe JSON responses. Worker intake can coordinate persisted job lease claims, heartbeat renewal, dispatch-failure marking, and expired-lease recovery through the store layer. A hosted worker runtime adapter can detach accepted jobs into the local queue, heartbeat during execution, map execution failures back to the owning lease, and expose queue stats. Hosted job enqueues can also target the broker interface through either the in-memory broker or the BullMQ broker; `pnpm test:redis` runs an optional real-Redis BullMQ smoke test when `GIDEON_REDIS_URL` or `REDIS_URL` is configured. The hosted worker process can be run with `pnpm worker:hosted` for local build-and-run, or `pnpm worker:hosted:run` when the built `dist` artifact already exists; `pnpm worker:hosted:check` validates required deployment environment and production hardening when `GIDEON_DEPLOYMENT_ENV=production`. It composes the configured broker, store-backed lease coordinator, shared `createGideonJobExecutor` adapter, safe JSON error logs, and structured metrics for worker start/stop, job start/success/failure duration, analysis pipeline duration, TTS latency, render duration, private artifact storage latency/bytes, usage records, and persisted job observability snapshots. Desktop queue jobs and MCP-enqueued jobs use the same adapter before calling analysis/render execution. Snapshots include active/queued/running counts, queue age, expired leases, recovered lease failures, failed/retryable jobs, and terminal failure rate; `src/main/observability.ts` defines alert rules for queue age, lease recovery, terminal failures, provider TTS latency/failures, and private storage latency/failures. `GIDEON_WORKER_ID`, `GIDEON_WORKER_LEASE_SECONDS`, `GIDEON_WORKER_HEARTBEAT_INTERVAL_MS`, `GIDEON_USER_DATA_DIR`, `GIDEON_STORE_PATH`, `GIDEON_PROJECTS_DIR`, and `GIDEON_STORAGE_ROOT` control worker identity, lease cadence, and local store/artifact paths. Production still needs deployed Redis operations and release hardening.

## Optional private cloud storage

By default, Gideon imports recordings into a private local app-data folder. To upload imported recordings to S3-compatible private object storage while keeping a local processing cache, launch with:

```bash
GIDEON_STORAGE_PROVIDER=r2 \
GIDEON_STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
GIDEON_STORAGE_BUCKET=gideon-private \
GIDEON_STORAGE_REGION=auto \
GIDEON_STORAGE_ACCESS_KEY_ID=... \
GIDEON_STORAGE_SECRET_ACCESS_KEY=... \
pnpm start
```

Use `GIDEON_STORAGE_PROVIDER=s3` for AWS/S3-compatible storage, or omit it for local private storage. Gideon signs uploads with AWS Signature V4 and stores objects under workspace/project-prefixed keys. When cloud storage is configured, the recording panel can create short-lived presigned PUT sessions, upload the selected recording directly to object storage, then ask the trusted app process to download the private object into its processing cache, validate/probe it, attach it as the active recording, and meter usage. Your bucket must allow CORS PUT requests from the packaged app/runtime origin for the browser-side upload step.

## Codex/Claude MCP control without Gideon API keys

Gideon also exposes a local MCP server so Codex, Claude Code, or another MCP client can inspect projects, make bounded script/moment edits, and enqueue app jobs using the agent's own model credentials. Gideon does not need provider API keys for this path. This is modeled after Palmier-style agent control: the coding agent discusses intent with the user, inspects Gideon through MCP tools, applies explicit bounded edits, and asks Gideon to run analysis or render work through the app’s own queue/executor boundary.

```bash
pnpm build:mcp
pnpm mcp:server
```

When the desktop app is running, MCP tools use the local control socket and route edits through Gideon's store, RBAC policy, worker queue, and audit trail. If the app is closed, safe direct-store copy edits remain available through `GIDEON_STORE_PATH`.
