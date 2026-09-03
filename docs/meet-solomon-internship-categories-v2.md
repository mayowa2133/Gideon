# Meet Solomon internship categories — V2

Private review revisions of finance, software and law, on
`codex/meet-solomon-style`. V1 scripts, compositions, captures and saved videos
remain unchanged. V2 is selected explicitly as `meet-solomon-categories-v2` and
`MeetSolomonCategoriesV2`.

## Editorial changes

The three scripts drop from 16 shots to 12. Repeated role/stage explanations,
generic advice and duplicate recaps are removed. Category-specific hooks lead
straight to the sample application, followed by the Solomon introduction.
The runtime accepts 30–33 seconds, first proof after a readable 1.5-second hook
and by 3.2 seconds, and introduction by 6.6 seconds. These are editorial checks,
not a guarantee of audience retention or conversion.

The presenter is smaller and absent from the opening interaction, full proof,
checklist and tracker establishing shots. The weighted presenter target is
35–60%, versus V1's 50–70%. The character stays mouthless, with no lip-sync claim.

Finance connects firm and stage using paired slips that resolve to joined
context. Software separates application and preparation lanes, then compares
the role with the viewer's projects. Law scans past the title and separates
eligibility, documents and dates in an illustrated checklist. These graphics
remain explicitly conceptual, not product UI or verified job requirements.

The CTA now matches the application tracker actually demonstrated:
**“Organise your [category] internship applications with Solomon.”**
The complete action and product name stay visible for a measured 3–5 seconds.
There is no URL, fake button, delivery promise, application submission or posting.
The spoken “Ready?” preamble was removed after the first timing pass lingered
too long on the ending.

## Captured selection

The same preserved offline component harness was opened for each category.
Its original Solomon TrackerPage and styling remain unchanged. Fixtures are
read-only, there is no backend or authenticated account, and save/mutation hooks
remain blocked. The capture tab and preview server were closed afterwards.

A visible sample role card was selected through the UI. Its actual before and
after screenshots are retained at 1280×720, with the original JPEG bytes, PNG
conversions, bounds, source hashes and capture timestamps. The film shows these
states with an **editorial hard cut**, disclosed on screen; this is not a
continuous recording or a reconstructed UI animation. No text is painted into
product pixels. The selected panel must pass OCR for its category's role,
employer and note/technical-round text before rendering.

The interaction receipt binds the category and the two distinct source hashes,
requires ordered captures within 30 minutes and declares that playback is not
continuous. A card remains visible for at least 0.6 seconds before the cut; the
detail panel then has at least one second. The panel establishes context; the
following factual crops provide the legible proof. Original V1 factual regions
retain the 28px floor, separate from the 10px establishing-context floor.

All sample-data limitations from V1 still apply. Nothing demonstrates real
vacancies, customer applications, backend persistence or hiring outcomes.
Public use still requires human content approval and appropriate evidence.

## Reproduce

```sh
npm run creator:meet:solomon:finance-internships:v2
npm run creator:meet:solomon:software-internships:v2
npm run creator:meet:solomon:law-internships:v2
npm run test:meet:solomon
```

Story blueprints are `fixtures/meet-solomon/{finance,software,law}-internships-v2.json`.
Local output roots are `tmp/meet-internship-categories-v2/<category>/`. Besides
`evidence.json` and `capture/`, V2 requires `interaction-capture.json`. Use a new
output directory for revisions; the renderer refuses preserved archives.
Existing local Chatterbox and Whisper provide narration and alignment, with no
voice cloning, new paid provider or model downloads. Original quiet sound accents
are retained. Captures, voices and masters remain ignored by Git.

## Validation

100 targeted tests cover earlier formats plus V2 source binding, ordered state
changes, category grounding, readable proof, disclosure, phase selection,
opening timing, smaller presenter, aligned captions and the application CTA.
Main and Remotion typechecks, lint and build are checked separately. The full
repository typecheck retains the existing unrelated renderer errors. No app
user flow, API, database or publishing behavior changed, so app E2E is not part
of this media-only revision.

## Measured comparison

| Category | V1 → V2 duration | First product proof V1 → V2 | V2 introduction | V2 CTA | Presenter V1 → V2 |
| --- | --- | --- | --- | --- | --- |
| Finance | 37.5 → 30.5s | 3.53 → 3.03s | 5.03s | 4.50s | 65.2 → 59.6% |
| Software | 39.5 → 31.5s | 5.07 → 3.03s | 5.60s | 3.87s | 68.4 → 56.6% |
| Law | 39.5 → 33.0s | 3.27 → 2.93s | 5.73s | 4.23s | 61.4 → 58.7% |

Law’s opening now has 2.93 seconds instead of 0.93 seconds, while the first
product proof still arrives earlier because the separate introductory filler
beat was removed. Finance loses 7 seconds overall, software 8, and law 6.5.

Narration alignment covers 98.67% of finance words, 94.29% of software words
and 97.37% of law words. A second software transcription check found three
British/American spelling mismatches (labelled/labeled, practise/practice,
organise/organize) and a minor article difference (the/a); no product name,
category, interview-round label or CTA was missing. Captions retain the
authored text and disclose alignment coverage in the manifest.

The full repository typecheck reports 52 pre-existing renderer errors; none
are in these Meet files. Lint, main/Remotion typechecks and build pass.

## Export verification

All three masters are 1080×1920 at 30 fps, H.264/AAC, yuv420p with BT.709
metadata and 48 kHz audio. Final encoded CTA endpoints and both sides of the
card-selection cut are retained for visual review.

| Category | Loudness | True peak | Detected clicks |
| --- | --- | --- | --- |
| Finance | -14.31 LUFS | -1.67 dBTP | 0 |
| Software | -14.60 LUFS | -1.77 dBTP | 0 |
| Law | -14.31 LUFS | -1.79 dBTP | 0 |

Saved archives are under `renders/meet-solomon/internships/{finance,software,law}/v2/`,
with `-v2.mp4` masters, editable scripts, manifests, original source captures,
interaction receipts, captions, voice provenance and preservation hashes.
All seven earlier saved masters remain byte-identical. Nothing was published.
