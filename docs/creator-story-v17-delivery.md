# Solomon Creator Story V17 — delivery notes

V17 fixes two defects found by reviewing V16 against the three reference videos,
and corrects a measurement error that had been hiding one of them.

## 1. The CTA frame

In V16 the mascot completely covered the comment box (only "SO…" and "…OMS"
showed), the antenna punched through the `@SOLOMON` pill, the background read as
murky grey-green, and "COMMENT SOLOMON" printed twice — headline and bottom chip.
This is the most important frame in the film and its call-to-action mechanism was
hidden behind the character.

**Why no gate caught it.** `forbidden()` has always marked `mascot × cta` as an
illegal pair, but **no scene had ever constructed a `cta` rect**. Only `caption`,
`mascot`, and `product` rects exist anywhere in the tree, so the comment box was
raw JSX invisible to the collision model. The rule was dead code. This is the same
root cause as the V11 proof-text overlap, which was only fixed on the mascot side.

**Fix.** A new `layouts("cta")` mode declares four non-overlapping bands:

| band | rect | rendered |
|---|---|---|
| headline | *(text zone)* | y 212–344 |
| mascot | `.27/.22/.73/.615` | rig y 473–1181, antenna tip 437 |
| comment | `.09/.645/.91/.80` | card 1252–1356, sub-line 1374–1404 |
| handle | `.30/.845/.70/.895` | pill 1636–1689 |

The mascot rect is deliberately **width-limited** (`scale = min(496.8/660,
758.4/940) = .75273`), which leaves 50.8 px of top slack for the antenna. That
matters because the rig's svg is `overflow:visible` and the antenna draws ~48 px
above the declared box — the *second* reason the break went uncaught. Measured
clearances: 57.6 px above the comment box, 93.1 px between antenna and headline.

`V17_RIG_BLEED` now models that overhang. It is reported for every scene but only
**hard-fails against CTA bands**: cameo scenes legitimately bleed into empty
canvas, whereas social UI is what the viewer must act on and can never be crossed.

Also removed: the duplicate bottom chip (captions 9 → 8, assert relaxed to
`.min(7)`) and the `dim` overlay, which was the murk — 42% ink over pale mint.

## 2. Cut strength

The original complaint was "V16 has 4 cuts, references have 31–52". That number
was wrong, and the correction changed the whole approach.

Measured at the repo's own threshold (0.10), the references are 27/18/15 shots
over 53/36.3/38.2 s = **0.392–0.509 shots/s**, and V16 sat at 15 shots / 0.417.
The count gap was small. The real defect showed up in a threshold sweep:

| threshold | V16 | **V17** | references |
|---|---:|---:|---|
| >0.10 | 14 | **27** | 27 / 18 / 17 |
| >0.20 | 6 | **23** | 26 / 16 / 14 |
| >0.30 | 1 | **19** | 25 / 16 / 13 |
| >0.40 | 1 | **19** | 25 / 15 / 13 |

The references **plateau** — once a cut is detected it stays detected, because
every one is hard. V16 **collapsed**, because every boundary was marginal. Six of
its 17 scenes shared an identical pale gradient and four more sat within ~15 luma
of it; pale-on-pale adjacency is why boundaries failed to register. **The mint
monotony and the "no cuts" reading were the same defect.**

**Fix.** `V17_BACKDROPS` defines seven tokens across three luma tiers (bright
~232–243, mid ~152–165, deep ~15–57). Scenes are assigned so no two consecutive
shots share a token *or* a tier, making every adjacent pair differ by ≥75 luma;
`auditV17BackdropCadence` enforces it so a future edit cannot reintroduce a pale
run. All four `match_cut`s became real cuts (18 decisive, 0 dissolves).

The `signature` scene (165 f / 5.5 s — longer than any reference shot) splits into
three, with distinct `scaleTo` and `semanticTarget` so the composition-similarity
audit sees three fingerprints, and `groupFrom` re-anchors `useCurrentFrame()` so
the token choreography stays continuous across the new Sequence boundaries.

~30 scenes was considered and rejected on measurement: it yields 0.83 shots/s
against a reference ceiling of 0.509.

## 3. The measurement corrections

**Cut clustering.** The first V17 render reported 28 shots and failed the gate.
The raw times showed clusters — `8.4, 8.433, 8.467` — three "cuts" 33 ms apart.
V17's boundaries change backdrop *and* slide content over 2–3 frames, and the
scene detector fires on each. `cutScan` now merges detections within 150 ms.
The references were **re-measured with the same fix**, and the band was re-derived
from those numbers: `[13,20]`, which is *tighter* than the hand-set `[16,21]` it
replaced.

**Motion ceilings were self-referential.** Measured on the repo's own metric the
references score medianFrameChange 5.72 / 7.57 / 6.76, continuous 4.60 / 5.07 /
4.58, longestLowMotion 3.4 / 3.2 / 3.2 — so **all three would have failed V16's
ceilings of 3.5 / 4 / 2**. Those ceilings had been tuned to Gideon's own output,
which is how a gate reported "in band" while the film looked nothing like the
target. Ceilings widen to 8 / 5.5 / 4. Floors are deliberately **not** raised:
V17 does not reach reference continuous motion, and lifting them would force
decorative drift — the exact V10 failure these bands were introduced to stop.

**New `shotDensity` gate.** `decoded.shots` was already computed by the existing
`cutScan()` and never gated in `qualityAudit()`; it now is, against
`V17_SHOT_BANDS`. Baseline floors derive from `referenceMeasurements` rather than
from the parent master.

## Results

All 27 gates pass. `decodedShotCount` 20, mean 1.80 s, median 1.83 s;
`nearStaticFramePercent` 10.06 (floor 10, references 12.1–21.1);
`medianFrameChange` 3.84; 19 hard cuts holding at threshold 0.40.

**Caveat worth keeping:** at 20 shots over 36 s V17 runs 0.556 shots/s against a
reference maximum of 0.509. It is inside the band but at the **top** of it —
slightly busier than any reference, not dead centre. Near-static also sits just
above its floor at 10.06 vs the references' 12.1–21.1, so the film has less calm
than the target. Both are candidates for a future pass.

## Reproduce

```bash
pnpm creator-story:v17:fixture
pnpm creator-story:v17:capture   # or reuse an existing capture dir
pnpm creator-story:v17:baseline
pnpm creator-story:v17:solomon
pnpm creator-story:v17:compare
pnpm test:creator-story:v17
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
