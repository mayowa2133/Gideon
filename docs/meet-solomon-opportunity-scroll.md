# Meet Solomon opportunity scroll

This format turns real Solomon job-feed cards into a calm vertical scroll for
short-form content. It is isolated from the earlier Meet Solomon compositions
and renders through `scripts/render-meet-solomon-opportunities.mjs` from a
validated JSON story.

## Claim boundary

- Product captures must be PNGs with retained SHA-256 hashes and capture times.
- The scroll must be labelled as editorial and dated on screen.
- The story must say that listings can change.
- The copy cannot describe the inventory as exclusive without separate proof.
- The final informational CTA is **Want easy access to more opportunities? Join
  Solomon.** It does not imply a public URL, application submission, or hiring
  outcome.

## V1 source set

The first cut uses three captures from August 31, 2026:

| Feed | SHA-256 | Cards used |
| --- | --- | ---: |
| Remote software | `a938ce04ef5eb0835ad8eb09a2fd712d7c8b235d95b29113947b24916df1d64e` | 6 |
| Marketing | `9932ede621d510aaa3e30a99b92f5557c0b333e69f09654e375d9613b042502b` | 6 |
| Remote nontechnical | `5dd860e6235c4099b033128e3012f7bd6f7f639d25224b1048be019c415da47a` | 5 |

The crops preserve the original card pixels. Their arrangement is the only
editorial transformation. The source images, story, film manifest, OCR review,
voice provenance, alignment, decoded-quality report, CTA review frames, and
render receipt are retained with the local master.

## V1 verification

- Duration: 23.53 seconds
- CTA hold: 4.4 seconds
- Caption alignment: 100%, source `aligned`
- Decoded narration: exact approved script with Whisper `small.en`
- Integrated loudness: -14.42 LUFS
- Audio clicks: 0
- Video: 1080×1920, 30 fps, H.264, YUV420p, BT.709
- CTA OCR: matched at 19.3 and 23.3 seconds
- Existing Meet Solomon masters changed: 0

## V2 mascot treatment

V2 adds the mouthless Solomon robot in two bounded roles. A circular head cameo
welcomes the viewer during the hook, then disappears before the opportunity
scroll begins. A small full-character cameo returns below the CTA with one
presentation gesture and wave. The mascot never covers a job title, employer,
category tag, caption, CTA line, or the dated-capture disclosure.

The character is intentionally absent from the four middle scenes. Its motion
settles after the entrance gesture instead of floating continuously. V1 remains
independently selectable and its preserved master is byte-identical.

V2 verification:

- Duration and CTA hold: unchanged at 23.53 and 4.4 seconds
- Product cards: unchanged at 17
- Character appearances: hook and CTA only
- Decoded mean motion: 4.24; longest static reading hold: 4.0 seconds
- Caption alignment: 100%, source `aligned`
- Decoded narration: exact approved script with Whisper `small.en`
- Integrated loudness: -14.42 LUFS; detected audio clicks: 0
- CTA OCR: required CTA text matched at 19.3 and 23.3 seconds
