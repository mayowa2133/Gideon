# Meet Solomon style pilot

Branch: `codex/meet-solomon-style`. The first pilot is **06 — Too Late**.

This is an isolated local render format, not a change to the existing V1–V22
films, production API, approval gates, or capture worker. The existing V22 rig
has one optional `mouthless` prop; its default output and golden snapshots stay
unchanged. The Meet renderer always uses it. No voice is cloned and no paid
provider is called.

## Creative decisions

The supplied three reference clips were inspected as decoded frames; their
durations are 53.0s, 36.27s, and 38.23s. The useful grammar is a close presenter,
large empty areas, short sans-serif phrases, occasional oversized italic serif,
floating evidence, and decisive cuts to full-screen proof. The people, logos,
music, and delivery CTAs in those clips are not reused.

The pilot starts with a promising job, exposes its age, resets with “Meet
Solomon,” explains automatic discovery, shows a second listing and the real
sorting control, then returns to the two ages before asking “What changed?”
Sixteen shots have separate new-information, visual-metaphor, presenter-action,
evidence, and transition records. Edit the JSON story, not the old templates.

## Evidence limitation

A capture plan was written before the product was opened. The local preview
rendered the product UI but could not load account data (the development auth
bootstrap reported a failed fetch). It supplied a new capture of the visible
automatic-feed explanation, not proof that a background search ran or a
fabricated filled feed. The timestamp
contrast uses existing product screenshots dated August 25 and August 27, 2026.
The film labels those dates and identifies the comparison as different listings
and different captures. It does not claim that the postings remain available,
that a posting changed from old to new, or that finding it early beats other
applicants. The originally proposed “12 days / 18 minutes” figures are not used.

This is explicitly a **private style study**. It is not the normal fresh-capture
production path and is not approved for publication. For a campaign release,
capture the needed product states for that angle and update the script’s required
evidence together. Never silently replace the proof behind an unchanged claim.

## Run

```sh
npm run creator:meet:solomon -- --out tmp/meet-solomon-style
# To review before encoding the full video:
npm run creator:meet:solomon -- --out tmp/meet-solomon-style --stills-only
npm run test:meet:solomon
```

Inputs:

- `fixtures/meet-solomon/too-late.json`: editable narrative and art direction.
- `<out>/evidence.json`: locally reviewed, hash-pinned evidence metadata.
- `<out>/capture/*.png`: corresponding private source images.
- Local Chatterbox model/runtime and Whisper. Model downloads are disabled.

Use `--story`, `--evidence`, and `--capture-dir` for explicit input paths.
`--seconds` is bounded to 35–45; voice retiming outside 0.8–1.3 fails. Source
images and outputs remain in ignored private directories and are not committed.

Outputs include `film.json`, `BEAT-SHEET.md`, `caption-alignment.json`,
`quality.json`, voice provenance, sixteen review stills, and
`meet-solomon-too-late.mp4` with a content-hash render receipt.

The template currently implements the Too Late narrative’s sixteen visual
layouts. It is a starting vocabulary for future Meet stories, not an automatic
ten-video campaign generator.

## Guarantees and limits

- Runtime schemas validate timing, crop bounds, asset names, approval status,
  evidence references, and caption containment.
- Source image hashes are verified before the images are copied into this
  film’s own render directory. File signatures and source dimensions are checked;
  a browser screenshot returned JPEG bytes despite a `.png` output name, which
  this check caught. Its original bytes and a PNG normalization receipt are kept.
  OCR on each cropped proof must contain the exact claimed text. Required
  evidence text and spoken figures must match same-scene proof.
- Proof sizing and its 20px type floor use the renderer’s exact contain scale.
  The brief wide product view uses the distinct 10px recognizability floor and
  is excluded from factual grounding.
- The continuous narration is assembled from bounded passages. A single long
  Chatterbox generation corrupted its last lines during development; the first
  81% transcription match correctly blocked the render. The gate remains 90%.
- Phrase captions use the authored words and measured speech times. Failed
  alignment blocks the pilot instead of silently estimating captions.
- Final output is normalized toward −14 LUFS and −1.5 dBTP. Automated checks
  support review; they do not establish creative mastery or human approval.
- Metadata marked approved means reviewed for this local style study, not an
  approval to publish customer media. Source OCR and hashes establish pixel/text
  agreement, not the current availability of an archived job posting.

## Delivery verification — August 30, 2026

The encoded master is 38.5 seconds, 1080×1920, 30 fps, 1,155 frames, H.264/AAC,
limited-range yuv420p / BT.709, and 48 kHz audio. Measured loudness is −14.56 LUFS
with −1.77 dBTP true peak and zero detected clicks. The decoded shot detector
finds 18 shots (2.14 seconds mean), including the intentional in-scene changes.
The presenter is visible for approximately 65.8% of the film. Whisper matched
99.0% of narration words. Cropped factual proof measures 31.8–62.5px text at
1080; the one wide product view measures 10.1px and carries no factual claim.

Reviewed the sixteen-scene contact sheet from the final encoded video and the
wide-to-close product cut separately. A first pass corrected checklist timing,
added the application view, removed duplicated question typography, and gave
the introduction 1.1 seconds. Final mastering corrected the encoder’s default
color space and used two-pass loudness normalization. The remaining creative
limitation is expressiveness: the mascot is still a deterministic 2D rig, and
this one story is not enough to establish quality across all ten campaign angles.

Validation passed: repository lint, 18 targeted tests including unchanged V22
golden snapshots, main and Remotion typechecks, full desktop/web build, source
PNG/hash/OCR checks, full Remotion render, and decoded media verification.
The repository-wide typecheck still fails in existing renderer test files
(`angleBlueprint`, `.mjs` declarations, and V11–V22 mascot literal-type tests).
No existing application user flow or API changed, so no application E2E run was
needed. Generated binaries and private screenshots are excluded from the commit.
