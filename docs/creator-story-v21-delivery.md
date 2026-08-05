# Solomon Creator Story V21 — delivery notes

V21 makes held content hold. Through V20 nothing in the film ever sat still on a
whole pixel, so every edge re-rasterized on every frame and the picture read as
faintly unstable — most visibly on the robot's head.

## The report

> "Why does the robot look glitchy — the head in particular does not always look
> solid but almost staticky in a way?"

Correct, and it was a real renderer defect rather than an encoding artefact.

## Two sources, one principle

1. **The mascot rig** drove an idle hover and a rotation jitter from `uneven()`,
   a sum of three incommensurate sines. Measured on the V20 master it moved the
   rig **0.006–0.335 px per frame** — always fractional, never zero, never
   repeating. That is the worst available amplitude: too small to read as motion,
   too large to be free.
2. **`EditorialCamera`** translated *and* rescaled every scene on every frame.
   Calm damping only applied to `product_annotation` scenes, so most of the film
   ran at damp `.75` — ±4.5 px and ±3.75 px of sway, plus a per-frame
   `scale(baseScale + push)`.

## The head specifically

`transformOrigin: "50% 78%"` resolves to svg (330, 733), essentially the torso
ellipse centre (`cy=720`). The robot rotated about its own stomach, so the head
centre — ~455 units from that pivot — was dragged furthest per degree while the
torso pivoted in place. Lossless temporal std: head shell **0.478** vs torso
**0.082**.

The head also holds the worst content to resample: mint `#39f2b5` (luma ~200)
directly on ink `#030914` (luma ~8) is a 190-code edge, the highest-contrast
boundary in the film, wrapped in three `drop-shadow` glows. And at luma 14 a
one-code fluctuation is ~7% relative against 0.4% on the luma-246 torso, so
identical numerical noise is far more visible on the face than on the body.

A later measurement showed the *type* was actually worse than the mascot —
headline serif churned at a mean per-frame delta of ~3.0 against the mascot's
0.68 and a truly static backdrop's 0.01. The head is simply what the eye watches.

## It was not the encoder

Frames 1035–1046 were re-rendered losslessly as PNG from the cached bundle and
compared against the same frames decoded from the master:

| region | lossless PNG | encoded master | encoder adds |
|---|---:|---:|---|
| visor bottom edge | 4.340 | 4.396 | +1% |
| eye edge (mint/ink) | 1.665 | 1.865 | +12% |
| torso white | 0.082 | 0.196 | — |
| backdrop (static) | 0.037 | 0.046 | +0.009 |

The static backdrop is the control: on genuinely still content the encoder sits
at 0.046. The churn was already in the rendered pixels.

## Why eleven versions of gates never saw it — and scored it as a positive

`measureV21Motion` decodes at **180×320 and 5 fps**: a 36× spatial and 6× temporal
decimation. Sub-pixel churn at 1080×1920/30 fps is averaged out of existence
before the metric is computed. Whatever survived registered as *motion*, so
`medianFrameChange` and `nearStaticFramePercent` were counting the defect in the
film's favour.

This is the third appearance of the same structural weakness the V20 notes
flagged — gates that measure declared intent and whole-frame aggregates, and
never ask whether a thing that should be still actually is.

## Changes

- `mascotIdleFloat()` in `solomonMascotV21.ts` — the idle curve, rounded to whole
  pixels. Applied by `MascotLayer` on `left`/`top`, the only element in the tree
  that positions in unscaled canvas space; inside the rig the same value passed
  through a `scale()` parent and landed fractionally again.
- The rig loses its hover and its rotation jitter. Rotation is now constant once
  `gazePath` settles. The antenna is quantized to whole units.
- `EditorialCamera` loses the continuous sway (`swayXMax`/`swayYMax` → 0). The
  declared focus push is kept as real motion but quantized: translate rounds to
  whole pixels, scale to `1 + round((s-1)·960)/960` so the outermost edge steps
  rather than creeps. This is V18's `EvidenceCrop` finding applied one level up.
- The camera transform moves into `v21CameraTransform`, a pure function, so it
  can be asserted without a Remotion context.

## The gate

**Renderer level — exact, no thresholds.** `HeldStability.test.tsx` asserts that
across a held window the rig's wrapper transform and the head group's transform
are **byte-identical** frame to frame, that `mascotIdleFloat` is integer-valued
across all 1080 frames, and that the camera transform changes on a minority of
frames with whole-pixel values only. It deliberately checks geometry alone — the
face, mouth, blink, and antenna *should* animate — with a companion assertion
that the rig has not simply frozen.

Verified to bind: across 24 held frames the V20 rig produces **24 distinct**
wrapper transforms; V21 produces **1**. (The V20 *head group* transform was
already constant in that window, which confirms the mechanism precisely: all of
the head's churn arrived through the wrapper, levered by the belly pivot.)

**Decoded level — `scripts/lib/creator-story-v21-stability.mjs`.** Per-pixel
temporal measurement over 12-frame windows decoded at **full resolution and full
frame rate** — deliberately not the 180×320/5 fps motion path, which is what made
the defect invisible for eleven versions. A header comment says so, because the
obvious "optimisation" would reintroduce the blindness.

The metric that binds is the **fraction of adjacent frame pairs that are
byte-identical**, not the average difference. Sub-pixel drift never produces an
identical pair; whole-pixel quantization produces mostly identical pairs with the
change concentrated into occasional steps. That distinction is the whole point of
the version, and it survives even when the absolute deltas are small.

What it gates, and what it only reports, is set out in the next-but-one section —
both boundaries were moved by measurement rather than preference. V21 scores
73–100% identical on the control regions; V20 scores 45% on two of the same
windows.

## A third drift source, found by the gate before it shipped

The decoded measurement earned its place on its first real run. After the hover
and the rotation jitter were gone, the head crown still failed to produce a
single byte-identical frame pair. The cause was `lean`, which is scaled by
`limbCurve` and therefore eases continuously — so for the whole length of every
gesture the entire rig slid ~0.2–0.3 px per frame. Invisible as movement, ample
to shimmer every edge.

The renderer test had missed it because its held-window fixture deliberately
avoided gesture frames. Both are fixed: the rig now takes a `pixelScale` and
rounds its translate in *device* space (rounding the local value would leave the
composed position fractional again — the same mistake in a new place), and
`HeldStability.test.tsx` gained a mid-gesture assertion.

## Results

All **28** gates pass (27 inherited plus `heldStability`); scorecard reports
regression-free.

| | V20 | V21 | band |
|---|---:|---:|---|
| medianFrameChange | 3.403 | 3.379 | 1.2–8 |
| nearStaticFramePercent | 12.291 | **24.58** | 10–30 |
| continuousMovementExcludingCuts | 3.469 | 3.307 | 1.2–5.5 |
| decodedShotCount | 19 | 19 | 13–21 |
| claim coverage | 1.00 | 1.00 | — |
| loudness | −14.36 | −14.36 LUFS | −14.5…−13.5 |

No accepted deviation was needed. The predicted `medianFrameChange` drop happened
and stayed inside the band, so it recorded as a pass rather than a concession.

The number that moved most is **near-static frames, 12.3% → 24.6%**. The film now
has genuine stillness for the first time in the series, rather than uniform
low-grade churn.

**That figure needs watching.** It sits 5.4 points under the band ceiling of 30,
and past the references' 12.1–21.1. Gideon is now *calmer than any reference*,
which is the opposite of the problem it had at V10. There is very little headroom
left: any further calming will fail the band. If the film needs more life, it has
to come from deliberate motion — more cuts, larger in-scene events, more kinetic
type — and specifically not from restoring drift, which is what produced the
churn this version removed.

## Idle-float tuning

The first V21 render inherited V20's raw amplitude (2.8/3.6) and speed (.17/.13).
Quantized, that steps every 3 frames — 10 per second — which reviewed as too busy.
Measured step rate per 100 frames across all scenes:

| amplitude | speed | steps/100f | frames held |
|---|---|---:|---:|
| 2.8 / 3.6 | .17 / .13 | 33.1 | 3.0 |
| 2.0 / 2.6 | .17 / .13 | 23.8 | 4.2 |
| 1.5 / 2.0 | .17 / .13 | 18.2 | 5.5 |
| **1.2 / 1.5** | **.17 / .13** | **14.1** | **7.1** |
| 1.2 / 1.5 | .11 / .085 | 9.0 | 11.1 |
| 1.0 / 1.3 | .11 / .085 | 8.1 | 12.3 |

Amplitude and speed are separable levers and were tuned separately, over two
review rounds. Lowering both at once (1.2/1.5 @ .11/.085) removed the busy tick
but read as **stiff** — holding ~11 frames is long enough to look frozen between
moves. Keeping the reduced amplitude and restoring the original speed holds ~7
frames: the excursion stays small so no single move is large enough to tick,
while the cadence stays lifelike.

This landed the best mascot numbers of the three settings — see below.

### The stability probe, run identically on both masters

Mean absolute per-frame-pair delta, frames 1035–1046:

| region | V20 | V21 | |
|---|---:|---:|---|
| backdrop (control) | 0.018 | 0.011 | 1.6× quieter |
| headline serif | 6.564 | **0.360** | 18.2× quieter |
| @SOLOMON pill | 3.076 | **0.596** | 5.2× quieter |
| mascot head shell | 0.345 | 0.297 | 1.2× quieter |
| mascot eye edge | 0.670 | **0.533** | 1.3× quieter |

The per-pair detail is the real result, because the shape matters more than the
mean. The `@SOLOMON` pill in V21 reads:

```
0.00  0.00  0.01  6.54  0.00  0.00  0.00  0.01  0.00  0.00  0.00
```

Dead still, one clean step, dead still. V20 spread that same energy across every
pair. That is the whole change: **the motion is now coherent and concentrated
instead of smeared as sub-pixel resampling over every frame.**

The mascot's eye edge reads:

```
0.48  0.43  0.44  0.02  0.49  0.33  0.39  0.00  3.12  0.12  0.04
```

One step in eleven pairs. Note index 3, where the headline and pill spike to 3.80
and 6.54 but the mascot reads 0.02 — that is the camera stepping, and the mascot
correctly does not move with it, because MascotLayer sits outside EditorialCamera.

Across the three settings tried, the mascot eye-edge mean went 1.110 (amplitude
2.8/3.6, visibly ticking) → 0.608 (1.2/1.5 @ .11/.085, stiff) → **0.533**, against
V20's 0.670. The final setting is the quietest of the three *and* the most alive,
because small excursions at a natural cadence beat large ones at a slow cadence.

Frame-difference images confirm it. In V20 every outline glowed on every frame,
with red/cyan fringing on the eyes and mouth. In V21 a typical (hold) pair shows
**no eyes, no mouth, no outlines** — only encoder noise. The step pair looks like
V20's *every* frame, because the whole 1px move now happens at once.

If the stepping reads as too busy on review, the knob is `V21_IDLE_FLOAT` in
`solomonMascotV21.ts` — a smaller amplitude yields fewer steps. It should not be
resolved by restoring sub-pixel drift.

## What is gated, and what deliberately is not

Two boundaries moved during implementation, both because measurement rejected the
first design.

The decoded gate initially asserted the mascot box and headline band were
near-still. The first V21 run scored the `five` scene at 44.3 on the headline —
because that scene runs a kinetic headline. **A gate that fails on intentional
animation is not a stability gate**; the only way to satisfy it would be to make
the film worse.

The second attempt gated the head crown. That found the lean bug, then had to be
demoted too: reading the manifest showed limb spans cover nearly every frame of
every scene (`cta` is L[5-71] R[8-82] out of 96), so the mascot is almost never
in a held state, and a pixel difference cannot separate a legitimate whole-pixel
step from a sub-pixel drift.

So the decoded gate binds only on what it can assert soundly — the backdrop
control patches, which drift if and only if the camera does (73–100% byte-identical
in V21; V20 scored 45% on two of the same windows). The rig's invariant is locked
by the unit test instead, which asserts it exactly and needs no render. Crown,
mascot box, and headline band remain in the report as diagnostics — which is how
the lean bug surfaced.

## Also fixed in passing

- `parentVersion` in the generated floors was hardcoded `"10"`, so every fixture
  since v15 mislabelled its parent. Now derived.
- The shot-count band existed in three places with three different values
  (`[13,20]`, `[13,21]`, `[16,21]`); the scorecard now reads the shared constant
  instead of restating it.
- `test:creator-story` omitted the Beats and rig tests that the per-version script
  includes.

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
