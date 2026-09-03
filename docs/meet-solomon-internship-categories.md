# Meet Solomon — Finance, software and law internships

Three independently editable private review films on `codex/meet-solomon-style`,
August 30, 2026 (captures dated August 31 UTC). Each has 16 shots, aligned local
narration, original product pixels, a mouthless presenter, and a complete spoken
and visible closing CTA: **“Ready? Start your [category] internship search with
Solomon.”** No URL, comment-keyword delivery or application submission is implied.

## Three stories

- Finance connects the role, firm and recorded stage, with a sample reminder to
  review the role requirements. Its illustrated ledger contains no invented
  financial figures or investment advice.
- Software separates applications from preparation and shows a sample Technical
  interview round. A recorded Interviewing stage is not an interview guarantee.
- Law reads past the role title to eligibility and required documents, using an
  explicit sample note. It does not prescribe universal eligibility criteria,
  offer legal advice or promise hiring outcomes.

## Source and limitations

No authenticated category-specific account capture was available. Instead,
`scripts/prepare-meet-category-demo.mjs` copies the actual Solomon TrackerPage,
UI primitives and original CSS unchanged from the local product source. Only the
data hooks are replaced with read-only in-memory fixtures. The standalone
component preview has no authentication, backend, paid provider or account
mutation. It is not a bypass of the application login and does not verify the
full application, API or current vacancies.

The three fictional records are Finance Intern / Example Finance Co., Software
Engineering Intern / Example Software Studio, and Legal Intern / Example Legal
Group. Each was planned before capture, rendered at 1440×900, and captured as a
tracker plus selected detail panel. The source commit, component hashes, fixture
hash, exact captures, DOM bounds and timestamps are retained. The preview tab,
viewport override and server were closed after capture.

Every product shot says **OFFLINE DEMO / SAMPLE DATA**. Each role reveal includes
a spoken demo or sample disclosure and a not-a-live-vacancy label. Conceptual
illustrations are labelled separately. Do not use these films as evidence of
real applications, live internship availability or customer outcomes. Public
campaign use requires human content approval and suitable current evidence.

## Reproduce or revise

```sh
node scripts/prepare-meet-category-demo.mjs
# Run the generated local Vite harness from tmp/meet-internship-categories/demo;
# capture ?category=finance, ?category=software and ?category=law per CAPTURE-PLAN.
npm run creator:meet:solomon:finance-internships
npm run creator:meet:solomon:software-internships
npm run creator:meet:solomon:law-internships
npm run test:meet:solomon
```

The story blueprints are `fixtures/meet-solomon/{finance,software,law}-internships-v1.json`.
Their private capture plans, evidence and source PNGs are under
`tmp/meet-internship-categories/<category>/`. Use `--evidence` and `--capture-dir`
with preserved inputs when rendering to a new `--out` directory. `--prepare-only`
and `--stills-only` stop before video export. Existing local Chatterbox/Whisper
runtimes are required; model downloads and voice cloning remain disabled.

The isolated `meet-solomon-categories-v1` schema and `MeetSolomonCategories`
composition leave earlier Meet versions unchanged. Runtime gates require the
correct category's title, employer, stage and detail; the role/company must fit
inside one card, its stage must head the same column, and its selected detail
must share the detail panel's source hash. Wrapped software titles are supported.
Original source text must pass OCR and reach 28px; whole-screen establishing
views have a separate 10px recognizability floor and do not ground claims.

The complete category CTA must be last and held for 2.8–4.8 seconds. Other gates
require proof by 5.5 seconds, introduction by 8.5 seconds, no shot longer than
4.8 seconds, 50–70% presenter time and at least 90% aligned narration coverage.
Finance was tightened from 39.5 to 37.5 seconds to keep its longest shot below
the pacing ceiling. The software split illustration was moved clear of the
close-up presenter during visual review.

## Validation and preservation

73 targeted tests pass, including all previous Meet formats and V22 snapshots.
Lint, main and Remotion typechecks and the desktop/MCP/web build pass. The full
repository typecheck retains 52 existing renderer errors, with none in Meet
Solomon files. No application user flow, API, database or publishing behavior
changed, so application E2E was not rerun.

The private archives retain each master, source captures, demo component source,
script and film manifests, aligned captions, voice provenance, narration, sound
design, decoded-frame review and quality/preservation receipts. Generated media
is ignored by Git. Previous Meet masters are checked against their original
SHA-256 values and never overwritten. Render revisions to a new version folder.

## Render measurements

| Category | Duration | Final CTA | First proof | Aligned words | Presenter |
| --- | --- | --- | --- | --- | --- |
| Finance | 37.5s | 3.93s | 3.53s | 97.94% | 65.2% |
| Software | 39.5s | 3.40s | 5.07s | 98.04% | 68.4% |
| Law | 39.5s | 3.47s | 3.27s | 96.08% | 61.4% |

All masters are 1080×1920 at 30 fps, H.264/AAC, yuv420p / BT.709, with
48 kHz audio. Every source proof passes OCR. Every closing CTA is checked in
the encoded first and final CTA frames. The saved files are under
`renders/meet-solomon/internships/{finance,software,law}/v1/`.

| Category | Integrated loudness | True peak | Detected clicks |
| --- | --- | --- | --- |
| Finance | -14.40 LUFS | -1.74 dBTP | 0 |
| Software | -14.61 LUFS | -1.75 dBTP | 0 |
| Law | -14.30 LUFS | -1.62 dBTP | 0 |
