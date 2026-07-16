# Capture autonomy Phase 9 evidence

Date: 2026-07-16

## Locally verified

`pnpm test:infrastructure` creates private temporary PostgreSQL 16 and Redis 8 instances on loopback, applies all five migrations from an empty database, runs the selected Vitest suite, stops both services, removes their data directories, and writes a mode-0600 redacted JSON report under ignored `tmp/` storage.

The passing 26-test run proves workspace-scoped PostgreSQL reads/deletes, concurrent idempotent capture-run/job convergence, transaction rollback on a failed write, immutable usage deduplication without cross-workspace collision, project capture graph/object/secret cleanup, real BullMQ duplicate suppression and bounded retry, durable queued work after broker-client interruption, pending cancellation, lease recovery/claim/heartbeat/safe failure recording, queue drain, authorized short-lived capture preview signing, S3-compatible signed PUT/GET/DELETE behavior through a loopback fixture, retention/legal-hold planning, missing/orphan detection, and verified infrastructure teardown.

Two defects were discovered and fixed by the production-like run: PostgreSQL JSONB key reordering caused false immutable-flow mismatches until comparison switched to canonical serialization; lease error persistence allowed `password=...` diagnostics until it was routed through the shared privacy redactor.

## Verification record

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:infrastructure`: seven files and 26 tests passed; five migrations applied; teardown verified.
- `pnpm test:capture`: 59 files and 210 tests passed.
- `pnpm test`: 124 files passed and two environment-gated files skipped; 616 tests passed and eight environment-gated tests skipped.
- `pnpm test:web`: three files and nine tests passed.
- `pnpm test:e2e`: two Chromium journeys passed.
- `pnpm build`: Electron main/renderer, MCP, and hosted Next.js builds passed.

## Exact limitations

The object-store exercise is an in-process S3-compatible HTTP fixture, not MinIO or a cloud bucket. Redis client interruption and worker failure are exercised; full Redis/PostgreSQL daemon crash, replication, failover, disk exhaustion, and network partition require a staging topology. Durable cleanup tasks and reconciliation plans exist, but a deployed cleanup retry worker and provider inventory adapter remain deployment work. Formal multi-tenant penetration testing and production load/fairness validation remain external.
