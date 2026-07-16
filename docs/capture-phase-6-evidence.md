# Phase 6 evidence — deterministic discovery and bounded repair

Date: 2026-07-16

## Outcome

Phase 6 is locally verified. Gideon now selects durable locators, detects ambiguous action targets before interaction, bounds provider-guided discovery and repair, distinguishes harmless locator drift from material page changes using safe evidence, and preserves every accepted repair as a draft revision for human approval.

No live model provider, customer product, credential, screenshot pixel, or paid API was used.

## Implemented evidence

- `src/shared/productFlowCapture.ts` runtime-validates stable-link and named-landmark locators in addition to existing role, label, test-ID, placeholder, and text strategies.
- `src/main/playwrightCaptureExecutor.ts` counts visible locator matches before click, fill, select, or targeted key actions and emits `locator_not_found`, `locator_not_visible`, or `locator_ambiguous`.
- Real Chromium tests prove duplicate accessible names are rejected and stable destination/named-landmark locators select the intended control.
- `src/main/flowDiscovery.ts` validates scope, approval, persona, risk, evidence IDs, routes, controls, duplicate IDs, attempt count, timeout, and circuit state around provider output.
- `src/main/capturePageComparison.ts` releases only paths, hashes, accessibility similarity, and a locally computed screenshot similarity. Screenshot pixels do not cross the repair boundary.
- `src/main/flowRepair.ts` permits one locator or wait-assertion replacement on an explicitly failed step and requires the replacement locator to match exactly one current control.
- Changed path/DOM structure or similarity below the versioned policy thresholds produces `material_change_review_required` without calling the provider.
- `fixtures/capture-repair-golden-v1.json` replays seven synthetic drift, ambiguity, material-change, prompt-injection, duplicate, unsafe, and timeout cases.

## Automated checks

| Command | Result |
| --- | --- |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |
| `pnpm test:capture` | 53 files, 185 tests passed |
| `pnpm test` | 118 files passed, 1 skipped; 590 tests passed, 1 skipped |
| `pnpm test:web` | 3 files, 9 tests passed |
| `pnpm test:e2e` | 2 Chromium tests passed |
| `pnpm build` | desktop main/renderer/MCP and hosted Next.js build passed |
| `pnpm capture:hostile:check` | 5 permitted flows passed; 17 prohibited plans blocked; 0 of 9 trap side effects occurred |

The single skipped full-suite case is an existing optional integration gate and is not a Phase 6 regression.

## Supported claims

- Gideon rejects ambiguous action targets instead of silently selecting the first match.
- Gideon can recover a harmless synthetic accessible-name drift by producing a bounded draft repair.
- A material synthetic path, structure, accessibility, or screenshot change returns to revision-bound human review.
- Malformed, duplicated, ungrounded, risk-expanding, drifting, slow, failed, or over-budget fake-provider behavior fails closed.
- The hostile fixture remains side-effect free after the locator changes.

## Unsupported claims and external gates

- No claim is made that every real application exposes durable accessible locators.
- The similarity thresholds have not received design-partner or human-comprehension validation.
- No OpenAI, Anthropic, or other live reasoning-provider adapter is approved or enabled.
- Model recall, latency, privacy, and cost require provider canaries plus human-reviewed rollout thresholds.
- A repaired draft still requires human approval and a deterministic dry run before clean recording.
