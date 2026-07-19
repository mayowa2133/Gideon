# Creator-led product video production

Status: local structural implementation complete; real avatar quality and production-provider readiness require later confirmation.

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

Cursor, click, and typing cues remain evidence-driven. Gideon shows them when they explain an interaction; it does not invent continuous purposeless pointer movement.

## Avatar provider contract

The provider-neutral avatar result supports one continuous approved-narration performance, output dimensions, FPS, duration, crop-safe region, background/matte type, word/phoneme timing, expression/gesture tags, provider receipt, consent/source lineage, and failure status.

The deterministic local fixture produces a 1080×1920, 30 fps green-screen test performance. It exercises full-screen, close, medium, lower-third, left/right split, hidden-presenter, and CTA layouts. It is a compositor fixture only: it does not demonstrate photorealism, identity stability, natural lip sync, hands, or emotional quality.

Existing lineage checks reject stale script/avatar combinations. Consent may be `not_required` for Gideon-owned fictional catalog presenters; real likenesses must have a current, non-revoked consent record. Every presenter scene carries `AI-generated brand presenter` disclosure lineage.

## Scene-aware renderer

The renderer consumes the blueprint and composes each scene independently while exporting one deterministic 1080×1920, 30 fps H.264/AAC file. It supports scene-dependent presenter visibility/crop/position, chroma key, baked-background fallback, product-only proof, split layouts, floating product frames, branded backgrounds, captions, editorial headings, CTA rendering, snap/match/wipe transitions, focus changes, and click/pop/whoosh cues.

Audio layers are mixed and normalized, then the encoded result is measured. If the result misses the target, bounded measured gain passes correct it. The limiter has automatic gain restoration disabled so the final correction is not undone.

The two editable typography families are kinetic bold captions and editorial serif/italic headings. Text supports word highlighting, emphasized keywords, brand colors, per-scene placement, line limits, dwell, safe regions, deterministic font fallback, and CTA treatment.

## Review and revision

The script review screen exposes pace and every compiled scene. A user can inspect timing, purpose, claim/evidence IDs, shot type, presenter visibility/layout, product asset, text position, and manual-override state. Editing a scene marks it as a manual override, and later recompilation preserves it. Replanning one scene clears only that scene's override and does not regenerate the approved script or the rest of the blueprint. A final export still composes the complete timeline; true cached per-scene media replacement is listed as an explicit local limitation below.

Script approval, avatar generation, rendering, and export remain separate operations. Blocking script warnings prevent provider work. The quality report is designed to be displayed alongside scene warnings and final-render approval.

## Quality gates

`evaluateCreatorVideoQuality` emits a versioned report and a publishable decision. Local gates cover:

- 1080×1920 H.264/AAC and duration drift;
- missing audio, loudness, and excessive silence;
- black/blank/low-signal sampled frames;
- text safe-layout and overflow risks;
- minimum product scale and scene dwell;
- excessive cuts and three-scene asset repetition;
- missing CTA;
- unsupported or unapproved claim evidence;
- deterministic presenter/text collisions;
- avatar disclosure, script lineage, consent, artifact presence, crop/frame metadata, and matte/background declaration.

Avatar lip sync, mouth/hand deformation, identity stability, blinking/head motion, segmentation halo, temporal flicker, pronunciation, and emotional fit have typed report fields but remain `requires_external_review` until a genuine model-backed canary and human review exist.

## Local benchmark

Build main-process code and run:

```bash
pnpm build:main
node dist/main/main/creatorVideoBenchmarkCli.js --output-dir "$PWD/tmp/creator-video-benchmark"
```

The benchmark synthesizes a safe product capture, materializes a screenshot and trimmed interaction clip, compiles readable and energetic plans, uses a deterministic green-screen avatar, renders word-timed captions and editorial typography, writes a CTA, validates the final export, and generates a contact sheet and path-free JSON report.

Expected artifacts:

- `tmp/creator-video-benchmark/renders/benchmark-script/creator-video-energetic.mp4`
- `tmp/creator-video-benchmark/creator-video-contact-sheet.jpg`
- `tmp/creator-video-benchmark/creator-video-benchmark.json`
- `tmp/creator-video-benchmark/product-assets/product-assets.json`

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
- Product card shells are deterministic renderer treatments; a brand designer has not approved their final visual identity.
- The current review action replans a single scene, but final media rendering still rebuilds the complete timeline. Per-scene encoded caching and splice validation remain a local optimization, not a correctness blocker.
- Frame-signal QA samples representative frames; exhaustive frozen-frame detection should add perceptual hashes across the full output before high-volume production.
- Text collision checks use deterministic declared layouts, not face/object segmentation from a real avatar provider.
- Pronunciation dictionaries are stored and exposed, but actual pronunciation depends on the selected TTS/provider canary.
- No provider cost, retention, region, rate limit, commercial licence, or production SLA is asserted locally.

## Production-readiness checklist

- [x] Versioned template and scene contracts.
- [x] Deterministic compiler, evidence enforcement, pacing, dwell, CTA, and manual override preservation.
- [x] Product asset metadata and local materialization.
- [x] Provider-neutral avatar metadata, fixture, lineage, consent, and disclosure contracts.
- [x] Scene-aware compositor and deterministic vertical export.
- [x] Captions, editorial typography, SFX, loudness normalization, and post-render validation.
- [x] Local structural benchmark and path-free report.
- [ ] Genuine avatar/provider canary accepted.
- [ ] Voice, visual identity, CTA, pace, and human acceptance policies approved.
- [ ] Provider/model/licence review completed.
- [ ] Production storage, queue, database, GPU, observability, secret, retention, and deletion controls approved and deployed.
