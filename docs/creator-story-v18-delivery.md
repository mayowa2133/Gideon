# Solomon Creator Story V18 — delivery notes

V18 makes the film calmer. V17 passed its gates but sat at the busy end of every
band: near-static frames 10.06% against the references' 12.1–21.1%, and 0.556
shots/s against their ceiling of 0.509.

## The main cause was decorative drift, not pacing

`EvidenceCrop` animated on every frame of every product scene:

```
panX = sin(frame/13) * 4
panY = cos(frame/17) * 3
focusScale = 1.02 + sin(frame/21) * .003
```

Product scenes are most of the film, so no frame was ever still and the
near-static metric was suppressed film-wide. The references hold their product
shots and let the *cut* supply the energy; a wandering frame is the V10-era
decorative-motion habit that the motion bands were introduced to stop, surviving
inside a component nobody had re-read.

Removing it is the single change that moved the metric.

## Changes

1. **Deleted the sine pan and breathing scale from `EvidenceCrop`.** The crop and
   its 1.02 focus scale remain; only the per-frame drift is gone.
2. **Deepened calm holds** — damping 0.1 → 0.04 across 12–88% of a reading scene
   (was 15–85%), and non-calm scenes now damp to 0.75 rather than running free.
3. **Merged two signature splits back into one** (3 shots → 2). V17 added the
   third to raise cut count, but at 0.556 shots/s that overshot the reference
   ceiling. The resulting 110-frame (3.7 s) shot is well inside reference shot
   lengths, and scene count goes 19 → 18.

## Results

All 27 gates pass.

| | V17 | V18 | references |
|---|---:|---:|---|
| nearStaticFramePercent | 10.06 | **16.76** | 12.1–21.1 |
| decodedShotCount | 20 | **19** | 27 / 18 / 15 |
| shots per second | 0.556 | **0.528** | 0.392–0.509 |
| meanShotSeconds | 1.80 | 1.89 | 1.96 / 2.01 / 2.55 |
| medianFrameChange | 3.84 | 3.03 | 5.72 / 7.57 / 6.76 |

Cut strength is preserved — the threshold sweep still plateaus rather than
collapsing, so the calm came out of the holds and not out of the transitions:

| threshold | V16 | V17 | **V18** |
|---|---:|---:|---:|
| >0.10 | 14 | 27 | 26 |
| >0.20 | 6 | 23 | 22 |
| >0.30 | 1 | 19 | 18 |
| >0.40 | 1 | 19 | 17 |

## Two things still open

**Shots per second remains marginally above the reference ceiling** — 0.528 vs
0.509. Closer than V17, but not inside. One more merged boundary would land it.

**`medianFrameChange` fell 3.84 → 3.03, further from the references' 5.72–7.57.**
This was predicted before the render and is the more interesting gap: the
references are calmer *and* more dynamic, because they alternate genuinely still
holds with big kinetic moves, where Gideon has been uniformly mid-busy. V18 now
has the stillness; it lacks the peaks. Closing that means kinetic typography,
larger in-scene events, and faster reveals — a different piece of work from
pacing, and probably the highest-value one remaining.

## Reproduce

```bash
pnpm creator-story:v18:fixture
pnpm creator-story:v18:capture   # or reuse an existing capture dir
pnpm creator-story:v18:baseline
pnpm creator-story:v18:solomon
pnpm creator-story:v18:compare
pnpm test:creator-story:v18
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
