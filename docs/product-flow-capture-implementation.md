# Structured product-flow capture implementation

Status: backend foundation and hosted self-service capture workspace implemented behind explicit dependency wiring; the NexusReach loopback concierge pilot is verified, but capture is not enabled by default in the desktop UI or production deployment.

The requirement-by-requirement status is maintained in [product-flow-capture-requirement-audit.md](./product-flow-capture-requirement-audit.md).

This document records what the code now guarantees and what operators must provide before exposing “Let Gideon capture my product” to customers. The product and rollout contract remains [product-flow-capture-plan.md](./product-flow-capture-plan.md).

The production architecture does not automate the Claude Code or Codex desktop applications. Those tools are useful for an internal concierge workflow, but their UI sessions, permissions, and recordings are not a stable multi-tenant product runtime. Gideon uses a provider-neutral model API only for bounded discovery/repair proposals and uses deterministic Playwright for the final clean recording. Either OpenAI or Anthropic can implement the reasoning adapter without changing the approved-flow or recording contracts.

The supported local concierge proofs are documented in [nexusreach-local-capture-pilot.md](./nexusreach-local-capture-pilot.md) and [signaldraft-local-capture-pilot.md](./signaldraft-local-capture-pilot.md). `pnpm capture:pilot` and `pnpm capture:pilot:signaldraft` exercise the real reset, dry-run, recording, verification, normalization, artifact, assembly, and coverage pipeline against two allowlisted products with different UI stacks. They are intentionally headless operator commands; they do not relax the hosted production gates.

The retained runs can be audited without replay or provider access using `pnpm capture:baseline`, documented in [capture-baseline-evidence.md](./capture-baseline-evidence.md). The command probes private media in place, enforces versioned acceptance thresholds, and emits a path-free machine-readable report below ignored `tmp/` storage.

## Implemented boundaries

- Runtime-validated flow revisions support only bounded navigation, click, fixture fill/select, approved keys, waits, and observable assertions. Generated code and unknown fields are rejected.
- Human approval is immutable and revision-bound. Compilation fails for drafts, stale approval, stale environment versions, disallowed domains, or elevated risk.
- Environment validation performs DNS/private-network checks and a pinned-address HTTP/TLS reachability probe. Redirects are revalidated at every hop.
- Disposable credential grants have a callback-only vault interface. The external-vault adapter persists only metadata and an opaque vault reference; the login adapter resolves the secret only while filling the approved form.
- Capture-run creation is idempotent. The server compiles current approved flows, hashes policy and plans, estimates quota usage, and atomically persists the generic job and capture run before queueing.
- BullMQ capture jobs contain only workspace, project, run, and job IDs. Queue retries are bounded.
- Remote capture is refused unless the runtime identifies itself as container or microVM isolated. `local_test` is accepted only for `local_preview` environments. Remote responses must include an attestation bound to the exact declarative manifest hash, declared isolation class, valid runtime instance ID, completion time, and the caller's pinned SHA-256 worker image digest before their browser receipt or recording is trusted.
- Every flow resets before both dry run and recording. Failed dry runs stop before recording; failed assertions produce review state instead of successful clips.
- Playwright replay uses fixed viewport, locale, timezone, color scheme, reduced motion, disabled downloads, and per-request network-policy checks.
- Raw WebM, verification receipt, network/action telemetry, normalized H.264 clip, assembly manifest, and composite source recording are private artifacts with hashes and lineage. Explicit assembly jobs preserve the user's selected clip order before activation.
- Media processing uses argument-array FFmpeg invocation with no shell interpolation. It verifies checksums and codec/profile and rejects mostly blank captures.
- Cooperative cancellation is checked between expensive stages, deletes the private work directory, and exposes cleanup hooks for temporary capabilities.
- Project deletion has a workspace-scoped transactional PostgreSQL purge path for capture rows and returns opaque vault references for external secret destruction and reconciliation.
- Deterministic discovery follows rendered same-origin links without clicking controls or submitting forms. It normalizes opaque route IDs and removes query values.
- Model-guided discovery receives trusted policy separately from untrusted evidence. Outputs remain drafts, are schema validated, cannot self-approve, and cannot exceed allowed risks.
- Repository evidence extraction is read-only and structural. It excludes environment/secret/key files, dependencies, build output, binaries, symlinks, and oversized files and never executes repository code.
- Declarative Playwright/Cypress manifests import as drafts. Arbitrary test code is never evaluated.
- Usage evidence drops unknown properties and suppresses low-volume sequences before ranking.
- Coverage reports dimensions independently. Missing denominators remain `unknown`.
- Bounded repair changes only locators or wait assertions on failed steps and creates a new draft revision for human review.
- Capture mutations have CSRF, workspace authorization, strict validation, and per-workspace/user rate limiting. Expensive capture creation requires `Idempotency-Key` and exposes a quota hook before enqueue.
- Environment validation and discovery are durable asynchronous jobs. Remote discovery refuses a local browser runtime.
- Capture completion automatically persists an honest coverage snapshot; dimensions without a trustworthy inventory remain unknown.
- Capture audit events use fixed summaries and reject secret-shaped metadata. User actions and worker completion actions retain their actor type.
- Clip previews use separately authorized, short-lived, no-store signed URLs for verified normalized clips only.
- The hosted Next.js workspace lists projects, checks session and capture capabilities, manages environment/persona/disposable-login setup, runs discovery, supports revision-safe proposal edits and approval, launches/cancels capture, previews verified clips, reports honest coverage, retries failed flows, and explicitly orders/activates an assembly.
- Opaque discovery/capture run IDs are retained per project in browser storage so a reload can re-authorize and resume status polling; credentials, media URLs, and signed previews are never persisted there.
- The browser-facing web app calls a same-origin, path-restricted server proxy. The internal hosted API URL, cookies, CSRF forwarding, response no-store policy, request-size limit, and response-header allowlist stay server-controlled.

## Main modules

- `src/shared/productFlowCapture.ts`: flow, policy, receipt, persistence, and coverage contracts.
- `src/main/captureService.ts`: environment, persona, and flow application service.
- `src/main/captureRunCoordinator.ts`: idempotent compilation and run/job creation.
- `src/main/captureRunWorker.ts`: reset, dry run, recording, artifacts, normalization, assembly, cancellation, and usage orchestration.
- `src/main/environmentValidationCoordinator.ts` and `discoveryRunCoordinator.ts`: idempotent asynchronous job creation.
- `src/main/captureAssemblyCoordinator.ts` and `captureAssemblyWorker.ts`: ordered user-selected source assembly and activation.
- `src/main/captureAudit.ts`, `postRunCoverage.ts`, and `capturePreviewService.ts`: audit, post-run coverage, and signed preview boundaries.
- `src/main/playwrightCaptureExecutor.ts`: deterministic browser replay.
- `src/main/isolatedCaptureRuntime.ts`: container/microVM client boundary.
- `src/main/captureNetworkPolicy.ts` and `captureEnvironmentProbe.ts`: SSRF, DNS, redirect, and reachability policy.
- `src/main/flowDiscovery.ts`, `captureInventoryCrawler.ts`, `repositoryEvidence.ts`, and `testScenarioImport.ts`: discovery inputs.
- `src/main/captureCoverage.ts`: multi-dimensional coverage calculation.
- `migrations/0004_product_flow_capture.sql`: PostgreSQL schema.
- `apps/web`: hosted Next.js project launcher, capture workspace, same-origin API proxy, typed client, unit tests, and Playwright E2E journey.
- `src/main/nexusReachPilot.ts`: allowlisted loopback-only NexusReach concierge composition and evidence report.
- `src/main/signalDraftPilot.ts`: allowlisted Streamlit/FastAPI pilot with isolated SQLite reset, heuristic-only readiness attestation, persisted outcome verification, and a fail-closed pre-approval send check.
- `src/main/capturePilotManifest.ts`: strict loopback-only pilot manifest and trusted adapter-registry boundary.
- `src/main/capturePilot.ts`: generic versioned local pilot orchestration shared by registered product adapters.
- `src/main/capturePresentationRenderer.ts`: receipt-timed caption tracks, safe vertical framing, and explicitly provider-gated optional narration for pilot derivatives.
- `src/main/captureBaselineReport.ts`: strict private-artifact selection, FFprobe inspection, versioned baseline thresholds, and redacted cross-product evidence reporting.

## Required production wiring

The code deliberately does not fall back to a local browser for remote products. Production must provide:

1. A browser pool using a pinned SHA-256 image digest, container or microVM isolation, non-root execution, read-only base filesystem, bounded work volume, CPU/memory/PID/time limits, default-deny egress through the policy gateway, and a response attestation bound to each submitted manifest hash.
2. PostgreSQL migration `0004_product_flow_capture.sql`, Redis/BullMQ, and private S3/R2 storage.
3. An external secret-store implementation and credential metadata repository.
4. Reset adapters and reviewed login adapters for enabled environments.
5. Capture quota/entitlement and usage-recording callbacks.
6. The provided captured-assembly store activator (or an equivalent transactional project-store adapter) that attaches the composite artifact and marks downstream analysis stale.
7. The provided PostgreSQL-backed capture audit sink wiring for environment, credential, discovery, flow approval, run, cancellation, retry, coverage, and assembly actions.
8. Dashboards and alerts fed by capture observability plus browser-worker and queue metrics.

Run `pnpm capture:worker:check` before starting a worker. Production configuration rejects local-test isolation, in-memory secrets, local artifact storage, loopback or credential-bearing runtime endpoints, unpinned worker images, and missing policy bundle versions.

## API availability

The hosted API supports environment/persona CRUD foundations, flow list/get/revision/approval, capture-run creation, status, and cancellation when services are injected. It returns `503 capture_not_configured` when a deployment has not wired them, preventing the UI from promising capture while an isolated worker is absent.

The hosted API includes asynchronous environment validation and discovery create/status/cancel routes, explicit ordered assembly jobs, signed verified-clip preview URLs, latest coverage, one-flow retry, and a capability endpoint. Every route remains dependency-gated. The hosted review UI exposes capture controls only when `/api/v1/capture-capabilities` returns `available: true`; otherwise it identifies the missing safe runtime dependency without offering recording actions.

## Verification

`pnpm test:capture` covers policy, SSRF/DNS/redirect behavior, credentials, real Chromium replay, deterministic crawling, login, real FFmpeg normalization and visual QA, discovery, prompt-like evidence, repair, repository/test import, coverage, queueing, idempotency, cancellation, persistence, isolation manifests, baseline evidence redaction, and service scoping. `pnpm test:web` covers the typed client and proxy policy. `pnpm test:e2e` covers session/capability gating and the edit → approve → discover → capture → preview → coverage → assembly journey in a real browser. Tests use synthetic applications/data and no customer media or credentials.

## Honest product copy

Use: “Gideon can discover visible workflows, propose them for review, and record the approved flows in your safe demo environment.”

Do not use: “Gideon knows every possible user flow.” Hidden routes, unsupported roles, feature-flag variants, and areas without trustworthy inventory remain unknown or blocked.
