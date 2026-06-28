# Gideon

Gideon is a macOS desktop app that turns a product walkthrough recording into editable short-form video drafts.

## Implementation progress

Current engineering estimate: **67% complete** toward the full original product vision.

This estimate is intentionally conservative. Gideon has the local upload-to-export loop, provider-neutral AI/media adapters, private artifact storage, local queue controls, MCP control for Codex/Claude Code without Gideon API keys, workspace/team/billing foundations, hosted direct-upload completion, and hosted analysis/render job enqueue primitives in place. Remaining work is mainly production-hosted persistence, hosted export API coverage, hosted checkout/customer portal flows, distributed workers, observability, deployment hardening, and later non-MVP expansion items.

## Local development

Use the bundled Codex runtime or any local Node.js 22+ environment.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Build a downloadable Mac app

```bash
pnpm package:mac
```

The packaged `.dmg` and `.zip` artifacts are written to `release/`:

- `release/Gideon-0.1.0-arm64.dmg`
- `release/Gideon-0.1.0-arm64-mac.zip`

Local builds are unsigned unless Apple Developer ID signing credentials are configured. For local testing on a Mac, open the DMG and drag Gideon to Applications. A public internet download should be signed and notarized before release.

## GitHub packaging artifact

The `Build macOS app` workflow builds the app on macOS and uploads the DMG/ZIP as workflow artifacts. After pushing to `main`, open the latest workflow run in GitHub Actions and download the Gideon macOS artifact.

## Runtime requirements

- macOS
- FFmpeg and ffprobe available on `PATH`, or at `/opt/homebrew/bin/ffmpeg` and `/opt/homebrew/bin/ffprobe`
- `/usr/bin/say` for local voiceover generation; if unavailable, Gideon renders with silent audio

## Hosted auth foundation

Gideon includes hosted-auth primitives for the future web/API service while keeping the current local desktop flow intact. `GIDEON_SESSION_SECRET` enables HMAC-signed session tokens with HttpOnly `SameSite=Lax` cookies, expiry checks, and CSRF validation. `GIDEON_SESSION_COOKIE_NAME`, `GIDEON_SESSION_DURATION_SECONDS`, and `GIDEON_SECURE_COOKIES=false` customize local/dev behavior. The hosted API foundation exposes typed handlers for `GET /api/v1/auth/session`, internal `POST /api/v1/auth/provider-callback`, CSRF-protected `POST /api/v1/auth/session/logout`, authenticated `GET/POST /api/v1/projects`, authenticated `GET /api/v1/projects/:id`, CSRF-protected `PATCH /api/v1/projects/:id/profile`, CSRF-protected `POST /api/v1/projects/:id/recordings/uploads`, CSRF-protected `POST /api/v1/projects/:id/recordings/:recordingId/complete`, CSRF-protected `POST /api/v1/projects/:id/analysis-runs`, CSRF-protected `POST /api/v1/projects/:id/render-jobs`, authenticated `GET /api/v1/jobs/:id`, CSRF-protected `POST /api/v1/jobs/:id/cancel`, CSRF-protected `POST /api/v1/jobs/:id/retry`, and verified `POST /api/v1/webhooks/stripe`. Auth provider callbacks must include `GIDEON_AUTH_CALLBACK_SECRET`; they sync the provider subject through the store, create or update the user, create a default owner workspace when needed, switch the active workspace, and record an `auth.user.sync` audit event.

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

Provider outputs are treated as untrusted until parsed and validated. If a provider call fails, Gideon records a safe provider-run error and falls back to the local path where possible. Successful provider TTS output is stored as a private `voiceover` artifact before rendering. Completed render MP4s are imported into private storage as `render` artifacts. User exports create private `export` artifacts before copying to the selected destination, so rendered and exported media stay attached to the project and counted against storage quota.

## Local billing and quota controls

Workspace owners/admins can change a workspace between the local MVP, starter, team, and enterprise plan definitions from the sidebar. These plan definitions update the workspace entitlements used by quota checks for source minutes, transcription minutes, AI runs, TTS characters, render minutes, storage, exports, and project count. This is a provider-neutral billing foundation: checkout, invoices, customer portals, and webhook reconciliation still need a real billing provider before hosted production use.

The billing provider foundation includes Stripe-style webhook signature verification and subscription-event normalization. Hosted webhook handlers should verify the raw request body with `STRIPE_WEBHOOK_SECRET` or `GIDEON_STRIPE_WEBHOOK_SECRET`, map price IDs with `GIDEON_STRIPE_STARTER_PRICE_ID`, `GIDEON_STRIPE_TEAM_PRICE_ID`, and `GIDEON_STRIPE_ENTERPRISE_PRICE_ID`, then apply the normalized subscription event to the workspace. Billing webhooks are idempotent by provider event ID and update workspace plan/status, provider customer/subscription IDs, entitlements, and audit history.

## Local worker queue controls

Gideon runs analysis and render work through a local worker queue. By default it runs one job at a time. For local stress testing you can raise the global queue limit and optionally cap specific job kinds:

```bash
GIDEON_QUEUE_CONCURRENCY=2 \
GIDEON_ANALYSIS_QUEUE_CONCURRENCY=1 \
GIDEON_RENDER_QUEUE_CONCURRENCY=1 \
pnpm start
```

The runtime panel shows active/pending queue counts and configured lanes. This is still a local queue; Redis/BullMQ-style distributed workers remain a productionization step.

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

Gideon also exposes a local MCP server so Codex, Claude Code, or another MCP client can inspect projects, make bounded script/moment edits, and enqueue app jobs using the agent's own model credentials. Gideon does not need provider API keys for this path.

```bash
pnpm build:mcp
pnpm mcp:server
```

When the desktop app is running, MCP tools use the local control socket and route edits through Gideon's store, RBAC policy, worker queue, and audit trail. If the app is closed, safe direct-store copy edits remain available through `GIDEON_STORE_PATH`.
