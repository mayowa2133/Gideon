# Observability dashboards and alerts

Gideon hosted workers emit structured JSON metrics and job observability snapshots. The executable alert catalog lives in `src/main/observability.ts`; this document is the operator-facing runbook for those rules.

## Dashboard panels

| Panel | Source events | What to show |
| --- | --- | --- |
| Queue health | `job_observability_snapshot` | Active, queued, running, canceling, terminal jobs; oldest queued age; oldest running age |
| Lease recovery | `job_observability_snapshot` | Expired running leases, recovered lease failures, retryable failed jobs |
| Failure rate | `job_observability_snapshot`, `hosted_worker_job_failed` | Terminal failure rate per hour, failed jobs, sanitized failure summaries |
| Provider latency | `tts_provider_finished`, `tts_provider_failed`, `analysis_pipeline_finished`, `analysis_pipeline_failed` | TTS latency p50/p95, TTS failures, analysis duration, analysis failures |
| Render health | `render_draft_finished`, `render_draft_failed` | Render duration p50/p95, failed renders, output duration |
| Storage health | `artifact_storage_finished`, `artifact_storage_failed` | Artifact storage latency p50/p95, bytes stored, storage failures |
| Usage metering | `usage_recorded` | Usage records by metric/source, unusual spikes, missing usage after successful expensive jobs |
| Hosted review health | `hosted_mcp_context_served`, `hosted_review_edit_succeeded`, `hosted_review_edit_failed` | MCP context requests, script/moment edit success, revision conflicts, missing preconditions, bounded failure codes |

## Default alert rules

| Rule | Severity | Window | Threshold | Primary action |
| --- | --- | --- | --- | --- |
| `queue-oldest-queued-age-warning` | warning | 5m | oldest queued job age ≥ 5m | Check worker count, Redis, providers, and growing backlog. |
| `queue-oldest-queued-age-critical` | critical | 5m | oldest queued job age ≥ 15m | Page operator, scale workers, inspect BullMQ/Redis, and pause expensive enqueue sources if needed. |
| `queue-expired-running-leases-critical` | critical | 5m | expired running leases ≥ 1 | Inspect worker crashes, heartbeat interval, stalled subprocesses, and store latency. |
| `queue-recovered-lease-failures-warning` | warning | 1h | recovered lease failures ≥ 1 | Confirm recovered jobs are retryable and not double-metered. |
| `queue-terminal-failure-rate-warning` | warning | 1h | terminal failures ≥ 3/hour | Group failures by stage/provider and check recent deploys. |
| `queue-terminal-failure-rate-critical` | critical | 1h | terminal failures ≥ 10/hour | Page operator and consider disabling new expensive work. |
| `provider-tts-latency-warning` | warning | 15m | TTS p95 latency ≥ 15s | Check provider status, rate limits, model selection, and text length distribution. |
| `provider-tts-failures-warning` | warning | 15m | TTS failures ≥ 1 | Verify credentials, provider health, and fallback behavior. |
| `storage-latency-warning` | warning | 15m | storage p95 latency ≥ 5s | Check object-store region, network path, artifact size, and retries. |
| `storage-failures-critical` | critical | 15m | storage failures ≥ 1 | Page operator, verify bucket credentials/policy, and pause exports/renders if writes are failing. |
| `hosted-review-revision-conflicts-warning` | warning | 15m | revision conflicts ≥ 5 | Check stale MCP clients, collaborative editing races, and whether agents are refreshing project context before edits. |
| `hosted-review-precondition-failures-warning` | warning | 15m | missing revision preconditions ≥ 1 | Verify MCP/web clients include `If-Match` or body `revision` from the hosted MCP context before script/moment edits. |

## Data-safety rules

- Do not index transcripts, OCR text, scripts, prompts, object keys, signed URLs, filenames, provider payloads, or API keys into dashboards.
- Keep dashboard dimensions to safe IDs and bounded categories: worker ID, workspace/project/job IDs, event name, provider/model, artifact kind, review resource kind, status/code, changed-field names, duration, counts, sizes, and sanitized error summaries.
- Treat `no_data` alert evaluation as an instrumentation problem for production workers.

## Implementation notes

`evaluateObservabilityAlerts` accepts recent `JobObservabilitySnapshot` values plus timestamped executor and hosted API metric records. The evaluator returns `ok`, `firing`, or `no_data` per rule. Production integrations can map these results to Datadog, Prometheus Alertmanager, Grafana, Honeycomb triggers, or another observability backend without changing Gideon’s worker/API metric contract.
