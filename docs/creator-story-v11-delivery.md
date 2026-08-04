# Solomon Creator Story V11 — delivery notes

V11 exists to close the defect classes found by a frame-by-frame review of V5→V10
against three reference creator videos, and — more importantly — to make each of
those defect classes impossible to reintroduce silently. Every V10 review finding
now has either a compile-time contract or a render gate behind it.

## What changed

### One source of truth for text
`src/shared/solomonCreatorStoryV11Beats.ts` is now the only place any viewer-facing
words are authored. `compileSolomonCreatorStoryV11()` derives the VO script, the
per-scene narration, the TTS beat list, the caption chips, the serif headlines,
and the numeral anchors from that single list.

V10 authored those five surfaces independently, which is why its hook caption read
`…surfaced a relevant contact.INTERVIEWING` (a case-sensitive `String.split` with
no fallback, over a caption whose text was the spoken sentence rather than a chip)
while the on-screen headline, the spoken hook, and the caption all said different
things.

- Captions are short uppercase chips again (`beatText`), with a case-insensitive
  highlight lookup that degrades to plain text instead of concatenating.
- Serif headlines render from the manifest (`SerifHeadline`), not from JSX literals
  duplicated across scene components.

### Hook and CTA are locked templates
- Hook: viewer-outcome, second person, ≤14 words — "Your job search just changed…".
- CTA: comment-gated — "Comment SOLOMON and I'll send you the demo" — with a dimmed
  outro, an `@SOLOMON` handle pill, a ghost comment box that types the keyword, and
  the mascot waving. Across V5→V10 the CTA churned comment → follow → save → save;
  it is now a template constant with `auditV11Cta` enforcing it.
- Comment delivery is a real-world capability, so `ctaDeliveryApproval` is a
  `blocked_external_confirmation` gate rather than a silent pass.

### Narration timing derived, not hand-typed
`assembleNarration` measures each synthesized beat and places it a fixed 225 ms
after the previous beat ends, at a single global tempo. V10 hand-typed absolute
`startMs` windows per beat and `adelay`-ed to them, which produced five ~0.4 s dead
gaps mid-video. `narrationGapAudit` fails the render on any internal gap > 0.3 s,
and mastering is now two-pass loudnorm targeting −14.0 LUFS.

### Mascot: art fixes, spec enforcement, and a persistent layer
- Resting face is the arched dome. `surprised` (circle eyes) is schema-rejected as a
  base face and may only appear via `faceAccents` for ≤9 frames; the hook uses one
  such accent. The off-center `direct_cta` pupils are gone, so it no longer reads
  cross-eyed at phone scale.
- Hands are mitts at cameo scale (`cameoFingerDetails: false` restored from V9);
  point gestures are a tapered wedge fused to the mitt rather than a thin stroke
  poking out of an ellipse, and `thinking_hand`'s pin/lollipop circle is removed.
- A neck capsule closes the 17 px head-to-body seam that the larger V10 head
  rotation exposed.
- `RobotMascotV11Rig` is a dependency-free pure function of props; `MascotLayer`
  mounts it **once** for the whole film and slides it between numeric anchors with a
  squash-and-stretch landing. V10 mounted the mascot inside all 14 scene Sequences,
  so its entrance spring restarted at every boundary and the host ghosted in and out.
- V9's dashed interaction line is restored, so the mascot visibly points at what it
  is presenting.

### Camera, safe area, and cuts
`V11_CAMERA_ENVELOPE` and `V11_SAFE_AREA` are shared by the renderer and the audit.
The camera is far tighter than V10's effective ~1.08 scale with ±26 px sway, and
"calm" scenes (product annotations) damp the sway during their middle stretch, which
is what restores reference-style calm frames. `EvidenceCrop`'s independent sine pan —
V10's second drift source — is reduced to a fraction of its former amplitude.
Scene content enters in ≤8 frames so beat boundaries read as cuts.

## Gates added

| Gate | Catches |
| --- | --- |
| `captionLints` | chips over four words, sentence-case chips, highlights that are not substrings |
| `numeralAnchorsStatic` / `numeralAnchorsSpoken` | a hero numeral (the 170 px `5×`) with no matching spoken token, statically and against Whisper word timestamps |
| `narrationGaps` | dead air > 0.3 s inside the narration bed |
| `renderedBounds` | any content rect the camera envelope could push off-canvas |
| `motionBands` | motion that is too still **or** too churny (two-sided, replacing V10's "beat the previous version" floors) |
| `mascotBoundaryContinuity` | the mascot popping or refading at a scene boundary |
| `transitions` | declared transition metadata that decoded pixels contradict |
| character golden masters | any silhouette change to face, hands, neck, or proportions |
| `v11-scorecard` | any metric that passed in V10 regressing in V11 |

The scorecard (`reports/v11-scorecard.{json,md}`) compares every numeric metric
against `fixtures/creator-story/v10-accepted-metrics.json` and exits non-zero on a
regression. This is the direct answer to the V5→V10 pattern where each version fixed
the criticized axis and quietly regressed another.

## Reproduce

```bash
pnpm creator-story:v11:fixture
pnpm creator-story:v11:capture   # or SOLOMON_V11_CAPTURE_DIR=<v10 capture dir>
pnpm creator-story:v11:baseline
pnpm creator-story:v11:solomon
pnpm creator-story:v11:compare
pnpm test:creator-story:v11
```

Requires `ffmpeg`, `ffprobe`, `tesseract`, and `whisper` on PATH, plus the Chatterbox
runtime at `tmp/chatterbox-runtime/.venv`.

## Still human-gated

Mascot appeal, voice naturalness, message quality, proof credibility, disclosure
clarity, CTA appropriateness, brand/legal approval, and overall reference-quality
judgement remain `blocked_external_confirmation`. V11 renders privately and is not
release-approved.
