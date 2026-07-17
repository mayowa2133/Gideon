# Structured capture operational readiness

Status: locally executable planning and failure-model evidence. This is not a production capacity certification.

`pnpm capture:operations:check` builds the main process and writes a private report to `tmp/capture-operations/readiness-report.json`. The report is mode `0600`, contains no media paths or product content, and makes no paid provider calls.

## Safe telemetry contract

Every capture operation metric uses `schemaVersion: 1`, event name `capture_operation`, and these bounded fields only:

- correlation, workspace, and project IDs;
- stage and terminal outcome;
- timestamp, duration, queue delay, and attempt;
- a bounded safe error code for failures.

The nine stages are environment validation, discovery, queue, capture, retry, render, private storage, deletion, and runtime teardown. Exception text is deliberately excluded. Page text, transcripts, prompts, selectors, filenames, object keys, signed URLs, credentials, cookies, and tokens are forbidden dashboard dimensions.

`observeCaptureOperation` is the provider-neutral instrumentation wrapper for production adapters. It emits start and success/failure metrics while rethrowing the original failure to normal job handling. Telemetry delivery fails open so an exporter outage cannot alter capture state or replace the operation error; a production collector must independently alert on missing data. Exporting those records to a production telemetry backend remains deployment wiring.

## SLOs and alerts

`CAPTURE_OPERATION_SLOS` defines rolling-30-day planning objectives for all nine stages. They cover p95 stage duration, p99 queue delay, deletion success, and teardown success. These are initial engineering objectives; production baselines must replace or confirm them before an external SLA is published.

`CAPTURE_OPERATION_ALERT_RULES` is executable and returns `ok`, `firing`, or `no_data`. The checked-in dashboard definition is `config/capture-observability-dashboard-v1.json`. `no_data` must be treated as missing instrumentation in a deployed worker, not as health.

## Local load and cost model

The readiness command schedules 32 synthetic project tasks with a concurrency limit of four and one deliberately runaway task. It proves the local scheduler respects the configured limit, preserves FIFO start order, and terminates a task at its wall-clock boundary.

It does **not** measure browser, FFmpeg, database, Redis, object storage, network, or cloud-host saturation. It is explicitly labeled `local_synthetic_exercise_not_capacity_benchmark`. Production capacity requires representative flows, production-sized media, deployed dependencies, warm/cold worker measurements, and sustained/soak traffic.

The versioned cost model uses integer micro-USD rates for browser seconds, render seconds, first-month retained storage, egress, and optional model tokens. It is deterministic planning math and reports `providerCallsMade: 0`. Vendor quotes, regional prices, discounts, retries, idle allocation, logging, support, and taxes remain outside this local estimate.

## Failure exercises

The local report includes safe incident receipts for worker failure, queue loss, database outage, storage outage, deletion failure, and runtime teardown failure. The state models assert detection, containment, recovery ownership, artifact publication suppression, and zero duplicate usage records. Real PostgreSQL, Redis/BullMQ, and S3-compatible fixture paths are separately exercised by `pnpm test:infrastructure`.

These simulations do not prove managed-service failover, regional loss, corrupt backups, cloud IAM behavior, orchestrator cleanup, or human paging response. Run the deployment exercises in [capture-incident-runbook.md](./capture-incident-runbook.md) before customer rollout.

## Acceptance gates

The command fails unless all stages are represented, every SLO has data and is met, every alert has data and is healthy, concurrency is bounded, the runaway is terminated, FIFO fairness is preserved, the estimate is provider-free, all six incident models run, every incident is detected and contained without duplicate usage, and unsafe artifacts remain unpublished. Generated evidence stays under ignored `tmp/` storage and must not be committed.
