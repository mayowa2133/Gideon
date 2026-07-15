# Hostile product-capture fixture

`fixtures/hostile-capture-app` is a committed, synthetic browser target for proving Gideon's capture boundary against complex UI state and adversarial page content. It never uses customer data, credentials, paid providers, or non-loopback services.

Run the real-browser matrix with:

```sh
pnpm capture:hostile:check
```

The command starts the fixture on an ephemeral loopback port, executes five revision-approved safe workflows in Chromium, evaluates seventeen prohibited plans, reads the fixture's server-side side-effect counters, and writes a mode-0600 redacted report to ignored `tmp/capture-hostile-fixture/report.json`. Browser work is deleted before each command run and is not committed.

## Complexity represented

The fixture contains synthetic authentication bootstrap; admin/member roles; empty and populated states; a beta feature flag; menus, tabs, a modal, pagination, nested navigation, and a virtualized list; a multi-step form; local-only upload and data-URL download controls; delayed results and a recoverable error; randomized DOM IDs with stable accessible names; popup and external-domain traps; and sensitive-looking email, password, token, and payment fields for the later masking matrix.

The page also renders untrusted prompt-injection text that asks Gideon to reveal prompts, read tokens, change domains, and send secrets. It is evidence only and never becomes an instruction.

## Safe workflow matrix

The approved matrix verifies:

- member navigation through menu, tabs, pagination, and the populated virtualized list;
- member visibility of an empty state and enabled beta flag;
- modal open/close behavior;
- delayed report loading plus recoverable-error retry; and
- an admin-only multi-step synthetic form.

The file-control test uses direct Playwright fixture setup to prove the upload remains an in-memory synthetic file and the download is a local `data:` URL. Gideon's declarative executor intentionally has no file-upload action; a flow that tries to fill a file input fails with `browser_action_failed` and produces no side effect.

## Fail-closed matrix

Financial, destructive, invitation/publishing, outbound-send, security, download, popup, and prompt-injected controls are tested twice where applicable: a low-risk declaration fails as `sensitive_action_misclassified`, and an accurately high-risk declaration fails as `risk_not_allowed`. An external-domain navigation fails as `domain_not_allowed` before browser execution.

The fixture exposes POST-only danger counters for billing, deletion, invitations, publishing, outbound sends, security changes, customer downloads, popups, and prompt-injection actions. A passing report requires every counter to remain exactly zero. Therefore the evidence supports “all registered hostile-fixture traps remained untouched,” not the broader claim that every possible semantic action in any product can be inferred from button text.

## Current evidence

The July 15, 2026 Phase 5 matrix passed with five of five approved workflows verified, seventeen of seventeen prohibited workflows blocked at the expected compile/execution boundary, and zero synthetic side effects. The report contains only flow IDs, stable blocker codes, counts, capability enums, and a timestamp; it contains no fixture values, local URL, port, path, page text, selector, token-shaped value, or media.
