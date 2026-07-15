# Product-flow capture rollout audit — 2026-07-14

## Decision

The local concierge capture path has passed two independent real demo-product pilots and is ready for controlled design-partner use. It is not ready to be advertised as generally available autonomous capture.

Gideon now has real evidence across React and Streamlit products for deterministic discovery/import boundaries, human-approved replay, browser and application-state verification, human-paced interaction presentation, clean and vertical media outputs, private lineage, targeted retry, and fail-closed hosted capability gating. General availability still requires deployed infrastructure and external design-partner evidence that cannot be produced from this repository alone.

## Verified implementation evidence

| Boundary | Evidence | Result |
| --- | --- | --- |
| Real product capture | NexusReach and SignalDraft local safe-demo resets, real Chrome dry runs and clean takes, API outcome verification, FFmpeg normalization | Seven of seven declared goals and seven of seven current approved flows verified across two products |
| Product workflows | NexusReach onboarding, jobs, contacts, tracker, and draft review; SignalDraft ordinary and sensitive message analysis | Seven separate verified clean clips |
| Presentation | Human-readable holds, arrow cursor, smooth pointer movement, click feedback, character typing | Enabled and visually inspected across both registered real-product manifests |
| Dual output | Landscape normalized walkthrough plus receipt-timed 1080×1920 H.264/AAC derivative | Fourteen verified MP4 outputs across both full runs |
| Captions | Burned-in deterministic overlay plus private editable WebVTT | Seven caption tracks generated from recorded step timings |
| Narration | Explicit provider-only interface; no implicit provider cost or local voice fallback | Fail-closed boundary tested; narration intentionally disabled in both pilots |
| Reliability | Durable local repository, immutable run directories, incremental checkpoint, bounded targeted retry, sensitive-shaped diagnostic redaction | Repeated real-browser integration plus actual NexusReach and SignalDraft targeted retries passed |
| Generic runner | Ephemeral independent fixture product, randomized loopback origin, registered adapters, two workflows, repeated full and selected runs | Real Chrome and FFmpeg integration passed; this is technical portability evidence, not a second customer pilot |
| Independent product portability | SignalDraft Streamlit/FastAPI/SQLite app, heuristic-only runtime, synthetic message typing, persisted classification verification, human-review and send gate | Two of two workflows passed; first unstable UI assertion failed closed, retained a checkpoint, and passed after a bounded locator repair |
| Reproducible golden baseline | Runtime-validated pilot registry, private regular-file enforcement, FFprobe media inspection, committed thresholds, redacted machine-readable output | Two pilots, seven workflows, seven landscape clips, seven vertical renders, and seven caption tracks passed with no findings |
| Hosted workflow | Connect/review/edit/approve/capture/preview/coverage/assembly and runtime-unavailable state | Nine hosted unit tests and two real-browser E2E journeys passed |
| Remote isolation boundary | Declarative manifest, no credential-like fixtures, exact response attestation, pinned image digest, production config preflight | Unit/config tests pass; production-shaped preflight passes |
| Regression | Repository lint, strict TypeScript, capture suite, full suite, hosted unit/E2E, desktop/web builds | 130 capture tests, 534 full tests, 9 hosted unit tests, and 2 hosted E2E tests passed; one full-suite test remains intentionally skipped; builds passed |

The successful full NexusReach dual-output run began at `2026-07-15T02:51:59Z` and produced five clean clips, five vertical renders, and five WebVTT tracks. The successful full SignalDraft run began at `2026-07-15T03:19:15Z` and produced two clean clips, two vertical renders, and two WebVTT tracks. Both runs independently verified outcomes and complete declared goal/flow coverage. Generated private media remains ignored by Git and is not part of this audit document.

## What is still unknown or externally blocked

These items must remain visible as release gates rather than being converted into optimistic product claims:

1. **Deployed isolated browser pool.** The manifest and attestation contract is implemented; no container/microVM pool with non-root execution, read-only image, resource limits, default-deny egress, and retained platform attestation was available in this workspace.
2. **External secret manager and private object storage.** Production adapters, lifecycle rules, deletion reconciliation, and incident exercises require deployed services.
3. **Staging PostgreSQL/Redis evidence.** Migrations, queue fairness/leases, concurrent idempotency, cancellation, and recovery need staging load and failure-injection runs.
4. **Live discovery/repair providers.** Provider-neutral boundaries exist, but reviewed OpenAI/Anthropic adapters need measured recall, drift, cost, and recovery canaries before promotion.
5. **Read-only Git and analytics connectors.** Repository snapshots and usage-sequence contracts exist locally; installation/revocation, retention, privacy UI, provider audit, and low-volume production evidence remain.
6. **Trustworthy route/state denominators.** Both real-product pilots truthfully report route, state, sequence, flag, outcome, and failure-state dimensions as unknown where no bounded inventory was supplied.
7. **Reviewed narration.** No live TTS call was made because no approved production voice/provider configuration was placed in scope. Captioned silent derivatives remain the safe default.
8. **External review.** Penetration testing, privacy/legal/vendor review, accessibility/usability review, capacity/cost SLOs, and incident exercises remain required before general availability.

## Input required for the next real-product pilot

Provide a demo project with all of the following. Do not provide customer credentials or production data.

- Absolute local repository path or a reviewed read-only snapshot.
- One loopback start command and the expected local HTTP origin.
- A disposable synthetic persona and fixture values.
- Deterministic reset commands or fixture APIs for each starting state.
- Existing Playwright/Cypress scenario manifests where available.
- The workflows and outcomes considered in scope, plus explicit prohibited actions.
- Any required authentication bootstrap through an opaque disposable grant, never plaintext in a manifest.
- Permission to store private local pilot artifacts outside Git for the duration of the test.

Before recording, Gideon will add a trusted adapter registration, reject manifest-provided commands, import flows as drafts, and require revision-bound approval. A materially different target, risk, or expected outcome creates a new review revision.

## Next rollout sequence

1. Run controlled design-partner pilots and measure locator failure rate, reset reliability, capture duration, visual QA, caption fit, and human comprehension against the NexusReach and SignalDraft baselines.
2. Deploy the pinned isolated runtime plus external vault, PostgreSQL, Redis, and private object storage in staging.
3. Execute strict staging checks, live provider canaries, deletion/retention proof, load/failure injection, and an incident exercise.
4. Conduct external security, privacy, accessibility, and usability review.
5. Promote only if every release gate has retained evidence; continue describing unknown dimensions as unknown.
