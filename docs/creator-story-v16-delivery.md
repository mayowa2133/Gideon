# Solomon Creator Story V16 — delivery notes

V16 makes the signature scene's context dot travel in a straight line instead of
arcing, and introduces a mechanism for recording deliberate metric regressions.

## Change

The dot's vertical position was `1100 - sin(travel * PI) * 85`, tracing the curve
the removed dashed arc used to draw. It is now a constant `top: 1062`.

Note that simply dropping the `sin` term would have pinned the dot at y=1015,
which is the token cards' bottom edge (they span 720-1020), so it would have
grazed along them. 1062 sits clearly below the cards and near the midpoint of the
old arc's vertical range.

## Accepted deviation: decodedShotCount 16 -> 15

The regression floor caught a real consequence of this change. `decodedShotCount`
is ffmpeg's scene-change detector counting visually distinct shots. The dot's arc
previously produced enough vertical movement inside the signature scene to trip
that detector once; a level path does not.

The lost shot is an internal change *within* a scene, not a beat boundary:

- All 26 gates pass, including transition reconciliation — every declared cut,
  slide, and object wipe still produces its decoded peak, zero mismatches.
- `majorTransitionPeakCount` unchanged at 28.
- `medianFrameChange` rose 2.92 -> 3.22; `nearStaticFramePercent` identical at
  12.85%.

Rather than lower the floor silently — the exact failure mode this gate suite
exists to prevent — the deviation is recorded in
`fixtures/creator-story/v15-accepted-metrics.json` under `acceptedDeviations`,
with a minimum and a written reason. The scorecard reports such metrics with
status `accepted` rather than `passed`, so the concession stays visible in every
future report, and `analyze-solomon-v16-baseline.mjs` preserves the block when it
regenerates floors from the parent master.

Future versions are held to `decodedShotCount >= 15`.

## Results

All 26 gates pass. Scorecard: zero regressions, one accepted deviation. Verified
by frame inspection at four points across the dot's travel, confirming it clears
the token cards at every position.

## Reproduce

```bash
pnpm creator-story:v16:fixture
pnpm creator-story:v16:capture   # or reuse an existing capture dir
pnpm creator-story:v16:baseline
pnpm creator-story:v16:solomon
pnpm creator-story:v16:compare
pnpm test:creator-story:v16
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
