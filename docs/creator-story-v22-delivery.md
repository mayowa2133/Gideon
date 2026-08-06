# Solomon Creator Story V22 — delivery notes

V21 solved stability. This pass measured everything else against the three
reference creator videos and attacked the two largest compositional gaps: colour
and presenter scale.

**Status: partial.** The palette work landed and two of three colour metrics are
now inside the reference range. The presenter work is half done, and the reason
is a measured structural limit worth recording. Phases 4 (content density, deeper
darks, freer type) and 5 (palette/presenter gates) are not done.

## What was already right — and stayed right

| | ref-53s | ref-36s | ref-38s | V21 | **V22** |
|---|---:|---:|---:|---:|---:|
| shots/second | 0.509 | 0.496 | 0.392 | 0.528 | **0.528** |
| mean shot | 1.96s | 2.01s | 2.55s | 1.89s | **1.89s** |
| loudness | −14.1 | −13.9 | −13.8 | −14.3 | **−14.3 LUFS** |

Cut rhythm and audio were in range before this pass and are untouched by it.

## Colour — the largest measured gap, substantially closed

| | coloured px | top-2 hue share | meanSat | meanY | p10 luma |
|---|---:|---:|---:|---:|---:|
| ref-53s | 16.7% | red+yellow 85% | 14.2 | 152 | 66 |
| ref-36s | 14.2% | red+spring 73% | 14.9 | 89 | 17 |
| ref-38s | 22.1% | red+azure 97% | 27.8 | 140 | 22 |
| V21 | 39.3% | **spring+cyan 91%** | 34.0 | 152 | 58 |
| **V22** | **28.4%** | **cyan+red 73%** | **25.7** | 153 | 63 |

- **Hue concentration is now inside the reference band** (73%, against 73–97%),
  and the dominant pair has shifted from spring+cyan to cyan+**red** — warmth has
  entered the palette rather than green simply being reduced.
- **Mean saturation is now inside the reference band** (25.7 against 14.2–27.8).
- **Coloured-pixel fraction fell 28%** (39.3 → 28.4) but is still above the
  references' 14.2–22.1. The residue is the mascot's mint face, the GREEN display
  headlines (6 of 8), the mint semantic accents, and the `sky` backdrop.

The change: `V22_BACKDROPS` replaces the mid and one deep token — `mint` → `clay`
(warm grey-tan) and `teal` → `espresso` (warm deep brown). Both keep their luma
tier, so `auditV22BackdropCadence`'s no-repeat-token-or-tier rule needed no
re-solving. That single swap took green/cyan full-frame washes from **33.4% of
all frames to 8.9%**. `sky` stays as the one cool mid, because the references are
not uniformly warm either (ref-38s carries azure at 16%).

## Presenter scale — half closed, and the limit is structural

Frame-weighted mascot occupancy: **8.3% → 11.9%** (a 43% lift). Cameo roles are
gone; the mascot is now `host` scale in a new `split` layout for eleven scenes,
and genuinely absent for 23.6% of frames so its return has weight.

**The 20–25% target was not reached, and cannot be without re-composing the
scenes.** Measured from the V21 master, scene content occupies **65–83% of frame
height in every split scene** (status .17–.99, grounded .17–1.00, control
.17–.98). There is no spare band to give a presenter.

A `ProductBand` wrapper was built and removed. It cropped each scene's content
into the declared product rect using the `camera.focus` each scene already
declares. It cannot work: a 31% band cannot show content that is 65–83% tall, and
the spot render showed "APPLIED" sliced mid-word and the Jobs card cut through.
Re-centring does not help — there is no window position that contains content
taller than the window. The removal and the reasoning are recorded in the source
so it is not attempted again.

Closing the rest means re-laying-out thirteen components as short, wide
compositions. That is a version of its own, not a rect change.

## Three defects caught before the render

**Two by gates, which is what they are for.**

1. `auditV22RenderedBounds` rejected the first split geometry: rects are projected
   through the camera envelope before the bounds check, and a mascot bottom of
   .99 projected to 1926.6 — past the 1920 edge — in all twelve split scenes.
   `.975` is the deepest the rig can sit and still project inside.
2. The antenna's ~48px overflow (`overflow:visible`) would have painted into the
   product rect even with the rects merely abutting. Solved to 45px clearance.

**One by eye, because no gate can see it.** The enlarged mascot covered proof
chips in `contact`, `reasons`, `control`, `grounded` and `result` — the V11/V17
defect class, invisible to the collision audit because those chips are drawn at
absolute pixels and never declared as rects. Fixed by raising each label row
above the antenna line and shrinking two cards. `five` became a product scene
(mascot absent) because its five-card grid genuinely fills the frame.

## One measurement trap worth recording

The first render came back at **23 shots** against a band of [13,20], failing
`shotDensity`. Comparing cut times against V21's showed four new cuts, three of
them inside `contact` at 2.17s, 2.63s and 2.80s.

The cause was not pacing. `EvidenceCrop` derives its zoom from the width/height it
is passed (`scale = max(w/cropW, h/cropH)`), so shrinking the Contact card from
810 to 700 also *un-zoomed* the underlying screen recording — revealing more of
the capture, whose own content changes then registered as scene cuts. Passing the
original dimensions while keeping the smaller container decouples zoom from box
size and restored 19 shots.

Worth remembering: a layout change can silently alter what a source recording
shows, and the symptom appears in a completely unrelated metric.

## Results

All **28** gates pass; scorecard regression-free. Claims 1.00, OCR 1.00, shots 19,
loudness −14.3 LUFS.

`medianFrameChange` fell 3.379 → 2.382 (band 1.2–8) and `nearStaticFramePercent`
is 23.46 (band 10–30). Both in band; the film is calmer again, which is the
expected consequence of a larger static mascot replacing moving cameo content.

## Not done

- **Phase 4 — content density, darks, type.** Edge density is **7.50** against the
  references' 5.69–6.12, slightly worse than V21's 7.36. The mock UI's thin-line
  filler is untouched, and the display type is still 6-of-8 GREEN rather than the
  references' warm/white serif.
- **Phase 5 — the gates.** `paletteBands` and `presenterOccupancy` were specified
  but not built, so both new axes are currently conventions rather than
  invariants. Given this series' history, that is the most important thing
  outstanding: everything un-gated has eventually regressed.
