# Structured product capture final local delivery — 2026-07-16

## Outcome

Gideon can locally connect to two explicitly registered safe demo products, import or discover bounded flows, require exact-revision human approval, reset each starting state, dry-run and record approved actions in real Chromium, render landscape and vertical outputs with a visible arrow pointer/click/typing presentation, verify application outcomes, calculate versioned coverage, and fail closed on unsupported or unsafe behavior.

This is strong local/staging-preparation evidence. It is not evidence that Gideon knows every possible flow, is safe for arbitrary production products, or is generally available.

## Final real-product recapture

The immutable final full runs are:

- NexusReach: `2026-07-17T00-18-35-960Z-9fe4ac7c-948d-4560-aa36-8aa95b07b8a0` — five of five declared goals and approved flows verified.
- SignalDraft: `2026-07-17T00-25-37-255Z-61090262-1510-47c2-8418-101851d3df41` — two of two declared goals and approved flows verified, including the approval-required failure state while live send remained blocked.

Together they produced seven normalized 1440×900 clips, seven 1080×1920 H.264/AAC vertical renders, seven editable WebVTT tracks, seven private framing manifests, seven private quality reports, and seven private contact sheets. The redacted mode-`0600` baseline reports seven verified workflows, four quality-ready outputs, three review warnings, and zero failures.

| Product / flow | Duration | Vertical size | Pointer / typing | Quality result |
| --- | ---: | ---: | --- | --- |
| NexusReach / onboarding | 36.433s | 1,058,895 B | 350ms pointer, 45ms/character | warning: legitimate loading page state; human review required |
| NexusReach / browse jobs | 11.200s | 961,431 B | 350ms pointer, 45ms/character | ready |
| NexusReach / saved contacts | 10.000s | 723,371 B | 350ms pointer, 45ms/character | ready |
| NexusReach / tracker update | 22.467s | 1,201,585 B | 350ms pointer, 45ms/character | ready |
| NexusReach / draft review | 8.567s | 299,418 B | 350ms pointer, 45ms/character | ready |
| SignalDraft / recruiter analysis | 20.833s | 813,781 B | 400ms pointer, 22ms/character | warning: long caption dwell; human review required |
| SignalDraft / sensitive compensation | 20.467s | 673,502 B | 400ms pointer, 22ms/character | warning: long caption dwell; human review required |

All seven outputs had three informative sampled frames, preserved the declared pointer presentation, and passed black/blank/frozen/detail, effective-text, caption-fit, pointer/click/typing evidence, pacing, target-evidence, and camera-motion failure gates except for the listed warnings. Contact sheets were visually inspected for framing and caption placement. Actual mobile-device comprehension remains a human gate.

The final hostile fixture passed five permitted complex workflows and rejected seventeen prohibited workflows with expected blocker codes; all nine prohibited-side-effect counters remained zero.

## Final automated verification

- 63 capture test files / 225 tests passed.
- 128 full-suite files passed and 2 skipped; 633 tests passed and 8 skipped.
- 3 hosted web files / 9 tests passed; 4 real-browser E2E tests passed.
- Repository lint, all strict TypeScript targets, and Electron main/renderer, MCP, and hosted Next.js builds passed.
- Static isolation, production-readiness dry-run, observability dry-run, and a production-shaped capture-worker configuration passed. Docker runtime enforcement remained unavailable and is not claimed.

The exact command and failure-resolution record is [capture-phase-13-evidence.md](./capture-phase-13-evidence.md).

## Failure found and resolved during final recapture

The first final NexusReach attempt correctly refused to start while the demo was offline. After startup, two dry runs failed closed because the React app attached the first approved control after `DOMContentLoaded`, while Gideon performed an immediate locator count. No recording was promoted.

The executor now waits for the first matching control to attach only within the existing bounded action timeout, then performs the same unique/visible/ambiguous checks. A real-browser delayed-control fixture covers the regression. A targeted onboarding retry passed before the complete five-flow recapture. SignalDraft's first startup then failed because NexusReach still occupied its API port; Gideon rejected the mismatched verification service, the completed demo was stopped, and the isolated SignalDraft services were started successfully.

## Capability matrix

| Classification | Capability | Evidence / remaining boundary |
| --- | --- | --- |
| Locally verified | Typed action policy, exact-revision approval, reset, dry run, clean recording, verification, normalization, framing, captions, pointer/click/typing presentation, quality gates, coverage, assembly lineage | Two products, seven current flows, hostile matrix, real Chromium and FFmpeg |
| Locally verified | Privacy and safety boundaries | Pre-frame masking tests, content-free receipts, workspace scoping, SSRF/egress policy, prohibited-action counters, private mode-`0600` reports |
| Locally verified | Persistence and recovery contracts | Five migrations, disposable PostgreSQL/Redis/BullMQ, S3-compatible fixture, idempotency, leases, retry, cancellation, deletion/reconciliation, duplicate-usage protection |
| Locally verified | Operator and hosted review surfaces | HTTP, CLI, MCP, OpenAPI, responsive/axe/keyboard E2E, capability fail-closed behavior |
| Locally verified | Operational planning | Nine-stage telemetry/SLO/alert contract, 32-task bounded synthetic exercise, runaway termination, deterministic provider-free cost model, six incident state models |
| Implemented, not deployed | Isolated browser container/proxy and teardown attestation | Static policy and contracts pass; Docker runtime was unavailable locally and no production pool is connected |
| Implemented, not deployed | Production PostgreSQL, Redis, private object storage, vault, audit export, telemetry dashboards/paging | Local adapters/checks exist; staging/cloud endpoints and secrets were not placed in scope |
| Implemented, not deployed | Provider-neutral discovery/repair and narration adapters | Budgets, schema validation, grounding, circuit breakers, and fail-closed interfaces exist; no reviewed live model/TTS adapter or paid canary ran |
| Externally blocked | General-availability security/privacy/legal/vendor approval | Requires independent review, penetration testing, contracts, retention review, and operational ownership |
| Externally blocked | Production capacity, cost, SLO, failover, and incident-response certification | Requires deployed soak/load, managed-service failures, real billing, paging, recovery timing, and incident participants |
| Requires human evaluation | Mobile readability, pacing/comprehension, caption accuracy, assistive technology, zoom/reflow, touch ergonomics, and overall usability | Automated gates and contact sheets reduce risk but do not substitute for representative people/devices |
| Requires human evaluation | Discovery completeness and useful-flow ranking | Hidden routes, roles, flags, third-party surfaces, and uninstrumented states remain unknown; design partners must judge relevance and denominator governance |

## PR and merge ledger

| Phase | PR | Merge commit |
| --- | --- | --- |
| Baseline | [#8](https://github.com/mayowa2133/Gideon/pull/8) | `22f67e6c6ffe7dab92cc4b58ae1c1839d14037cd` |
| Framing | [#9](https://github.com/mayowa2133/Gideon/pull/9) | `95519d8f0191b8425ca9aea46ae61624d64f89e1` |
| Video quality | [#10](https://github.com/mayowa2133/Gideon/pull/10) | `e81c3229b9a050222ab1ea8100271a307f393175` |
| Coverage | [#11](https://github.com/mayowa2133/Gideon/pull/11) | `9c5af566f82df0a7f40ed9e51f80e05477246e66` |
| Hostile fixture | [#12](https://github.com/mayowa2133/Gideon/pull/12) | `bf7d989a77edd326065aef69c0c9eb02d0a4c814` |
| Discovery and repair | [#13](https://github.com/mayowa2133/Gideon/pull/13) | `a0e1971bc81bd09658fb255aec4cb072c430e534` |
| Sensitive masking | [#14](https://github.com/mayowa2133/Gideon/pull/14) | `f466f1941f04eb22a256bd6ea8003430a3527ea1` |
| Browser isolation | [#15](https://github.com/mayowa2133/Gideon/pull/15) | `6993aebc2cc134e9467e4e8dc8aa505b9fba12df` |
| Local infrastructure | [#16](https://github.com/mayowa2133/Gideon/pull/16) | `f4ef0a77d7b28494cd1cfaa1e85b3ede3e7411ac` |
| Operator surfaces | [#17](https://github.com/mayowa2133/Gideon/pull/17) | `58418e705cd4f2cdddd504d91f385e45c4f78dac` |
| Accessibility/responsive | [#18](https://github.com/mayowa2133/Gideon/pull/18) | `da53cf3d9ea217e21882a5684f353eeb674f2ec0` |
| Operational readiness | [#19](https://github.com/mayowa2133/Gideon/pull/19) | `039dd5c875643005a789190a71c7ec55a93ea6f4` |

## Recommended first external validation

Run one controlled design-partner sandbox pilot on a deployed isolated worker with a synthetic account and no production/customer data. Have the partner nominate and approve 5–10 high-value flows, then measure reset success, locator failure/repair rate, time and cost per verified minute, unsafe-action blocks, masking review, caption/pacing comprehension on a real phone, and coverage-denominator disagreements. This single activity tests the largest remaining uncertainty: whether the bounded, safe system captures the flows humans actually value in a third product.
