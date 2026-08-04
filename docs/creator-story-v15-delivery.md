# Solomon Creator Story V15 — delivery notes

V15 restores the travelling context dot in the signature scene while leaving the
dashed arc removed.

## Why

V14 removed both the arc and the dot together, on the reasoning that the dot only
made sense as a marker traversing a visible track and would otherwise read as a
stray glowing element. Reviewed on frame, that concern did not hold: the dot is
42px, arcs along a shallow curve just beneath the token row, and lands on each
next card, so it reads as a packet of context moving between JOB, PERSON, PROOF,
and MESSAGE rather than as an unmoored artifact.

The arc stays removed. It was a long dashed stroke across the frame; the dot is a
small moving marker. Only the former had the stray-line problem.

## Change

`Signature` in `SolomonCreatorStoryV15.tsx` restores the `travel` local and the
dot element, tagged `data-v15-context-dot` so it is identifiable in frame
inspection. Its path is unchanged from V13: `top: 1100 - sin(travel * PI) * 85`,
which traces the curve the arc used to draw.

This is a new fork rather than an edit to V14 because V14 is already committed and
its master published; per repo convention a released version's code keeps matching
the video it produced.

## Results

All 26 gates pass; the scorecard reports zero regressions against V14. Verified by
frame inspection at four points across the dot's travel, including mid-flight
between tokens where an unmoored marker would be most visible.

## Reproduce

```bash
pnpm creator-story:v15:fixture
pnpm creator-story:v15:capture   # or reuse an existing capture dir
pnpm creator-story:v15:baseline
pnpm creator-story:v15:solomon
pnpm creator-story:v15:compare
pnpm test:creator-story:v15
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
