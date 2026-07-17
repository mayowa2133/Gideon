# Phase 13 local evidence — final recapture and delivery

Date: 2026-07-16 (run IDs use UTC and therefore begin 2026-07-17)

## Real product and media evidence

- `pnpm capture:pilot`: final NexusReach run `2026-07-17T00-18-35-960Z-9fe4ac7c-948d-4560-aa36-8aa95b07b8a0` passed five of five workflows and independently verified synthetic application outcomes.
- `SIGNALDRAFT_API_TOKEN=<disposable-local-token> pnpm capture:pilot:signaldraft`: final isolated heuristic-mode run `2026-07-17T00-25-37-255Z-61090262-1510-47c2-8418-101851d3df41` passed two of two workflows, with no OpenAI key/provider call and live send blocked before approval.
- `pnpm capture:hostile:check`: five permitted workflows passed; seventeen prohibited workflows were rejected; all nine prohibited-side-effect counters remained zero.
- `pnpm capture:baseline`: two pilots, seven verified workflows, seven landscape clips, seven 1080×1920 renders, seven caption tracks, seven quality reports, and seven contact sheets; four ready, three warnings, zero failed, current coverage for both pilots.
- Both generated reports were mode `0600`; all media and runtime state remained under ignored `tmp/` storage.
- The seven final contact sheets were visually inspected for focus framing and caption placement. Automated evidence does not replace real-phone/human comprehension review.

## Regression discovered and fixed

The first NexusReach command correctly failed while the demo was offline. After startup, the first approved React control was attached after `DOMContentLoaded`; two dry runs failed closed at `locator_not_found` and promoted no recording. `uniqueActionLocator` now waits for attachment only within the existing 500–30,000 ms bounded action timeout, then retains the unique and visible match requirements. A real-browser fixture delays a control by 250 ms and verifies successful bounded resolution. A targeted onboarding retry and the subsequent complete five-flow run passed.

SignalDraft's first process start collided with the still-running NexusReach API on port 8000. Gideon rejected the mismatched verification API. After the completed NexusReach demo was stopped, SignalDraft started with its approved temporary database, API auth, heuristic mode, and no OpenAI key; the full run passed.

## Final automated checks

- `pnpm lint`: passed.
- `pnpm typecheck`: passed for main, renderer, MCP, and hosted web.
- `pnpm test:capture`: 63 files and 225 tests passed.
- `pnpm test`: 128 files passed, 2 skipped; 633 tests passed, 8 skipped.
- `pnpm test:web`: 3 files and 9 tests passed.
- `pnpm test:e2e`: 4 real-Chromium tests passed, including the hosted capture journey, capability fail-closed state, accessibility/responsive checks, and keyboard/focus/reduced-motion behavior.
- `pnpm build`: Electron main/renderer, MCP, and hosted Next.js production builds passed.
- Targeted Playwright executor integration: 11 real-browser tests passed.

## Production-shaped checks

- `pnpm production:check -- --dry-run`: passed and enumerated the 36 production promotion gates without performing live promotion or paid calls.
- `pnpm production:observability:check -- --dry-run`: passed.
- `pnpm capture:isolation:check`: static policy passed with the pinned image/policy hashes; runtime validation was not run because Docker was unavailable.
- `pnpm capture:worker:check` intentionally failed with no deployment environment, then passed with a production-shaped HTTPS isolated-runtime endpoint, pinned image digest, external vault, S3, PostgreSQL, Redis, queue/concurrency/browser-time settings, FFmpeg path, and policy version.

## Supported and unsupported claims

Supported: the approved seven-flow local corpus is repeatably captured and verified with human-paced pointer/typing presentation, vertical framing, captions, quality evidence, safe coverage, and prohibited-action enforcement.

Unsupported: complete product-flow knowledge, arbitrary-site robustness, production isolation, cloud failover, production capacity/cost/SLOs, external security/privacy/legal approval, assistive-technology coverage, or human mobile comprehension. Those remain explicit gates in [capture-final-delivery-2026-07-16.md](./capture-final-delivery-2026-07-16.md).
