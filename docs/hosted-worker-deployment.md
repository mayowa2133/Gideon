# Hosted worker deployment

Gideon’s hosted worker is the separately scaled process that consumes BullMQ jobs and runs analysis/render work outside request handling. It is designed for private network deployment with no public ingress.

## Deployable artifact

- Container: `Dockerfile.hosted-worker`
- Local compose smoke: `docker-compose.hosted-worker.yml`
- Runtime entrypoint: `pnpm worker:hosted:run`
- Local build-and-run entrypoint: `pnpm worker:hosted`
- Preflight check: `pnpm worker:hosted:check`

The container installs FFmpeg for media probing/extraction/render support, builds `tsconfig.main.json`, installs production dependencies, and runs `dist/main/main/hostedWorkerProcess.js` as the unprivileged `node` user. `/data` is the default writable volume for local store/artifact paths.

## Required production environment

```bash
GIDEON_DEPLOYMENT_ENV=production
GIDEON_HOSTED_QUEUE_PROVIDER=bullmq
GIDEON_REDIS_URL=rediss://...
GIDEON_BULLMQ_QUEUE_NAME=gideon-prod-workers
GIDEON_BULLMQ_PREFIX=gideon-prod
GIDEON_BULLMQ_CONCURRENCY=4
GIDEON_BULLMQ_ATTEMPTS=3
GIDEON_BULLMQ_BACKOFF_TYPE=exponential
GIDEON_BULLMQ_BACKOFF_DELAY_MS=5000
GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT=1000
GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT=5000
GIDEON_BULLMQ_DEAD_LETTER_POLICY=retain_failed
GIDEON_WORKER_ID=worker-media-1
GIDEON_WORKER_LEASE_SECONDS=300
GIDEON_WORKER_HEARTBEAT_INTERVAL_MS=30000
GIDEON_STORE_PROVIDER=postgres_snapshot
GIDEON_DATABASE_URL=postgres://...?...sslmode=require
GIDEON_DATABASE_POOL_MAX=10
GIDEON_DATABASE_STATEMENT_TIMEOUT_MS=30000
GIDEON_DATABASE_IDLE_TIMEOUT_MS=30000
GIDEON_POSTGRES_BACKUP_RETENTION_DAYS=30
GIDEON_POSTGRES_PITR_ENABLED=true
GIDEON_POSTGRES_RESTORE_DRILL_AT=<recent-restore-drill-iso>
GIDEON_POSTGRES_RESTORE_DRILL_MAX_AGE_DAYS=90
GIDEON_POSTGRES_MIGRATION_POLICY=predeploy_migrate
GIDEON_POSTGRES_SNAPSHOT_TABLE=gideon_app_state_snapshots
GIDEON_POSTGRES_SNAPSHOT_ID=production
GIDEON_PROJECTS_DIR=/data/projects
GIDEON_STORAGE_ROOT=/data/storage
GIDEON_STORAGE_PROVIDER=s3
GIDEON_STORAGE_BUCKET=gideon-private-prod
GIDEON_STORAGE_ACCESS_KEY_ID=...
GIDEON_STORAGE_SECRET_ACCESS_KEY=...
GIDEON_OPENAI_API_KEY=...
```

Use `GIDEON_BULLMQ_QUEUE_NAME` and `GIDEON_BULLMQ_PREFIX` to isolate preview, staging, and production queues. Use `GIDEON_BULLMQ_CONCURRENCY`, `GIDEON_BULLMQ_ATTEMPTS`, `GIDEON_BULLMQ_BACKOFF_TYPE`, `GIDEON_BULLMQ_BACKOFF_DELAY_MS`, `GIDEON_BULLMQ_REMOVE_ON_COMPLETE_COUNT`, `GIDEON_BULLMQ_REMOVE_ON_FAIL_COUNT`, and `GIDEON_BULLMQ_DEAD_LETTER_POLICY=retain_failed` to make worker concurrency, retry/backoff, completed retention, and failed-job retention explicit per environment. Use `GIDEON_STORE_PROVIDER=postgres_snapshot` plus a TLS-enabled PostgreSQL URL for hosted app state; the hosted worker creates a `pg` connection pool, persists app-state snapshots, and closes the pool on worker shutdown. Use the database policy variables to make pool size, statement/idle timeout, backup retention, PITR, restore-drill recency, and predeploy migration behavior explicit before production promotion. Use private object storage variables from the README for production media/artifacts instead of relying on container-local storage.

Run migrations before starting a worker against a new database:

```bash
GIDEON_DATABASE_URL=postgres://...?...sslmode=require pnpm db:migrate
```

The migrations create relational `gideon_users`, `gideon_workspaces`, `gideon_workspace_members`, `gideon_projects`, `gideon_recording_upload_sessions`, `gideon_jobs`, `gideon_artifacts`, `gideon_usage_events`, and `gideon_audit_events` projections used by `src/main/postgresCoreRepository.ts`, `src/main/postgresJobArtifactRepository.ts`, and `src/main/postgresUsageAuditRepository.ts`.

When `GIDEON_STORE_PROVIDER=postgres_snapshot`, the hosted worker also mirrors current users, workspaces, workspace members, projects, recording upload sessions, jobs, artifacts, usage events, and audit events into those relational tables after successful store saves. Set `GIDEON_RELATIONAL_MIRROR=false` only during controlled migration windows where the relational projections are intentionally unavailable.

## Preflight

Run the preflight before starting a deployed worker:

```bash
pnpm worker:hosted:check
pnpm production:db:check
pnpm production:queue:check
pnpm production:observability:check
```

The check fails on missing BullMQ/Redis/lease identity configuration and warns when optional provider-backed AI, storage, or web-session settings are absent. With `GIDEON_DEPLOYMENT_ENV=production`, it also fails on:

- non-`rediss://` Redis unless `GIDEON_ALLOW_INSECURE_REDIS=true` is explicitly set;
- missing `GIDEON_BULLMQ_QUEUE_NAME` or `GIDEON_BULLMQ_PREFIX`;
- missing or invalid BullMQ concurrency, retry/backoff, retention, or `retain_failed` dead-letter policy when running `pnpm production:queue:check`;
- missing or invalid observability backend, dashboard, runbook, alert route, paging, or alert thresholds when running `pnpm production:observability:check`;
- missing PostgreSQL database settings when `GIDEON_STORE_PROVIDER=postgres_snapshot`;
- missing or invalid PostgreSQL pool, timeout, backup retention, PITR, restore-drill, or predeploy migration policy when running `pnpm production:db:check`;
- local file-backed app state unless `GIDEON_ALLOW_LOCAL_PRODUCTION_STORE=true` is explicitly set;
- PostgreSQL database URLs without `sslmode=require` unless `GIDEON_ALLOW_INSECURE_DATABASE=true` is explicitly set;
- heartbeat intervals greater than or equal to the lease duration;
- local-only artifact storage unless `GIDEON_ALLOW_LOCAL_PRODUCTION_STORAGE=true` is explicitly set;
- missing provider credentials unless `GIDEON_ALLOW_NO_PROVIDER_KEYS=true` is explicitly set;
- worker store/project/storage paths under `/tmp`.

The allow flags are intended for controlled private deployments only; do not use them for customer production.

## Local container smoke

```bash
docker compose -f docker-compose.hosted-worker.yml up --build
```

This starts Redis and one hosted worker using the same BullMQ provider path as production. It is intended for infrastructure smoke tests, not for storing customer media.

## Scaling and isolation

- Scale worker replicas horizontally against the same Redis queue.
- Keep `GIDEON_BULLMQ_CONCURRENCY` below provider/storage throughput limits and raise it only after staging load tests.
- Give each replica a unique `GIDEON_WORKER_ID`.
- Use environment-specific queue names and Redis prefixes for preview, staging, and production.
- Keep failed-job retention greater than or equal to completed-job retention so production incidents remain inspectable.
- Prefer managed Redis with TLS (`rediss://`) and persistence enabled.
- Prefer managed PostgreSQL with TLS, encrypted backups, PITR, and a restore drill within the configured maximum age.
- Keep worker instances off public ingress.
- Use separate runtime identities from any web/API service.
- Restrict egress to Redis, PostgreSQL, private storage, provider APIs, and any future database service.
- Export JSON logs to the observability backend; alert on oldest queued age, expired leases, recovered lease failures, terminal failure rate, provider failures, and storage failures. `pnpm production:observability:check` verifies the backend, dashboard, runbook, paging route, and threshold contract before promotion. See [observability-alerts.md](./observability-alerts.md).
