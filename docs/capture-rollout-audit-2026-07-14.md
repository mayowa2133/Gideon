# Product-flow capture rollout audit — 2026-07-14

## Decision

The local concierge capture path is ready for another controlled demo-product pilot. It is not ready to be advertised as generally available autonomous capture.

Gideon now has real evidence for deterministic discovery/import boundaries, human-approved replay, browser and application-state verification, human-paced interaction presentation, clean and vertical media outputs, private lineage, targeted retry, and fail-closed hosted capability gating. General availability still requires deployed infrastructure and independent design-partner evidence that cannot be produced from this repository alone.

## Verified implementation evidence

| Boundary | Evidence | Result |
| --- | --- | --- |
| Real product capture | NexusReach local safe-demo reset, real Chrome dry run and clean take, API outcome verification, FFmpeg normalization | Five of five declared goals and five of five current approved flows verified |
| Product workflows | Onboarding, jobs browse/filter, saved contacts, local tracker mutation/reset, seeded unsent draft review | Five separate verified clean clips |
| Presentation | Human-readable holds, arrow cursor, smooth pointer movement, click feedback, character typing | Enabled in the registered NexusReach manifest and exercised in real captures |
| Dual output | Landscape normalized walkthrough plus receipt-timed 1080×1920 H.264/AAC derivative | Ten verified MP4 outputs in the full five-flow run |
| Captions | Burned-in deterministic overlay plus private editable WebVTT | Five caption tracks generated from recorded step timings |
| Narration | Explicit provider-only interface; no implicit provider cost or local voice fallback | Fail-closed boundary tested; NexusReach narration intentionally disabled |
| Reliability | Durable local repository, immutable run directories, incremental checkpoint, bounded targeted retry, sensitive-shaped diagnostic redaction | Repeated real-browser integration plus an actual one-flow NexusReach retry passed |
| Generic runner | Ephemeral independent fixture product, randomized loopback origin, registered adapters, two workflows, repeated full and selected runs | Real Chrome and FFmpeg integration passed; this is technical portability evidence, not a second customer pilot |
| Hosted workflow | Connect/review/edit/approve/capture/preview/coverage/assembly and runtime-unavailable state | Nine hosted unit tests and two real-browser E2E journeys passed |
| Remote isolation boundary | Declarative manifest, no credential-like fixtures, exact response attestation, pinned image digest, production config preflight | Unit/config tests pass; production-shaped preflight passes |
| Regression | Repository lint, strict TypeScript, capture suite, full suite, desktop/web builds | 124 capture tests passed; 528 full tests passed with one intentional skip; builds passed |

The successful full NexusReach dual-output run began at `2026-07-15T02:51:59Z` and produced five clean clips, five vertical renders, five WebVTT tracks, independently verified outcomes, and complete declared goal/flow coverage. Generated private media remains ignored by Git and is not part of this audit document.

## What is still unknown or externally blocked

These items must remain visible as release gates rather than being converted into optimistic product claims:

1. **Second independent real product.** The generic fixture proves portability of the contracts, but it is not a substitute for a different real application with its own routes, state, visual density, authentication, and reset behavior.
2. **Deployed isolated browser pool.** The manifest and attestation contract is implemented; no container/microVM pool with non-root execution, read-only image, resource limits, default-deny egress, and retained platform attestation was available in this workspace.
3. **External secret manager and private object storage.** Production adapters, lifecycle rules, deletion reconciliation, and incident exercises require deployed services.
4. **Staging PostgreSQL/Redis evidence.** Migrations, queue fairness/leases, concurrent idempotency, cancellation, and recovery need staging load and failure-injection runs.
5. **Live discovery/repair providers.** Provider-neutral boundaries exist, but reviewed OpenAI/Anthropic adapters need measured recall, drift, cost, and recovery canaries before promotion.
6. **Read-only Git and analytics connectors.** Repository snapshots and usage-sequence contracts exist locally; installation/revocation, retention, privacy UI, provider audit, and low-volume production evidence remain.
7. **Trustworthy route/state denominators.** NexusReach truthfully reports route, state, sequence, flag, outcome, and failure-state dimensions as unknown where no bounded inventory was supplied.
8. **Reviewed narration.** No live TTS call was made because no approved production voice/provider configuration was placed in scope. Captioned silent derivatives remain the safe default.
9. **External review.** Penetration testing, privacy/legal/vendor review, accessibility/usability review, capacity/cost SLOs, and incident exercises remain required before general availability.

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

1. Run the same manifest, checkpoint, dual-output, and verification contract against one independent real demo product.
2. Compare locator failure rate, reset reliability, capture duration, visual QA, caption fit, and human comprehension with NexusReach.
3. Deploy the pinned isolated runtime plus external vault, PostgreSQL, Redis, and private object storage in staging.
4. Execute strict staging checks, live provider canaries, deletion/retention proof, load/failure injection, and an incident exercise.
5. Conduct design-partner review and external security/privacy assessment.
6. Promote only if every release gate has retained evidence; continue describing unknown dimensions as unknown.

