# Phase 12 local evidence — observability, load, cost, and incidents

Date: 2026-07-16

## Local automated result

- `pnpm capture:operations:check`: passed; private mode-`0600` report covered all nine operation stages, nine planning SLOs, nine alert rules, 32 synthetic projects at concurrency four, 31 completed projects, one deliberately runaway task terminated, deterministic estimated cost of USD 0.726414, six contained incident receipts, and zero paid provider calls.
- Capture operation unit/CLI tests: 10 passed, including secret-shaped dimension rejection, exception-text omission, exporter fail-open behavior, met/missed/no-data SLOs, firing/no-data alerts, dashboard/rule linkage, deterministic cost, concurrency/fairness/runaway behavior, incident containment, artifact suppression, and private-report permissions.
- `pnpm test:capture`: 63 files and 224 tests passed.
- `pnpm test:infrastructure`: 7 files and 26 tests passed after applying all five migrations to disposable PostgreSQL and exercising disposable Redis/BullMQ plus an in-process S3-compatible lifecycle fixture; teardown was verified.
- `pnpm test`: 128 files passed, 2 skipped; 632 tests passed, 8 skipped.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed for main, renderer, MCP, and hosted web.
- `pnpm build`: Electron main/renderer, MCP, and hosted Next.js production builds passed.
- `pnpm test:web`: 3 files and 9 tests passed.
- `pnpm production:observability:check -- --dry-run`: passed and enumerated the required production metric, dashboard, runbook, alert-route, paging, and threshold configuration.

## What the evidence establishes

- A content-free, runtime-validated telemetry boundary exists for environment validation, discovery, queue, capture, retry, render, storage, deletion, and runtime teardown.
- Initial rolling planning SLOs and executable alert rules are checked in with a provider-neutral dashboard definition and incident runbook.
- The local scheduler exercise respects its concurrency limit, preserves FIFO start order, and terminates deliberately over-time work.
- Safe state models cover worker failure, queue loss, database outage, storage outage, deletion failure, and teardown failure without duplicate usage; unsafe publication is suppressed where required.
- Cost estimation is versioned, deterministic integer micro-USD math and cannot make provider calls.

## Honest boundary

Timer-based synthetic work is not a browser/media throughput benchmark. State simulations plus disposable local PostgreSQL/Redis/S3-compatible fixtures are not managed-cloud failover evidence. The checked-in dashboard and alert definitions are not proof of production metric export or paging. Real worker saturation, sustained/soak load, multi-tenant fairness, regional/provider failure, cloud IAM and lifecycle behavior, runtime cleanup, measured vendor cost, SLO calibration, and human incident response remain staging/production gates.
