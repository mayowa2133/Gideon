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
GIDEON_HOSTED_QUEUE_PROVIDER=bullmq
GIDEON_REDIS_URL=rediss://...
GIDEON_WORKER_ID=worker-media-1
GIDEON_WORKER_LEASE_SECONDS=300
GIDEON_WORKER_HEARTBEAT_INTERVAL_MS=30000
GIDEON_USER_DATA_DIR=/data
GIDEON_STORE_PATH=/data/store.json
GIDEON_PROJECTS_DIR=/data/projects
GIDEON_STORAGE_ROOT=/data/storage
```

Use `GIDEON_BULLMQ_QUEUE_NAME` and `GIDEON_BULLMQ_PREFIX` to isolate preview, staging, and production queues. Use private object storage variables from the README for production media/artifacts instead of relying on container-local storage.

## Preflight

Run the preflight before starting a deployed worker:

```bash
pnpm worker:hosted:check
```

The check fails on missing BullMQ/Redis/lease identity configuration and warns when optional provider-backed AI, storage, or web-session settings are absent.

## Local container smoke

```bash
docker compose -f docker-compose.hosted-worker.yml up --build
```

This starts Redis and one hosted worker using the same BullMQ provider path as production. It is intended for infrastructure smoke tests, not for storing customer media.

## Scaling and isolation

- Scale worker replicas horizontally against the same Redis queue.
- Give each replica a unique `GIDEON_WORKER_ID`.
- Keep worker instances off public ingress.
- Use separate runtime identities from any web/API service.
- Restrict egress to Redis, private storage, provider APIs, and any future database service.
- Export JSON logs to the observability backend; alert on oldest queued age, expired leases, recovered lease failures, terminal failure rate, provider failures, and storage failures. See [observability-alerts.md](./observability-alerts.md).
