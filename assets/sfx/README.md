# Sound effects library

Ten one-shot sound effects used by the desktop render path in place of the
synthesized sine tones it shipped with. Every file is CC0 1.0 (public domain)
from [Kenney](https://kenney.nl/assets?q=audio):

| Pack | Files |
| --- | --- |
| Interface Sounds | `click_003.ogg`, `drop_001.ogg`, `drop_002.ogg`, `bong_001.ogg` |
| UI Audio | `click2.ogg` |
| Impact Sounds | `impactSoft_medium_001.ogg`, `impactSoft_medium_002.ogg`, `impactGlass_light_001.ogg`, `impactBell_heavy_003.ogg` |
| Casino Audio | `card-slide-1.ogg` |

They were chosen from the 228-file library that
[latent-spaces/brag](https://github.com/latent-spaces/brag) bundles, using its
spectral analysis: only low/medium high-frequency-risk files, because a bright
click repeated five times in a twenty-second film is fatiguing in a way a warm
one is not. The labels are copied into the manifest so the reason each file is
here survives the choosing.

## manifest.json

Generated, never hand-edited:

```bash
node scripts/build-sfx-manifest.mjs           # rewrite
node scripts/build-sfx-manifest.mjs --check   # verify, exit 1 on drift
```

Each entry carries the file's `sha256`, `durationMs`, measured `peakDbfs` and
a `gainTrimDb` that brings the file to a common −6 dBFS sample peak. The
renderer verifies the hash before mixing and refuses to render if it does not
match; there is no fallback to a tone. A cue's `gainDb` is applied on top of
the trim, so it means the same thing for every file.

`kind` is the vocabulary a render manifest uses (`click`, `pop`, `whoosh`,
`card`, `impact`, `success`, `sting`). Kinds with two entries alternate by cue
ordinal so repeated cues do not sound machine-stamped.

## What is not here

No music. A licensed track is attached in the platform's composer at post
time, and the render never embeds one. Adding a bundled bed is a separate
decision with its own license record.
