# Creator-led product video production

Status: all locally achievable structural and visual-readiness work is implemented. The deterministic benchmark passes both readiness states; real avatar quality, subjective human approval, brand acceptance, licensing, provider credentials, and production infrastructure still require external confirmation.

The reusable mouthless code-native presenter and authentic Solomon pilot are documented separately in [masked-presenter-system.md](./masked-presenter-system.md). That presenter avoids lip synchronization and does not replace the existing provider-backed human-avatar work described here.

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

## Solomon 36-second user-story review composition

`SolomonCreatorStoryV2` remains the internal Remotion composition ID for compatibility, but the current output is the V5 creator-review master. It tells one continuous Senior Product Engineer at Faire → privacy-masked relevant contact → personalized draft and human approval story without changing V1–V7. Four purpose-built, 1080×1350, hash-verified clips come from an authenticated genuine Solomon session; the renderer rejects missing or changed hashes before synthesis or composition.

The review edit uses only purpose-specific crops from those authentic pixels. It excludes fixture banners, synthetic-data explanations, model-call disclaimers, internal storyboard labels, and the former fake CTA. Status shots isolate the Discovered-to-Interviewing action and result, the opportunity shot holds the real role/company, the people shot holds privacy-masked verified hiring-manager evidence, and outreach shots isolate the recipient, role context, message, `DRAFT — NOT SENT` state, and manual-review controls. Bounded camera drift creates readable proof holds without fabricating interface pixels.

The story manifest declares every scene, product target, host pose/emotion/framing/gaze state, caption phrase, sound cue, transition behavior, camera recipe, source interval, environment class, and public-release approval. `ProductFocus` uses bounded target-aware quintic camera movement, cursor-aware clamping, and a standard arrow pointer rather than a circle. `SolomonHost` remains a mouthless code-native rig with independent blink, eyebrows, gaze, head, hand, breathing, posture, framing, emotional-lighting, and voice-reactive speaker-grille controls. This follows the selected masked-performer direction without pretending to provide literal lip synchronization.

The render creates conversational, energetic, and restrained/credible Chatterbox candidates. The selected master must preserve the exact normalized 89-word script and achieve mean Whisper word confidence of at least 0.90. Punctuation is normalized; word order and count are not relaxed.

`auditSolomonStoryRetention` fails closed for event gaps, adjacent repeated poses, missing proof targets or source entries, inconsistent product gaze, a required cursor outside the visible crop, excessive camera velocity or acceleration, abrupt camera direction changes, caption-cadence violations, placeholder/debug/legacy copy, and unapproved product assets. CTA verification is reported as a separate release gate.

A verified platform-native `COMMENT ‘SOLOMON’` CTA is rendered and held through the final Solomon brand sting. The file name includes `NOT-FOR-PUBLICATION` because explicit approval to publish the genuine source footage remains a separate release gate. Delivery encoding is H.264/yuv420p with BT.709 matrix, primaries, transfer, and limited range.

Run:

```bash
pnpm test:creator-story
pnpm creator-story:v2:solomon
```

Generated review artifacts include a 36-second non-publication master, social transcode, muted review, ten-second opening, three voice candidates, source and claim manifests, frame-level phrase timings, retention and encoded-narration audits, reproducible reference comparison, media-quality report, one-frame-per-second OCR scan for forbidden visual copy, V5-priority completion audit, and full/mobile/scene/avatar/product/CTA review strips under `tmp/solomon-creator-story-v5-creator-review/`.

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
## Solomon Creator Story V6 robot edition

`pnpm creator-story:v6:solomon` renders an isolated 36-second Solomon review master without changing V1–V5 composition IDs or outputs. The V6 format uses a code-native, mouthless Gideon robot; authenticated, hash-verified Solomon micro-scenes; disclosed conceptual illustrations; a 205–225 WPM user story; and a single verified platform-follow CTA that does not promise comment delivery, a public URL, or automated distribution.

`pnpm creator-story:v7:solomon` renders the isolated 36-second `SolomonCreatorStoryV7Robot` composition without changing V1–V6 composition IDs or outputs. V7 is a public-facing Solomon product story: Solomon is the only brand named or marked inside the video, while Gideon remains internal generation provenance. The opening proves the stage change and relevant-contact claim as separate evidence atoms within 2.2 seconds; product proof occupies 35–55% of the runtime; authentic source hashes and intervals fail closed; and the final action is the verified platform-native instruction `SAVE THIS SOLOMON WORKFLOW`. The command writes private, ignored review artifacts under `tmp/solomon-creator-story-v7-robot/` and never makes them publication-ready without explicit source, voice, phone, legal, and brand approvals.

Run `pnpm creator-story:v7:baseline` to reproduce the direct V6/reference measurements and reconciliation before rendering. V7 also stores actual narration-envelope-driven robot direction, three hook candidates, three payoff candidates, a rendered-pixel robot report, phone-scale artifacts, exact-transcript verification, and a scene-level regeneration lineage contract. A scene regeneration may change one scene's presentation fields but cannot change its timeline, source, atomic claim binding, or any unselected scene.

The runtime manifest validates creative direction, evidence bindings, robot performance, caption cadence, product occupancy, proof-by-2.2-seconds, and narration-to-visual alignment. Product proof remains full-color and uses selected crops or outlines rather than a global dim. A normal arrow cursor appears only when an interaction is part of the claim.

Generated review media and reports live under ignored `tmp/solomon-creator-story-v6-robot/`. The master remains marked `NOT-FOR-PUBLICATION` until a human approves the genuine source footage, voice naturalness, robot brand appearance, phone readability, and any required synthetic-presenter disclosure.

## Solomon Creator Story V8 performance-led edition

`pnpm creator-story:v8:solomon` renders the isolated 36-second `SolomonCreatorStoryV8Robot` composition without modifying V1–V7 composition IDs, commands, or output behavior. V8 keeps the Solomon-only, source-grounded V7 story while replacing repeated screenshot framing with ten composition families, continuous semantic events, a reusable robot-host rig, a five-surface problem mechanism, the `JOB → PERSON → PROOF → MESSAGE` signature transformation, draft assembly, human-control proof, a real-product payoff, and the verified `SAVE THIS SOLOMON WORKFLOW` action.

The V8 manifest binds each atomic claim to an approved source hash and interval, required readable text, an OCR confidence threshold, a phone-proof region, action/result frames, semantic-event frames, robot direction, audio cue, and collision-exclusion regions. Authentic Solomon pixels remain visually distinct from conceptual connective graphics. Missing or changed source media, unsupported claims, private OCR matches, robot/evidence collisions, narration drift, or an unsafe CTA fail the render.

The robot is a mouthless host, not a lip-synced avatar. Its serialized per-frame performance data is derived from the exact selected narration WAV and drives the speech grille, emphasis, blink suppression, gaze, head beats, and gesture intensity. Shared V8 robot modules provide reserved host/cameo positions, multiple arm and eye silhouettes, product-directed gaze, forward lean, recoil, open-palm control return, and a save gesture. The public skin remains Solomon-specific; the reusable geometry does not add another public brand.

V8 uses bundled Manrope Variable and Fraunces Variable font packages. Its deterministic mastering chain applies fades at assembled speech boundaries, high-pass filtering, de-clicking, noise reduction, semantic cue mixing, limiting, and loudness normalization. Decoded QA measures the final encoded pixels and PCM rather than trusting manifest declarations. The current accepted local master measures 36 seconds at 1080×1920/30 fps, 210 WPM, −14.43 LUFS, −1.19 dBTP, 3.56% low-energy audio, zero isolated click transients, and a 2.2-second longest static interval. Exact narration, source hashes, proof OCR, privacy OCR, CTA, collision, robot-pixel, color, and full-decode gates pass. Audio-event density is 4.25 events/sec under the documented 10 ms / +6 dB method; this is below the aspirational 5.3 target and is retained as an honest follow-up rather than padded with unrelated sound effects.

Run:

```bash
pnpm creator-story:v8:baseline
pnpm test:creator-story
pnpm creator-story:v8:solomon
pnpm creator-story:v8:compare
```

The render writes the master, 720×1280 social export, muted and opening reviews, thirteen candidate MP4s, contact sheets, inspection strips, spectrogram, decoded measurement reports, claim/source lineage, exact transcript verification, and V7/reference comparison under ignored `tmp/solomon-creator-story-v8-robot/`. The master filename remains `NOT-FOR-PUBLICATION`, and `releaseReady` remains false until a human approves voice naturalness, physical-phone readability, publication of the genuine Solomon footage, Solomon brand/legal treatment, and the synthetic-presenter disclosure decision.

## Solomon Creator Story V9 cute-mascot edition

V9 is an isolated `SolomonCreatorStoryV9Mascot` composition. It preserves V1–V8 behavior while replacing the armored V8 host with a code-native, soft-gloss Solomon mascot and replacing privacy-obscured product footage with authentic captures from Solomon's fail-closed synthetic demo mode. The capture environment runs only on loopback, disables external providers and navigation, uses deterministic fictional identities, keeps drafts unsent, and records exact source hashes and an environment receipt.

The baby-schema contract makes the redesign measurable: the selected mascot has a 51.1% head/height ratio, a 1.216 head/body width ratio, an 82.3% screen/head width ratio, a 25.8% screen-corner/head ratio, a 25.1% eye/screen ratio, and a 15.3% badge/body ratio. Large arched eyes and a friendly open smile replace the slit eyes and EQ grille. The EQ motif is available only as a thinking state. The egg torso, mitt hands, orange antenna bobble, orange belly accent, `S` badge, near-black visor, mint face, specular shell highlight, ambient shading, and contact shadow are retained as separately testable geometry and material decisions.

The selected material is `code_glossy`. A hybrid glossy-sprite shell was evaluated but rejected for this master because a complete multi-angle sprite pack did not cover all required gestures and expressions; the code-native rig remains deterministic across forward lean, recoil, presentation, control, celebration, and save gestures. A flat fallback remains a review candidate, not the selected master.

V9 uses one 132-word script as the source of narration, captions, and beat copy. The spoken and visible hook are exact: `This job just moved to interviewing.` The story exposes the contact within 2.2 seconds, uses separate semantic and decorative motion accounting, limits active semantic-event gaps to 0.9 seconds, uses cuts/slides/match cuts/object wipes with no default dissolves, and keeps product proof in reserved rectangles separate from mascot and caption zones. Product composites are audited from clean and composed OCR, and the payoff must show Interviewing, Avery Chen, supporting proof, and a complete editable unsent message before the mascot celebrates.

Run:

```bash
pnpm creator-story:v9:capture
pnpm creator-story:v9:baseline
pnpm test:creator-story
pnpm creator-story:v9:solomon
pnpm creator-story:v9:compare
```

Generated media, candidate MP4s, capture receipts, review strips, and decoded QA reports remain private and ignored under `tmp/solomon-creator-story-v9-mascot/`. Automated render completion does not authorize publication. Human mascot-appeal, voice-naturalness, physical-phone readability, synthetic-demo-footage publication, Solomon brand/legal, and synthetic-presenter-disclosure decisions remain explicit release blockers. The CTA stays `SAVE THIS FOR YOUR NEXT JOB SEARCH`; no comment, DM, URL, handle, or delivery promise is implied.

## Solomon Creator Story V10 performance-directed edition

V10 is the isolated `SolomonCreatorStoryV10Performance` composition. It leaves V1–V9 compositions and commands unchanged, preserves V9's baby-schema mascot identity, and adds performance direction, scene-specific semantic camera paths, larger product evidence, a stronger connected-result payoff, and the exact CTA `SAVE FOR YOUR NEXT JOB SEARCH`.

The V10 product footage comes from a temporary worktree of the actual Solomon application running in fail-closed fictional demo mode. External providers and navigation are disabled, the server binds only to loopback, the fixtures use Avery Chen, Northstar Labs, and Product Engineer, messages remain drafts, and every capture stores its source hash, verified interval, DOM evidence, control coordinates, and privacy scan. The master displays one persistent `DEMO DATA` disclosure. Product claims fail closed against this lineage; the connected payoff is explicitly marked as a conceptual assembly of approved product evidence.

The story is a 36-second, 116-word user story rather than a continuous workflow recording. The exact spoken hook is `This job just moved to interviewing, and Solomon already surfaced a relevant contact.` The mechanism is `JOB → PERSON → PROOF → MESSAGE`, followed by a grounded editable message, explicit user control, and a 4.5-second connected payoff. The mascot uses distinct emotional face paths, narration-energy mouth states, gaze-before-gesture timing, independent arms, forward lean and recoil, phrase-aware head/antenna beats, and a physical bookmark performance for the CTA.

Run:

```bash
pnpm creator-story:v10:fixture
pnpm creator-story:v10:capture
pnpm creator-story:v10:baseline
pnpm test:creator-story:v10
pnpm creator-story:v10:solomon
pnpm creator-story:v10:compare
```

The accepted local exact master is 1080×1920, 30 fps, 36 seconds, BT.709 limited range, and hashes to `00d1f822c82147d0cb8a1f6b5abfeeb77643eff5108816ea189b47bbde85dbde`. Decoded QA measures median movement 7.113, continuous movement 6.575, a 0.20-second longest low-motion interval, −14.48 LUFS, −1.20 dBTP, zero isolated clicks, 100% required OCR coverage, and 94.44% claim-composite OCR coverage. All automated render gates pass. The private master, review variants, candidate clips, contact sheets, source receipts, and decoded reports remain ignored under `tmp/solomon-creator-story-v10-performance/`.

`renderPassed: true` is not publication approval. `releaseReady` remains false until a human approves the demo-footage publication right, mascot appeal, voice performance, message quality, physical-phone readability, proof credibility, disclosure clarity, CTA, Solomon brand/legal treatment, synthetic-presenter disclosure policy, and overall reference quality. See `docs/creator-story-v10-delivery.md` for the exact artifact and validation receipt.
