# Meet Solomon 05 — Beyond engineering

Branch: `codex/meet-solomon-style`. Private review cut, August 30, 2026.

This implements campaign concept **05 — non-tech people working in tech** as
a separate 36.5-second film. The opening questions whether working at an AI
company always means writing code. Actual Solomon captures then reveal an IP
counsel role and an economic mobility partnerships role at Anthropic. The
closing advice is to read each role’s requirements and start from your existing
expertise. It does not promise that either role requires no coding or that a
viewer is qualified for it.

## Creative treatment

Sixteen shots alternate the mouthless Solomon presenter, full-screen role
reveals, close crops of original product pixels, and labelled illustrations.
The first proof appears at 3.23 seconds, the introduction at 5.9 seconds, and
the final brand card lasts 1.17 seconds. The presenter occupies 64.0% of running
time. The longest shot lasts 3.83 seconds.

The opening code-window assumption returns as widened brackets around legal
and partnerships work. A company-to-roles illustration connects the two
examples without suggesting a hiring distribution. A qualifications reminder
precedes the closing callback. A repetitive reassurance beat was removed during
review, reducing the draft from 40 to 36.5 seconds. Bold sans-serif captions
carry most of the film; serif is reserved for the opening question, partnerships
reveal and callback. Quiet original sound cues emphasize reveals. Narration uses
the existing local Chatterbox default voice, without voice cloning or a paid
provider call.

## Evidence and release limits

The source is an existing private Solomon product capture from
**2026-08-25T01:09:59.579Z**, not a fresh account session. A capture plan and
evidence receipt document the angle’s requirements and the reuse decision.
The original PNG is hash-pinned. Six factual crops pass OCR: company search,
legal title, legal employer, legal category, partnerships title and partnerships
employer. A seventh crop is an establishing application view, excluded from
claim grounding.

The title and employer for each role must come from the same captured card.
The two employers must match within the same captured source before the film
can say “same company.” Only the visible partnerships title excerpt is used;
a truncated suffix and a longer title in capture metadata are not substituted
for visible pixels. No product UI is recreated with HTML text.

Every factual crop uses the renderer’s contain scale and must reach 28px source
text at 1080-wide output; the final minimum is 28.25px. The application view
uses a separate 10px recognizability threshold and measures 10.08px. This does
not make all text in the establishing view readable. Conceptual graphics carry
illustration labels and are not offered as product evidence.

The cut is labelled as a private style study with dated captures. It establishes
what those captured listings showed, not present availability, hiring ratios,
coding requirements, eligibility, or a demonstrated background search. Obtain
fresh angle-specific captures and review the claims before any public campaign
release. No public URL, delivery automation or publication approval is implied.

## Reproduce or revise

```sh
npm run creator:meet:solomon:nontech
npm run creator:meet:solomon:nontech -- --stills-only
npm run test:meet:solomon
```

The editable script is `fixtures/meet-solomon/nontech-v1.json`. Local evidence
metadata and source images are under `tmp/meet-solomon-05-nontech/`; use
`--evidence` and `--capture-dir` for explicit private inputs. Those assets are
not committed. The runtime inputs are therefore required in addition to a
checkout. Rendering uses existing local Chatterbox and Whisper installations;
model downloads remain disabled.

The `meet-solomon-nontech-v1` schema and `MeetSolomonNontech` composition are
independently selectable. They reuse common timing/evidence validation and the
mouthless V22 rig without expanding the older story schemas or changing V1/V2
layouts. Phased proof swaps are rejected because this format displays each
shot’s title/employer proof together. Action cues must occur in aligned speech.

The preserved output is
`renders/meet-solomon/05-beyond-engineering/v1/meet-solomon-05-beyond-engineering.mp4`.
Its directory contains source metadata and captures, the script and compiled
film, narration and sound-design tracks, voice provenance, alignment, quality
reports, encoded-frame contact sheet and hash preservation receipt. Render
revisions into a new working directory, never into this preserved directory.
The existing V1 and V2 saved masters were rechecked against their original
SHA-256 receipts and remain unchanged.

## Validation

The encoded master is 1080×1920, 30 fps, 1,095 frames, H.264/AAC, yuv420p with
BT.709 metadata, and 48 kHz audio. Narration alignment matches 98.95% of script
words. Audio measures −14.67 LUFS and −1.43 dBTP, with zero detected clicks.
The decoded shot detector finds 16 shots. Automated checks support review;
they do not establish creative mastery or substitute for publication approval.

Validation passed: 39 targeted tests, including older Meet formats and V22
golden snapshots; repository lint; main and Remotion typechecks; desktop,
MCP and web build; source PNG/hash/OCR checks; full render and decoded media
checks. Final exported frames were inspected, including role crops, captions,
the role map and closing transitions. A moving illustration was resized to
keep its disclosure label clear at full rotation.

The full repository typecheck still reports 52 existing renderer errors in
angle-blueprint tests, `.mjs` declarations and mascot literal-type tests; none
are in Meet Solomon files. No application user flow, API, database, provider
contract or publishing flow changed, so application E2E was not rerun.
Private media and generated binaries remain outside Git.
