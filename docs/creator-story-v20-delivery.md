# Solomon Creator Story V20 — delivery notes

V20 adds full-frame kinetic type to the five conceptual scenes (40% of the film):
giant serif words landing one at a time with an overshoot pop and a blur-to-sharp
transition, replacing static headlines.

## Why, and what V19 established

V19 made captions kinetic and `medianFrameChange` barely moved (3.03 → 3.18). The
reason was structural: a caption chip is 1–2% of frame pixels, and the metric is a
whole-frame mean luma difference, so no swap rate inside a chip can shift it. The
references drive their median with **full-frame** type — words occupying a large
share of the screen — plus moving b-roll.

V20 tests that directly. `KineticHeadline` renders a scene's headline as large
type sized to the band it is given, swapping chunk by chunk.

## Results

All 27 gates pass; claims report 1.00 coverage.

| | V19 | V20 | references |
|---|---:|---:|---|
| medianFrameChange | 3.18 | **3.40** | 5.72 / 7.57 / 6.76 |
| nearStaticFramePercent | 13.41 | 12.29 | 12.1–21.1 |
| decodedShotCount | 19 | 19 | 27 / 18 / 15 |

The mechanism is confirmed — full-frame type moves the metric where chips could
not — but the gain is smaller than the remaining gap. See "Open" below.

## Three defects, all found by frame inspection, none by a gate

1. **Words overflowed the canvas.** The width solve used a multiplier that
   implied ~0.35 em glyphs; bold serif caps run ~0.68 em. "SCATTERS" solved to
   1119 px on a 1080 px canvas and "CONNECTED" ran fully off-screen. Now solved
   from the real glyph ratio against a 940 px safe width.
2. **The friction headline rendered behind the mascot.** Friction is a `host`
   scene where the rig occupies y513–1497 at `zIndex:32` and paints over scene
   content. The headline's height budget has to end above the rig.
3. **A strobe that dropped words.** Friction has six words in thirty frames; at
   one word per swap that is an 8-frame hold against a 7-frame pop, so each word
   was permanently mid-animation **and the last two never appeared at all** — the
   headline never finished its sentence. Words are now chunked so every chunk
   holds ≥12 frames, stacked vertically so a shorter swap list does not shrink the
   type, and sized from the longest word rather than the whole line.

A measurement note for the record: an intermediate render reported
`medianFrameChange` 4.04 and was briefly described as the largest gain in the
series. That reading came from the *overflowing* build — type spilling past the
canvas changed more pixels than it should have. Corrected sizing settled it at
3.40. The 4.04 was measuring the bug.

## The pattern behind all three

Every one of these was a visual defect in code the gates cannot see, because
scene text is drawn at absolute pixels rather than declared as layout rects. That
is the same root cause as the V17 CTA occlusion (`forbidden()` had a `mascot × cta`
rule but no scene ever built a `cta` rect) and the V19 mint-label OCR failure.

**This is now the clearest structural weakness in the suite**, and it compounds:
every new visual element inherits the blind spot. Worth fixing — by making scene
components declare the rects they draw into — before adding further visual
features.

## Open

- **`medianFrameChange` 3.40 vs 5.72–7.57.** Type alone will not close this. The
  references also run full-frame b-roll and product footage at speed, where Gideon
  holds largely static product cards. That is a capture/footage question rather
  than a typography one.
- **Shots per second 0.528** still edges the 0.509 reference ceiling.

## Reproduce

```bash
pnpm creator-story:v20:fixture
pnpm creator-story:v20:capture   # or reuse an existing capture dir
pnpm creator-story:v20:baseline
pnpm creator-story:v20:solomon
pnpm creator-story:v20:compare
pnpm test:creator-story:v20
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
