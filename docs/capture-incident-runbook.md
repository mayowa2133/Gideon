# Structured capture incident runbook

Use safe IDs and bounded error codes in tickets, dashboards, and pages. Never paste credentials, cookies, page text, transcripts, prompts, selectors, filenames, object keys, signed URLs, raw provider responses, or customer media into incident systems.

## Common first response

1. Identify the alert, stage, safe correlation ID, affected workspace/project count, and first observed timestamp.
2. Stop or rate-limit new capture admission when continued work could create cost, duplicate usage, unsafe artifacts, or deletion backlog.
3. Preserve immutable job, audit, usage, runtime-attestation, and artifact-lineage records. Revoke signed previews when artifact safety is uncertain.
4. Confirm workspace isolation before retrying. Do not bypass revision approval, masking, verification, quota, or teardown gates.
5. Record recovery transitions and validate that idempotency and usage-deduplication keys did not change.

## validation-failures

Inspect allowlisted origin, DNS/private-address rejection, TLS, redirect policy, reset adapter, and credential-grant availability. Keep capture disabled until validation succeeds on the exact environment version.

## discovery-failures

Check inventory worker health, bounded provider budget/circuit state, rendered navigation, and imported evidence. Failed discovery must not create an approved revision. Operators may rerun discovery; users must still review and approve the exact revision.

## queue-loss-or-backlog

Pause admission if delay exceeds the critical threshold. Check Redis/BullMQ reachability, worker count, queue concurrency, stale leases, retry delay, and rate limits. Reconcile durable database jobs missing from the broker. Confirm one queue job and one usage record per idempotency key before resuming.

## worker-failure

Allow bounded automatic retry after lease expiry. Inspect only safe worker codes and runtime attestations. Quarantine partial artifacts unless verification and teardown both passed. Escalate repeated identical failures and open the circuit before the retry budget can create runaway cost.

## retry-exhaustion

Stop automatic retries at the configured maximum. Preserve the original approved revision and execution lineage. Require operator/user review for drift, authentication, masking, or assertion failures; never broaden the allowed action set automatically.

## render-degradation

Check render queue saturation, FFmpeg resource limits, source duration, and quality-gate results. Do not expose an output that failed normalization, framing, privacy masking, or quality verification. Scale only within configured quotas.

## storage-outage

Suppress ready/preview state before object persistence and verification. Keep the job retryable with the same idempotency key. Verify bucket policy, encryption, lifecycle, regional path, and signed-URL issuer before replay. Reconcile database artifact rows against private objects after recovery.

## deletion-failure

Revoke database access and signed previews first, retain the hashed failure receipt, and place provider cleanup in the bounded retry outbox. Observe legal holds. Escalate the oldest pending cleanup age; verify object absence and metadata cleanup before closing.

## runtime-teardown-failure

Reject the runtime attestation, quarantine extracted artifacts, revoke scoped grants, and stop admission to the affected worker pool. Prove destruction of profile, cookies, clipboard, cache, scratch space, and runtime instance before returning the pool to service. This is operator-required recovery.

## database-outage

Suppress enqueue when the authoritative transaction cannot commit. Do not infer job creation from an API timeout. After recovery, reconcile idempotency keys, job rows, queue messages, audit rows, and usage rows before reopening admission.

## Closure receipt

Record alert/rule ID, safe incident and correlation IDs, start/end timestamps, affected counts, containment action, state transitions, recovery owner, duplicate-usage count, unsafe-artifact count, deletion backlog, and follow-up owner. Customer content and infrastructure secrets remain omitted.
