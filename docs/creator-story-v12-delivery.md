# Solomon Creator Story V12 — delivery notes

V12 is a narrow follow-up to V11. It fixes one visible defect — the mascot
rendering on top of the product proof text — and closes the structural gap that
let that defect pass every automated gate.

## The defect and why the gates missed it

In V11 the mascot's on-screen position and its *declared* position in the
manifest were computed independently:

- The manifest declared a mascot rectangle per scene (bottom-right, y 1344-1882
  in the cameo layouts), and `auditV11Layout` checked that rectangle against
  product, caption, editorial, annotation, and CTA rectangles for forbidden
  overlaps. It passed.
- `MascotLayer` positioned the rig from its own anchor constants. Those constants
  assumed `transformOrigin: "50% 100%"` resolved against the rig's 940px height,
  but the wrapper `div` had no explicit box, so the origin collapsed onto the top
  edge and the scale pivoted from the wrong point — placing the rig roughly 490px
  above where the manifest said it was, directly over the proof chips.

So the collision audit was measuring a rectangle the renderer never used. The gate
was not wrong about its own data; it was checking data that had no authority over
the output.

## Fix

`mascotBoxForScene()` in `src/shared/creatorStoryV12Quality.ts` solves the rig's
on-screen box **from** the scene's declared mascot rectangle: fit inside the rect,
centre horizontally, bottom-align so the character stands on the rect's floor.
`MascotLayer` consumes that helper and gives its wrapper an explicit 660x940 box.

Renderer and audit now share one definition of where the host stands, which makes
`auditV12Layout`'s forbidden-pair check binding on what is actually rendered.
`auditV12MascotPlacement` asserts the solved box stays inside the declared rect,
so the two cannot silently diverge again.

## Second fix: caption chip over serif headline

The same frame inspection showed the signature scene printing its caption chip
("JOB → PERSON → PROOF → MESSAGE") across its own headline ("CONTEXT MOVES WITH
THE STORY"). `V12_TEXT_ZONES` defines the top caption band, and `SerifHeadline`
clamps every headline below it, so a scene cannot reintroduce the overlap by
choosing a small `top` value.

## Gate change: match cuts are exempt from the peak requirement

V11 required every non-dissolve boundary to produce a decoded mean-luma peak.
That is wrong for `match_cut`, whose defining property is that composition carries
across the boundary, and it is beyond what the metric can see: the grounded scene
slides its card 640px over 7 frames against a similarly toned background, which is
obvious to a viewer and nearly invisible to a whole-frame mean-luma delta.

`match_cut` is now exempt and capped at 5 per film so the exemption cannot be used
to relabel a lazy fade. `cut`, `slide`, and `object_wipe` — 12 of 16 boundaries —
must still register a peak, and the dissolve budget remains 2.

## Results

All 26 gates pass; the scorecard reports zero regressions against V11.

| Metric | V11 | V12 | Band |
| --- | --- | --- | --- |
| medianFrameChange | 2.74 | 3.00 | 1.2-3.5 |
| continuousMovementExcludingCuts | 2.98 | 3.35 | 1.2-4 |
| nearStaticFramePercent | 13.97 | 15.08 | 10-30 |
| loudnessIntegratedLufs | -14.36 | -14.36 | -14.5 to -13.5 |

Verified by frame inspection at the scenes that previously showed the overlap:
the mascot sits in clear space below the proof card in every cameo, and both proof
chips are fully legible.

## Reproduce

```bash
pnpm creator-story:v12:fixture
pnpm creator-story:v12:capture   # or SOLOMON_V12_CAPTURE_DIR=<existing capture dir>
pnpm creator-story:v12:baseline
pnpm creator-story:v12:solomon
pnpm creator-story:v12:compare
pnpm test:creator-story:v12
```

Note that capture receipts record absolute source paths. A receipt produced before
the repository moved out of iCloud must have those paths rewritten before it can
be reused.

## Still human-gated

Unchanged from V11: mascot appeal, voice naturalness, message quality, proof
credibility, disclosure clarity, CTA appropriateness, brand/legal approval, and
overall reference-quality judgement remain `blocked_external_confirmation`.
