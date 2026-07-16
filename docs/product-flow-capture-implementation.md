# Structured product-flow capture implementation

Status: backend foundation and hosted self-service capture workspace implemented behind explicit dependency wiring; the NexusReach loopback concierge pilot is verified, but capture is not enabled by default in the desktop UI or production deployment.

The requirement-by-requirement status is maintained in [product-flow-capture-requirement-audit.md](./product-flow-capture-requirement-audit.md).

This document records what the code now guarantees and what operators must provide before exposing “Let Gideon capture my product” to customers. The product and rollout contract remains [product-flow-capture-plan.md](./product-flow-capture-plan.md).

The production architecture does not automate the Claude Code or Codex desktop applications. Those tools are useful for an internal concierge workflow, but their UI sessions, permissions, and recordings are not a stable multi-tenant product runtime. Gideon uses a provider-neutral model API only for bounded discovery/repair proposals and uses deterministic Playwright for the final clean recording. Either OpenAI or Anthropic can implement the reasoning adapter without changing the approved-flow or recording contracts.

The supported local concierge proofs are documented in [nexusreach-local-capture-pilot.md](./nexusreach-local-capture-pilot.md) and [signaldraft-local-capture-pilot.md](./signaldraft-local-capture-pilot.md). `pnpm capture:pilot` and `pnpm capture:pilot:signaldraft` exercise the real reset, dry-run, recording, verification, normalization, artifact, assembly, and coverage pipeline against two allowlisted products with different UI stacks. They are intentionally headless operator commands; they do not relax the hosted production gates.

The retained runs can be audited without replay or provider access using `pnpm capture:baseline`, documented in [capture-baseline-evidence.md](./capture-baseline-evidence.md). The command probes private media in place, enforces versioned acceptance thresholds, and emits a path-free machine-readable report below ignored `tmp/` storage. Coverage denominator provenance and freshness are defined in [capture-coverage-inventory.md](./capture-coverage-inventory.md).

The hostile synthetic browser target and fail-closed matrix are documented in [hostile-capture-fixture.md](./hostile-capture-fixture.md). `pnpm capture:hostile:check` verifies complex permitted flows and dangerous-action traps without contacting a provider or non-loopback service.

Deterministic locator selection, provider budgets, safe page comparison, and revision-bound repair are documented in [capture-discovery-repair.md](./capture-discovery-repair.md).
The exact Phase 6 local verification record is [capture-phase-6-evidence.md](./capture-phase-6-evidence.md).
Pre-frame sensitive-region masking, privacy-safe receipts, and support-bundle redaction are documented in [capture-sensitive-masking.md](./capture-sensitive-masking.md).
The exact Phase 9 local verification record is [capture-phase-9-evidence.md](./capture-phase-9-evidence.md).

## Implemented boundaries

- Runtime-validated flow revisions support only bounded navigation, click, fixture fill/select, approved keys, waits, and observable assertions. Generated code and unknown fields are rejected.
- Human approval is immutable and revision-bound. Compilation fails for drafts, stale approval, stale environment versions, disallowed domains, or elevated risk.
- Environment validation performs DNS/private-network checks and a pinned-address HTTP/TLS reachability probe. Redirects are revalidated at every hop.
- Disposable credential grants have a callback-only vault interface. The external-vault adapter persists only metadata and an opaque vault reference; the login adapter resolves the secret only while filling the approved form.
- Isolated-runtime fixture values are staged through an opaque scoped grant and never serialized into the manifest. The grant is revoked after success or failure; credential-shaped keys remain forbidden and credentials stay behind the login-adapter vault.
- Capture-run creation is idempotent. The server compiles current approved flows, hashes policy and plans, estimates quota usage, and atomically persists the generic job and capture run before queueing.
- BullMQ capture jobs contain only workspace, project, run, and job IDs. Queue retries are bounded.
- Remote capture is refused unless the runtime identifies itself as container or microVM isolated. `local_test` is accepted only for `local_preview` environments. Version-2 attestations bind the manifest, workspace, execution, isolation class, exact image digest, canonical runtime-policy hash, start/completion times, terminal success, and destruction of the profile, cookies, clipboard, cache, scratch data, and runtime instance before any browser receipt or recording is trusted.
- The repository now defines a disposable Playwright container and separate CONNECT-only egress proxy. Static policy enforces non-root UID/GID, read-only roots, no added capabilities, no-new-privileges, bounded tmpfs/CPU/memory/PIDs, no host mounts or container socket, internal-only browser networking, HTTPS allowlists, resolved-IP connection, and metadata/private-address denial. Chromium receives the proxy explicitly at launch.
- Every flow resets before both dry run and recording. Failed dry runs stop before recording; failed assertions produce review state instead of successful clips.
- Playwright replay uses fixed viewport, locale, timezone, color scheme, reduced motion, disabled downloads, and per-request network-policy checks.
- Browser action timeouts are explicit and bounded. Geometry collection checks visibility before attempting scroll alignment, so hidden modals and controls cannot consume the timeout after every step.
- Every browser and inventory context installs a hash-bound strict masking policy before page creation. Password, token, payment, email, personal-data, visible secret-shaped text, custom selectors, and canvas regions are obscured and continuously realigned; masking is audited before screenshots/actions and at completion, and unavailable/incomplete masking fails closed.
- Successful step receipts include schema-validated geometry-only visual evidence: viewport and optional action, visible-result, and modal bounds. Receipts never add selector values, DOM text, fixture values, or screenshots to framing telemetry; isolated-runtime responses are revalidated before use.
- Raw WebM, verification receipt, network/action telemetry, normalized H.264 clip, assembly manifest, and composite source recording are private artifacts with hashes and lineage. Explicit assembly jobs preserve the user's selected clip order before activation.
- Pilot vertical renders compile that evidence into a versioned `capture-framing-v1` manifest. Automatic focus prefers a verified visible result, then a modal, then the action target; it uses a bounded 1–2× source-aspect crop and deterministic interpolated pan window. Missing evidence fails safely to the established full-frame presentation. Operators may explicitly select full-frame or provide a validated normalized manual region.
- Every clean-take derivative is evaluated by the deterministic `capture-video-quality-v1` gate before it can become a verified clip. Eight representative frames measure black/blank/frozen/detail signals; receipt, framing, caption, and presentation metadata measure safe page-state classifications, effective text-size lower bounds, caption fit, target evidence, cursor/click/typing presentation, dwell, pacing, and camera speed. The worker stores a private mode-0600 JSON report and JPEG contact sheet. A failed gate leaves the execution failed with no normalized preview or assembly source; warnings remain reviewable and are shown in the hosted results UI.
- Media processing uses argument-array FFmpeg invocation with no shell interpolation. It verifies checksums and codec/profile and rejects mostly blank captures.
- Cooperative cancellation is checked between expensive stages, deletes the private work directory, and exposes cleanup hooks for temporary capabilities.
- Project deletion has a workspace-scoped transactional PostgreSQL purge path for capture rows and returns opaque vault references for external secret destruction and reconciliation.
- Project deletion now also inventories and transactionally removes scoped job, upload-session, and artifact rows, then reconciles private objects and secrets through provider adapters. Public receipts contain only counts and hashes; failed targets go only to a retry callback. Retention planning supports bounded age, legal hold, missing-object/orphan detection, object-first deletion, and preservation of database lineage on storage failure.
- Usage recording conflicts on `(workspace_id, idempotency_key)` and returns the original immutable event, so worker retries cannot double-account and one workspace cannot suppress another. Signed preview authorization rechecks both workspace and project on execution and artifact records.
- Deterministic discovery follows rendered same-origin links without clicking controls or submitting forms. It normalizes opaque route IDs and removes query values.
- Model-guided discovery receives trusted policy separately from untrusted evidence. Outputs remain drafts, are schema validated, cannot self-approve, cannot exceed allowed risks or evidence scope, and are bounded by attempts, timeout, candidate count, duplicate rejection, and a cooling circuit breaker.
- Repository evidence extraction is read-only and structural. It excludes environment/secret/key files, dependencies, build output, binaries, symlinks, and oversized files and never executes repository code.
- Declarative Playwright/Cypress manifests import as drafts. Arbitrary test code is never evaluated.
- Usage evidence drops unknown properties and suppresses low-volume sequences before ranking.
- Coverage reports dimensions independently against a semantic-hashed `capture-coverage-inventory-v1`. Repository routes, rendered navigation, imported declarative tests, and manifest declarations may contribute bounded evidence; missing or untrusted denominators remain `unknown`.
- `capture-coverage-v2` binds inventory, environment, policy, fixture, persona, and approved-flow revisions. Reads reevaluate freshness, and the hosted UI suppresses percentages for stale, unknown, or untrusted denominators.
- Action locators are durability-ranked and visible-match counted before recording. Associated labels, stable link destinations, exact accessible roles, test IDs, named landmarks, placeholders, and text are supported; missing, hidden, and ambiguous targets fail with stable codes rather than selecting the first match.
- Bounded repair compares path, safe accessibility-control similarity, DOM structure, and locally scored screenshots. It changes only a uniquely evidenced locator or wait assertion on a failed step. Every result is a new draft revision; material application changes skip provider repair and require human review.
- Capture mutations have CSRF, workspace authorization, strict validation, and per-workspace/user rate limiting. Expensive capture creation requires `Idempotency-Key` and exposes a quota hook before enqueue.
- Environment validation and discovery are durable asynchronous jobs. Remote discovery refuses a local browser runtime.
- Capture completion automatically persists an honest coverage snapshot; dimensions without a trustworthy inventory remain unknown.
- Capture audit events use fixed summaries and reject secret-shaped metadata. User actions and worker completion actions retain their actor type.
- Assertion receipts redact sensitive-shaped text after evaluation. Isolated/local workers reject privacy-unsafe receipts, masking receipts retain counts/hashes only, pilot failure files retain repository counts instead of state, and mode-0600 support reports exclude media, credentials, selectors, private paths, object keys, signed URLs, and raw prompts.
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
- `fixtures/hostile-capture-app` and `src/main/hostileCaptureFixture.ts`: complex adversarial synthetic UI, loopback server, approved/prohibited workflow matrix, and redacted evidence command.
- `src/main/captureFraming.ts`: privacy-safe focus selection, crop clamping, deterministic pan expressions, and full-frame fallback.
- `src/main/captureVideoQuality.ts` and `captureQualityThresholds.json`: versioned deterministic frame/presentation quality checks, contact sheets, and ready/warning/failed gating.
- `src/main/isolatedCaptureRuntime.ts`, `captureBrowserWorkerProcess.ts`, and `captureRuntimeSession.ts`: manifest/attestation boundary, one-shot browser entrypoint, workspace-scoped disposable state, and terminal cleanup.
- `Dockerfile.capture-browser`, `docker-compose.capture-browser.yml`, `captureEgressProxy.ts`, and `config/capture-browser-runtime-policy-v1.json`: pinned browser image and enforced local isolation/egress definition.
- `src/main/captureNetworkPolicy.ts` and `captureEnvironmentProbe.ts`: SSRF, DNS, redirect, and reachability policy.
- `src/main/flowDiscovery.ts`, `captureInventoryCrawler.ts`, `repositoryEvidence.ts`, and `testScenarioImport.ts`: bounded discovery inputs and provider policy.
- `src/main/captureLocators.ts`, `capturePageComparison.ts`, and `flowRepair.ts`: durable locator selection, safe drift classification, and revision-bound repair.
- `src/main/captureMasking.ts` and `captureSupportBundle.ts`: pre-frame visual masking, safe masking attestation, receipt/diagnostic redaction, and private support reports.
- `src/main/captureArtifactReconciliation.ts` and `captureDeletion.ts`: retention/legal-hold planning, drift evidence, object-first lifecycle cleanup, project-graph purge, and safe retry receipts.
- `src/main/captureCoverageInventory.ts` and `captureCoverage.ts`: versioned bounded denominator compilation, semantic identity/freshness, and multi-dimensional coverage calculation.
- `migrations/0004_product_flow_capture.sql`: PostgreSQL schema.
- `apps/web`: hosted Next.js project launcher, capture workspace, same-origin API proxy, typed client, unit tests, and Playwright E2E journey.
- `src/main/nexusReachPilot.ts`: allowlisted loopback-only NexusReach concierge composition and evidence report.
- `src/main/signalDraftPilot.ts`: allowlisted Streamlit/FastAPI pilot with isolated SQLite reset, heuristic-only readiness attestation, persisted outcome verification, and a fail-closed pre-approval send check.
- `src/main/capturePilotManifest.ts`: strict loopback-only pilot manifest and trusted adapter-registry boundary.
- `src/main/capturePilot.ts`: generic versioned local pilot orchestration shared by registered product adapters.
- `src/main/capturePresentationRenderer.ts`: receipt-timed caption tracks, safe vertical framing, and explicitly provider-gated optional narration for pilot derivatives.
- `src/main/captureBaselineReport.ts`: strict private-artifact selection, FFprobe inspection, quality-report/contact-sheet lineage, versioned baseline thresholds, and redacted cross-product evidence reporting.

## Required production wiring

The code deliberately does not fall back to a local browser for remote products. Production must provide:

1. Deploy and runtime-exercise the supplied browser/proxy definition (or equivalent managed microVM pool), then have the orchestrator return the strict version-2 attestation only after extracting approved artifacts and destroying the runtime instance. Docker was unavailable during local Phase 8 verification, so repository policy and contracts are proven but live container enforcement is not.
2. Deploy PostgreSQL migrations, Redis/BullMQ, and private S3/R2 storage. The exact five migrations and real BullMQ paths pass against disposable local PostgreSQL 16 and Redis 8; S3-compatible signing/upload/download/delete behavior passes against an in-process private HTTP fixture, not a deployed MinIO/cloud bucket.
3. An external secret-store implementation and credential metadata repository.
4. Reset adapters and reviewed login adapters for enabled environments.
5. Capture quota/entitlement and usage-recording callbacks.
6. The provided captured-assembly store activator (or an equivalent transactional project-store adapter) that attaches the composite artifact and marks downstream analysis stale.
7. The provided PostgreSQL-backed capture audit sink wiring for environment, credential, discovery, flow approval, run, cancellation, retry, coverage, and assembly actions.
8. Dashboards and alerts fed by capture observability plus browser-worker and queue metrics.

Run `pnpm capture:worker:check` before starting a worker and `pnpm capture:isolation:check` to verify the pinned definition. `pnpm capture:isolation:runtime:check` additionally requires a Docker engine and fails when runtime validation cannot execute.

## API availability

The hosted API supports environment/persona CRUD foundations, flow list/get/revision/approval, capture-run creation, status, and cancellation when services are injected. It returns `503 capture_not_configured` when a deployment has not wired them, preventing the UI from promising capture while an isolated worker is absent.

The hosted API includes asynchronous environment validation and discovery create/status/cancel routes, explicit ordered assembly jobs, signed verified-clip preview URLs, latest coverage, one-flow retry, and a capability endpoint. Every route remains dependency-gated. The hosted review UI exposes capture controls only when `/api/v1/capture-capabilities` returns `available: true`; otherwise it identifies the missing safe runtime dependency without offering recording actions.

## Verification

`pnpm test:capture` covers policy, SSRF/DNS/redirect behavior, credentials, real Chromium replay, the hostile complex fixture, dangerous-action side-effect counters, geometry-only step evidence, framing compilation/fallback, focused FFmpeg rendering, black/blank/frozen/rushed/unreadable/caption-overflow/browser-error quality fixtures, deterministic crawling, login, real FFmpeg normalization, discovery, prompt-like evidence, repair, repository/test import, coverage, queueing, idempotency, cancellation, persistence, isolation manifests, retention/reconciliation, baseline evidence redaction, and service scoping. `pnpm test:infrastructure` starts disposable PostgreSQL and Redis, applies all migrations, exercises real BullMQ concurrency/failure paths plus the S3-compatible fixture, emits a redacted report, and verifies teardown. `pnpm test:web` covers the typed client and proxy policy. `pnpm test:e2e` covers session/capability gating plus safe quality warnings in the edit → approve → discover → capture → preview → coverage → assembly journey. Tests use synthetic applications/data and no customer media or credentials.

The quality gate is deterministic evidence, not a human-comprehension claim. Effective UI text is a conservative declared source-text lower bound transformed through the actual crop, caption wrapping is estimated using the fixed overlay typography, and page-state evidence is a safe enum rather than retained page text. OCR, perceptual design review, mobile-device viewing, and human pacing comprehension remain external review activities.

## Honest product copy

Use: “Gideon can discover visible workflows, propose them for review, and record the approved flows in your safe demo environment.”

Do not use: “Gideon knows every possible user flow.” Hidden routes, unsupported roles, feature-flag variants, and areas without trustworthy inventory remain unknown or blocked.
