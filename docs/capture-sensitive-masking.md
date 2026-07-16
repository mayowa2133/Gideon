# Capture sensitive-region masking and support redaction

Status: locally implemented and verified in real Chromium. Production rollout still requires the isolated browser-worker gate.

## Runtime contract

Every Playwright capture and rendered-inventory context installs `capture-masking-v1` before creating its first page. The policy cannot disable the protected password, token, payment, email, personal-data, or canvas categories. Operators may add up to 50 bounded custom CSS selectors and choose a six-digit mask color; the exact validated policy is hash-bound to the isolated execution manifest.

The in-page runtime finds protected inputs from type, autocomplete, name, ID, ARIA, and explicit `data-sensitive` signals. It also masks canvases and bounded visible leaf text containing email, payment-number, or secret/token shapes. It directly obscures form text and maintains fixed opaque overlays above each visible protected rectangle. Mutation, input, change, scroll, resize, responsive layout, and modal transitions trigger realignment. The same initialization runs in every frame.

Before navigation evidence, each action, each screenshot, final verification, and context close, Gideon audits masking state. An unavailable runtime, invalid selector, truncated text scan, missing overlay, or changed policy fails closed as `capture_masking_unavailable`; no successful recording artifact is returned. Hidden protected elements are counted but require no visual overlay because they have no rendered pixels.

Screenshot pixels never enter receipts. The safe receipt contains only policy hash, frame count, matched/visible/hidden element counts, overlay count, canvas count, and `active` status. The worker validates that receipt before accepting dry-run or recording output and stores it beside other private action telemetry.

Synthetic fixture values are not serialized into an isolated execution manifest. The isolated client stages them behind a scoped opaque fixture grant, the manifest carries only the grant ID and bounded fixture keys, and the grant is revoked in a `finally` boundary after success or failure. Credential-shaped fixture keys and credential-shaped grant IDs are rejected; actual credentials continue to use the separate login-adapter vault boundary.

## Receipt and diagnostic privacy

Assertions are evaluated against the original approved plan, then sensitive-shaped assertion text is replaced with `[masked]` before receipt creation. URL assertions retain only normalized paths. Both the worker and isolated-runtime client reject returned receipts containing email, payment, secret, private-path, signed-URL, or forbidden private-field evidence.

Capture worker and pilot errors pass through the same bounded diagnostic redactor. Pilot failure artifacts retain repository counts instead of serializing repository state, local paths, object keys, or artifact records. Capture audit metadata rejects sensitive keys and any string that the redactor would change.

## Redacted support bundle

`createRedactedCaptureSupportBundle` writes one mode-0600 JSON report beneath a verified non-symlink private root. Bundle and capture IDs are opaque and traversal-safe. The output path is opened with create-exclusive and no-follow flags. A symlinked root/output directory, existing filename, unsafe ID, oversized report, or excessive object depth/count fails closed.

The report excludes media, screenshots, credentials, selectors, private paths, object keys, signed URLs, and raw prompts. Diagnostic strings redact email addresses, payment numbers, token/password/key shapes, signed query strings, local paths, secret-shaped filenames, and private object-key patterns. Metadata keys that could carry those values are replaced wholesale.

## Automated proof

The real-Chromium masking fixture covers:

- autofilled email and password fields;
- token and payment inputs;
- hidden secret inputs;
- visible sensitive text;
- canvas pixels;
- custom selectors;
- scrolling and viewport resizing;
- modal transitions;
- invalid custom selectors;
- browser-error documents;
- PNG pixel sampling; and
- WebM frame pixel sampling with FFmpeg.

Support tests cover secret-shaped repository paths, traversal IDs, symlinked roots/output directories, unsafe filenames, signed URLs, object keys, control characters, diagnostic leakage, file permissions, and bounded hashes.

## Honest limitations

- Gideon intentionally masks the entire canvas because canvas semantics cannot be inspected safely.
- Arbitrary personal information that has no field semantics, detectable shape, or configured selector may remain unknown. Operators must declare product-specific sensitive regions and review the clean take.
- Closed shadow roots, browser chrome, extensions, native permission dialogs, DRM surfaces, and cross-origin content that prevents the initialization audit are not accepted as verified masked output.
- Automated pixel checks do not replace privacy review, design-partner testing, or a penetration test of the production worker.
