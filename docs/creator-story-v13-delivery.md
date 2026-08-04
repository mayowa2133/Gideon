# Solomon Creator Story V13 — delivery notes

V13 is a single-change follow-up to V12: it removes the dashed mascot-to-content
interaction line.

## Why

V9 drew a dashed line from the mascot to whatever it was presenting. V10 kept
`interactionTarget` in the schema but stopped rendering it, and V11 restored the
line so the mascot would read as a host rather than a sticker.

That worked while the mascot sat mid-frame. V12 moved it into a bottom corner to
clear the product proof text, which stretched the same pointer into a full-height
diagonal: it ran from the corner up across the Avery proof card and the "Why
matched / Company trust / Email safety" rows — the exact text V12 had just
uncovered — and at that length its 14/13 dash pattern read as a solid stray line
rather than a pointer.

The reference videos never connect presenter to content with a line. They direct
attention with highlight outlines, zooms, and annotation chips. The mascot already
has a point gesture that carries the same intent, so the line is removed rather
than restyled.

Note that the dashed arc in the signature scene is unrelated and remains: it is
that scene's JOB → PERSON → PROOF → MESSAGE flow graphic.

## Change

`MascotLayer` no longer renders `InteractionLine`; the component and its
`V13_CANVAS` import are deleted. `interactionTarget` stays in the performance
schema — the mascot's gaze and gesture planning still consume it, and
`v13MascotPerformanceSchema` still requires a visible mascot to declare one.

## Results

All 26 gates pass; the scorecard reports zero regressions against V12. Verified by
frame inspection at the scenes that carried the line: no diagonals remain, and
V12's placement fix still holds — the mascot sits clear of the proof card and both
proof chips are legible.

## Reproduce

```bash
pnpm creator-story:v13:fixture
pnpm creator-story:v13:capture   # or reuse an existing capture dir
pnpm creator-story:v13:baseline
pnpm creator-story:v13:solomon
pnpm creator-story:v13:compare
pnpm test:creator-story:v13
```

## Still human-gated

Unchanged from V11/V12: mascot appeal, voice naturalness, message quality, proof
credibility, disclosure clarity, CTA appropriateness, brand/legal approval, and
overall reference-quality judgement remain `blocked_external_confirmation`.
