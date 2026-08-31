# Meet Solomon: real internships

This isolated format replaces fictional examples with actual employer records
retrieved through the running Solomon application. It does not change any
previous Meet composition or overwrite the saved demonstration videos.

## Sources checked August 31, 2026

- Finance: Nationwide, **Summer 2027 Internal Audit Internship**, Columbus, Ohio.
  [Employer posting](https://nationwide.wd1.myworkdayjobs.com/en-US/Nationwide_Career/job/Summer-2027-Internal-Audit-Internship_100098).
- Software: Figma, **Software Engineer Intern (Winter 2027)**, San Francisco or New York.
  [Employer posting](https://boards.greenhouse.io/figma/jobs/6131089004).
- Legal operations: Cigna Group, **Legal Operations Financial, Data & AI Analytics Intern**, St. Louis.
  [Employer posting](https://cigna.wd5.myworkdayjobs.com/cignacareers/job/St-Louis-MO/Legal-Operations-Financial--Data---AI-Analytics-Intern_25016386).

The Cigna role is legal operations, not a JD or law-practice placement. Its
employer describes financial and analytical work, and the video names that
scope explicitly. Each employer page displayed the matching role and an Apply
control. This is a dated availability check, not a guarantee of future hiring
or eligibility. No application form was filled or submitted.

## Actual capture, not an offline reconstruction

The existing application at localhost:5173 was accessible in its configured
local development session and connected to real fetched job data. No login,
authentication configuration, mock hook, or database record was fabricated to
obtain access. These are actual product pixels; this is not represented as a
production customer account. The agent used the Jobs search/filter controls,
opened real records, and verified their outbound employer pages.

Source captures, DOM snapshots, observed text dimensions, OCR, timestamps,
application links, and employer verification text are retained privately under
`tmp/meet-real-internships`. Each film uses one selected record's source image,
with separately cropped role, employer, location, and Open Posting proof.
No job stage was changed and no outreach was requested or sent. Solomon's
normal discovery flow may queue its existing contact pre-warm work.

## Data problems encountered

- The existing Nationwide inventory link omitted the Workday career-site
  segment and returned Page not found. The genuine internship was located on
  Nationwide's own board and re-imported using Solomon's normal Search Career
  Page control. This produced a second record with a working employer link;
  it did not repair or delete the original record.
- A Williams record was incorrectly labelled Williams-Sonoma. It was excluded.
- The Nationwide exact import parsed revenue and Fortune ranking as salary.
  The wrong salary field is neither shown nor spoken. Original unedited
  captures retain it for audit; the renderer crops verified regions only.

These are source-product defects, not fixes made by this video change. They
must be repaired separately before claiming comprehensive feed accuracy.

## Rendering and safeguards

`meet-solomon-real-internships-v1` has a separate runtime schema and Remotion
composition. Its 12-scene script leads with a real role, resets to Meet Solomon,
shows source context and location, directs viewers to the employer posting,
warns that listings can change, and ends with a spoken and visible CTA:
“Find your next [finance/software/legal] internship with Solomon.” No public
product URL, automated application, comment delivery, or posting is implied.

The input requires `sampleData: false`, actual-product capture mode, a matching
employer-page verification hash, an observed Apply control, source image
hashes, and matching internship/employer text. Capture and employer verification
must be within one day. Mixed source images, archived evidence, fictional
employer names, missing CTAs, and unreadable crops fail closed. Factual crops
must reach 28px at 1080; the separate product overview must reach 10px and
carries no factual claim. As with all source approval, these checks support
human verification; they cannot establish truth from a self-authored manifest
alone.

Narration uses the existing local stock Chatterbox model with downloads
disabled, then Whisper alignment. No reference voice is cloned. Duration is
bounded to 30–40 seconds for this format only. The original versions keep their
own bounds. First factual proof must begin by four seconds, the introduction
by nine seconds, and the final CTA must hold for three to six seconds.

```sh
npm run build:main
node scripts/render-meet-solomon.mjs \
  --story tmp/meet-real-internships/finance/story.json \
  --out tmp/meet-real-internships/finance --seconds 34
# Software uses --seconds 32; finance and legal operations use --seconds 34.
# Change both --story and --out to the desired category directory.
npm run test:meet:solomon
```

Keep private story/capture inputs together. `--prepare-only` checks voice,
source OCR and alignment; `--stills-only` produces review frames. An output
with a preservation receipt cannot be overwritten. Renders remain local and
require human approval before publication.


## Verification results

The source and regression suite passes 116 tests. Repository lint, main and
Remotion typechecks, and the complete desktop/MCP/web build pass. The full
repository typecheck still reports 52 existing errors in unrelated renderer
and mascot test files; none are in this format. No production UI/API or critical
application flow was changed, so an application E2E run was not required.

Encoded review checks inspect every scene and OCR the first and last CTA
frames. Masters use 1080×1920, 30fps, H.264/AAC, yuv420p/BT.709 and 48kHz audio.
The archive retains source screenshots, employer-page verification, original
voice provenance, alignment, captions, decoded quality, and content hashes.

The narration review removed uncertain spoken brand names from the software
and legal voiceover; the genuine employer names remain clearly visible in
unchanged product footage. The initial legal title OCR confused uppercase I
with lowercase l in AI. The final cut uses narrower, legible original-word
crops for the claims actually spoken, while keeping the complete title in the
retained source and application overview. The OCR gate was not weakened.

| Cut | Duration | First proof | CTA hold | Alignment | LUFS | True peak |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Finance | 34s | 2.70s | 3.33s | 100.0% | -14.44 | -1.78 dBTP |
| Software | 32s | 2.07s | 4.80s | 100.0% | -14.48 | -1.72 dBTP |
| Legal operations | 34s | 1.20s | 3.13s | 95.7% | -14.46 | -1.70 dBTP |

All three masters have zero detected audio clicks. Older saved masters are
verified byte-for-byte before writing new `real-v1` archive directories.

## Benefit-led V2

The V2 revision makes every beat lead toward using Solomon. It explains that
Solomon keeps opportunities in one workspace, can help tailor an uploaded
resume to a role, provides a per-role workflow checklist, and opens the original
employer posting. The copy says “helps tailor”; it does not promise a match,
interview, or application outcome. Resume-tailoring and checklist claims are
grounded in the same actual job-detail captures as each listing.

V2 narration is generated in four short conversational passages and plays at
its native rate (`tempo: 1`). The renderer derives the film length from the
voice and adds the CTA hold; it does not slow or accelerate this version to a
fixed runtime. The stock local Chatterbox voice remains synthetic and no voice
reference or cloning is used.

```sh
npm run build:main
node scripts/render-meet-solomon.mjs \
  --story tmp/meet-real-internships-benefit-v2/finance/story.json \
  --out tmp/meet-real-internships-benefit-v2/finance
```

| V2 cut | Duration | First proof | CTA hold | Alignment | Voice tempo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Finance | 36.30s | 2.77s | 3.63s | 99% | 1.00× |
| Software | 35.73s | 2.53s | 3.60s | 98% | 1.00× |
| Legal operations | 37.03s | 3.27s | 3.50s | 99% | 1.00× |
