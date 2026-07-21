# Short-form video quality audit: reference vs Gideon `viseme2d` canary

**Audit date:** 2026-07-20
**Reference:** supplied 53-second vertical MOV
**Gideon sample:** 27.8-second `viseme2d` canary with generated test footage

## Executive conclusion

The supplied reference is currently about **8.3/10 as a publishable short-form product video**. The Gideon canary is approximately **3.8/10 as a publishable video**, although it is **7/10 as a technical pipeline proof**: it proves narration, local avatar animation, captions, composition, disclosure, audio, and export all work.

The approximate **4.5-point publishable-quality gap is not primarily caused by encoding or resolution**. Gideon exports at a higher resolution and has acceptable A/V synchronisation. The largest differences are:

1. Gideon exposes internal QA/debug graphics in the final render.
2. The canary uses colour-bar fixture footage rather than legible product evidence.
3. The reference changes visual emphasis about every two seconds; Gideon remains compositionally static.
4. The reference makes a natural human presenter a primary subject. Gideon's local avatar is a small supporting sticker with discrete mouth states and almost no expressive motion.
5. The reference has a coherent editorial design system; Gideon combines too many boxes, borders, labels, caption panels, and empty regions.

`viseme2d` can become a credible free **motion-graphic spokesperson** system, but it will not equal real-person facial performance by adding more mouth sprites alone. The fastest route to a strong result is to improve the entire short-form composition and use the avatar as a well-art-directed supporting presenter. Photorealistic neural animation or real presenter footage remains necessary when the face must carry the video.

## Method and fairness caveat

The videos were inspected through FFprobe, two-second contact sheets, representative full-resolution frames, scene-change analysis, silence analysis, and EBU loudness analysis.

This is intentionally a strict market-facing comparison, but it is not a perfectly controlled A/B test. The reference contains real product/UI footage and a recorded human presenter. The Gideon file is a canary built around synthetic colour bars to prove the pipeline. Consequently, the product-footage and overall-style scores measure the current example—not the maximum capability of Gideon's renderer.

## Technical comparison

| Property | Reference | Gideon canary | Assessment |
|---|---:|---:|---|
| Duration | 53.0 s video / 51.15 s audio | 27.77 s video / 27.81 s audio | Gideon has better A/V duration agreement: 40 ms. Reference has about 1.85 s of video beyond audio. |
| Frame size | 720×1280 | 1080×1920 | Gideon wins on nominal delivery resolution. |
| Frame rate | 30 fps | 30 fps | Equivalent. |
| Video codec | HEVC | H.264 | Both valid; H.264 is safer for broad social/platform compatibility. |
| Video bitrate | ~2.04 Mb/s | ~1.27 Mb/s | Reference spends substantially more data per pixel. Gideon's flat fixture compresses easily, but detailed real footage should use CRF-based quality and a sensible maximum bitrate. |
| Audio | AAC, 44.1 kHz stereo, ~124 kb/s | AAC, 96 kHz stereo, ~58 kb/s | Gideon's 96 kHz output is unnecessary while 58 kb/s is low. Standardise on 48 kHz and 128–192 kb/s AAC. |
| Integrated loudness | -13.88 LUFS | -14.12 LUFS | Both are well placed for short-form playback. |
| True peak | +0.08 dBTP | -3.13 dBTP | Reference risks clipping. Gideon is safe but could target -1 dBTP for more controlled impact. |
| Detected hard scene changes | 25 | 1 | Reference averages roughly one cut per 2.1 s. Gideon is visually static despite overlay movement. |
| Detected silence intervals | 2 | 2 | Neither has a major silence-density problem from this coarse measurement. |

## Quality scorecard

Scores assess the files as publishable social videos, not implementation completeness.

| Dimension | Reference | Gideon | Gap | Why |
|---|---:|---:|---:|---|
| Hook and first-frame clarity | 8.5 | 4.0 | -4.5 | Reference immediately alternates product and platform imagery. Gideon opens with a large mostly empty header and diagnostic-looking product panel. |
| Product-evidence clarity | 8.0 | 1.5 | -6.5 | Reference shows recognisable phones, terminals, diagrams, and UI states. Gideon uses colour bars and focus-test marks. |
| Presenter realism/performance | 9.0 | 3.5 | -5.5 | Reference has continuous head, brow, cheek, jaw, gaze, posture, and occasional hand motion. Gideon has discrete full-frame mouth/blink states plus a few pixels of idle translation. |
| Lip-sync naturalness | 9.0 | 5.0 | -4.0 | Gideon's mouth opens during speech and rests correctly, but energy buckets do not encode actual phonemes and transitions are visibly stepped. |
| Pacing and retention | 8.5 | 3.5 | -5.0 | Reference makes 25 hard visual changes and varies presenter/product dominance. Gideon holds nearly one composition throughout. |
| Composition and hierarchy | 8.0 | 4.0 | -4.0 | Reference usually offers one product focal point, one presenter, and one short keyword. Gideon stacks header, proof card, product frame, focus label, caption panel, avatar, disclosure, and CTA. |
| Typography/captions | 7.5 | 4.5 | -3.0 | Gideon captions are readable but large, box-heavy, awkwardly wrapped, and occasionally show punctuation defects such as doubled periods. Reference uses short kinetic keywords with more breathing room. |
| Motion design | 8.0 | 3.5 | -4.5 | Reference uses scale changes, device cards, transitions, graphic strikes, and layout changes. Gideon mostly moves test graphics within a fixed frame. |
| Brand coherence | 8.0 | 5.0 | -3.0 | Gideon's dark/lime system is consistent, but the visible QA elements make it feel like a test harness. Reference consistently uses paper texture, monochrome type, rounded product cards, and muted green presenter framing. |
| Audio finish | 8.0 | 6.0 | -2.0 | Gideon's loudness is good, but the local system voice and low AAC bitrate sound less produced. The reference is hotter and more natural, though its peak is technically unsafe. |
| Export readiness | 7.5 | 3.0 | -4.5 | Gideon's resolution/codec are ready, but debug overlays and fixture media make the actual file non-publishable. |
| **Overall** | **8.3** | **3.8** | **-4.5** | The pipeline works; editorial polish and presenter performance are not yet competitive. |

## Detailed visual findings

### 1. Internal QA graphics are leaking into the final export

The green safe-region rectangle, central focus box, numbered proof pill, “FOCUS PUNCH” label, and thin guide borders read as developer/debug overlays. They overwhelm both the product evidence and the presenter.

**Required change:** make render overlays explicitly `editorial` or `diagnostic`. Diagnostic overlays must be disabled in every final/export job and allowed only in preview/review renders. Add a regression test that samples final frames and fails if known debug colours/labels are present.

### 2. The composition has too many simultaneous layers

The Gideon frame often contains seven competing zones: header, empty title card, product viewport, proof annotation, focus-punch chip, caption card, and presenter/disclosure. The reference usually establishes one dominant product image and one human face, with one short word or phrase bridging them.

**Required change:** enforce a maximum of three dominant layers per scene:

- product + presenter + keyword;
- product + kinetic caption;
- presenter + product card;
- full-screen product proof;
- CTA end card.

### 3. Large areas are visually empty

Gideon's top card remains blank across many frames and the lower black area is often underused. This makes the video feel like a dashboard template placed inside a vertical canvas rather than a native short-form edit.

**Required change:** calculate occupied-area ratios during layout QA. Reject scenes where a decorative/empty panel occupies more than about 15% of the frame or where the primary evidence uses less than about 35% of the safe frame without an intentional close-up presenter layout.

### 4. Product evidence needs editorial transformation

The reference does not merely show a screen recording. It isolates phones, terminals, diagrams, and UI panels into cards, changes scale, alternates screenshots with presenter shots, and uses large device mockups. Gideon's existing test fixture cannot demonstrate this.

**Required change:** produce the next benchmark from real product footage and apply:

- automatic crop to the active UI region;
- device/window mockups;
- background removal or card treatment;
- zoom-to-evidence and pan-to-control;
- before/after frames;
- isolated screenshots for key states;
- 1.5–2.5 second visual beats;
- hard cuts or short 4–8 frame transitions rather than one persistent canvas.

### 5. The presenter is too small and too passive

The reference face usually occupies 45–70% of frame width and frequently anchors the lower half. Gideon's avatar is closer to a small lower-right badge. At that size, the presenter does not create trust or emotional continuity, yet it still competes with captions and disclosure.

**Required change:** add purposeful presenter modes:

- **Presenter lead:** 55–75% frame width, product card above/alongside;
- **Balanced split:** 40–50% presenter, 50–60% product;
- **Evidence lead:** 22–30% presenter only while the product proof is critical;
- **Hidden:** remove presenter entirely for full-screen proof.

The CreativeBlueprint should change among these modes throughout a video instead of selecting one lower-third layout globally.

### 6. `viseme2d` identity and motion need a more stable rig

The current pack swaps complete AI-generated face frames. Even with alignment, jaw shape, cheeks, teeth, and expression can subtly change between mouth states. The energy extractor also chooses openness, not the actual sound being spoken.

**Required local/free improvements:**

1. Build one canonical base portrait per avatar.
2. Store transparent mouth-region overlays rather than complete replacement portraits.
3. Store separate eyelid overlays and retain the same face/lighting beneath them.
4. Use feathered masks and fixed facial landmarks for mouth/eye anchoring.
5. Add two or three expression sets—neutral, explanatory, confident—without changing identity.
6. Add tiny eye saccades, brow changes, head rotation/scale, and shoulder breathing using deterministic bounded curves.
7. Package a reviewed Rhubarb Lip Sync binary when possible, using its phoneme cues instead of energy-only openness; retain the current energy engine as fallback.
8. Add 2–4 frame eased transitions between mouth shapes to reduce popping.

This should materially improve polish while remaining offline and API-free. It will not create the continuous facial muscle and head/body performance visible in the recorded presenter.

### 7. Captions need fewer words and better line control

Gideon's captions are legible, but some frames show awkward fragments, doubled punctuation, and large dark boxes. The reference commonly highlights a single word while the spoken sentence continues.

**Required change:**

- cap active caption display at roughly 3–6 words;
- remove duplicated punctuation during segmentation;
- avoid orphan words and one-word second lines unless intentional;
- use word-by-word emphasis without redrawing a huge background card;
- reserve bottom safe-area space before presenter placement;
- make captions responsive to the current presenter/product layout.

### 8. Audio is technically safe but not yet premium

Gideon's integrated loudness is suitable, but 96 kHz AAC at about 58 kb/s is an inefficient delivery format. The local system voice is also a larger perceived-quality limitation than loudness.

**Required change:** output 48 kHz stereo AAC at 128–192 kb/s, target about -14 LUFS and -1 dBTP, and add a restrained music/SFX bed with dialogue ducking. Evaluate higher-quality commercially safe local TTS options separately; retain macOS `say` as the zero-setup fallback.

## Prioritised improvement plan

### P0 — Make the next output honestly publishable (1–3 engineering days)

1. Remove all diagnostic guides/labels from final exports.
2. Use a real non-sensitive product walkthrough instead of colour bars.
3. Fix caption punctuation, line wrapping, and CTA overflow.
4. Remove the persistent empty top panel.
5. Increase Orbit/Nova scale and alternate presenter lead, evidence lead, and hidden layouts.
6. Export 48 kHz/128–192 kb/s AAC and retain current loudness safety.
7. Create a reference-style benchmark fixture and require manual visual approval.

**Expected outcome:** overall quality approximately 5.5–6/10 without changing the avatar engine.

### P1 — Match the reference's editorial rhythm (1 sprint)

1. Add a target visual beat interval of 1.5–2.5 seconds.
2. Add automatic product crops, screenshots, window/device cards, and proof zooms.
3. Implement five reference-derived scene templates: presenter lead, product-over-presenter, balanced split, full-screen product, CTA.
4. Use short kinetic keywords rather than large persistent caption blocks.
5. Add scene-level presenter visibility/scale changes and 4–8 frame transitions.
6. Add music/SFX selection, mix ducking, and transition accents.
7. Add layout occupancy and collision QA to reject empty/overcrowded scenes.

**Expected outcome:** overall quality approximately 6.5–7/10 with the free local avatar acting as a stylised presenter.

### P1 — Improve the local avatar without recurring cost (1–2 sprints)

1. Replace full-frame sprite swaps with canonical-base mouth/eye overlays.
2. Add phoneme-aware Rhubarb cues with energy fallback.
3. Add eased mouth transitions, eye saccades, brow/expression states, and better idle curves.
4. Add avatar-specific mask/edge QA and identity-difference regression tests.
5. Create close-up, medium, and lower-third pack crops rather than scaling one 720×720 render everywhere.

**Expected outcome:** avatar-only perceived quality approximately 5.5–6/10. It should look intentionally animated, not photorealistic.

### P2 — Reach near-reference presenter realism

Use one of these modes when presenter realism is central:

- real recorded presenter footage;
- an approved local/hosted MuseTalk-style GPU worker;
- a professionally commissioned 2D/3D rig with continuous facial deformation.

Keep `viseme2d` as the free default and position it as a privacy-first stylised presenter. A neural/real-person mode should be an explicit quality upgrade, not a silent replacement.

## Recommended product-quality targets

Before describing a generated video as publishable, require:

- no diagnostic overlays in final frames;
- at least 8 meaningful visual changes in a 20-second video, unless an intentional talking-head format is selected;
- primary product evidence occupying at least 35% of the safe frame when referenced in narration;
- captions of 3–6 active words with no overflow or duplicated punctuation;
- presenter scale and visibility changing with scene purpose;
- no caption/presenter/disclosure collision;
- 30 fps and ≤100 ms A/V duration difference;
- dialogue near -14 LUFS and ≤-1 dBTP;
- 48 kHz AAC at ≥128 kb/s;
- human review of opening frame, first three seconds, product proof, CTA, and at least one avatar close-up.

## Final recommendation

Do not spend the next iteration primarily adding more avatar mouth frames. First remove debug output and rebuild the short-form scene grammar around real product evidence, faster editorial beats, simpler hierarchy, and variable presenter prominence. Those changes offer the largest quality gain and remain completely local/free.

Once the edit feels professional without the avatar, upgrade `viseme2d` to a canonical layered rig plus phoneme-aware cues. Use the optional GPU mode only where the commercial requirement is specifically “indistinguishable from a recorded person.”
