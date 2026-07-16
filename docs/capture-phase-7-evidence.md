# Phase 7 evidence — sensitive-region masking and privacy

Date: 2026-07-16

## Outcome

Phase 7 is locally implemented and verified. Gideon now installs strict masking before capture pages are created, continuously aligns protected overlays, verifies masking before accepting screenshots or recordings, removes sensitive-shaped values from receipts/diagnostics, stages remote fixture values outside manifests, and generates bounded redacted support reports.

All test content is synthetic. No customer media, production credentials, signed URLs, private object-store data, or live provider calls were used or committed.

## Implemented evidence

- `src/main/captureMasking.ts` validates the non-disableable password/token/payment/email/personal-data/canvas policy, installs frame-local masking before page scripts, realigns on mutation/input/change/scroll/resize, and produces numeric/hash-only receipts.
- `src/main/playwrightCaptureExecutor.ts` audits masks before actions and screenshots, redacts assertions after evaluation, removes query/fragment and sensitive path material from network receipts, and rejects any remaining privacy-unsafe receipt data.
- `src/main/captureInventoryCrawler.ts` applies the same mask before screenshot hashing and replaces masked control names with a generic label.
- `src/main/isolatedCaptureRuntime.ts` hash-binds the mask policy, revalidates remote masking/privacy receipts, stages synthetic fixture values through an opaque grant instead of the manifest, and revokes that grant after success or failure.
- `src/main/captureRunWorker.ts` validates both dry-run and recording masking evidence before storing media and retains the safe masking receipt in private action telemetry.
- `src/main/captureSupportBundle.ts` creates exclusive no-follow mode-0600 JSON reports beneath a verified non-symlink private directory and redacts secret-shaped diagnostics/metadata.
- Capture audit values and pilot/worker diagnostics use the same privacy checks; pilot failure evidence now stores repository counts instead of repository state.

## Real-browser and media proof

The committed real-Chromium test proves masks for autofilled email/password fields, token/payment fields, a hidden secret field, visible email text, canvas pixels, a custom private panel, scroll, responsive resize, and modal transitions. It also proves invalid CSS and browser-error documents fail closed.

FFmpeg samples the center pixel of every protected PNG region and a protected WebM frame. The observed pixels match the configured opaque dark mask rather than the underlying white/red fixture content.

A headed Playwright CLI inspection confirmed the committed hostile fixture exposes its synthetic member flow and adversarial prompt-injection region through stable accessible controls. The CLI session and generated snapshots were deleted after inspection.

## Automated checks

| Command | Result |
| --- | --- |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |
| `pnpm test:capture` | 56 files, 197 tests passed |
| `pnpm test` | 121 files passed, 1 skipped; 602 tests passed, 1 skipped |
| `pnpm test:web` | 3 files, 9 tests passed |
| `pnpm test:e2e` | 2 Chromium tests passed |
| `pnpm build` | desktop main/renderer/MCP and hosted Next.js build passed |
| `pnpm capture:hostile:check` | 5 permitted flows passed; 17 prohibited plans blocked; 0 of 9 trap side effects occurred |

The single skipped full-suite case is an existing optional integration gate and is not a Phase 7 regression.

## Supported claims

- Protected synthetic values are visually obscured in tested PNG and WebM output.
- Mask overlays remain aligned through tested scroll, responsive, and modal changes.
- Hidden protected fields produce no visual region; canvas is conservatively masked in full.
- Missing/incomplete masking, invalid selectors, unbounded text scans, and browser-error documents cannot produce accepted capture evidence.
- Sensitive-shaped assertion/network/diagnostic/audit/support data is redacted or rejected.
- Isolated manifests contain fixture grant IDs/keys, not fixture values, and staged grants are revoked after success or failure.
- Hostile-flow side-effect protections remain unchanged.

## Unsupported claims and external gates

- Shape/semantic detection cannot identify every arbitrary piece of personal information. Product-specific selectors and human clean-take review remain required.
- Closed shadow roots, browser chrome/extensions, native dialogs, DRM, and frames that prevent the audit are not supported as verified masked output.
- No production container/microVM worker has exercised this policy yet.
- External privacy review, penetration testing, design-partner validation, retention review, and production incident exercises remain mandatory.
