# Solomon Creator Story V14 — delivery notes

V14 removes the last of the mint connector graphics: the dashed arc in the
signature scene, together with the dot that travelled along it.

## Why

V13 removed the mascot-to-content interaction line. The signature scene kept a
separate dashed arc — `M145 1160 C330 1020 745 1020 935 1160` — drawn beneath the
JOB → PERSON → PROOF → MESSAGE token cards, plus a glowing mint dot that moved
between tokens.

Those two elements are one graphic, not two: the dot's vertical position was
`1100 - sin(travel * PI) * 85`, which traces the arc's curve. Removing the arc and
keeping the dot would have left a glowing ball floating across empty space —
the same stray-green reading the connector removals were meant to eliminate — so
both are gone.

The scene still carries its meaning. The four token cards light up in sequence
through their `active` borders as `phase` advances, and the MESSAGE token still
resolves to mint, so "context moves with the story" reads through the card states
rather than through a drawn path. This also matches the reference videos, which
sequence ideas with card states and cuts rather than connector lines.

## Change

`Signature` in `SolomonCreatorStoryV14.tsx` drops the arc `<svg>` and the
travelling dot. The now-unused `travel` local is removed with them.

## Verification status

Static checks pass: 365 tests, both typechecks, repository lint clean. The render
and its 26 gates were still running when this was committed — see the scorecard at
`tmp/solomon-creator-story-v14-performance/reports/v14-scorecard.json` for the
recorded result, and treat any gate failure there as superseding this note.

## Reproduce

```bash
pnpm creator-story:v14:fixture
pnpm creator-story:v14:capture   # or reuse an existing capture dir
pnpm creator-story:v14:baseline
pnpm creator-story:v14:solomon
pnpm creator-story:v14:compare
pnpm test:creator-story:v14
```

## Still human-gated

Unchanged: mascot appeal, voice naturalness, message quality, proof credibility,
disclosure clarity, CTA appropriateness, brand/legal approval, and overall
reference-quality judgement remain `blocked_external_confirmation`.
