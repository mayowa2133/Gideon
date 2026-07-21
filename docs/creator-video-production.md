# Creator-led product video production

Status: all locally achievable structural and visual-readiness work is implemented. The deterministic benchmark passes both readiness states; real avatar quality, subjective human approval, brand acceptance, licensing, provider credentials, and production infrastructure still require external confirmation.

## Scope and reference grammar

The three supplied reference clips share a production grammar, not a reusable person or brand identity. Gideon preserves that grammar while excluding the referenced presenter, products, handles, logos, and CTA keywords.

- 9:16 composition, approximately 36–53 seconds.
- Hook within the first three seconds.
- A visual change roughly every 1.9–2.3 seconds, moderated when product proof needs longer dwell.
- Alternating presenter, full-screen proof, designed product frames, and typography.
- Phrase- or word-timed kinetic captions.
- Multiple presenter crops and positions instead of a permanent corner overlay.
- Claims paired with captured evidence.
- Approximately 4.5 seconds for the CTA/end card.
- Narration near social-video loudness. Gideon targets −14 LUFS with a ±1.5 LU acceptance gate.

The references speak at approximately 225–243 WPM. Gideon defaults to `energetic` (160–175 WPM); `readable` is 145–160 WPM and `reference_fast` is an explicit 200–235 WPM choice.

## Architecture

`referenceCreatorVideoTemplateV1` is the versioned production grammar. `compileCreativeBlueprint` consumes an approved script, product moments, frame evidence, the product profile, and any prior manually overridden scenes. Identical approved inputs produce the same blueprint.

The compiler emits a `CreativeBlueprint` containing ordered `SceneComposition` records. A scene declares its purpose, timing, shot type, presenter visibility/layout, product assets, claims, captions, typography, background, transition, crop/focus, minimum dwell, and SFX. The supported shot vocabulary is:

- `product_hero`
- `product_fullscreen`
- `product_mockup`
- `presenter_fullscreen`
- `presenter_lower_third`
- `presenter_with_card`
- `split_presenter_product`
- `comparison_card`
- `kinetic_typography`
- `cta_end_card`

The compiler flags claims without evidence, reserves the CTA, gives complex proof longer dwell, alternates presenter and product scenes, varies layouts, chooses collision-aware text positions, and preserves scenes marked `manuallyOverridden`. `projectBlueprintOntoEditDecisionList` maps the versioned blueprint onto the existing EDL v2 contract, preserving backward compatibility for projects without a blueprint.

## Product asset pipeline

`buildProductEvidenceAssets` derives editable asset records from captured moments and frames. Every asset carries moment/evidence lineage, claim IDs, time bounds, masking status, readable crop metadata, provenance, approval status, and whether factual use is permitted.

`materializeProductEvidenceAssets` creates local media from a source capture:

- clean screenshots;
- 30 fps trimmed H.264 interaction clips;
- source media for browser, phone, terminal, feature, comparison, and hero treatments;
- before/after composite frames;
- normalized privacy mask regions;
- a path-safe manifest containing basenames rather than private absolute paths.

The scene compositor supplies the designed browser, terminal, phone, feature, comparison, and hero framing. A conceptual asset is never materialized as factual proof. Rejected assets are skipped. Quantitative or comparative copy remains blocked unless an approved factual asset supports its claim.

Normal render jobs run this factory before composition. Required factual assets must be approved with masking review resolved. The deterministic cache includes source checksum, evidence/claim lineage, crop/readable region, masking inputs, approval, and factory version. Matching private artifacts are reused; changed source, evidence, crop, or masking state invalidates them. Artifact lineage retains source, moment, evidence, claim, approval, masking, crop, content-hash, and factory details. All ten asset kinds have distinct treatments: clean screenshot, temporal interaction clip, browser chrome, portrait phone, monospace terminal, labeled before/after, feature, evidence/concept comparison, branded hero, and conceptual warning.

Cursor, click, and typing cues remain evidence-driven. Production renders use a code-native black-and-white arrow with a `(1, 1)` tip hotspot, cubic eased travel, pre-click dwell, separate click feedback, and progressive safe-field typing at a readable character cadence. Secret-shaped values are redacted. Gideon shows interaction cues when they explain an action; it does not invent continuous purposeless pointer movement.

## Avatar provider contract

The provider-neutral avatar result supports one continuous approved-narration performance, output dimensions, FPS, duration, crop-safe region, background/matte type, word/phoneme timing, expression/gesture tags, provider receipt, consent/source lineage, and failure status.

The deterministic local fixture produces a 1080×1920, 30 fps green-screen test performance. It exercises full-screen, close, medium, lower-third, left/right split, hidden-presenter, and CTA layouts. It is a compositor fixture only: it does not demonstrate photorealism, identity stability, natural lip sync, hands, or emotional quality.

Existing lineage checks reject stale script/avatar combinations. Consent may be `not_required` for Gideon-owned fictional catalog presenters; real likenesses must have a current, non-revoked consent record. Every presenter scene carries `AI-generated brand presenter` disclosure lineage.

## Scene-aware renderer

The renderer encodes each blueprint scene as an independent 1080×1920, 30 fps H.264/AAC segment. The content-addressed key covers complete scene composition and direct transition dependencies, template/blueprint version, source checksum, product hashes, avatar hash, narration range/hash, pronunciation hash, captions/typography, render policy, and renderer version. A cold render encodes all scenes. A scoped render encodes the requested scene and direct transition neighbors, reuses other segments byte-for-byte, and atomically splices them. Failed/canceled work uses temporary paths and does not replace the prior final render or cache manifest.

Before replacement, Gideon verifies decodable boundary frames, transition dependencies, timestamp/audio continuity, caption ranges, total duration, and codec compatibility. The compositor supports scene-dependent presenter visibility/crop/position, chroma key, baked fallback, product-only proof, split layouts, floating frames, branded backgrounds, captions, CTA, transitions, focus changes, and SFX. Background dimming is applied before the presenter is composited, so it cannot darken the presenter layer. `renderPolicy.mode` is explicitly `production` or `debug`; normal jobs and the canonical benchmark use production mode, while diagnostic geometry remains available in metadata and debug renders.

Audio layers are mixed and normalized, then the encoded result is measured. If the result misses the target, bounded measured gain passes correct it. The limiter has automatic gain restoration disabled so the final correction is not undone.

The two editable typography families are kinetic bold and a genuine serif italic. Editorial fallback order is system Georgia Italic, Times New Roman Italic, STIX Two Text Italic, DejaVu Serif Italic, then the kinetic face; kinetic independently prefers Arial Bold or DejaVu Sans Bold. Render metadata records resolved family, font basename, italic flag, and fallback state. Bundling a production font remains subject to licence approval.

Text placement uses normalized rectangles. Presenter layouts, disclosure, CTA controls, platform safe bounds, and each product asset's readable region are reserved. Caption/heading candidates are tried deterministically with bounded scale reduction; chosen rectangles and collision inputs are stored in validation metadata. An impossible placement fails final approval. Provider landmarks may refine these rectangles later.

## Review and revision

The script review screen exposes pace, every scene, image/video asset previews, visual treatment, source moment/time, claim/evidence lineage, masking, approval, factual eligibility, conceptual warnings, and compatible approved replacements. Editing a scene marks it as a manual override, and recompilation preserves it. “Regenerate encoded scene” saves the blueprint, retains that override, and launches a scoped job. The resulting render lists requested, regenerated, and reused scene IDs.

Script approval, avatar generation, rendering, and export remain separate operations. Blocking script warnings prevent provider work. The quality report is designed to be displayed alongside scene warnings and final-render approval.

## Quality gates

`evaluateCreatorVideoQuality` emits a versioned report with separate `structurallyPublishable` and `humanReviewReady` outcomes. The compatibility `publishable` field is true only when both automated outcomes pass; the UI still requires explicit final human approval before export. Local gates cover:

- 1080×1920 H.264/AAC and duration drift;
- missing audio, loudness, and excessive silence;
- black/blank/low-signal sampled frames;
- scene-aware repeated-frame ratio, longest unexpected freeze, affected scenes, and stale-loop detection; static CTA/type scenes are allowed, while unexpected product/presenter freezes fail;
- text safe-layout and overflow risks;
- minimum product scale and scene dwell;
- excessive cuts and three-scene asset repetition;
- missing CTA;
- unsupported or unapproved claim evidence;
- actual presenter/product/disclosure/CTA/text rectangle intersections;
- avatar disclosure, script lineage, consent, artifact presence, crop/frame metadata, and matte/background declaration.
- encoded CTA presence at the beginning, middle, and end of its visible interval, including exact copy, bounds, font, contrast, dwell, and sample timestamps;
- arrow movement, tip-aligned clicks, progressive typing, completion dwell, and secret redaction receipts;
- production-mode exclusion of diagnostic guides, timecodes, and known test patterns;
- known product-label readability and minimum rendered text size;
- presenter-region exposure, all ten populated treatments, and transition-boundary safety at approximately −100/0/+100 ms.

Pronunciation dictionaries accept at most 64 normalized printable term/value pairs. The approved script and captions never change. Entries affect synthesis input only through provider-native support when safely available, or deterministic boundary-aware substitution otherwise. Voiceover provenance stores dictionary and speech-input hashes; changes invalidate reusable voiceover and dependent avatar lineage.

Avatar lip sync, deformation, identity stability, blinking/head motion, segmentation halo, temporal flicker, audible pronunciation quality, and emotional fit remain `requires_external_review` until a genuine model-backed canary and human review exist.

## Local benchmark

Run the first-class command; the default directory is ignored:

```bash
pnpm creator-video:benchmark
pnpm creator-video:benchmark --output-dir "$PWD/tmp/creator-video-benchmark-custom"
```

The benchmark renders the `readable` plan as its canonical output and also compiles the energetic plan for comparison. Its local seeded NexusReach-style workflow opens Contacts, types “Maya Chen” progressively, opens the record, changes Lifecycle stage to Qualified, saves, and shows “Changes saved.” It exercises four eased arrow movements (one long and three short), three clicks, safe typing, all ten populated treatments, exact CTA rendering, presenter exposure, production-overlay exclusion, every transition boundary, pronunciation, both type families, cold rendering, and single-scene regeneration/cache reuse. It uses audible local narration when macOS `say` is available and never claims subjective avatar equivalence or photorealism.

Expected artifacts:

- `tmp/creator-video-benchmark/renders/benchmark-script/creator-video-readable.mp4`
- `tmp/creator-video-benchmark/creator-video-contact-sheet.jpg`
- `tmp/creator-video-benchmark/creator-video-key-frames.jpg`
- `tmp/creator-video-benchmark/creator-video-interaction-motion-strip.jpg`
- `tmp/creator-video-benchmark/creator-video-typing-sequence.jpg`
- `tmp/creator-video-benchmark/creator-video-cta-samples.jpg`
- `tmp/creator-video-benchmark/creator-video-benchmark.json`
- `tmp/creator-video-benchmark/product-assets/product-assets.json`
- `tmp/creator-video-benchmark/scene-cache-report.json`
- `tmp/creator-video-benchmark/creator-video-structural-quality-report.json`
- `tmp/creator-video-benchmark/creator-video-visual-readiness-report.json`
- `tmp/creator-video-benchmark/creator-video-quality-report.json`

Generated benchmark media lives under ignored `tmp/` and must not be committed.

## External-provider canary

After provider/model/legal confirmation, configure the existing worker and run:

```bash
pnpm avatar:worker:check
pnpm avatar:worker:canary
pnpm provider:canary
```

Then render the benchmark with the returned presenter artifact and run the same post-render quality evaluator. A canary passes only if receipt and consent lineage match, status is complete, dimensions/FPS/duration/crop/matte metadata validate, no stale source is used, and a human reviewer accepts disclosure, lip sync, identity, deformation, flicker, pronunciation, emotional fit, and brand appearance.

## Current limitations

- The deterministic avatar fixture is intentionally synthetic and cannot prove real-avatar quality.
- Product treatments are deterministic and distinct, but final visual identity lacks brand approval.
- Temporal QA uses dense scene-aware perceptual differences, not every encoded frame; production thresholds need corpus calibration.
- Known-label readability uses deterministic fixture geometry and receipts rather than general-purpose OCR; real-product corpus calibration remains useful.
- Collision checks use deterministic crop-safe rectangles, not provider face/object segmentation.
- Pronunciation substitution executes locally, but audible quality needs the selected provider canary and human review.
- A cold scene cache costs more than a monolithic draft; revisions gain the reuse benefit.
- A scoped product-scene regeneration still rebuilds the complete timeline-wide interaction overlay before reusing unaffected encoded scene segments; this is correct but leaves a performance optimisation opportunity.
- No provider cost, retention, region, rate limit, commercial licence, or production SLA is asserted locally.

## Production-readiness checklist

- [x] Versioned template and scene contracts.
- [x] Deterministic compiler, evidence enforcement, pacing, dwell, CTA, and manual override preservation.
- [x] Product asset metadata and local materialization.
- [x] Provider-neutral avatar metadata, fixture, lineage, consent, and disclosure contracts.
- [x] Scene-aware compositor and deterministic vertical export.
- [x] Captions, editorial typography, SFX, loudness normalization, and post-render validation.
- [x] Local structural benchmark and path-free report.
- [x] Encoded scene cache, scoped regeneration, atomic splice, and UI receipt.
- [x] Production asset materialization, private lineage, previews, and distinct treatments.
- [x] Temporal QA, rectangle collision metadata, real serif italic resolution, and pronunciation execution.
- [x] Separate structural and encoded visual-readiness outcomes with negative regressions.
- [x] Seeded workflow, arrow/click/typing presentation, production/debug policy, readable product framing, presenter exposure, visible CTA, populated treatments, and transition sampling.
- [ ] Genuine avatar/provider canary accepted.
- [ ] Voice, visual identity, CTA, pace, and human acceptance policies approved.
- [ ] Provider/model/licence review completed.
- [ ] Production storage, queue, database, GPU, observability, secret, retention, and deletion controls approved and deployed.
