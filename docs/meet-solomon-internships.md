# Meet Solomon — Your internship hunt

Private review cut on `codex/meet-solomon-style`, August 30, 2026.

The user requested an internship film and a closing CTA. This 37.5-second,
16-shot cut starts with scattered search tabs, reveals a sample Marketing Intern
card, then brings the role, company and tracked stage together. It ends with
**“Start your internship search with Solomon.”** The complete CTA stays on
screen for 2.5 seconds; there is no public URL, fake button or comment-keyword
delivery promise.

## Evidence and disclosure

The capture plan was written before opening the product. The local Solomon
frontend initially was not running. It was started with its normal development
command; `/jobs` then required sign-in. No authenticated alternative browser
session was available. Authentication settings were not changed, no account
data was modified, and the temporary browser tab and preview server were closed.

The review cut therefore uses the existing August 11, 2026 **product demo**
capture, not a live internship feed. Marketing Intern / Northstar Labs is
deliberately seeded sample data. Its Interviewing stage is a sample recorded
status, not an observed customer interview or an outcome Solomon achieved.
The narration says “demo” and “sample”; the header, product-shot labels and
footer disclose demo/sample data. The first card reveal also says it is not a
live vacancy. The film explicitly distinguishes recorded status from a hiring
guarantee.

The original tracker PNG is preserved byte-for-byte. Five factual crops pass
OCR: internship title, company, full card, column heading and Application
Tracker title. A separate wide tracker view establishes the product and cannot
ground individual facts. Role and company must fit within the same source card;
the stage must head that card’s column. All share an approved source hash and
capture date. The renderer uses original image pixels, not recreated UI text.

Factual source type must reach 28px at 1080-wide output. The wide product view
uses its own 10px recognizability floor. Dates, requirements, fit and next-step
graphics are labelled illustrations; they do not invent deadlines, product
fields or eligibility criteria. No application, outreach or posting is sent.
For public campaign use, obtain fresh angle-specific evidence and human content
approval. This cut does not prove live internship discovery or current vacancy
availability.

## Reproduce and revise

```sh
npm run creator:meet:solomon:internships
npm run creator:meet:solomon:internships -- --stills-only
npm run test:meet:solomon
```

The editable script is `fixtures/meet-solomon/internships-v1.json`. Local
evidence and captures live under `tmp/meet-solomon-internships/`. They are
private inputs, not committed fixtures; use `--evidence` and `--capture-dir`
to point at a preserved copy. Existing local Chatterbox and Whisper runtimes
are required. No voice cloning, paid provider or model download is introduced.

`meet-solomon-internships-v1` and `MeetSolomonInternships` are isolated schema
and composition selections. Older Meet schemas and layouts remain unchanged.
The new story and compiled-film boundaries require the sample-data declaration,
proof relationships, readable crops, spoken demo disclosure and exact final
CTA. Timing gates require first proof by 5.5 seconds, introduction by 8.5,
50–70% presenter presence, and a 2.3–4.5-second CTA hold. The same mouthless V22
rig supplies the presenter, with movements tied to aligned speech.

The first visual pass corrected an end-card text overlap and separated a
return arrow from a source label. The final duration was tightened from 39.5
to 37.5 seconds. All three previously saved Meet masters were checked against
their original SHA-256 values and remain unchanged.

The saved video is
`renders/meet-solomon/internships/v1/meet-solomon-internships.mp4`.
Its archive includes the script, film manifest, original demo screenshot and
receipt, evidence metadata, narration, sound-design track, voice provenance,
alignment, encoded-frame review, quality reports and preservation hashes.
Do not render revisions into a preserved directory.

## Validation

49 targeted tests pass, including older Meet formats and the V22 golden
snapshots. Lint, main and Remotion typechecks, and desktop/MCP/web build pass.
The repository-wide typecheck still reports 52 pre-existing renderer errors
in angle-blueprint tests, `.mjs` declarations and mascot literal-type tests;
none are in Meet Solomon files. No application user flow, API, database or
publishing behavior changed, so application E2E was not rerun.

The encoded master is 1080×1920, 30 fps, 1,125 frames, H.264/AAC, yuv420p with
BT.709 metadata and 48 kHz audio. Measured loudness is −14.42 LUFS with a
−1.79 dBTP true peak and zero detected clicks. Narration alignment matches
96.81% of script words. The first proof appears at 4.03 seconds, the introduction
at 7.83 seconds, and the complete CTA occupies 35.0–37.5 seconds. Presenter
presence is 65.3%; the longest shot lasts 3.8 seconds.

Minimum factual source text is 30.88px; the separate establishing view measures
12.66px and is not used as claim evidence. All five factual crops pass OCR and
source hash checks. The full render, decoded media checks and sixteen-scene
encoded-frame contact-sheet review pass. The final CTA has no overlapping text,
and the product source labels remain clear of the moving illustrations.
Automated checks do not substitute for approval to publish this demo footage.
