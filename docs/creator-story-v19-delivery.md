# Solomon Creator Story V19 — delivery notes

V19 adds kinetic typography: captions swap 1–3 word groups every ~13 frames with
a scale pop, instead of holding one static chip for up to 3.4 s.

## Change

`buildWordGroups()` in `solomonCreatorStoryV19Beats.ts` splits each caption's
**spoken line** into groups sized to the window, so the words on screen are the
words being said. Groups are laid out on cumulative proportional boundaries —
monotonic by construction, so no group can collapse to zero frames however tight
the window — and a tight window widens groups to three words rather than starving
them below the 9-frame readable minimum.

Result: 46 groups at a 0.45 s mean cadence, inside the reference 0.3–0.5 s band.
The `Caption` component renders the active group with a spring pop, and groups
containing the highlight word get a size and scale bump.

## The kinetic-typography hypothesis was wrong

The stated goal was to raise `medianFrameChange` toward the references' 5.72–7.57
(V18 sat at 3.03). It moved to **3.18** — a rounding error.

The reason is structural, not tuning: a caption chip occupies 1–2% of the frame's
pixels, and the metric is a whole-frame mean absolute luma difference. No swap
rate inside a chip can move it. The references' high median comes from **full-frame**
kinetic type — giant words filling a third of the screen — plus moving b-roll.

V19 therefore has the reference *rhythm* at chip *scale*. Closing the median gap
requires full-frame type moments, which is a design change rather than a
parameter, and remains the largest open difference from the references.

## What the composite gate exposed

The first V19 render failed `composite`: "Save Edit" (draft @628) and "Nothing
sends without you" (control @802) were unreadable at their claim frames. The
frames showed both plainly, and OCR had read every dark-background label while
missing only the **mint** ones.

Those mint labels have never been machine-legible. The gate had been passing
because the old static caption chip repeated the same words in a high-contrast
chip — it was verifying the caption, not the proof. Kinetic captions removed the
crutch and exposed a pre-existing weakness.

Fix: the two claim-bearing labels move to the ink/white treatment the other proof
labels already use. That satisfies the gate for the right reason and improves
genuine readability at phone scale. All six claims now report 1.00 coverage.

## Results

All 27 gates pass.

| | V18 | V19 | references |
|---|---:|---:|---|
| nearStaticFramePercent | 16.76 | 13.41 | 12.1–21.1 |
| medianFrameChange | 3.03 | 3.18 | 5.72 / 7.57 / 6.76 |
| decodedShotCount | 19 | 19 | 27 / 18 / 15 |
| claim coverage | passing | 1.00 × 6 | — |

## Open

- **Full-frame kinetic type** is the remaining lever on median frame change, and
  the largest visual difference from the references.
- **Shots/second 0.528** still edges the 0.509 reference ceiling.

## Reproduce

```bash
pnpm creator-story:v19:fixture
pnpm creator-story:v19:capture   # or reuse an existing capture dir
pnpm creator-story:v19:baseline
pnpm creator-story:v19:solomon
pnpm creator-story:v19:compare
pnpm test:creator-story:v19
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
