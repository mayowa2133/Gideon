# Gideon production-readiness audit

Last updated: 2026-06-29

This audit maps the original full-product gaps to the current implementation evidence and the remaining production work. It is intentionally evidence-based: a capability is counted only when there is code, documentation, or a verification command that demonstrates the path.

## Executive summary

Gideon is no longer only a local deterministic desktop prototype. The repository now contains the local upload-to-export loop, provider-neutral AI/media boundaries, OpenAI-backed analysis/TTS adapters, private artifact storage, local and hosted job execution, MCP agent control for Codex/Claude Code without Gideon-held model API keys, workspace/team/billing foundations, hosted direct-upload and download primitives, signed queue handoff, BullMQ-backed hosted worker infrastructure, observability snapshots/alerts, and macOS release provenance checks.

The remaining production gap is narrower and mostly operational: replace local JSON-backed hosted state with production database-backed persistence, run Redis/BullMQ and object storage as managed production services, complete deployment/release operations, and execute a final end-to-end production smoke with real infrastructure. Social posting, scheduling, avatar generation, and voice cloning remain explicit post-MVP items.

Current engineering estimate: **99% complete** toward the full original product vision.

## Capability audit

| Original gap | Current status | Evidence | Remaining production work |
| --- | --- | --- | --- |
| Local upload-to-export loop | Implemented | Desktop app accepts walkthrough recordings, stores project artifacts, detects moments, generates scripts, renders vertical drafts, and packages macOS builds. See `src/main/main.ts`, `src/main/store.ts`, `src/main/render.ts`, `src/renderer/App.tsx`, and `pnpm package:mac`. | Run final signed/notarized release candidate and production install smoke. |
| Real AI/LLM semantic analysis | Implemented behind provider boundary | `src/main/providers/openai.ts`, `src/main/analysisPipeline.ts`, `src/main/jobExecutor.ts`, and tests in `src/main/providers/openai.test.ts` / `src/main/analysisPipeline.test.ts` validate structured provider parsing, fallback behavior, and executor handoff. | Production canary with real provider credentials, model/cost limits, and prompt/version rollout controls. |
| Transcription / ASR from recordings | Partially implemented as an adapter boundary | The architecture and roadmap require provider-neutral ASR. Provider config and job boundaries exist, but production ASR is not yet a fully independent hosted worker lane. | Add the production ASR provider implementation, media extraction fixture tests, and worker lane separation for ASR-heavy jobs. |
| OCR / UI understanding | Partially implemented as evidence model and prompt boundary | `docs/productionization-roadmap.md`, `docs/technical-spec.md`, and analysis pipeline tests document transcript/frame/OCR evidence handling and prompt-injection treatment. | Add production OCR provider or local OCR integration, persist frame-level OCR evidence, and add noisy/prompt-injection OCR fixtures. |
| Cloud auth, workspaces, teams, RBAC, billing, quotas | Implemented as foundations | `src/main/auth.ts`, `src/shared/rbac.ts`, `src/main/billing.ts`, `src/shared/usage.ts`, `src/main/hostedApi.ts`, and related tests cover roles, hosted API boundaries, billing-session wiring, usage records, and quota foundations. `src/main/persistence.ts` adds a pluggable app-state persistence boundary plus a `pg`-backed PostgreSQL snapshot adapter, `src/main/hostedWorkerProcess.ts` wires it from `GIDEON_STORE_PROVIDER=postgres_snapshot`, `migrations/0001_hosted_jobs_artifacts.sql` / `migrations/0002_usage_audit_events.sql` start the relational hosted schema, and `GideonStore` mirrors live jobs, artifacts, usage, and audit records into those projections after successful saves. | Complete relational repositories for projects and billing webhook reconciliation before public paid launch. |
| Direct-to-cloud uploads and private object storage | Implemented as primitives | `src/main/storage.ts`, `src/main/store.ts`, `src/main/hostedApi.ts`, `src/main/storage.test.ts`, and API docs cover direct upload sessions, private artifact records, signed downloads, and non-public storage behavior. | Replace local storage paths with production S3-compatible storage in hosted deployments and complete deletion/lifecycle policies. |
| Async queues and hosted workers | Implemented through local, memory, HTTP, and BullMQ paths | `src/main/jobQueue.ts`, `src/main/hostedWorker.ts`, `src/main/hostedWorkerProcess.ts`, `src/main/jobExecutorAdapter.ts`, `src/main/postgresJobArtifactRepository.ts`, `src/main/postgresUsageAuditRepository.ts`, `Dockerfile.hosted-worker`, `docker-compose.hosted-worker.yml`, `scripts/check-hosted-worker-config.mjs`, and `src/main/jobQueue.redis.test.ts` prove the queue, signed intake, leases, heartbeat, recovery, worker process, Redis smoke path, hosted persistence preflight, PostgreSQL store selection, live relational mirroring, and relational jobs/artifacts/usage/audit projections. | Operate managed Redis/BullMQ and PostgreSQL in staging/production, tune concurrency/retention, and add infrastructure-level dashboards. |
| Provider-backed TTS | Implemented behind provider boundary | `src/main/jobExecutor.ts` creates the speech provider through the same provider config as analysis; worker metrics include provider TTS latency/failure. | Production voice selection, provider quota controls, and audio artifact retention policy. |
| Stage-level retry/cancel jobs | Implemented for the current job model | `src/main/jobQueue.ts`, `src/main/store.ts`, and `src/main/jobQueue.test.ts` cover job states, retryability, canceling, leases, heartbeats, expired lease recovery, and safe failure mapping. | Extend stage-specific worker lanes as ASR/OCR become fully hosted services. |
| Observability and safe operations | Implemented for hosted workers | `src/main/observability.ts`, `docs/observability-alerts.md`, `docs/hosted-worker-deployment.md`, and worker process tests cover metrics, alert rules, safe summaries, and deployment checks. | Connect emitted metrics to production observability backend and define paging thresholds after staging load tests. |
| macOS packaging and release provenance | Implemented for unsigned local builds and preflighted production candidates | `package.json`, `scripts/check-macos-release.mjs`, `src/main/macosReleaseCheck.test.ts`, `docs/release-hardening.md`, and the release workflow validate DMG/ZIP metadata, checksums, provenance, signing/notarization env, and production release preflight. | Run Apple Developer ID signing/notarization with production credentials and publish the first release artifact. |
| Codex/Claude Code MCP control without Gideon API keys | Implemented as a first-class path | `src/mcp/server.ts`, `src/mcp/server.test.ts`, `docs/mcp-agent-control.md`, `docs/implementation-plan.md`, and README document Palmier-style MCP tools for project inspection, bounded script/moment edits, audit events, and analysis/render enqueueing. The agent supplies model reasoning; Gideon does not require LLM provider API keys for this control path. | Harden hosted MCP mode through the authoritative hosted service layer before exposing remote/enterprise MCP access. |
| Human approval gates | Preserved | Product docs and UI flow keep users in control of reviewing moments, scripts, and generated outputs before export. MCP mutations are bounded and audited. | Add stronger hosted revision/conflict handling during collaborative review. |
| Social posting, scheduling, analytics | Out of MVP by design | `AGENTS.md` and `docs/productionization-roadmap.md` explicitly defer publishing and social automation. | Revisit only after the evidence-to-render loop is production-grade and explicitly approved. |
| Avatar generation, voice cloning | Out of MVP by design | `AGENTS.md`, `docs/security-rules.md`, and roadmap constraints exclude avatar generation and voice cloning without explicit instruction. | Requires separate consent, anti-impersonation, safety, and legal review before implementation. |

## Verification commands

Run these from the repository root before promoting a production-readiness slice:

```bash
pnpm typecheck
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
GIDEON_BULLMQ_QUEUE_NAME=gideon-prod-workers \
GIDEON_BULLMQ_PREFIX=gideon-prod \
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
pnpm package:mac
pnpm release:mac:check
hdiutil verify release/Gideon-0.1.0-arm64.dmg
git diff --check
```

`pnpm lint` should also be added to the gate once a lint script exists.

## Go-live blockers

1. Production database-backed hosted persistence is partly closed by the pluggable persistence boundary, hosted-worker PostgreSQL snapshot wiring, and live relational mirroring for jobs, artifacts, usage, and audit records; remaining work is project/billing relational expansion and staging operation.
2. Managed Redis/BullMQ operations with production retention, concurrency, retry, and dead-letter policies.
3. Production object storage credentials, lifecycle/deletion policies, and signed-download smoke tests.
4. Real provider canary runs for analysis, ASR/OCR where configured, and TTS with cost ceilings.
5. Signed and notarized macOS release artifact, plus production release provenance.
6. End-to-end staging smoke from upload to private export package using production-shaped infrastructure.

## Next engineering slice

The next slice should add provider canary smoke tests for ASR/OCR/TTS/analysis or add project/billing relational expansion while keeping desktop and MCP compatibility intact.
