# Gideon masked-presenter system

Status: code-native Axiom presenter, semantic gesture scheduler, collision-aware layout planner, deterministic renderer, Solomon pilot compositor, motion gates, provenance, tests, and local review workflow implemented. Voice, music, public CTA destination, and final brand acceptance remain human publication decisions.

## Why this architecture

The hydrated Gideon repository already had:

- deterministic FFmpeg creator-video rendering;
- scene-level presenter layouts and product treatments;
- a provider-neutral avatar contract;
- a code-native `pureimage` drawing dependency;
- the verified Playwright product-capture pilot;
- focused vertical product renders with an explanatory arrow, click feedback, and typed input.

It did not contain the premium cursor-telemetry and Solomon-short-form modules that had existed in an earlier temporary checkout. The masked presenter therefore integrates with the current authoritative creator/capture stack. It consumes the verified vertical render after the capture camera and cursor presentation, then adds the presenter, captions, branding, and audio. It does not replace the capture renderer or bake presenter pixels into a source recording.

A code-native 2D/2.5D rig was selected because it:

- is deterministic and reproducible;
- does not depend on a GPU, paid API, or external AI-video call;
- produces stable hands, clothing, mask geometry, and lighting;
- needs no lip synchronization;
- can render either 30 or 60 fps;
- supports transparent PNG compositing and a green-screen compatibility export;
- can later be replaced by recorded transparent masked-actor clips through the same provider interface.

The implementation is split across:

- `src/main/maskedPresenter.ts`: character contract, script beats, gesture scheduler, idle motion, layout planner, validation, and motion QA;
- `src/main/maskedPresenterRenderer.ts`: articulated vector-style Axiom rig and deterministic frame/video materialization;
- `src/main/maskedPresenterProvider.ts`: provider-neutral asset interface and code-native provider;
- `src/main/solomonMaskedPresenterPilot.ts`: authentic-capture selection, timeline, presenter/caption/audio compositing, review artifacts, provenance, and final quality report;
- `src/main/solomonMaskedPresenterPilotCli.ts`: local operator command.

## Original character specification

The first Gideon-owned character is **Axiom** (`solomon-axiom-v1`).

- Mask: softly tapered ivory shield, offset indigo brow plane, no mouth opening.
- Eyes: three asymmetric cyan aperture lights.
- Clothing: midnight tailored utility jacket, copper centre placket, simplified stable gloves.
- Primary colour: `#101A33`.
- Secondary colour: `#F4F1E8`.
- Accent: `#39D3C4`.
- Default posture: open shoulders, relaxed stance, hands near the lower ribs.
- Lighting: cool camera-left key and narrow warm camera-right rim.
- Asset provenance: entirely code generated, Gideon owned, no third-party assets.

The design intentionally does not reuse the reference video's black illuminated face, studio, clothing, lighting, or identity. Only the general production technique—a mouthless presenter moving independently from narration—is shared.

## Motion model

Motion is sampled from a deterministic integer seed and combines independent layers:

1. Piecewise asymmetric weight shifts with different travel and hold durations.
2. Slightly irregular 3.7–5.15 second breathing.
3. Independently timed head turns and tilts.
4. Counter-moving shoulders.
5. Bounded low-frequency micro-movement.
6. Deterministically irregular eye apertures/blinks.
7. Semantic gesture envelopes.

Weight shift, head, shoulder, and vertical targets use quintic smootherstep interpolation. Velocity and acceleration are zero at transition endpoints. Holds are deliberately irregular, so the result is not a repeating sinusoidal pendulum.

Every gesture has:

- anticipation;
- primary action;
- hold;
- recovery;
- a smooth return to the live idle pose.

Implemented gesture families:

- neutral explanation;
- single-hand emphasis;
- two-hand explanation;
- point left;
- point right;
- point up;
- count/list;
- lean forward;
- small reaction;
- open-handed CTA;
- rest;
- entrance;
- exit.

Hands are stylised gloves rather than photorealistic fingers. This removes a common generated-video instability while remaining readable at phone size.

## Script and scheduler

`MaskedPresenterBeat` stores:

- timeline bounds and text;
- semantic intent;
- energy;
- emphasized words;
- related product workflow;
- presenter requirement;
- optional gesture override;
- product priority;
- caption placement;
- camera emphasis.

The scheduler maps `hook`, `problem`, `explanation`, `product_reveal`, `demonstration`, `benefit`, `evidence`, `transition`, and `cta` intents to gesture candidates. It:

- honours explicit overrides;
- uses the deterministic seed for bounded variation;
- prevents temporal collisions;
- preserves recovery time;
- avoids immediate gesture repetition;
- skips a gesture if the available beat is too short;
- aligns to semantic beats only;
- never generates phoneme or mouth motion.

## Layout modes

The planner supports:

- full-screen presenter;
- presenter lower third;
- split left;
- split right;
- picture-in-picture;
- presenter foreground;
- product only.

Demonstration and evidence beats, hidden-presenter beats, and product-priority values at or above `0.76` default to product only. Active action-region collision can also force product-only mode. Layout manifests store product, presenter, and caption rectangles and fail validation when a placement leaves the canvas or reports a collision.

The Solomon pilot uses this compositor order:

1. verified authentic clean-take product recording;
2. existing capture focus/camera treatment;
3. existing capture arrow, click, and typing presentation;
4. Axiom presenter;
5. narration captions and Solomon branding;
6. narration and review music bed.

There is only one cursor layer. The current authoritative capture branch uses its code-native arrow during the clean take; it does not expose the separate telemetry compositor from the abandoned temporary checkout.

## Asset-provider extension

`MaskedPresenterAssetProvider` supports these provider categories:

- `code_native_rig`;
- `recorded_transparent_clips`;
- `approved_ai_video`.

The built-in provider is `CodeNativeMaskedPresenterProvider`. A recorded masked actor can be added by implementing the same `produce()` request/response contract and returning a timeline-aligned transparent or keyed performance plus provenance.

To add another presenter theme:

1. Define a new character specification with a unique ID, owned palette, silhouette, safe placement, and provenance.
2. Implement its articulated drawing function or its clip-backed provider without changing motion or beat schemas.
3. Return the same `MaskedPresenterRenderResult` and validated performance manifest.
4. Add phone-size, transparent-edge, deterministic-checksum, 30/60 fps, and collision tests.
5. Register it through dependency injection at the caller; do not add product-specific logic to the provider.

The current renderer intentionally constrains its built-in character ID to Axiom. A second built-in code-native theme should widen that manifest contract only when its assets and tests are added, rather than accepting arbitrary unvalidated IDs.

Recommended recorded-actor library:

- neutral idle variants;
- point left/right/up;
- single- and two-hand explanation;
- lean-forward hook;
- small reaction;
- count/list;
- open CTA;
- entrance and exit.

Record consistent wardrobe, lens, lighting, framing, frame rate, slate timing, and alpha/green-screen metadata. Do not require the actor to mouth narration.

## Motion quality thresholds

The local evaluator samples at 120 Hz and checks:

- horizontal displacement at or below 22 rig pixels;
- head angle at or below 7.5 degrees;
- torso lean at or below 5.8 degrees;
- weight-shift velocity at or below 36 pixels/second;
- acceleration at or below 95 pixels/second²;
- jerk at or below 1,600 pixels/second³;
- no frozen performance interval over 900 ms;
- irregular reversal intervals rather than pendulum timing;
- exact repeated-state share at or below 2.5%.

The pilot additionally checks:

- verified source workflows and absolute private source paths;
- one visible cursor and no duplicate cursor;
- product-only detailed interaction beats;
- 1080×1920, 30 fps, H.264/AAC master;
- 720×1280 H.264/AAC social transcode;
- full decode of both outputs;
- no black interval;
- mouthless/no-lip-sync manifest;
- original Axiom identity;
- no unsupported numeric marketing claims;
- a non-transactional CTA.

## Local commands

Run focused tests:

```sh
pnpm test:masked-presenter
```

For a presenter-only review, inspect
`tmp/solomon-masked-presenter-v1/presenter/axiom-masked-presenter-green-screen.mp4`
after the production command below. It is generated from the same frame sequence,
seed, schedule, and motion manifest used by the alpha compositor, so preview and
export cannot drift. The transparent PNG sequence beside it is the alpha-capable
source; the green MP4 is only a broadly playable compatibility preview.

After a verified four-workflow Solomon capture exists:

```sh
pnpm presenter:pilot -- \
  --capture-run "$PWD/tmp/capture-pilot/nexusreach/runs/<run-id>" \
  --output-dir "$PWD/tmp/solomon-masked-presenter-v1"
```

The original pilot uses macOS Samantha narration and a procedural audio bed as review placeholders. The versioned Chatterbox pilot uses the provider-neutral local narration path documented in `docs/chatterbox-narration.md`, preserves Samantha as an explicit comparison/fallback, and rejects any beat that would need more than 1.08× timing compression. Both versions disclose their voice and audio-bed provenance.

## Expected pilot artifacts

- `final/solomon-masked-presenter-v1.mp4`
- `final/solomon-masked-presenter-v1-social.mp4`
- `contact-sheet-1fps.jpg`
- `dense-timeline-review.jpg`
- `phone-size-muted-review.jpg`
- `presenter-gesture-strip.jpg`
- `presenter-idle-motion-strip.jpg`
- `product-action-cursor-strip.jpg`
- `camera-motion-strip.jpg`
- `gesture-schedule.json`
- `presenter-layout-manifest.json`
- `product-provenance.json`
- `presenter-provenance.json`
- `quality-report.json`
- `manual-review.md`

All generated media lives below ignored `tmp/` storage and must not be committed.

## Remaining human decisions

- Approve or replace the review voice.
- Approve or replace the procedural music.
- Approve Axiom's final brand identity and colour treatment.
- Confirm the public CTA destination and access status.
- Watch the complete master at normal speed with sound.
- Confirm platform-specific synthetic-presenter disclosure and caption policy.

The system does not publish or post automatically.
