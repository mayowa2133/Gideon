# Creator editorial template

`creator_editorial_v1` is Gideon’s presenter-led short-form editorial format. It is separate from the product walkthrough and the earlier masked-presenter pilot. The template uses a faster editorial grammar rather than playing the same walkthrough faster.

## Contract and scheduling

The reusable contract and compiler live in `src/shared/creatorEditorial.ts`. The product-agnostic evidence-card, presenter-split, outro, and kinetic-caption compositor lives in `src/main/creatorEditorialRenderer.ts`; the Solomon runner is only an orchestration consumer. They accept a `CreativeBlueprint`, approved semantic narration beats, verified `ProductEvidenceAsset` records, capture hashes, optional cursor/action/result geometry, a brand kit, and a deterministic seed. Runtime assertions reject unknown evidence, unsupported claim IDs, invalid hashes, invalid geometry, unsafe colors, relative output paths, and malformed EDLs.

The compiler targets 32–36 seconds and 14–18 shots. Most shots last 1.5–2.5 seconds; no compiled shot may exceed three seconds or fall below 1.5 seconds. A CTA and independent three-second branded outro are always reserved. It alternates presenter, split, product-card, detail, result, comparison, recap, and branded modes and prevents three identical families in sequence.

Supported editorial families are:

- `presenter_hook`, `presenter_closeup`, `presenter_medium`
- `presenter_product_split`
- `product_evidence_card`, `product_detail_crop`, `product_result_hold`
- `kinetic_emphasis`, `comparison_card`, `benefit_cutaway`, `recap_montage`
- `presenter_cta`, `branded_outro`

Every shot records narration/evidence IDs, immutable capture hashes, crop/focus geometry, Axiom placement and gesture, an eased camera path, pointer policy, caption treatment, transition, callout, audio accents, expected change, claim lineage, deterministic cache identity, and fallback behavior.

## Presenter and layout

Axiom remains Gideon’s original mouthless, code-native masked presenter. No lip synchronization is performed or claimed. Editorial shots use full, lower, left, and right placements at 35–50% visual scale. The compiler targets 55–70% presenter visibility. Product-only shots are reserved for evidence and result inspection.

Caption safe regions move away from the presenter. In split layouts the caption occupies the opposite side; with full/bottom presenter treatments it stays in the upper platform-safe region. Product cards preserve a distinct evidence region. The Solomon pilot emits a layout/collision receipt for review.

## Authentic evidence and camera behavior

Only approved factual assets with a captured/evidence-derived provenance and a real image or clip path may feed factual product shots. Claim IDs must exist in the input blueprint. Each source checksum is carried into the EDL and cache identity.

Action or result geometry drives a tight crop. When cursor telemetry is available, the camera records either `contain_pointer` or an intentional `transition_to_result`; otherwise it uses `geometry_fallback`. Paths use continuous cubic easing and cap scale change. The renderer never adds a fabricated cursor. Result holds and annotations are distinct from narration captions.

## Kinetic captions

Captions contain one to five words, honor clauses and punctuation, and normally change within 0.3–0.8 seconds. Provider word timings are preferred. The Solomon pilot uses the already-installed local Whisper `small.en` model and records `local_alignment`. It rejects an alignment unless all approved words appear exactly once and in order. Two zero-width word boundaries returned at semantic joins are expanded by a disclosed 80–160 ms deterministic boundary correction. When no local aligner exists for another product, Gideon uses a deterministic weighted estimator and records `deterministic_estimate`; this avoids adding a new heavyweight dependency only for captions. Word order and exact approved text are preserved.

The two original roles are a strong display/editorial emphasis and a supporting sans-serif. They are not copies of the reference font or layout.

## Narration and audio

The policy targets 180–210 active-speech WPM, ordinary gaps below 600 ms, at most one intentional 0.8–1.0 second pause, and tempo correction between 0.92× and 1.08×. Chatterbox model-default speech is primary; Samantha remains an explicit provider-chain fallback elsewhere in Gideon. The pilot records approved script, provider-prepared text, model revision, PerTh watermark, hashes, timing correction, and fallback use. Voice cloning is not used.

The editorial mix targets −14 LUFS (allowed −15 to −13), true peak at or below −1.5 dBTP, and LRA 3–8 LU. The pilot uses a disclosed code-generated review bed; narration remains primary and the bed fades under the outro. No reference music or effects are used.

## Cache and integration

`creator_editorial_v1` is selectable through the regular `CreatorTemplateKey` and creator template pack. Its compiler consumes CreativeBlueprint and produces a complete editorial EDL. Each shot has a stable content identity derived from the compiler/renderer contract, brand kit, presenter hash, authentic source hashes, source interval, captions, camera, and layout. Cached encoded shots are hash-checked before reuse. `editorialChangedSceneIds` returns only changed shots plus transition neighbors, matching Gideon’s scene-cache invalidation model. Existing templates and their defaults are unchanged.

## Solomon pilot

From the hydrated repository or an isolated worktree:

```sh
pnpm creator-editorial:pilot:solomon
```

Optional environment variables can override the private capture root, original Gideon root, Axiom asset, Chatterbox runtime, FFmpeg paths, and output root. The default output is `tmp/solomon-creator-editorial-v1/`; it never overwrites previous pilots.

The pilot uses four verified authentic Solomon workflows: role browsing/filtering, opportunity tracking, saved-contact review, and outreach-draft review. The private capture path retains the historic `nexusreach` directory name because the capture predates the product rename; viewer-facing copy says Solomon.

## Quality and human review

Automated gates cover duration, dimensions/codecs, complete decode, shot count/dwell, presenter ratio/scale, transition bounds, caption chunks, claim lineage, narration pace/stretch, loudness, peak, LRA, and silence. Review artifacts include contact sheets, dense timeline, phone-sized samples, presenter/product/CTA strips, camera/layout/audio/rhythm reports, manifests, and a checklist.

Automated checks do not approve creative quality, voice suitability, pronunciation, phone readability in every viewing condition, claim accuracy, or publication. Those remain human decisions. Chatterbox currently does not return exact word timings; the Solomon pilot therefore runs the installed local aligner and also retranscribes the final AAC-encoded master, failing if its 95-word sequence differs from the approved script.

## Creator Editorial v2

`creator_editorial_v2` is independently selectable and preserves the v1 contract and runner. It adds a versioned EDL with three caption roles, seven original background modes, configurable CTA modes, context-to-detail evidence treatments, richer Axiom framing, and a 48 kHz production export. The reusable compiler remains product agnostic; the Solomon pilot is an orchestration consumer.

The Axiom system is split into a deterministic pose library and motion planner. It schedules neutral, explain, left/right pointing, emphasis, and open-CTA poses across intimate close-up, chest-up, and waist-up framings. Motion uses restrained non-repeating sway periods, subtle head and lateral movement, phrase-aligned gesture onset, and eased punch-ins. Axiom remains mouthless and the system neither performs nor implies lip synchronization.

V2 evidence cards preserve authentic capture pixels and source hashes. Verified action/result geometry drives a continuous context-to-detail `zoompan`; the renderer adds no cursor layer, so any pointer shown is the real captured pointer. Full-screen macro, split, spotlight, irrelevant-area defocus, border, shadow, and result-hold treatments remain distinct from narration captions.

V2 caption roles are `standard_narration`, `keyword_emphasis`, and `full_frame_editorial`. Local Whisper timings preserve all approved words exactly once. Chunks contain one to five words, normally change within 350–650 ms, and settle within 120–220 ms. Placement responds to presenter, evidence, and platform-safe regions.

The v2 Solomon pilot renders with:

```sh
pnpm creator-editorial:v2:pilot:solomon
```

Its default output root is `tmp/solomon-creator-editorial-v2/`. The runner produces a 1080×1920 H.264 High/CRF 17/slow master and a 720×1280 H.264 High/CRF 20/slow derivative, both at 30 fps with 48 kHz AAC. It records FFprobe details and SSIM comparisons in `encoding-report.json`.

V2 generates three deterministic local Chatterbox candidates. Selection requires the exact approved word sequence, minimum local alignment confidence of 0.35, tempo correction from 0.92× through 1.08×, and no narration gap above 600 ms. The receipt records accepted and rejected takes, seeds, hashes, model revision, PerTh provenance, timing, confidence, RMS/peak measurements, and rejection reasons. Voice naturalness and pronunciation still require a human.

Perceptual reporting combines midpoint luma/chroma/saturation signatures from the actual encoded render with semantic composition dimensions. A planned boundary is not automatically meaningful. The report identifies duplicate adjacent shots, the longest unchanged interval, and change distribution across opening, middle, benefit, and CTA/outro windows.

The default v2 CTA is `non_transactional` because repository evidence does not confirm public Solomon availability. Transactional `try_now`, `request_access`, and `join_waitlist` modes require explicit availability confirmation; `learn_more` and `non_transactional` remain safe informational modes. A separate three-second branded outro always follows the CTA.

V2 cache identities include compiler content and the v2 renderer version. Source scene hashes are validated before reuse. Presenter, evidence/crop, caption, and transition-neighbor changes remain scoped, while export settings do not unnecessarily invalidate reusable source scenes.

## Creator Editorial v3

`creator_editorial_v3` is independently selectable and leaves the v1/v2 contracts and outputs intact. Its compiler lives in `src/shared/creatorEditorialV3.ts`; the same renderer exposes a versioned v3 path. Run the authentic Solomon pilot with:

```sh
pnpm creator-editorial:v3:pilot:solomon
```

V3 schedules actual intervals from the Gideon-owned Axiom green-screen performance reel rather than treating pose labels as rendered performances. The seven available performances are neutral listening, explaining, pointing left, pointing right, strong emphasis, open CTA, and reaction. Each visible presenter shot records the exact source interval, silhouette class, intensity, phrase-relative peak, final-pose hold, and cooldown. Adjacent presenter shots cannot repeat a performance.

Each shot also carries an explicit motion timeline with one primary event and no more than two supporting events. Long non-outro shots require primary motion. Product camera paths hold context, ease into the verified action/result, then use a subtle one-way drift that preserves containment; they do not oscillate, teleport, or add a cursor. The ten v3 composition families deliberately reset presenter scale/placement, product geometry, typography, and background treatment.

V3 captions use three visibly different original treatments: a soft-backed clean floating style, accent-color keyword underline, and display-serif editorial takeover. Placement cycles through composition-aware safe regions; fewer than half may use top center. Authentic evidence remains traceable to capture hashes and source intervals, uses zero synthetic cursor layers, and records phone-scale occupancy and workflow-specific review strips.

Narration selection retains v2’s exact-word, confidence, gap, and 0.92–1.08× tempo gates. V3 additionally measures combined and per-beat pYIN pitch range/contour plus RMS energy locally, rejects flat or discontinuous candidates, and writes both the selection receipt and `pitch-and-energy-report.json`. Edge fades are excluded from join scoring; adjacent trimmed-beat mean energy measures audible join consistency. Human voice-naturalness and pronunciation approval remain required.

The default CTA remains `non_transactional` because public availability is not verified. The final three seconds use an independently animated branded outro. The v3 master uses H.264 High, CRF 16/slow, yuv420p, and 48 kHz AAC; the social derivative uses CRF 19/slow. The pilot generates reference/v2/v3 comparison media, performance and motion schedules, phone/readability evidence, full-media decode and perceptual reports, and a manual publication checklist under `tmp/solomon-creator-editorial-v3/`.

## Creator Editorial v4

`creator_editorial_v4` is a strict, independently selectable extension of v3. It preserves all prior template contracts and outputs while making presenter performance, phrase captions, evidence focus, and the final eight seconds explicit compiler concerns. Run the authentic Solomon pilot with:

```sh
pnpm creator-editorial:v4:pilot:solomon
```

The v4 Axiom inventory records eight verified source intervals with gesture peaks, entrance/gesture/hold/cooldown phases, hand and shoulder positions, direction, silhouette, energy, safe caption/product regions, and visual-quality scores. The compiler schedules at least six distinct silhouettes, prohibits adjacent performance repetition, and aligns each gesture peak to an emphasized or opening narration word within 150 ms. The current source is sufficient for v4 but honestly records two non-blocking asset gaps: it contains no real torso lean and no dedicated result-celebration performance.

V4 captions are regrouped into semantic phrases, normally two to four words and never more than five. A one-word caption is valid only when it is an intentional emphasized keyword. The exact narration word sequence is preserved. Each product shot binds its focus to recorded action-target geometry and a separately reviewed result region, carries explicit geometry provenance, and retains zero synthetic cursor layers. When sampled cursor telemetry is unavailable, the action-target center guides the camera but is disclosed as a geometry proxy rather than a recorded cursor.

The Solomon runner resolves the authenticated 1440×900 normalized flow clips from the capture artifact index and verifies the source, normalization, framing-manifest, and action-receipt hashes before rendering. Desktop evidence is composed into protected landscape cards. Action and result viewports share one aspect-correct crop size and move with a smooth cubic path; product shots receive no second whole-frame zoom and no post-focus drift. Transform-aware QA maps source regions through the semantic viewport and product card into the final 1080×1920 frame. It rejects clipped cards, incomplete evidence regions, unsafe action centers, and presenter/caption collisions rather than treating declared occupancy metadata as proof.

The runner prioritizes recorded write/navigation events over observe-only targets and retimes every product shot so the genuine captured arrow cursor reaches the relevant control before the camera pans to the result. Pixel QA detects the cursor’s connected arrow outline in the authenticated source frame, maps its measured pixel center through the exact viewport/card transform, and requires the same component at the expected position and scale in the decoded master. This verifies all product shots without adding a synthetic cursor layer.

An explicit `GIDEON_VERIFIED_NARRATION_ROOT` may reuse an already-approved narration while iterating on visuals. Reuse is accepted only when the approved script, selected-candidate policy, exact-word alignment receipt, combined audio hash, every provider-beat hash, provider model revision, and watermark all verify. The new render receives its own reuse receipt; failed verification stops the run.

The ending now uses three contiguous editorial changes from 27 seconds: a payoff/reset through 30 seconds, presenter CTA from 30–33 seconds, and a dedicated branded close from 33–35 seconds. V4 retains the v3 production encoding profile and adds its own compiler, renderer/cache version, tests, quality report, and comparison baseline.

The v4 runner creates a staged review bundle before publication approval: an unlabeled Axiom pose strip and selected-performance reel; authentic phone-evidence reel and workflow strips; three six-second hook candidates plus a selection receipt; a caption-role reel and audit; a final-eight-second candidate and reference/v3/v4 comparison; a complete low-resolution draft; and the final master/social encodes. The default output root is `tmp/solomon-creator-editorial-v4/`. No upload, deployment, or publication is performed.

## Creator editorial reference rhythm v1

`creator_editorial_reference_rhythm_v1` is an independently selectable semantic layer over the authenticated v4 renderer. It copies no creator identity, wording, screenshots, or product claims. It models the reusable retention grammar from the supplied reference: outcome hook, disclosed visual metaphor, credibility proof, breadth, failure state, mechanism action/result, benefit translation, secondary benefit, objection/evidence answer, direct CTA, and branded hold.

Run the authentic Solomon pilot with:

```sh
pnpm creator-editorial:reference-rhythm:pilot:solomon
```

The compiler emits one narrative beat per visual section, explicit claim provenance, at least three complete claim → proof → benefit cycles, and meaningful internal caption/annotation/diagram/gesture events no more than 700 ms apart during active sections. Runtime validation rejects unsupported claims, evidence mismatches, generic CTAs, viewer-facing legacy product naming, missing mechanism progression, and plans that fail the v4 authenticity/cursor baseline.

The Solomon pilot targets 36 seconds, 16 major sections, 180–210 active-speech words per minute, measured narration pauses no longer than 700 ms, approximately 55–70% masked-presenter exposure, a three-second direct CTA, and a separate three-second branded action hold. V1–V4 retain their 600 ms narration-gap policy. The new script follows one dominant story: disconnected job-search context becomes a reviewable workflow across roles, tracker, contacts, and outreach. “Open the Solomon demo” is an informational action and does not claim public availability or invent a destination URL.

A four-node connected-decision trail is the only new conceptual mechanism visual. It is explicitly labelled `Conceptual workflow` and remains visually distinct from authenticated product pixels. Product sections continue using normalized 1440×900 Solomon recordings, verified source intervals, action/result framing, smooth cubic camera movement, and decoded-frame cursor-pixel verification with zero synthetic cursor layers.

In addition to the v4 review bundle, the runner writes:

- `narrative-beat-manifest.json`
- `claim-provenance-report.json`
- `reference-versus-output-comparison-report.json`
- `editorial-breakdown.md`
- `review/product-action-evidence-strip.jpg`

The generated breakdown records exact time/frame ranges, visual purpose, script structure, pacing, A-roll/B-roll ratio, typography, composition, presenter performance, hook logic, credibility limits, and the reusable timing formula. Human publication approval remains required for voice naturalness, pronunciation, hook strength, brand fit, claim acceptance, and subjective visual quality.

## Creator editorial AI co-host v6

`creator_editorial_ai_creator_v6` is the reusable creator-discovery layer requested by the Solomon comparison report. It preserves the reference-rhythm and V4 authenticity baselines while changing the narrative emphasis from an abstract SaaS brand film to a concrete creator explainer.

Run the Solomon pilot without overwriting V5:

```sh
pnpm creator-editorial:v6:pilot:solomon
```

## User-story editorial V7

`creator_editorial_user_story_v7` changes the editorial unit from a connected
product workflow to a presenter-led user story. It preserves V6's authentic
Solomon evidence, immutable source hashes, source intervals, claim
qualifications, mouthless presenter, deterministic rendering, and quality
reports, while deliberately reducing product footage to four isolated
micro-scenes.

The default story grammar is:

```text
user problem
→ presenter interpretation
→ isolated product proof
→ presenter reset
→ second product proof
→ trust boundary
→ outcome
→ CTA
```

Every narration beat is classified as `SPEAKER_ONLY`, `USER_PROBLEM`,
`PRODUCT_EVIDENCE`, `PRODUCT_RESULT`, `EMOTIONAL_TRANSITION`,
`TRUST_STATEMENT`, or `CTA`. Only product evidence/result beats may select a
micro-scene. A micro-scene records its single semantic purpose, approved
capture hash and interval, region of interest, predetermined crop, allowed
motion, cursor policy, supported claims, visible result, and no-fabrication
declaration.

V7 defaults to four 1–3 second product inserts, a presenter-only ratio of at
least 55%, a presenter reset after every product concept, zero connected
navigation sequences, and zero continuous cursor-following camera paths. The
real source cursor may remain for one short proof action, but the semantic
region—not the cursor—drives the camera.

Run the local Solomon V7 pilot with:

```bash
pnpm creator-editorial:v7:pilot:solomon
```

The pilot writes the exact master/social encodes plus the user-story,
classification, micro-scene, claim/evidence, cursor-policy, camera-motion,
comparison, review-strip, and completion-audit artifacts under
`tmp/solomon-creator-editorial-v7`.

V6 opens with roles, contacts, outreach, and the captured review-before-send boundary. It uses a changed-priority question as tension, resolves that tension through authenticated tracker evidence, makes outreach review the main trust payoff, and repeats `Open the Solomon demo.` through the branded final frame. The safe CTA does not assert that a public URL, comment-keyword automation, or distribution workflow exists.

The compiler schedules all eight approved Axiom performance states without adjacent repetition. Axiom remains mouthless; no lip synchronization is attempted. Restrained visor/eye accent cues may respond to narration cadence, but they are character styling rather than product evidence. The current source reel still lacks a real torso lean and a dedicated result-celebration performance.

Every approved product claim is represented in a fail-closed matrix containing the spoken sentence, caption, required action, evidence asset, source hash, verified interval, visible result, approval status, and qualification. Any rejected row, missing asset, source-hash mismatch, or interval mismatch stops compilation.

V6 adds a Reference/V5/V6 directional baseline, three evidence-linked hook previews, the V6 creator-direction report, later-confirmations report, muted-comprehension audit, and human-readable frame-by-frame breakdown. Subjective descriptions are review guidance, never automated truth. Human approval remains mandatory for voice naturalness, brand fit, marketing claims, and publication.
