# Solomon Creator Story V22 — delivery notes

V21 solved stability. This pass measured everything else against the three
reference creator videos and attacked the two largest compositional gaps: colour
and presenter scale.

**Status: partial, and the latest commit does not pass all gates — see the crop-region section.** The palette work landed and two of three colour metrics are
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

All **29** gates pass; scorecard regression-free. Claims 1.00, OCR 1.00, shots 19,
loudness −14.3 LUFS.

`medianFrameChange` fell 3.379 → 2.379 (band 1.2–8) and `nearStaticFramePercent`
is 18.99 (band 10–30). Both in band; the film is calmer again, which is the
expected consequence of a larger static mascot replacing moving cameo content.


## Caption sync — reported, diagnosed, fixed

Reported: "a lot of the times they are not matching up with the words being said."
Correct, and it had been true since at least V11.

**Two timelines that were never reconciled.** `assembleNarration` places each beat
by its *measured* audio length (`cursor += audibleMs + GAP_MS`), while every
caption window was a hand-authored absolute frame keyed to the beat's *declared*
start. Measured drift between declared and spoken beat starts:

| beat | drift | | beat | drift |
|---|---:|---|---|---:|
| hook | +0.00s | | reason | +3.00s |
| friction | −0.40s | | signature | +3.50s |
| five | −0.64s | | control | +2.82s |
| role | +0.88s | | payoff | +3.34s |

By mid-film captions ran ~3.5s ahead of the audio.

**Why it stayed invisible for eleven versions.** The render already computes this
as `driftMs` for every beat — and discards it; the identifier appeared exactly
once in the script, on the line creating it. Worse, it was only computed on a cold
synthesis: narration is cached by script hash, so on every warm render the whole
assembly block is skipped and `realizedTimings` stays `null`. The numbers existed
only in the one case nobody re-runs.

**Fix, in two layers.** `hydrateCaptionTimings` maps each caption into its beat's
realized window (removes the multi-second drift), then `alignCaptionsToSpokenWords`
snaps every word group onto its actual spoken word using Whisper on `narration.wav`
*before* the render rather than only measuring the master afterwards (removes the
~1.6s residue left by interpolating linearly across a beat). Beat packing was
extracted into one shared function so the cache path reports the same placement the
audio was built with.

**Result: 44/44 groups aligned, worst drift 0.33s**, against a 0.45s tolerance —
from means of +3.5s to +0.04–0.12s per caption.

**New `captionSync` gate.** Compares every kinetic word group against Whisper word
timings on the encoded master; fails below 80% aligned. It measures the symptom
directly, so nothing but real alignment satisfies it. Annotation chips are excluded
via a new `tracksSpeech` flag — "WHY AVERY?" is a label that is never spoken, and
auditing it against speech found a spurious match on an unrelated "why" 12s later.

**Two side effects, both fixed.** Widening caption windows to the union of authored
and spoken spans left chips lingering past their last word, so they appeared and
vanished when nothing else changed — five phantom cuts. Captions now span exactly
their words. And a hard group swap resizes the dark chip in a single frame, which
also read as a cut; the swap now eases in over four frames. Shot count returned
from 24 → 19.

**Three renders were lost to one avoidable mistake**: this script does all its work
at module top level, so a `const` declared beside the function that uses it is
still in its temporal dead zone when that function runs, and fails only at render
time. All such constants are now hoisted above the first `await`, with a note in
the file.


## Edge density and green headlines — one fixed, one not

**Headlines: fixed.** Six of eight display headlines rendered in GREEN. They now
follow the backdrop tier — CORAL on bright and mid grounds, AMBER on the deep
ones — with MINT kept only for the CTA. GREEN remains the semantic proof colour on
borders and success chips; it is simply no longer the voice of the typography.

**Edge density: not closed, and the reason is now measured.** Three attempts:

| attempt | result |
|---|---|
| Remove chrome (ProofLabel outlines, EvidenceCard hairlines, ConnectedBoard panel borders, Friction placeholder bars) | worked per-scene (`result` −0.75, `signature` −1.13, `hook` −0.72) but net ~0: removing a border un-insets the crop box, so `EvidenceCrop` rescales and reveals more recording, adding it back in `signature_proof` (+1.31) |
| Zoom product crops 1.02 → 1.30 | −0.15 only, and broke `composite`: claim coverage 1.00 → 0.94, OCR 1.00 → 0.90, because the tighter frame cropped required proof text out. Reverted |
| — | final 7.42 against the references' 5.69–6.12 |

The measurement that reframes it: **the source recordings measure 2.17–6.36 —
below the references.** The excess was never the footage and never our borders. It
is that Gideon shows a whole dense product UI at small scale where the references
show a few large elements. That is a composition problem, and it lands on exactly
the same conclusion as the presenter-scale limit: these scenes need re-laying-out
around fewer, larger elements.

The chrome reductions are kept on their own merits (less visual noise, cleaner
chips). The zoom finding is recorded at the `PRODUCT_FOCUS_SCALE` constant so it is
not retried.


## Per-usage crop regions — refactor landed, with a known regression

`Crop` now means **region of interest** — the part of the recording that carries the
proof — and `fitRegionToCard` derives the actual framing from whatever card it is
drawn into, expanding the region to that card's aspect, centred and clamped to the
source.

**Why it was needed.** `EvidenceCrop` scales with `max()` to cover the card, so
whenever a region's aspect did not match the card's, the surplus was silently cut on
the tighter axis. The same region is drawn at wildly different aspects —
`trackerAfter` at 5.5:1 in a strip and 1.6:1 in a card, `message` at 1.18:1 and
1.88:1 — so no single rect could serve them. The old values were not well-framed;
they merely carried enough slack to hide the mismatch, which is why tightening them
clipped words mid-character.

Fitting to the card makes cover and contain identical, so **clipping is now
structurally impossible**. Containment was verified arithmetically across all twelve
usages before rendering. One usage genuinely cannot be fitted — a 5.5:1 strip cannot
hold a 1.8:1 region — so `trackerAfterStrip` is authored wide and short to match the
shape it is drawn into. It is the only per-usage region required.

**Result:** claim coverage 1.00, OCR 1.00, phone scale passing, no clipped proof.
Edge density 7.42 → 7.30.

**Known regression, not yet fixed.** `shotDensity` is **29** against a band of
[13,20]; the render does not pass. Containment has a cost: to guarantee a region
fits, the fitter grows it, so several cards now show more surrounding application —
and that extra UI carries its own animation, which the scene detector counts. This
is outside the 19–22 range that identical code produces run to run, so it is a real
effect and not the gate's noise.

The fix is tight per-usage regions, which the refactor now makes safe to author
(the fitter only ever grows a region, so a tight one cannot clip). It is not
automatic: a tighter region can frame a busier part of the app. A wide region for
the 790×470 role card was tried and reverted for exactly that reason — it took
detected shots from 22 to 29 on its own. Each region needs a render to check what it
newly exposes.

## Not done

- **Phase 4 — content density.** Edge density is **7.42** against the references'
  5.69–6.12. Chrome and crop zoom were both tried and are exhausted; closing this
  needs the scenes re-composed around fewer, larger elements. Deeper darks were
  not attempted. Headline colour is done.
- **Phase 5 — the gates.** `paletteBands` and `presenterOccupancy` were specified
  but not built, so both new axes are currently conventions rather than
  invariants. Given this series' history, that is the most important thing
  outstanding: everything un-gated has eventually regressed.
